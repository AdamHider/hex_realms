class MapGenerator {
    constructor(options = {}) {
        this.width = options.width || 600;
        this.height = options.height || 600;
        this.borderMargin = options.borderMargin || 22;

        this.showClimate = options.showClimate ?? true;
        this.currentSeason = options.currentSeason ?? 'SPRING';
        this.viewMode = options.viewMode;

        this.canvas = options.canvas;
        this.ctx = this.canvas.getContext('2d');
        this.tooltip = options.tooltip;

        this.initialSeed = options.seed || 12345;
        this.currentSeed = this.initialSeed;
        this.mapVoronoi = null;
        this.noisyEdgeCache = new Map();


        this.viewTransform = { x: 0, y: 0, scale: 1 };
        this.minScale = 0.6;
        this.maxScale = 6;
        this.mapLayerScale = Math.min(this.maxScale, 4) * (window.devicePixelRatio || 1) * 2;


        this.mapLayerCanvas = document.createElement('canvas');
        this.mapLayerCanvas.width = this.width * this.mapLayerScale;
        this.mapLayerCanvas.height = this.height * this.mapLayerScale;
        this.mapLayerCtx = this.mapLayerCanvas.getContext('2d');

        this.color = {
            getBase: MapColor.getBase.bind(this),
            getGrayscale: MapColor.getGrayscale.bind(this),
            hexToRgb: MapColor.hexToRgb.bind(this),
            rgbToHex: MapColor.rgbToHex.bind(this),
            hslToHex: MapColor.hslToHex.bind(this),
            blend: MapColor.blend.bind(this)
        };

        this.interaction = {
            initEvents: MapInteraction.initEvents.bind(this),
            hideTooltip: MapInteraction.hideTooltip.bind(this),
            describeRegion: MapInteraction.describeRegion.bind(this),
            handlePointerAt: MapInteraction.handlePointerAt.bind(this),
            _handleWheel: MapInteraction._handleWheel.bind(this),
            _handleMouseDown: MapInteraction._handleMouseDown.bind(this),
            _handleMouseUp: MapInteraction._handleMouseUp.bind(this),
            _handleMouseMove: MapInteraction._handleMouseMove.bind(this)
        }

        this.factions = {
            config: options.factions || { count: 0 },
            startHops: options.startHops ?? 5,
            capitalPopulation: options.capitalPopulation ?? 120,
            populationDecay: options.populationDecay ?? 0.62,
            colors: { 
                all: [
                    '#e63946', '#457b9d', '#2a9d8f', '#f4a261', '#9b5de5',
                    '#ffbe0b', '#06d6a0', '#ef476f', '#118ab2', '#f77f00',
                    '#8338ec', '#06a77d', '#d62828', '#3a86ff', '#ffd60a',
                ],
                neutral: 'rgba(148, 163, 184, 0)'
            },
            getTotal: MapFaction.getTotal.bind(this),
            pickCapitals: MapFaction.pickCapitals.bind(this),
            settle: MapFaction.settle.bind(this),
            setColors: MapFaction.setColors.bind(this),
            getColorOf: MapFaction.getColorOf.bind(this),
            drawBorders: MapFaction.drawBorders.bind(this),
        }


        this.terrain = {
            config: {
                regionCount: options.regionCount || 3000,
                peakCount: options.peakCount || 4,
                peakShape: options.peakShape || 0.5,
                shapeType: options.shapeType || 'continent',
                landAmount: options.landAmount || 0.8,
                relief: options.relief || 0.9,
                chaos: options.chaos || 0.2,
                edgeRoughness: options.edgeRoughness || 0.42,
                edgeDepth: options.edgeDepth || 5
            },
            regions: [],
            createTemperatures: MapTerrain.createTemperatures.bind(this),
            createRegions: MapTerrain.createRegions.bind(this),
            addBlob: MapTerrain.addBlob.bind(this),
            addRange: MapTerrain.addRange.bind(this),
            spreadDecay: MapTerrain.spreadDecay.bind(this),
            createNeighbors: MapTerrain.createNeighbors.bind(this),
            findNeighbor: MapTerrain.findNeighbor.bind(this),
            getContinentCenters: MapTerrain.getContinentCenters.bind(this),
            createElevation: MapTerrain.createElevation.bind(this),
            classifyByLandFraction: MapTerrain.classifyByLandFraction.bind(this),
            cleanup: MapTerrain.cleanup.bind(this),
        }
        this.decor = {
            pointInPolygon: MapDecor.pointInPolygon.bind(this),
            densityFor: MapDecor.densityFor.bind(this),
            generate: MapDecor.generate.bind(this),
            drawTree: MapDecor.drawTree.bind(this),
            drawMountain: MapDecor.drawMountain.bind(this),
            drawRock: MapDecor.drawRock.bind(this),
            render: MapDecor.render.bind(this),
        };
        this.utils = {
            strokeOffsetPolyline: MapUtils.strokeOffsetPolyline.bind(this),
            seededRandom: MapUtils.seededRandom.bind(this),
            setSeed: MapUtils.setSeed.bind(this),
            findBand: MapUtils.findBand.bind(this)
        }

        this._initConfig();

        if (this.canvas) {
            this.interaction.initEvents();
        }
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION: MAP_CONFIG
    // Статичная конфигурация — биомы, сезоны, палитра фракций.
    // Вычисляется один раз в конструкторе, не меняется в рантайме.
    // ═══════════════════════════════════════════════════════════

    _initConfig() {
        this.biomeDefs = [
            { id: 'DEEP_OCEAN', isWater: true, maxT: 0.45, label: 'Глубокий океан',
              color: '#1f2a54', resources: { food: 0, production: 0, manpower: 0, gold: 0, upkeep: -0.2 } },
            { id: 'OCEAN', isWater: true, maxT: 0.80, label: 'Океан',
              color: '#232f5e', resources: { food: 1, production: 0, manpower: 0, gold: 1, upkeep: -0.3 } },
            { id: 'SHALLOW', isWater: true, maxT: Infinity, label: 'Мелководье',
              color: '#2a3973', resources: { food: 2, production: 0, manpower: 0, gold: 0, upkeep: -0.3 } },
            { id: 'COAST', isWater: false, maxT: 0.08, label: 'Побережье',
              colors: { cold: '#8fae9c', temperate: '#b7d688', hot: '#d9c27a' },
              resources: { food: 2, production: 1, manpower: 1, gold: 1, upkeep: -0.5 } },
            { id: 'STEPPE', isWater: false, maxT: 0.16, label: 'Степь',
              colors: { cold: '#7a9a86', temperate: '#88aa55', hot: '#cdb26a' },
              resources: { food: 1, production: 1, manpower: 2, gold: 0, upkeep: -0.5 } },
            { id: 'PLAINS', isWater: false, maxT: 0.25, label: 'Равнина',
              colors: { cold: '#6b8f7a', temperate: '#679459', hot: '#c2a35c' },
              resources: { food: 3, production: 1, manpower: 1, gold: 0, upkeep: -0.6 } },
            { id: 'GRASSLAND', isWater: false, maxT: 0.35, label: 'Луга',
              colors: { cold: '#5a7d6a', temperate: '#559944', hot: '#b8944a' },
              resources: { food: 3, production: 1, manpower: 2, gold: 0, upkeep: -0.6 } },
            { id: 'WETLANDS', isWater: false, maxT: 0.45, label: 'Болота',
              colors: { cold: '#4a6b5c', temperate: '#4d7c0f', hot: '#a9863e' },
              resources: { food: 2, production: 0, manpower: 1, gold: 0, upkeep: -0.7 } },
            { id: 'WOODLAND', isWater: false, maxT: 0.56, label: 'Редколесье',
              colors: { cold: '#3d5a4d', temperate: '#337755', hot: '#9c7a3a' },
              resources: { food: 1, production: 2, manpower: 1, gold: 0, upkeep: -0.6 } },
            { id: 'FOREST', isWater: false, maxT: 0.68, label: 'Лес',
              colors: { cold: '#2f4a40', temperate: '#14532d', hot: '#8a6a35' },
              resources: { food: 1, production: 3, manpower: 1, gold: 0, upkeep: -0.7 } },
            { id: 'DENSE_FOREST', isWater: false, maxT: 0.80, label: 'Густой лес',
              colors: { cold: '#24413a', temperate: '#064e3b', hot: '#7a5c30' },
              resources: { food: 0, production: 3, manpower: 1, gold: 0, upkeep: -0.8 } },
            { id: 'HIGHLANDS', isWater: false, maxT: 0.92, label: 'Плоскогорье',
              colors: { cold: '#cfd8d6', temperate: '#042f2e', hot: '#8a6048' },
              resources: { food: 0, production: 2, manpower: 0, gold: 2, upkeep: -0.9 } },
            { id: 'PEAKS', isWater: false, maxT: Infinity, label: 'Пик',
              colors: { cold: '#f2f6f7', temperate: '#707372', hot: '#7a6558' },
              resources: { food: 0, production: 1, manpower: 0, gold: 3, upkeep: -1.0 } },
        ];

        this.waterBiomes = this.biomeDefs.filter(b => b.isWater);
        this.landElevationBands = this.biomeDefs.filter(b => !b.isWater);

        this.biomesMap = {};
        this.elevationBandLabels = {};
        this.biomeResourceBase = {};

        this.biomeDefs.forEach(b => {
            this.elevationBandLabels[b.id] = b.label;
            this.biomeResourceBase[b.id] = b.resources;
            if (b.isWater) {
                this.biomesMap[b.id] = b.color;
            } else {
                ['cold', 'temperate', 'hot'].forEach(zone => {
                    this.biomesMap[b.id + '_' + zone] = b.colors[zone];
                });
            }
        });

        this.cityResourceBonus = { production: 1, manpower: 1, gold: 1, upkeep: -0.5 };
        this.climateZoneLabels = { cold: 'холодный', temperate: 'умеренный', hot: 'жаркий' };

        this.seasons = {
            SPRING: {
                label: 'Весна',
                modifiers: {
                    cold:      { food: 0.9, production: 1.0, manpower: 1.0, gold: 1.0, upkeep: 1.0 },
                    temperate: { food: 1.1, production: 1.0, manpower: 1.0, gold: 1.0, upkeep: 1.0 },
                    hot:       { food: 1.0, production: 1.0, manpower: 1.0, gold: 1.0, upkeep: 1.0 },
                },
                tints: {
                    land:  { cold: { color: '#cfe8c2', strength: 0.12 }, temperate: { color: '#d9f2a3', strength: 0.15 }, hot: { color: '#f2e6a8', strength: 0.05 } },
                    water: { cold: { color: '#dfeff5', strength: 0.05 }, temperate: { color: '#dfeff5', strength: 0.00 }, hot: { color: '#dfeff5', strength: 0.00 } },
                },
            },
            SUMMER: {
                label: 'Лето',
                modifiers: {
                    cold:      { food: 1.1, production: 1.1, manpower: 1.1, gold: 1.0, upkeep: 1.0 },
                    temperate: { food: 1.3, production: 1.1, manpower: 1.1, gold: 1.0, upkeep: 1.0 },
                    hot:       { food: 0.8, production: 0.9, manpower: 0.9, gold: 1.1, upkeep: 1.1 },
                },
                tints: {
                    land:  { cold: { color: '#e8f0c2', strength: 0.05 }, temperate: { color: '#fff4b0', strength: 0.05 }, hot: { color: '#ffdd88', strength: 0.18 } },
                    water: { cold: { color: '#bfe0e8', strength: 0.00 }, temperate: { color: '#bfe0e8', strength: 0.00 }, hot: { color: '#bfe0e8', strength: 0.00 } },
                },
            },
            AUTUMN: {
                label: 'Осень',
                modifiers: {
                    cold:      { food: 0.8, production: 1.0, manpower: 0.9, gold: 1.0, upkeep: 1.0 },
                    temperate: { food: 1.2, production: 1.0, manpower: 1.0, gold: 1.0, upkeep: 1.0 },
                    hot:       { food: 1.0, production: 1.0, manpower: 1.0, gold: 1.0, upkeep: 1.0 },
                },
                tints: {
                    land:  { cold: { color: '#c98a3e', strength: 0.20 }, temperate: { color: '#d9822b', strength: 0.35 }, hot: { color: '#e0a83e', strength: 0.08 } },
                    water: { cold: { color: '#7a8fa0', strength: 0.05 }, temperate: { color: '#7a8fa0', strength: 0.05 }, hot: { color: '#7a8fa0', strength: 0.00 } },
                },
            },
            WINTER: {
                label: 'Зима',
                modifiers: {
                    cold:      { food: 0.3, production: 0.7, manpower: 0.7, gold: 0.9, upkeep: 1.3 },
                    temperate: { food: 0.6, production: 0.9, manpower: 0.9, gold: 1.0, upkeep: 1.15 },
                    hot:       { food: 0.9, production: 1.0, manpower: 1.0, gold: 1.0, upkeep: 1.0 },
                },
                tints: {
                    land:  { cold: { color: '#ffffff', strength: 0.80 }, temperate: { color: '#ffffff', strength: 0.45 }, hot: { color: '#ffffff', strength: 0.00 } },
                    water: { cold: { color: '#e8f4fb', strength: 0.15 }, temperate: { color: '#e8f4fb', strength: 0.20 }, hot: { color: '#e8f4fb', strength: 0.00 } },
                },
            },
        };
        this.seasonOrder = Object.keys(this.seasons);
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION: MAP_GEOMETRY
    // Полигональная геометрия: шумные края, path региона,
    // граф рёбер (для границ). Чистая математика над Voronoi.
    // ═══════════════════════════════════════════════════════════

    getNoisyLineSegments(x0, y0, x1, y1) {
        const key = `${Math.round(x0*10)},${Math.round(y0*10)}-${Math.round(x1*10)},${Math.round(y1*10)}`;
        const revKey = `${Math.round(x1*10)},${Math.round(y1*10)}-${Math.round(x0*10)},${Math.round(y0*10)}`;

        if (this.noisyEdgeCache.has(key)) return this.noisyEdgeCache.get(key);
        if (this.noisyEdgeCache.has(revKey)) return [...this.noisyEdgeCache.get(revKey)].reverse();

        let points = [{x: x0, y: y0}, {x: x1, y: y1}];
        for (let i = 0; i < this.terrain.config.edgeDepth; i++) {
            const nextPoints = [];
            for (let j = 0; j < points.length - 1; j++) {
                const p0 = points[j], p1 = points[j + 1];
                nextPoints.push(p0);

                const mx = (p0.x + p1.x) * 0.5;
                const my = (p0.y + p1.y) * 0.5;
                const dx = p1.x - p0.x, dy = p1.y - p0.y;
                const length = Math.hypot(dx, dy);

                const offset = (this.utils.seededRandom() - 0.5) * length * this.terrain.config.edgeRoughness;
                const nx = -dy / length * offset;
                const ny = dx / length * offset;

                nextPoints.push({ x: mx + nx, y: my + ny });
            }
            nextPoints.push(points[points.length - 1]);
            points = nextPoints;
        }

        this.noisyEdgeCache.set(key, points);
        return points;
    }

    drawRegionPath(ctx, polygon) {
        ctx.beginPath();
        let firstPoint = true;
        for (let j = 0; j < polygon.length - 1; j++) {
            const p1 = polygon[j], p2 = polygon[j + 1];
            const noisySegment = this.getNoisyLineSegments(p1[0], p1[1], p2[0], p2[1]);
            for (let k = 0; k < noisySegment.length; k++) {
                const pt = noisySegment[k];
                if (firstPoint) { ctx.moveTo(pt.x, pt.y); firstPoint = false; }
                else { ctx.lineTo(pt.x, pt.y); }
            }
        }
        ctx.closePath();
    }
    createEdgeMap() {
        const edgeMap = new Map();
        function edgeKey(p1, p2) {
            const a = `${Math.round(p1[0] * 10)},${Math.round(p1[1] * 10)}`;
            const b = `${Math.round(p2[0] * 10)},${Math.round(p2[1] * 10)}`;
            return a < b ? `${a}|${b}` : `${b}|${a}`;
        }
        for (let i = 0; i < this.terrain.regions.length; i++) {
            const polygon = this.mapVoronoi.cellPolygon(i);
            if (!polygon) continue;
            for (let j = 0; j < polygon.length - 1; j++) {
                const p1 = polygon[j], p2 = polygon[j + 1];
                const key = edgeKey(p1, p2);
                if (!edgeMap.has(key)) edgeMap.set(key, { regionIds: [], p1, p2 });
                edgeMap.get(key).regionIds.push(i);
            }
        }
        return edgeMap;
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION: MAP_SETUP
    // Точка входа первичного этапа: собирает terrain + факции
    // в this.terrain.regions, кэширует edgeMap. create() — публичная
    // обёртка, которая сразу же вызывает первый render() и отдаёт
    // наружу данные для дальнейшей динамической синхронизации.
    // ═══════════════════════════════════════════════════════════

    create(seed) {
        this.setup(seed);
        this.render();
        return {
            regions: this.getRegionsData(),
            factions: this.getFactionsData(),
        };
    }

    setup(seed) {
        if (seed !== undefined) this.utils.setSeed(seed);
        else this.currentSeed = this.initialSeed;

        this.noisyEdgeCache.clear();
        
        const regions = this.terrain.createRegions(this.width, this.height, 10).map((s, i) => ({
            id: i, x: s.x, y: s.y, elevation: 0, t: 0, biome: 'OCEAN', biomeBand: 'OCEAN',
            biomeClimate: 'OCEAN', biomeNeutral: 'OCEAN', climateZone: null, isWater: true, city: null,
            ownerId: null,
        }));

        const points = new Float64Array(regions.length * 2);
        for (let i = 0; i < regions.length; i++) {
            points[i * 2] = regions[i].x;
            points[i * 2 + 1] = regions[i].y;
        }
        const delaunay = new d3.Delaunay(points);
        const voronoi = delaunay.voronoi([0, 0, this.width, this.height]);
        
        const neighbors = this.terrain.createNeighbors(delaunay, regions.length);

        const elevation = this.terrain.createElevation(regions, neighbors);

        const targetFraction = Math.min(0.62, Math.max(0.12, 0.20 + (this.terrain.config.landAmount - 0.5) * 0.35));
        const { isWater, t } = this.terrain.classifyByLandFraction(elevation, targetFraction);

        const minLandSize = Math.max(4, Math.round(this.terrain.config.regionCount * 0.006));
        this.terrain.cleanup(isWater, neighbors, minLandSize);

        const temperature = this.terrain.createTemperatures(regions, t);

        regions.forEach((region, i) => {
            region.elevation = elevation[i];
            region.t = t[i];
            region.isWater = !!isWater[i];

            const zone = temperature[i] < 0.28 ? 'cold' : temperature[i] > 0.72 ? 'hot' : 'temperate';
            region.climateZone = zone;

            if (region.isWater) {
                const id = this.utils.findBand(this.waterBiomes, t[i]).id;
                region.biomeBand = id;
                region.biomeClimate = id;
                region.biomeNeutral = id;
            } else {
                const band = this.utils.findBand(this.landElevationBands, t[i]);
                region.biomeBand = band.id;
                region.biomeClimate = band.id + '_' + zone;
                region.biomeNeutral = band.id + '_temperate';
            }
        });

        this.factions.settle(regions, neighbors);
        this.decor.generate(regions, voronoi); 

        this.terrain.regions = regions;
        this.mapVoronoi = voronoi;
        this.edgeMap = this.createEdgeMap();
        this.viewTransform = { x: 0, y: 0, scale: 1 };
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION: MAP_DATA
    // Динамический синтез: превращает статичные mapRegions + текущие
    // "живые" параметры (сезон) в данные наружу и в тултип.
    // Вызывается многократно, без пересчёта setup().
    // ═══════════════════════════════════════════════════════════

    getRegionsData() {
        return this.terrain.regions.map(s => ({
            id: s.id,
            x: s.x,
            y: s.y,
            isWater: s.isWater,
            biome: s.biomeBand,
            climateZone: s.climateZone,
            city: s.city,
            ownerId: s.ownerId,
            population: s.population,
            resources: this.getRegionResources(s),
        }));
    }

    getFactionsData() {
        return this.factions.list || [];
    }

    getRegionResources(region, season = this.currentSeason) {
        const base = this.biomeResourceBase[region.biomeBand];
        if (!base) return null;

        const zone = region.climateZone || 'temperate';
        const mod = this.seasons[season].modifiers[zone];

        const result = {};
        for (const key of Object.keys(base)) {
            const value = base[key] * (mod[key] ?? 1);
            result[key] = key === 'upkeep' ? -Math.abs(value) : value;
        }
        if (region.city) {
            for (const key of Object.keys(this.cityResourceBonus)) {
                result[key] = (result[key] || 0) + this.cityResourceBonus[key];
            }
        }
        return result;
    }

    setSeason(season) {
        if (!this.seasonOrder.includes(season)) return;
        this.currentSeason = season;
        if (this.terrain.regions.length) this.render();
    }

    setShowClimate(value) {
        this.showClimate = value;
        if (this.terrain.regions.length) this.render();
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION: MAP_RENDER
    // Второй этап: перекладывает уже готовые this.terrain.regions на canvas.
    // Ничего не мутирует в данных — вызывается на каждую смену
    // сезона/слоя/фильтра без повторного setup().
    // ═══════════════════════════════════════════════════════════

    render() {
        const ctx = this.mapLayerCtx;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.mapLayerCanvas.width, this.mapLayerCanvas.height);
        ctx.scale(this.mapLayerScale, this.mapLayerScale);
    
        this.renderRegions(ctx);
        //this.renderPaperTexture(ctx);
    
        ctx.restore();
        this.draw();
    }
    
    draw() {
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();
    
        // Слой 1: растровая заливка (дорогая, кэшированная)
        this.ctx.save();
        this.ctx.translate(this.viewTransform.x, this.viewTransform.y);
        this.ctx.scale(this.viewTransform.scale / this.mapLayerScale, this.viewTransform.scale / this.mapLayerScale);
        this.ctx.drawImage(this.mapLayerCanvas, 0, 0);
        this.ctx.restore();
    
        // Слой 2: живой векторный оверлей — константный размер на экране при любом зуме
        this.ctx.save();
        this.ctx.translate(this.viewTransform.x, this.viewTransform.y);
        this.ctx.scale(this.viewTransform.scale, this.viewTransform.scale);
        this.renderOverlay(this.ctx, this.viewTransform.scale);
        this.ctx.restore();
    }
    
    renderOverlay(ctx, zoomScale) {
        this.factions.drawBorders(ctx, zoomScale);
        //this.decor.render(ctx, zoomScale);
        this.renderCities(ctx, zoomScale);
    }
    renderPaperTexture(ctx) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = 'rgba(238, 222, 186, 0.18)';
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.restore();
    }
    renderRegions(ctx) {
        for (let i = 0; i < this.terrain.regions.length; i++) {
            const polygon = this.mapVoronoi.cellPolygon(i);
            if (!polygon) continue;

            const region = this.terrain.regions[i];
            ctx.fillStyle = this.color.getBase(region);
            ctx.strokeStyle = this.viewMode === 'factions' ? 'rgba(0, 0, 0, 0.25)' : 'rgba(2, 44, 44, 0.2)';
            ctx.lineWidth = 0.4;

            this.drawRegionPath(ctx, polygon);
            ctx.fill();
            ctx.stroke();

            if (region.ownerId !== null && region.ownerId !== undefined && this.factions.list?.[region.ownerId]) {
                ctx.save();
                ctx.globalAlpha = this.viewMode === 'factions' ? 0.65 : (this.viewMode === 'political') ? 0.32 : 0;
                ctx.fillStyle = this.factions.list[region.ownerId].color;
                ctx.fill();
                ctx.restore();
            }
        }
    }
    renderCities(ctx, zoomScale = 1) {
        const r = 2.5 / zoomScale;
        this.terrain.regions.forEach(region => {
            if (region.city) {
                ctx.fillStyle = '#facc15';
                ctx.beginPath();
                ctx.arc(region.x, region.y, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#022c22';
                ctx.lineWidth = 1 / zoomScale;
                ctx.stroke();
            }
        });
    }
}
// ═══════════════════════════════════════════════════════════
// SECTION: MAP_COLORS
// Всё, что превращает состояние региона (биом/сезон/фракция)
// в конкретный цвет для заливки. Читает MAP_CONFIG + this.viewMode.
// ═══════════════════════════════════════════════════════════
const MapColor = {
    getBase(region) {
        if (this.viewMode === 'factions') {
            return this.color.getGrayscale(region);
        }
        region.biome = region.isWater ? region.biomeClimate : (this.showClimate ? region.biomeClimate : region.biomeNeutral);
        
        const baseColor = this.biomesMap[region.biome];
        if (!baseColor) return baseColor;

        const tintGroup = this.seasons[this.currentSeason]?.tints;
        if (!tintGroup) return baseColor;

        const zone = region.climateZone || 'temperate';
        const tint = (region.isWater ? tintGroup.water : tintGroup.land)[zone];
        if (!tint || tint.strength <= 0) return baseColor;

        return this.color.blend(baseColor, tint.color, tint.strength);
    },
    getGrayscale(region) {
        if (region.isWater) {
            const v = 25 + region.t * 35;
            return this.color.rgbToHex(v * 0.7, v * 0.8, v * 1.05);
        }
        const v = 110 + region.t * 95;
        return this.color.rgbToHex(v, v, v);
    },
    hexToRgb(hex) {
        const h = hex.replace('#', '');
        return { r: parseInt(h.substring(0, 2), 16), g: parseInt(h.substring(2, 4), 16), b: parseInt(h.substring(4, 6), 16) };
    },
    rgbToHex(r, g, b) {
        const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
        return '#' + [clamp(r), clamp(g), clamp(b)].map(v => v.toString(16).padStart(2, '0')).join('');
    },
    hslToHex(h, s, l) {
        s /= 100; l /= 100;
        const k = n => (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        return this.color.rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
    },
    blend(baseHex, tintHex, amount) {
        if (amount <= 0) return baseHex;
        const base = this.color.hexToRgb(baseHex), tint = this.color.hexToRgb(tintHex);
        return this.color.rgbToHex(
            base.r + (tint.r - base.r) * amount,
            base.g + (tint.g - base.g) * amount,
            base.b + (tint.b - base.b) * amount
        );
    }
}

// ═══════════════════════════════════════════════════════════
// SECTION: MAP_INTERACTION
// Ввод пользователя, не связанный с камерой: тултип, события,
// поиск региона под курсором, текстовое описание региона.
// ═══════════════════════════════════════════════════════════
const MapInteraction = {
    initEvents() {
        this.canvas.style.cursor = 'grab';
        this.canvas.addEventListener('mousedown', e => this.interaction._handleMouseDown(e));
        window.addEventListener('mouseup', () => this.interaction._handleMouseUp());
        this.canvas.addEventListener('mousemove', e => this.interaction._handleMouseMove(e));
        this.canvas.addEventListener('mouseleave', () => this.interaction.hideTooltip());
        this.canvas.addEventListener('wheel', e => this.interaction._handleWheel(e), { passive: false });
        this.canvas.addEventListener('touchstart', e => {
            if (e.touches.length) this.interaction.handlePointerAt(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });
    },
    hideTooltip() {
        if (this.tooltip) this.tooltip.classList.add('hidden');
    },
    describeRegion(region) {
        const bandLabel = this.elevationBandLabels[region.biomeBand] || region.biomeBand;
        const lines = [];
        if (region.isWater) {
            lines.push(`Глубина: ${(100 - region.t * 100).toFixed(0)}%`);
        } else {
            if (this.showClimate && region.climateZone) lines.push(`Климат: ${this.climateZoneLabels[region.climateZone]}`);
            lines.push(`Высота: ${(region.t * 100).toFixed(0)}%`);
        }
        if (region.city) lines.push(`Поселение: ${region.city.name}`);
        const res = this.getRegionResources(region);
        if (res) {
            lines.push(`<hr class="my-1 border-emerald-800">`);
            lines.push(`Сезон: ${this.seasons[this.currentSeason].label}`);
            lines.push(`Еда ${res.food.toFixed(1)} · Произв. ${res.production.toFixed(1)} · Manpower ${res.manpower.toFixed(1)}`);
            lines.push(`Золото ${res.gold.toFixed(1)} · Содержание ${res.upkeep.toFixed(1)}`);
            if (region.population > 0) lines.push(`Население: ${region.population}`);
        }

        return `<div class="font-semibold text-emerald-400 mb-1">${bandLabel}</div>` +
               lines.map(l => `<div>${l}</div>`).join('');
    },
    handlePointerAt(clientX, clientY) {
        if (!this.terrain.regions.length) return;
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const px = (clientX - rect.left) * scaleX;
        const py = (clientY - rect.top) * scaleY;

        const wx = (px - this.viewTransform.x) / this.viewTransform.scale;
        const wy = (py - this.viewTransform.y) / this.viewTransform.scale;

        if (wx < 0 || wy < 0 || wx > this.width || wy > this.height) { this.interaction.hideTooltip(); return; }

        const idx = this.terrain.findNeighbor(this.terrain.regions, wx, wy);
        if (idx === -1) { this.hideTooltip(); return; }
        this.tooltip.innerHTML = this.interaction.describeRegion(this.terrain.regions[idx]);
        this.tooltip.style.left = (clientX + 16) + 'px';
        this.tooltip.style.top = (clientY + 16) + 'px';
        this.tooltip.classList.remove('hidden');
    },
    _handleWheel(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const px = (e.clientX - rect.left) * scaleX;
        const py = (e.clientY - rect.top) * scaleY;

        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const newScale = Math.min(this.maxScale, Math.max(this.minScale, this.viewTransform.scale * factor));

        const worldX = (px - this.viewTransform.x) / this.viewTransform.scale;
        const worldY = (py - this.viewTransform.y) / this.viewTransform.scale;

        this.viewTransform.scale = newScale;
        this.viewTransform.x = px - worldX * newScale;
        this.viewTransform.y = py - worldY * newScale;

        this.draw();
        this.interaction.hideTooltip();
    },
    _handleMouseDown(e) {
        this._isPanning = true;
        this._panStart = { x: e.clientX, y: e.clientY };
        this._transformStart = { x: this.viewTransform.x, y: this.viewTransform.y };
        this.canvas.style.cursor = 'grabbing';
    },
    _handleMouseUp() {
        this._isPanning = false;
        this.canvas.style.cursor = 'grab';
    },
    _handleMouseMove(e) {
        if (this._isPanning) {
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            const dx = (e.clientX - this._panStart.x) * scaleX;
            const dy = (e.clientY - this._panStart.y) * scaleY;

            this.viewTransform.x = this._transformStart.x + dx;
            this.viewTransform.y = this._transformStart.y + dy;

            this.draw();
            this.interaction.hideTooltip();
            return;
        }
        this.interaction.handlePointerAt(e.clientX, e.clientY);
    }
}

// ═══════════════════════════════════════════════════════════
// SECTION: MAP_FACTIONS
// Расстановка государств поверх готового ландшафта: столицы,
// территория (BFS), население, цвета. Часть первичного setup(),
// но логически отдельная от рельефа — государства можно
// в будущем пересобирать без пересчёта terrain.
// ═══════════════════════════════════════════════════════════

const MapFaction = {
    getTotal() {
        if (this.factions.config.count) return this.factions.config.count;
        const scaled = Math.round(this.terrain.config.regionCount / 60);
        return Math.max(8, Math.min(40, scaled));
    },
    pickCapitals(candidates, count) {
        const chosen = [];
        if (!candidates.length || count <= 0) return chosen;

        chosen.push(candidates[Math.floor(this.utils.seededRandom() * candidates.length)]);
        while (chosen.length < count && chosen.length < candidates.length) {
            let best = null, bestDist = -Infinity;
            for (const c of candidates) {
                if (chosen.includes(c)) continue;
                const minDist = Math.min(...chosen.map(p => Math.hypot(p.x - c.x, p.y - c.y)));
                if (minDist > bestDist) { bestDist = minDist; best = c; }
            }
            if (!best) break;
            chosen.push(best);
        }
        return chosen;
    },
    settle(regions, neighborsList) {
        regions.forEach(s => { s.city = null; s.population = 0; });

        const total = this.factions.getTotal();
        this.factions.list = [];
        if (total <= 0) return;

        const capitalCandidates = regions.filter(s => !s.isWater && s.biomeBand !== 'PEAKS' && s.biomeBand !== 'HIGHLANDS');
        if (capitalCandidates.length < total) {
            console.warn(`MapGenerator: клеток под столицы (${capitalCandidates.length}) меньше, чем фракций (${total})`);
        }

        const names = this.factions.config.names?.length === total ? this.factions.config.names : null;
        const colors = this.factions.config.colors?.length === total ? this.factions.config.colors : null;

        const capitals = this.factions.pickCapitals(capitalCandidates, total);

        capitals.forEach((capital, i) => {
            const factionName = names ? names[i] : `Фракция ${i + 1}`;
            capital.city = { name: factionName + ' (столица)' };
            this.factions.list.push({
                id: i,
                name: factionName,
                color: colors ? colors[i] : this.factions.getColorOf(i, (this.initialSeed % 360)),
                capitalRegionId: capital.id,
                ownedRegions: [],
                totalPopulation: 0,
                armies: [],
            });
        });

        const ownerOf = new Int16Array(regions.length).fill(-1);
        const hopOf = new Int16Array(regions.length).fill(-1);

        let frontier = capitals.map((capital, factionId) => {
            ownerOf[capital.id] = factionId;
            hopOf[capital.id] = 0;
            return capital.id;
        });

        for (let depth = 1; depth <= this.factions.startHops && frontier.length; depth++) {
            const nextFrontier = [];
            for (const id of frontier) {
                const factionId = ownerOf[id];
                for (const nb of neighborsList[id]) {
                    if (ownerOf[nb] !== -1 || regions[nb].isWater) continue;
                    ownerOf[nb] = factionId;
                    hopOf[nb] = depth;
                    nextFrontier.push(nb);
                }
            }
            frontier = nextFrontier;
        }

        regions.forEach((region, i) => {
            region.ownerId = ownerOf[i] === -1 ? null : ownerOf[i];
            region.population = region.ownerId === null
                ? 0
                : Math.round(this.factions.capitalPopulation * Math.pow(this.factions.populationDecay, hopOf[i]));
        });

        if (!colors) this.factions.setColors(regions, neighborsList);

        this.factions.list.forEach(faction => {
            const owned = regions.filter(s => s.ownerId === faction.id);
            faction.ownedRegions = owned.map(s => s.id);
            faction.totalPopulation = owned.reduce((sum, s) => sum + s.population, 0);
            faction.armies.push({ id: `${faction.id}-army-0`, regionId: faction.capitalRegionId, strength: 10 });
        });
    },
    setColors(regions, neighborsList) {
        const count = this.factions.list.length;
        if (!count) return;

        const adjacency = Array.from({ length: count }, () => new Set());
        for (let i = 0; i < regions.length; i++) {
            const ownerI = regions[i].ownerId;
            if (ownerI === null || ownerI === undefined) continue;
            for (const nb of neighborsList[i]) {
                const ownerNb = regions[nb].ownerId;
                if (ownerNb === null || ownerNb === undefined || ownerNb === ownerI) continue;
                adjacency[ownerI].add(ownerNb);
                adjacency[ownerNb].add(ownerI);
            }
        }

        const order = [...Array(count).keys()].sort((a, b) => adjacency[b].size - adjacency[a].size);

        const poolSize = Math.max(count * 4, 64);
        const candidates = [];
        for (let i = 0; i < poolSize; i++) {
            const hue = (i * 137.508 + (this.initialSeed % 360)) % 360;
            const saturation = 60 + (i % 3) * 10;
            const lightness = 46 + (i % 2) * 10;
            candidates.push({ hue, hex: this.color.hslToHex(hue, saturation, lightness) });
        }

        const hueDistance = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

        const assignedHue = new Array(count).fill(null);
        const used = new Set();

        order.forEach(factionId => {
            const neighborHues = [...adjacency[factionId]].map(n => assignedHue[n]).filter(h => h !== null);

            let best = -1, bestScore = -Infinity;
            candidates.forEach((c, idx) => {
                if (used.has(idx)) return;
                const score = neighborHues.length ? Math.min(...neighborHues.map(h => hueDistance(h, c.hue))) : 360;
                if (score > bestScore) { bestScore = score; best = idx; }
            });
            if (best === -1) best = 0;

            used.add(best);
            assignedHue[factionId] = candidates[best].hue;
            this.factions.list[factionId].color = candidates[best].hex;
        });
    },
    getColorOf(index, seedOffset = 0) {
        if (index < this.factions.colors.all.length) return this.factions.colors.all[index];

        const goldenAngle = 137.508;
        const hue = (seedOffset + index * goldenAngle) % 360;
        const saturation = 70 + (index % 3) * 8;
        const lightness = 48 + (index % 2) * 8;

        return this.color.hslToHex(hue, saturation, lightness);
    },
    drawBorders(ctx, zoomScale = 1) {
        if (!this.factions.list || !this.factions.list.length || !this.edgeMap) return;
        ctx.lineJoin = 'round';
    
        const borderWidth = 1.4 / zoomScale * 1.2;
        const offset = 0.7 / zoomScale * 1.2;

        this.edgeMap.forEach(edge => {
            if (edge.regionIds.length < 2) return;
            const [a, b] = edge.regionIds;
            const regionA = this.terrain.regions[a], regionB = this.terrain.regions[b];
            if (regionA.ownerId === regionB.ownerId) return;

            const segments = this.getNoisyLineSegments(edge.p1[0], edge.p1[1], edge.p2[0], edge.p2[1]);

            const dx = edge.p2[0] - edge.p1[0], dy = edge.p2[1] - edge.p1[1];
            const len = Math.hypot(dx, dy) || 1;
            let nx = -dy / len, ny = dx / len;

            const midX = (edge.p1[0] + edge.p2[0]) / 2, midY = (edge.p1[1] + edge.p2[1]) / 2;
            const towardA = (regionA.x - midX) * nx + (regionA.y - midY) * ny;
            if (towardA < 0) { nx = -nx; ny = -ny; }

            const colorA = (regionA.ownerId !== null && regionA.ownerId !== undefined)
                ? (this.factions.list[regionA.ownerId]?.color || this.factions.colors.neutral)
                : this.factions.colors.neutral;
            const colorB = (regionB.ownerId !== null && regionB.ownerId !== undefined)
                ? (this.factions.list[regionB.ownerId]?.color || this.factions.colors.neutral)
                : this.factions.colors.neutral;

            this.utils.strokeOffsetPolyline(ctx, segments, nx, ny, offset, colorA, borderWidth);
            this.utils.strokeOffsetPolyline(ctx, segments, -nx, -ny, offset, colorB, borderWidth);
        });
    }
}

const MapTerrain = {
    createRegions(width, height, iterations = 2) {
        let regions = [];
        for (let i = 0; i < this.terrain.config.regionCount; i++) {
            regions.push({ x: this.utils.seededRandom() * width, y: this.utils.seededRandom() * height });
        }

        for (let iter = 0; iter < iterations; iter++) {
            const points = new Float64Array(regions.length * 2);
            for (let i = 0; i < regions.length; i++) {
                points[i * 2] = regions[i].x;
                points[i * 2 + 1] = regions[i].y;
            }
            const delaunay = new d3.Delaunay(points);
            const voronoi = delaunay.voronoi([0, 0, width, height]);

            const newRegions = [];
            for (let i = 0; i < regions.length; i++) {
                const polygon = voronoi.cellPolygon(i);
                if (!polygon) { newRegions.push(regions[i]); continue; }

                let cx = 0, cy = 0, area = 0;
                for (let j = 0; j < polygon.length - 1; j++) {
                    const p1 = polygon[j], p2 = polygon[j + 1];
                    const cross = p1[0] * p2[1] - p2[0] * p1[1];
                    area += cross;
                    cx += (p1[0] + p2[0]) * cross;
                    cy += (p1[1] + p2[1]) * cross;
                }
                area *= 0.5;

                if (Math.abs(area) > 1e-5) {
                    cx /= (6 * area); cy /= (6 * area);
                    cx = Math.max(10, Math.min(width - 10, cx));
                    cy = Math.max(10, Math.min(height - 10, cy));
                    newRegions.push({ x: cx, y: cy });
                } else {
                    newRegions.push(regions[i]);
                }
            }
            regions = newRegions;
        }
        return regions;
    },
    createTemperatures(regions, landT) {
        const n = regions.length;
        const temp = new Float64Array(n);
        const phase = this.utils.seededRandom() * Math.PI * 2;
        for (let i = 0; i < n; i++) {
            const nx = regions[i].x / this.width, ny = regions[i].y / this.height;
            const wobble = Math.sin(nx * Math.PI * 2.2 + phase) * 0.07 + Math.sin(nx * Math.PI * 5.0 - phase) * 0.035;
            let val = ny + wobble;
            val -= landT[i] * 0.32;
            temp[i] = Math.min(1, Math.max(0, val));
        }
        return temp;
    },
    addBlob(elevation, neighborsList, startId, height, decayBase, plateauHops = 0) {
        elevation[startId] += height;
        this.terrain.spreadDecay(elevation, neighborsList, [startId], height, decayBase, 0.12, plateauHops, 0.97, 0.06);
    },
    addRange(elevation, neighborsList, regions, startId, endId, height, decayBase) {
        const path = [startId];
        let current = startId;
        let guard = 0;
        while (current !== endId && guard < neighborsList.length) {
            guard++;
            let best = null, bestScore = Infinity;
            for (const nb of neighborsList[current]) {
                const dx = regions[nb].x - regions[endId].x;
                const dy = regions[nb].y - regions[endId].y;
                const d = Math.hypot(dx, dy) + this.utils.seededRandom() * 60;
                if (d < bestScore) { bestScore = d; best = nb; }
            }
            if (best === null || best === current) break;
            current = best;
            path.push(current);
            if (path.length > 200) break;
        }
    
        path.forEach(id => {
            elevation[id] += height * (0.65 + this.utils.seededRandom() * 0.35);
        });
        this.terrain.spreadDecay(elevation, neighborsList, path, height * 0.85, decayBase, 0.1);
    },
    spreadDecay(elevation, neighborsList, seedIds, initialHeight, decayBase, jitter, plateauHops = 0, plateauDecay = 0.97, plateauJitter = 0.06) {
        const used = new Uint8Array(elevation.length);
        const queue = [...seedIds];
        seedIds.forEach(id => used[id] = 1);
        let h = initialHeight;
        let qi = 0;
        let visited = 0;
        while (qi < queue.length) {
            const id = queue[qi++];
            for (const nb of neighborsList[id]) {
                if (used[nb]) continue;
                used[nb] = 1;
                visited++;
                h = visited > plateauHops
                    ? h * (decayBase + (this.utils.seededRandom() * jitter - jitter / 2))
                    : h * (plateauDecay + (this.utils.seededRandom() * plateauJitter - plateauJitter / 2));
                if (h < 0.02) continue;
                elevation[nb] += h;
                queue.push(nb);
            }
        }
    },
    createNeighbors(delaunay, n) {
        const neighbors = new Array(n);
        for (let i = 0; i < n; i++) neighbors[i] = Array.from(delaunay.neighbors(i));
        return neighbors;
    },
    findNeighbor(regions, x, y) {
        let best = 0, bestD = Infinity;
        for (let i = 0; i < regions.length; i++) {
            const d = (regions[i].x - x) ** 2 + (regions[i].y - y) ** 2;
            if (d < bestD) { bestD = d; best = i; }
        }
        return best;
    },
    getContinentCenters(densityScale) {
        const jitter = () => (this.utils.seededRandom() - 0.5);
        switch (this.terrain.config.shapeType) {
            case 'two_continents':
                const centers = [
                    { x: 0.28 + jitter() * 0.12, y: 0.5 + jitter() * 0.25, w: 1.0 },
                    { x: 0.72 + jitter() * 0.12, y: 0.5 + jitter() * 0.25, w: 1.0 },
                ];
                //const satellites = Math.round((1 + Math.floor(this.utils.seededRandom() * 7)) * densityScale);
                const satellites = 7;
                for (let i = 0; i < satellites; i++) {
                    const ang = this.utils.seededRandom() * Math.PI * 2;
                    const dist = 0.18 + this.utils.seededRandom() * 0.12;
                    centers.push({
                        x: 0.5 + Math.cos(ang) * dist,
                        y: 0.48 + Math.sin(ang) * dist,
                        w: 0.55 + this.utils.seededRandom() * 0.35,
                    });
                }
                return centers;
            case 'island':
                return [{ x: 0.5 + jitter() * 0.1, y: 0.5 + jitter() * 0.1, w: 0.85 }];
            case 'continent':
            default: {
                const centers = [
                    { x: 0.28 + jitter() * 0.12, y: 0.25 + jitter() * 0.25, w: 1.0 },
                    { x: 0.52 + jitter() * 0.12, y: 0.75 + jitter() * 0.25, w: 1.0 },
                    { x: 0.72 + jitter() * 0.12, y: 0.25 + jitter() * 0.25, w: 1.0 },
                ];
                const satellites = 4;
                for (let i = 0; i < satellites; i++) {
                    const ang = this.utils.seededRandom() * Math.PI * 2;
                    const dist = 0.18 + this.utils.seededRandom() * 0.12;
                    centers.push({
                        x: 0.5 + Math.cos(ang) * dist,
                        y: 0.48 + Math.sin(ang) * dist,
                        w: 0.55 + this.utils.seededRandom() * 0.35,
                    });
                }
                return centers;
            }
        }
    },
    createElevation(regions, neighborsList) {
        const n = regions.length;
        const elevation = new Float64Array(n);
        const seedTrig = (this.currentSeed % 1000) * 0.017;
        const seedPhase = this.utils.seededRandom() * Math.PI * 2;

        const densityScale = Math.sqrt(n / 600);

        const decayExponent = Math.min(1, 600 / n);
        const scaleDecay = (d) => Math.pow(d, decayExponent);

        elevation.fill(0);

        let blobDecay;
        if (this.terrain.config.shapeType === 'island') blobDecay = Math.min(0.997, Math.max(0.985, 0.993 + (this.terrain.config.landAmount - 1.0) * 0.004));
        else blobDecay = Math.min(0.994, Math.max(0.965, 0.982 + (this.terrain.config.landAmount - 1.0) * 0.018));
        blobDecay = scaleDecay(blobDecay);
        const centers = this.terrain.getContinentCenters(densityScale);

        centers.forEach(c => {
            const startId = this.terrain.findNeighbor(regions, c.x * this.width, c.y * this.height);
            const peak = (0.75 + this.utils.seededRandom() * 0.35) * c.w * this.terrain.config.landAmount;
            this.terrain.addBlob(elevation, neighborsList, startId, peak, blobDecay);
        });

        const scaledPeakCount = Math.round(this.terrain.config.peakCount * densityScale);
        if (scaledPeakCount > 0) {
            const landCandidates = [];
            for (let i = 0; i < n; i++) if (elevation[i] > 0.22) landCandidates.push(i);
            if (landCandidates.length > 3) {
                const peakBlobDecay = scaleDecay(0.86 + this.terrain.config.relief * 0.05);
                const rangeDecay = scaleDecay(0.90 + this.terrain.config.relief * 0.03);
                const peakPlateau = Math.max(3, Math.round(7 * densityScale));

                const chosenPeaks = [];
                const minPeakDist = 0.16;
                const pickSpacedCandidate = (avoidId) => {
                    for (let attempt = 0; attempt < 10; attempt++) {
                        const id = landCandidates[Math.floor(this.utils.seededRandom() * landCandidates.length)];
                        if (id === avoidId) continue;
                        const cx = regions[id].x / this.width, cy = regions[id].y / this.height;
                        if (!chosenPeaks.some(p => Math.hypot(p.x - cx, p.y - cy) < minPeakDist)) return id;
                    }
                    return landCandidates[Math.floor(this.utils.seededRandom() * landCandidates.length)];
                };

                for (let i = 0; i < scaledPeakCount; i++) {
                    const startId = pickSpacedCandidate(-1);
                    chosenPeaks.push({ x: regions[startId].x / this.width, y: regions[startId].y / this.height });

                    const peakHeight = (0.85 + this.utils.seededRandom() * 0.3) * (0.6 + this.terrain.config.relief);
                    const asRidge = this.utils.seededRandom() < this.terrain.config.peakShape;
                    if (asRidge) {
                        const endId = pickSpacedCandidate(startId);
                        if (endId === startId) { this.terrain.addBlob(elevation, neighborsList, startId, peakHeight, peakBlobDecay, peakPlateau); continue; }
                        this.terrain.addRange(elevation, neighborsList, regions, startId, endId, peakHeight, rangeDecay);
                    } else {
                        this.terrain.addBlob(elevation, neighborsList, startId, peakHeight, peakBlobDecay, peakPlateau);
                    }
                }
            }
        }

        for (let i = 0; i < n; i++) {
            const nx = regions[i].x / this.width, ny = regions[i].y / this.height;
            const detail = Math.sin(nx * 23.0 * densityScale + seedTrig) * Math.cos(ny * 19.0 * densityScale - seedTrig) * 0.5
                            + Math.sin(nx * 47.0 * densityScale - ny * 31.0 * densityScale) * 0.25;
            const chaosJitter = this.utils.seededRandom() * 2 - 1;
            elevation[i] *= (1 + detail * (0.15 + this.terrain.config.relief * 0.55) + chaosJitter * this.terrain.config.chaos * 0.65);
        }

        for (let i = 0; i < n; i++) {
            const isEdge = regions[i].x < this.borderMargin || regions[i].x > this.width - this.borderMargin
                        || regions[i].y < this.borderMargin || regions[i].y > this.height - this.borderMargin;
            if (isEdge) elevation[i] *= 0.15;
        }
        return elevation;
    },
    classifyByLandFraction(elevation, targetFraction) {
        const n = elevation.length;
        const sorted = Array.from(elevation).sort((a, b) => a - b);
        const idx = Math.min(n - 1, Math.max(0, Math.floor((1 - targetFraction) * n)));
        const waterLevel = sorted[idx];
        const min = sorted[0];

        const landElevations = sorted.slice(idx);
        const refIdx = Math.min(landElevations.length - 1, Math.floor(landElevations.length * 0.95));
        const landMaxRef = landElevations[refIdx] || sorted[n - 1];
        const waterRange = (waterLevel - min) || 1;
        const landRange = (landMaxRef - waterLevel) || 1;

        const landCeiling = 0.35 + 0.65 * this.terrain.config.relief;

        const isWater = new Uint8Array(n);
        const t = new Float64Array(n);
        for (let i = 0; i < n; i++) {
            if (elevation[i] < waterLevel) {
                isWater[i] = 1;
                t[i] = Math.min(1, Math.max(0, (elevation[i] - min) / waterRange));
            } else {
                isWater[i] = 0;
                t[i] = Math.min(1, Math.max(0, (elevation[i] - waterLevel) / landRange)) * landCeiling;
            }
        }

        return { isWater, t };
    },
    cleanup(isWater, neighborsList, minLandSize) {
        const n = isWater.length;
        const visited = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
            if (visited[i] || isWater[i]) continue;
            const component = [i];
            visited[i] = 1;
            let qi = 0;
            while (qi < component.length) {
                const id = component[qi++];
                for (const nb of neighborsList[id]) {
                    if (visited[nb] || isWater[nb]) continue;
                    visited[nb] = 1;
                    component.push(nb);
                }
            }
            if (component.length < minLandSize) {
                for (const id of component) isWater[id] = 1;
            }
        }
    }
}

const MapUtils = {
    strokeOffsetPolyline(ctx, points, nx, ny, offset, color, width) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.beginPath();
        points.forEach((pt, k) => {
            const x = pt.x + nx * offset, y = pt.y + ny * offset;
            if (k === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
    },
    seededRandom() {
        this.currentSeed = (this.currentSeed * 48271) % 2147483647;
        return (this.currentSeed / 2147483647);
    },
    setSeed(seed) {
        this.initialSeed = seed || Math.floor(Math.random() * 9999999) + 1;
        this.currentSeed = this.initialSeed;
        return this.initialSeed;
    },
    findBand(bands, t) {
        for (const b of bands) if (t <= b.maxT) return b;
        return bands[bands.length - 1];
    }
}
const MapDecor = {
    pointInPolygon(x, y, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i][0], yi = polygon[i][1];
            const xj = polygon[j][0], yj = polygon[j][1];
            const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    },

    densityFor(region) {
        const table = {
            WOODLAND:     { count: [1, 20], icon: 'tree' },
            FOREST:       { count: [20, 40], icon: 'tree' },
            DENSE_FOREST: { count: [40, 50], icon: 'tree' },
            HIGHLANDS:    { count: [2, 10], icon: 'mountain' },
            PEAKS:        { count: [10, 20], icon: 'mountain' },
        };
        return table[region.biomeBand] || null;
    },

    generate(regions, voronoi) {
        regions.forEach(region => {
            region.decorations = [];
            if (region.isWater) return;

            const spec = this.decor.densityFor(region);
            if (!spec) return;

            const polygon = voronoi.cellPolygon(region.id);
            if (!polygon) return;

            const xs = polygon.map(p => p[0]), ys = polygon.map(p => p[1]);
            const minX = Math.min(...xs), maxX = Math.max(...xs);
            const minY = Math.min(...ys), maxY = Math.max(...ys);

            const count = spec.count[0] + Math.floor(this.utils.seededRandom() * (spec.count[1] - spec.count[0] + 1));
            let placed = 0, attempts = 0;
            while (placed < count && attempts < count * 8) {
                attempts++;
                const x = minX + this.utils.seededRandom() * (maxX - minX);
                const y = minY + this.utils.seededRandom() * (maxY - minY);
                if (!this.decor.pointInPolygon(x, y, polygon)) continue;

                region.decorations.push({
                    x, y,
                    icon: spec.icon,
                    size: 2.5 + this.utils.seededRandom() * 2,
                });
                placed++;
            }
        });
    },

    drawTree(ctx, x, y, size, zoomScale) {
        const s = size / zoomScale;
        ctx.fillStyle = '#3a5a3a';
        ctx.beginPath();
        ctx.moveTo(x, y - s * 1.6);
        ctx.lineTo(x - s, y + s * 0.4);
        ctx.lineTo(x + s, y + s * 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#5a3a28';
        ctx.fillRect(x - s * 0.12, y + s * 0.4, s * 0.24, s * 0.5);
    },

    drawMountain(ctx, x, y, size, zoomScale) {
        const s = size / zoomScale;
        ctx.fillStyle = '#664d37';
        ctx.beginPath();
        ctx.moveTo(x, y - s * 1.4);
        ctx.lineTo(x - s * 1.1, y + s * 0.6);
        ctx.lineTo(x + s * 1.1, y + s * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#f2f2f2';
        ctx.beginPath();
        ctx.moveTo(x, y - s * 1.4);
        ctx.lineTo(x - s * 0.35, y - s * 0.55);
        ctx.lineTo(x + s * 0.35, y - s * 0.55);
        ctx.closePath();
        ctx.fill();
    },

    drawRock(ctx, x, y, size, zoomScale) {
        const s = size / zoomScale;
        ctx.fillStyle = '#7a7568';
        ctx.beginPath();
        ctx.ellipse(x, y, s, s * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
    },

    render(ctx, zoomScale) {
        //const zoomMod = (2-zoomScale)*2;
        console.log(zoomScale)
        let zoomMod = (10 - zoomScale)*1.05;
        console.log(zoomMod)
        if(zoomMod > 12) zoomMod = 12
        this.terrain.regions.forEach(region => {
            if (!region.decorations || !region.decorations.length) return;
            region.decorations.forEach(d => {
                if (d.icon === 'tree') this.decor.drawTree(ctx, d.x, d.y, d.size, zoomMod);
                else if (d.icon === 'mountain') this.decor.drawMountain(ctx, d.x, d.y, d.size, zoomMod);
                else if (d.icon === 'rock') this.decor.drawRock(ctx, d.x, d.y, d.size, zoomMod);
            });
        });
    },
};