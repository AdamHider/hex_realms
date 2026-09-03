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


        this._isPanning = false;
        this._panStart = { x: 0, y: 0 };
        this.viewTransform = { x: 0, y: 0, scale: 1 };
        this.minScale = 0.6;
        this.maxScale = 10;

        this._renderScheduled = false;
        this.mapLayerScale = 6;
        this.sharpRegionBudget = 160;

        this.viewLevel = 'overview';
        this.layers = {
            terrain: this._createLayer(),
            political: this._createLayer(),
            fog: this._createLayer(),
        };
        this.fogEnabled = options.fogEnabled ?? true;


        this.color = {
            getBase: MapColor.getBase.bind(this),
            getGrayscale: MapColor.getGrayscale.bind(this),
            getResourceRange: MapColor.getResourceRange.bind(this),
            getResourceColor: MapColor.getResourceColor.bind(this),
            hexToRgb: MapColor.hexToRgb.bind(this),
            rgbToHex: MapColor.rgbToHex.bind(this),
            hslToHex: MapColor.hslToHex.bind(this),
            blend: MapColor.blend.bind(this)
        };

        this.interaction = {
            wheelDebounceTimer: null,
            initEvents: MapInteraction.initEvents.bind(this),
            hideTooltip: MapInteraction.hideTooltip.bind(this),
            describeRegion: MapInteraction.describeRegion.bind(this),
            handlePointerAt: MapInteraction.handlePointerAt.bind(this),
            _handleWheel: MapInteraction._handleWheel.bind(this),
            _handleMouseDown: MapInteraction._handleMouseDown.bind(this),
            _handleMouseUp: MapInteraction._handleMouseUp.bind(this),
            _handleMouseMove: MapInteraction._handleMouseMove.bind(this),
            selectRegionAt: MapInteraction.selectRegionAt.bind(this),
            clearSelection: MapInteraction.clearSelection.bind(this)
        }

        this.selection = {
            regionId: null,
            armyId: null,
            color: '#fff200',
            onSelect: options.onSelect || null,
            onArmySelect: options.onArmySelect || null,
        };

        this.factions = {
            config: options.factions || { count: 0 },
            startHops: options.startHops ?? 2,
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
            diplomacyColors: {
                player: '#facc15',   // жёлтый
                war: '#ef4444',      // красный
                alliance: '#3b82f6', // синий
                peace: '#94a3b8',    // нейтральный серый — не враг, не друг, не игрок
                neutral: 'rgba(148, 163, 184, 0)', // ничейная территория — как было
            },
            getTotal: MapFaction.getTotal.bind(this),
            pickCapitals: MapFaction.pickCapitals.bind(this),
            settle: MapFaction.settle.bind(this),
            setColors: MapFaction.setColors.bind(this),
            getColorOf: MapFaction.getColorOf.bind(this),
            drawBorders: MapFaction.drawBorders.bind(this),
            mapFactionEdges: MapFaction.mapFactionEdges.bind(this),
            getFactionAdjacency: MapFaction.getFactionAdjacency.bind(this),
            getNeighboringFactions: MapFaction.getNeighboringFactions.bind(this),
            computeVisibility: MapFaction.computeVisibility.bind(this),
            computeLabelPath: MapFaction.computeLabelPath.bind(this),
            renderFactionLabels: MapFaction.renderFactionLabels.bind(this),
            getLabelPath: MapFaction.getLabelPath.bind(this),
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
        this.utils = {
            strokeOffsetPolyline: MapUtils.strokeOffsetPolyline.bind(this),
            seededRandom: MapUtils.seededRandom.bind(this),
            setSeed: MapUtils.setSeed.bind(this),
            findBand: MapUtils.findBand.bind(this),
            generateRegionName: MapUtils.generateRegionName.bind(this),
            drawCurvedLabel: MapUtils.drawCurvedLabel.bind(this)
            
        }
        this.decorations = {
            enabled: options.iconsEnabled ?? true,
            ready: false,
            assets: {},
            basePath: options.iconBasePath || 'icons/',
            edgeMargin: options.iconEdgeMargin ?? 0.6,
            defaultSizePct: options.iconDefaultSizePct || [0.5, 0.6],
            gapFactor: options.iconGapFactor ?? 1, 
            sets: {
                STEPPE:       { count: [2, 4], keys: ['grass_tuft'], sizePct: [0.3, 0.4] },
                PLAINS:       { count: [4, 6], keys: ['grass_tuft'], sizePct: [0.3, 0.4] },
                GRASSLAND:    { count: [2, 3], keys: ['grass_tuft'], sizePct: [0.3, 0.4] },
                WETLANDS:     { count: [2, 3], keys: ['reed'], sizePct: [0.3, 0.4] },
                WOODLAND:     { count: [4, 6], keys: ['tree_lone'], sizePct: [0.3, 0.35] },
                FOREST:       { count: [3, 5], keys: ['tree_cluster'], sizePct: [0.6, 0.65] },
                DENSE_FOREST: { count: [4, 6], keys: ['tree_cluster', 'tree_snow_cluster'], sizePct: [0.6, 0.65] },
                HIGHLANDS:    { count: [2, 3], keys: ['rock', 'tree_snow_cluster'], sizePct: [0.7, 0.8] },
                PEAKS:        { count: [2, 3], keys: ['mountain'], sizePct: [0.7, 0.8]  },
                COAST:        { count: [1, 2], keys: ['grass_tuft'], sizePct: [0.3, 0.4] },
            },
            snowSets: {
                FOREST:       { count: [3, 5], keys: ['tree_snow'], sizePct: [0.3, 0.35]  },
                DENSE_FOREST: { count: [3, 4], keys: ['tree_snow_cluster'], sizePct: [0.6, 0.65]  },
                WOODLAND:     { count: [5, 6], keys: ['tree_snow_cluster'], sizePct: [0.6, 0.65]  },
                PEAKS:        { count: [2, 3], keys: ['mountain_snow'], sizePct: [0.7, 0.8]  },
                HIGHLANDS:    { count: [2, 3], keys: ['mountain_snow'], sizePct: [0.7, 0.8] },
            },
            hotSets: {
                COAST:        { count: [1, 2], keys: ['sand'], sizePct: [0.7, 0.8] },
                STEPPE:       { count: [2, 3], keys: ['sand'], sizePct: [0.5, 0.8] },
                PLAINS:       { count: [3, 4], keys: ['cactus'], sizePct: [0.2, 0.3] },
                GRASSLAND:    { count: [2, 3], keys: ['palm_lone'], sizePct: [0.3, 0.4] },
                COAST:        { count: [2, 3], keys: ['sand'], sizePct: [0.5, 0.8] },
                FOREST:       { count: [2, 3], keys: ['palm_cluster'], sizePct: [0.3, 0.4]  },
                DENSE_FOREST: { count: [3, 4], keys: ['palm_cluster'], sizePct: [0.3, 0.4]  },
                WOODLAND:     { count: [5, 6], keys: ['palm_lone'], sizePct: [0.3, 0.4]  },
                // сухие безлесные биомы в жаркой зоне логично отдать под пустыню:
                WETLANDS:  { count: [1, 2], keys: ['palm_lone'], sizePct: [0.3, 0.4] },
            },
            waterSets: {
                DEEP_OCEAN: { count: [1, 2], keys: ['wave'], sizePct: [0.7, 0.8] },
                OCEAN:      { count: [1, 2], keys: ['wave'], sizePct: [0.7, 0.8] },
                SHALLOW:    { count: [1, 2], keys: ['wave'], sizePct: [0.7, 0.8] },
            },
            variantsPerKey: {
                grass_tuft: 3, tree_lone: 3, tree_cluster: 3, tree_snow: 3,  tree_snow_cluster: 3,
                reed: 1, rock: 3, mountain: 3, mountain_snow: 2, wave: 3, sand: 3,
                palm_lone: 3, palm_cluster: 3, cactus: 1, oasis: 2,
            },
            textures: {
                enabled: options.texturesEnabled ?? true,
                ready: false,
                assets: {},
                variantCount: 4,
                alpha: options.textureAlpha ?? 0.5,
            },
            // методы
            loadAssets: MapDecorations._loadAssets.bind(this),
            shrinkPolygon: MapDecorations.shrinkPolygon.bind(this),
            pointInPolygon: MapDecorations.pointInPolygon.bind(this),
            resolveIconSet: MapDecorations.resolveIconSet.bind(this),
            generatePlacements: MapDecorations.generatePlacements.bind(this),
            assignTo: MapDecorations.assignTo.bind(this),
            paint: MapDecorations.paint.bind(this),
            paintTextures: MapDecorations.paintTextures.bind(this),
             
        };
        if (this.decorations.enabled) this.decorations.loadAssets();
        if (this.decorations.textures.enabled) this.decorations.loadTextures = MapDecorations._loadTextures.bind(this);
        if (this.decorations.textures.enabled) this.decorations.loadTextures();

        this.armies = {
            computeReachableRegions: MapArmies.computeReachableRegions.bind(this),
            selectArmy: MapArmies.selectArmy.bind(this),
            renderReachableArea: MapArmies.renderReachableArea.bind(this),
            renderArmies: MapArmies.renderArmies.bind(this),
        }

        this.armyAssets = {
            ready: false,
            images: {}, // ключ вида "3_2" — ранг 3, вариант 2
            basePath: options.armyAssetsPath || 'icons/',
            ranks: options.armyRanks ?? 5,
            variantsPerRank: options.armyVariantsPerRank ?? 3, // army_{rank}_1.png .. army_{rank}_3.png
        };
        this._loadArmyAssets();

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
            colors: { cold: '#9fb8a0', temperate: '#b5c95a', hot: '#d9c27a' },
            resources: { food: 2, production: 1, manpower: 1, gold: 1, upkeep: -0.5 } },
            { id: 'STEPPE', isWater: false, maxT: 0.16, label: 'Степь',
            colors: { cold: '#93ab97', temperate: '#a3bb52', hot: '#cdb26a' },
            resources: { food: 1, production: 1, manpower: 2, gold: 0, upkeep: -0.5 } },
            { id: 'PLAINS', isWater: false, maxT: 0.25, label: 'Равнина',
            colors: { cold: '#86a08c', temperate: '#8fae4f', hot: '#c2a35c' },
            resources: { food: 3, production: 1, manpower: 1, gold: 0, upkeep: -0.6 } },
            { id: 'GRASSLAND', isWater: false, maxT: 0.35, label: 'Луга',
            colors: { cold: '#7a9482', temperate: '#6fa050', hot: '#b8944a' },
            resources: { food: 3, production: 1, manpower: 2, gold: 0, upkeep: -0.6 } },
            { id: 'WETLANDS', isWater: false, maxT: 0.45, label: 'Болота',
            colors: { cold: '#6f8877', temperate: '#5c9159', hot: '#a9863e' },
            resources: { food: 2, production: 0, manpower: 1, gold: 0, upkeep: -0.7 } },
            { id: 'WOODLAND', isWater: false, maxT: 0.56, label: 'Редколесье',
            colors: { cold: '#63796d', temperate: '#4a8058', hot: '#9c7a3a' },
            resources: { food: 1, production: 2, manpower: 1, gold: 0, upkeep: -0.6 } },
            { id: 'FOREST', isWater: false, maxT: 0.68, label: 'Лес',
            colors: { cold: '#566a5f', temperate: '#3a6b52', hot: '#8a6a35' },
            resources: { food: 1, production: 3, manpower: 1, gold: 0, upkeep: -0.7 } },
            { id: 'DENSE_FOREST', isWater: false, maxT: 0.80, label: 'Густой лес',
            colors: { cold: '#4a5b53', temperate: '#2d5548', hot: '#7a5c30' },
            resources: { food: 0, production: 3, manpower: 1, gold: 0, upkeep: -0.8 } },
            { id: 'HIGHLANDS', isWater: false, maxT: 0.92, label: 'Плоскогорье',
            colors: { cold: '#8a9490', temperate: '#5c6b64', hot: '#8a7a5c' },
            resources: { food: 0, production: 2, manpower: 0, gold: 2, upkeep: -0.9 } },
            { id: 'PEAKS', isWater: false, maxT: Infinity, label: 'Пик',
            colors: { cold: '#eef2f0', temperate: '#9a9d9a', hot: '#a89a86' },
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
                    land:  { cold: { color: '#dfeff5', strength: 0.3 }, temperate: { color: '#d9f2a3', strength: 0.15 }, hot: { color: '#f2e6a8', strength: 0.05 } },
                    water: { cold: { color: '#dfeff5', strength: 0.01 }, temperate: { color: '#dfeff5', strength: 0.00 }, hot: { color: '#dfeff5', strength: 0.00 } },
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
                    land:  { cold: { color: '#ffffff', strength: 0.05 }, temperate: { color: '#fff4b0', strength: 0.05 }, hot: { color: '#ffdd88', strength: 0.18 } },
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
                    land:  { cold: { color: '#ffffff', strength: 0.30 }, temperate: { color: '#d9822b', strength: 0.25 }, hot: { color: '#e0a83e', strength: 0.08 } },
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
                    land:  { cold: { color: '#ffffff', strength: 0.80 }, temperate: { color: '#ffffff', strength: 0.35 }, hot: { color: '#ffffff', strength: 0.00 } },
                    water: { cold: { color: '#e8f4fb', strength: 0.02 }, temperate: { color: '#e8f4fb', strength: 0.01 }, hot: { color: '#e8f4fb', strength: 0.00 } },
                },
            },
        };
        this.seasonOrder = Object.keys(this.seasons);
    }
    _loadArmyAssets() {
        const loaders = [];
        for (let rank = 1; rank <= this.armyAssets.ranks; rank++) {
            for (let v = 1; v <= this.armyAssets.variantsPerRank; v++) {
                loaders.push(new Promise(resolve => {
                    const img = new Image();
                    const key = `${rank}_${v}`;
                    img.onload = () => { this.armyAssets.images[key] = img; resolve(); };
                    img.onerror = () => resolve();
                    img.src = `${this.armyAssets.basePath}army_${key}.png`;
                }));
            }
        }
        Promise.all(loaders).then(() => {
            this.armyAssets.ready = true;
            this.scheduleRender();
        });
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
        this.markDirty('terrain', 'political');
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
            region.temperature = temperature[i];
            region.name = this.utils.generateRegionName(region.isWater);
            const zone = temperature[i] < 0.20 ? 'cold' : temperature[i] > 0.60 ? 'hot' : 'temperate';
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
        regions.forEach((region, i) => {
            const polygon = voronoi.cellPolygon(i);
            if (polygon) {
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for (const [x, y] of polygon) {
                    if (x < minX) minX = x; if (x > maxX) maxX = x;
                    if (y < minY) minY = y; if (y > maxY) maxY = y;
                }
                region.bbox = { minX, minY, maxX, maxY };
                region.labelPath = this.computeRegionLabelPath(region, polygon);
            } else {
                region.bbox = { minX: region.x, minY: region.y, maxX: region.x, maxY: region.y };
            }
            this.decorations.assignTo(region, polygon || []);
        });

        this.factions.settle(regions, neighbors);
        this.factions.labelPathCache = new Map();

        this.terrain.regions = regions;
        this.mapVoronoi = voronoi;
        this.edgeMap = this.createEdgeMap();
        this.regionNeighbors = neighbors;
    
        this.viewTransform = { x: 0, y: 0, scale: 1 };
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION: MAP_DATA
    // Динамический синтез: превращает статичные mapRegions + текущие
    // "живые" параметры (сезон) в данные наружу и в тултип.
    // Вызывается многократно, без пересчёта setup().
    // ═══════════════════════════════════════════════════════════

    getRegionData(region) {
        return {
            id: region.id,
            name: region.name,
            x: region.x,
            y: region.y,
            isWater: region.isWater,
            biome: region.biomeBand,
            climateZone: region.climateZone,
            city: region.city,
            ownerId: region.ownerId,
            population: region.population,
            resources: this.getRegionResources(region),
        };
    }
    
    getRegionsData() {
        return this.terrain.regions.map(region => this.getRegionData(region));
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
    getFactionEconomy(factionId) {
        const totals = { food: 0, production: 0, manpower: 0, gold: 0, upkeep: 0 };
        let regionCount = 0;
    
        this.terrain.regions.forEach(region => {
            if (region.ownerId !== factionId) return;
            const res = this.getRegionResources(region);
            if (!res) return;
            regionCount++;
            totals.food += res.food;
            totals.production += res.production;
            totals.manpower += res.manpower;
            totals.gold += res.gold;
            totals.upkeep += res.upkeep;
        });
    
        return { ...totals, regionCount };
    }
    
    getAllFactionEconomies() {
        const result = {};
        (this.factions.list || []).forEach(f => {
            result[f.id] = this.getFactionEconomy(f.id);
        });
        return result;
    }
    getSelectedRegion() {
        if (this.selection.regionId === null) return null;
        const region = this.terrain.regions[this.selection.regionId];
        return region ? this.getRegionData(region) : null;
    }
    setViewMode(mode){
        this.viewMode = mode
        this.markDirty('terrain', 'political');
        this.render()
    }
    setSeason(season){
        this.currentSeason = season
        this.markDirty('terrain');
        this.render()
    }
    setShowClimate(climate){
        this.showClimate = climate
        this.markDirty('terrain');
        this.render()
    }
    setDiplomaticColorResolver(fn) {
        this.factions.getDiplomaticColor = fn;
    }
    setPlayerFaction(factionId) {
        this.playerFactionId = factionId;
        this.markDirty('fog');
        this.render();
    }
    setArmiesProvider(fn) {
        this.armiesProvider = fn;
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION: MAP_RENDER
    // Второй этап: перекладывает уже готовые this.terrain.regions на canvas.
    // Ничего не мутирует в данных — вызывается на каждую смену
    // сезона/слоя/фильтра без повторного setup().
    // ═══════════════════════════════════════════════════════════
    render() {
        const visibleRect = this.getVisibleWorldRect();
        this.updateViewLevel(visibleRect);
    
        if (this.viewLevel === 'detail') {
            this._drawDetail(visibleRect);
        } else {
            this._drawOverview();
        }
    }

    _drawOverview() {
        this.repaintLayersIfDirty();
    
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();
    
        const s = this.viewTransform.scale / this.mapLayerScale;
        this.ctx.save();
        this.ctx.translate(this.viewTransform.x, this.viewTransform.y);
        this.ctx.scale(s, s);
        this.ctx.drawImage(this.layers.terrain.canvas, 0, 0);
        this.ctx.drawImage(this.layers.political.canvas, 0, 0);
        this.ctx.drawImage(this.layers.fog.canvas, 0, 0);
        this.ctx.restore();
        this.ctx.save();
        this.ctx.translate(this.viewTransform.x, this.viewTransform.y);
        this.ctx.scale(this.viewTransform.scale, this.viewTransform.scale);
        this.renderDynamicObjects(this.ctx, this.viewTransform.scale);
        this.ctx.restore();
    }
    
    _drawDetail(visibleRect) {
        const dpr = window.devicePixelRatio || 1;
        if (this.canvas.width !== Math.round(this.canvas.clientWidth * dpr)) {
            this.canvas.width = Math.round(this.canvas.clientWidth * dpr);
            this.canvas.height = Math.round(this.canvas.clientHeight * dpr);
        }
    
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();
    
        this.ctx.save();
        this.ctx.translate(this.viewTransform.x, this.viewTransform.y);
        this.ctx.scale(this.viewTransform.scale, this.viewTransform.scale);
    
        this.renderRegions(this.ctx, visibleRect);
        this.paintCoastline(this.ctx, visibleRect);
        this.decorations.paintTextures(this.ctx, visibleRect);
        this.decorations.paint(this.ctx, visibleRect);
        this.factions.drawBorders(this.ctx, this.viewTransform.scale, visibleRect);
        this.renderDynamicObjects(this.ctx, this.viewTransform.scale);
        this.renderSelectedRegionLabel(this.ctx, this.viewTransform.scale);
        
        if (this.fogEnabled && this.playerFactionId !== null && this.playerFactionId !== undefined) {
            const visible = this.factions.computeVisibility(this.playerFactionId, this.fogVisionHops ?? 2);
            for (let i = 0; i < this.terrain.regions.length; i++) {
                if (visible[i]) continue;
                const region = this.terrain.regions[i];
                if (visibleRect && !this.bboxIntersects(region.bbox, visibleRect)) continue;
                const polygon = this.mapVoronoi.cellPolygon(i);
                if (!polygon) continue;
                this.ctx.fillStyle = 'rgba(5, 8, 15, 0.72)';
                this.drawRegionPath(this.ctx, polygon);
                this.ctx.fill();
            }
        }
        this.ctx.restore();
    }
    updateViewLevel(visibleRect) {
        const visibleCount = this.countVisibleRegions(visibleRect);
        this.viewLevel = visibleCount <= this.sharpRegionBudget ? 'detail' : 'overview';
    }
    renderSelectedRegionLabel(ctx, zoomScale) {
        if (this.selection.regionId === null) return;
        if (this.viewMode === 'factions') return;
    
        const region = this.terrain.regions[this.selection.regionId];
        if (!region || region.isWater) return;
    
        const playerVisible = this.fogEnabled && this.playerFactionId !== null && this.playerFactionId !== undefined
            ? this.factions.computeVisibility(this.playerFactionId, this.fogVisionHops ?? 2)
            : null;
        if (playerVisible && !playerVisible[region.id]) return;
    
        const path = region.labelPath;
        if (!path || path.length < 4) return; // слишком маленький регион — подпись не влезет разумно
    
        // название — растянутое вдоль главной оси региона
        this.utils.drawCurvedLabel(ctx, region.name, path.cx, path.cy, path.angle, path.length, zoomScale, {
            fontSize: 5,
            curveStrength: 0.1,
            color: 'rgba(20, 15, 10, 0.9)',
        });
        // ресурсы — отдельной строкой ниже, обычным (не изогнутым) текстом, для читаемости
        const res = this.getRegionResources(region);
        if (!res) return;
    
        const fontSize = 4 / zoomScale;
        ctx.save();
        ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(20, 15, 10, 0.85)';
        ctx.fillText(`🌾${res.food.toFixed(1)} ⚙️${res.production.toFixed(1)}`, region.x, region.y + fontSize * 2.2);
        ctx.restore();
    }
    renderDynamicObjects(ctx, zoomScale) {
        this.renderCities(ctx, zoomScale);
        this.armies.renderReachableArea(ctx, zoomScale);
        this.renderSelection(ctx, zoomScale);
        this.armies.render(ctx, zoomScale);
    }
    
    renderRegions(ctx, visibleRect = null) {
        const resourceRange = ['food', 'gold', 'production', 'manpower'].includes(this.viewMode)
        ? this.color.getResourceRange(this.viewMode)
        : null;

        for (let i = 0; i < this.terrain.regions.length; i++) {
            const polygon = this.mapVoronoi.cellPolygon(i);
            if (!polygon) continue;

            const region = this.terrain.regions[i];
            if (visibleRect && !this.bboxIntersects(region.bbox, visibleRect)) continue;
            ctx.fillStyle = this.color.getBase(region, resourceRange);
            ctx.strokeStyle = this.viewMode === 'factions' ? 'rgba(0, 0, 0, 0.25)' : 'rgba(2, 44, 44, 0.25)';
            ctx.lineWidth = 0.1;

            this.drawRegionPath(ctx, polygon);
            ctx.fill();
            ctx.stroke();

            if (region.ownerId !== null && region.ownerId !== undefined && this.factions.list?.[region.ownerId]) {
                ctx.save();
                ctx.globalAlpha = this.viewMode === 'factions' ? 0.65 : (this.viewMode === 'political') ? 0.52 : 0;
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
    
    
    getVisibleWorldRect(margin = 40) {
        const vt = this.viewTransform;
        const minX = (0 - vt.x) / vt.scale - margin;
        const minY = (0 - vt.y) / vt.scale - margin;
        const maxX = (this.canvas.width - vt.x) / vt.scale + margin;
        const maxY = (this.canvas.height - vt.y) / vt.scale + margin;
        return { minX, minY, maxX, maxY };
    }
    
    bboxIntersects(bbox, rect) {
        return bbox.maxX >= rect.minX && bbox.minX <= rect.maxX &&
               bbox.maxY >= rect.minY && bbox.minY <= rect.maxY;
    }
    scheduleRender() {
        if (this._renderScheduled) return;
        this._renderScheduled = true;
        requestAnimationFrame(() => {
            this._renderScheduled = false;
            this.render();
        });
    }
    _createLayer() {
        const canvas = document.createElement('canvas');
        canvas.width = this.width * this.mapLayerScale;
        canvas.height = this.height * this.mapLayerScale;
        return { canvas, ctx: canvas.getContext('2d'), dirty: true };
    }
    
    markDirty(...layerNames) {
        layerNames.forEach(name => {
            if (this.layers[name]) this.layers[name].dirty = true;
        });
    }
    
    _paintTerrainLayer() {
        const ctx = this.layers.terrain.ctx;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.layers.terrain.canvas.width, this.layers.terrain.canvas.height);
        ctx.scale(this.mapLayerScale, this.mapLayerScale);
        this.renderRegions(ctx);
        this.paintCoastline(ctx);
        this.decorations.paintTextures(ctx);
        this.decorations.paint(ctx);
        ctx.restore();
    }
    
    _paintPoliticalLayer() {
        const ctx = this.layers.political.ctx;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.layers.political.canvas.width, this.layers.political.canvas.height);
        ctx.scale(this.mapLayerScale, this.mapLayerScale);
        this.factions.drawBorders(ctx, this.mapLayerScale); 
        this.factions.renderFactionLabels(ctx, this.mapLayerScale);
        ctx.restore();
    }
    _paintFogLayer(playerFactionId) {
        const ctx = this.layers.fog.ctx;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.layers.fog.canvas.width, this.layers.fog.canvas.height);
    
        if (!this.fogEnabled || playerFactionId === null || playerFactionId === undefined) {
            ctx.restore();
            return;
        }
    
        ctx.scale(this.mapLayerScale, this.mapLayerScale);
        const visible = this.factions.computeVisibility(playerFactionId, this.fogVisionHops ?? 2);
    
        for (let i = 0; i < this.terrain.regions.length; i++) {
            if (visible[i]) continue; // видимые регионы не затемняем
            const polygon = this.mapVoronoi.cellPolygon(i);
            if (!polygon) continue;
    
            ctx.fillStyle = 'rgba(5, 8, 15, 0.52)';
            this.drawRegionPath(ctx, polygon);
            ctx.fill();
        }
        ctx.restore();
    }
    paintCoastline(ctx, visibleRect) {
        if (!this.edgeMap) return;
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1;
        ctx.lineJoin = 'round';
        ctx.filter = 'blur(2px)'
    
        this.edgeMap.forEach(edge => {
            if (visibleRect) {
                const ex = Math.min(edge.p1[0], edge.p2[0]), eX = Math.max(edge.p1[0], edge.p2[0]);
                const ey = Math.min(edge.p1[1], edge.p2[1]), eY = Math.max(edge.p1[1], edge.p2[1]);
                if (eX < visibleRect.minX || ex > visibleRect.maxX || eY < visibleRect.minY || ey > visibleRect.maxY) return;
            }
            if (edge.regionIds.length < 2) return;
            const [a, b] = edge.regionIds;
            const ra = this.terrain.regions[a], rb = this.terrain.regions[b];
            if (ra.isWater === rb.isWater) return; // рисуем линию только там, где по одну сторону суша, по другую вода
    
            const segments = this.getNoisyLineSegments(edge.p1[0], edge.p1[1], edge.p2[0], edge.p2[1]);
            ctx.beginPath();
            segments.forEach((pt, k) => k === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
            ctx.stroke();
        });
        ctx.restore();
    }
    repaintLayersIfDirty() {
        if (this.layers.terrain.dirty) { this._paintTerrainLayer(); this.layers.terrain.dirty = false; }
        if (this.layers.political.dirty) { this._paintPoliticalLayer(); this.layers.political.dirty = false; }
        if (this.layers.fog.dirty) { this._paintFogLayer(this.playerFactionId); this.layers.fog.dirty = false; }
    }
    countVisibleRegions(visibleRect) {
        let count = 0;
        for (let i = 0; i < this.terrain.regions.length; i++) {
            if (this.bboxIntersects(this.terrain.regions[i].bbox, visibleRect)) count++;
        }
        return count;
    }
    renderSelection(ctx, zoomScale) {
        if (this.selection.regionId === null) return;
        const region = this.terrain.regions[this.selection.regionId];
        if (!region) return;
    
        const polygon = this.mapVoronoi.cellPolygon(region.id);
        if (!polygon) return;
    
        ctx.save();
        ctx.lineWidth = 3 / zoomScale;
        ctx.strokeStyle = this.selection.color;
        ctx.shadowColor = this.selection.color;
        ctx.shadowBlur = 4 / zoomScale;
        this.drawRegionPath(ctx, polygon);
        ctx.stroke();
        ctx.restore();
    }
    focusOnRegion(regionId, targetScale = 2.5) {
        const region = this.terrain.regions[regionId];
        if (!region) return;
    
        const scale = Math.min(this.maxScale, Math.max(this.minScale, targetScale));
        this.viewTransform.scale = scale;
        this.viewTransform.x = this.canvas.width / 2 - region.x * scale;
        this.viewTransform.y = this.canvas.height / 2 - region.y * scale;
    
        this.scheduleRender();
    }
    computeRegionLabelPath(region, polygon) {
        let cx = 0, cy = 0;
        polygon.forEach(([x, y]) => { cx += x; cy += y; });
        cx /= polygon.length; cy /= polygon.length;
    
        let sxx = 0, syy = 0, sxy = 0;
        polygon.forEach(([x, y]) => {
            const dx = x - cx, dy = y - cy;
            sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
        });
        const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    
        let minProj = Infinity, maxProj = -Infinity;
        polygon.forEach(([x, y]) => {
            const proj = (x - cx) * Math.cos(angle) + (y - cy) * Math.sin(angle);
            if (proj < minProj) minProj = proj;
            if (proj > maxProj) maxProj = proj;
        });
    
        return { cx, cy, angle, length: maxProj - minProj };
    }
}
// ═══════════════════════════════════════════════════════════
// SECTION: MAP_COLORS
// Всё, что превращает состояние региона (биом/сезон/фракция)
// в конкретный цвет для заливки. Читает MAP_CONFIG + this.viewMode.
// ═══════════════════════════════════════════════════════════
const MapColor = {
    getBase(region, resourceRange) {
        if (this.viewMode === 'factions') {
            return this.color.getGrayscale(region);
        }
        if (!region.isWater && ['food', 'gold', 'production', 'manpower'].includes(this.viewMode)) {
            return this.color.getResourceColor(region, this.viewMode, resourceRange);
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
    },
    getResourceRange(key) {
        let min = Infinity, max = -Infinity;
        this.terrain.regions.forEach(region => {
            const res = this.getRegionResources(region);
            if (!res) return;
            const v = res[key];
            if (v < min) min = v;
            if (v > max) max = v;
        });
        if (!isFinite(min)) { min = 0; max = 1; }
        if (min === max) max = min + 1; // защита от деления на 0, если все значения одинаковы
        return { min, max };
    },
    
    getResourceColor(region, key, range) {
        const res = this.getRegionResources(region);
        if (!res) return '#333333';
    
        const scales = {
            food:       ['#7a1f1f', '#2f9e44'], // мало — красный, много — зелёный
            gold:       ['#4a2e1a', '#e08e2b'], // мало — коричневый, много — оранжевый
            production: ['#d7e6f2', '#12294f'], // мало — бледно-голубой, много — насыщенный тёмно-синий
            manpower:   ['#dbd7d8', '#e83a63'], // мало — бледно-голубой, много — насыщенный тёмно-синий
               
        };
        const [lowColor, highColor] = scales[key];
    
        const t = Math.max(0, Math.min(1, (res[key] - range.min) / (range.max - range.min)));
        return this.color.blend(lowColor, highColor, t);
    },
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
        window.addEventListener('mouseup', e => this.interaction._handleMouseUp(e));
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
    selectRegionAt(clientX, clientY) {
        if (!this.terrain.regions.length) return null;
    
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const px = (clientX - rect.left) * scaleX;
        const py = (clientY - rect.top) * scaleY;
    
        const wx = (px - this.viewTransform.x) / this.viewTransform.scale;
        const wy = (py - this.viewTransform.y) / this.viewTransform.scale;
    
        if (wx < 0 || wy < 0 || wx > this.width || wy > this.height) {
            this.interaction.clearSelection();
            return null;
        }
    
        const idx = this.terrain.findNeighbor(this.terrain.regions, wx, wy);
        if (idx === -1) {
            this.interaction.clearSelection();
            return null;
        }
    
        const region = this.terrain.regions[idx];
        const wasArmySelected = this.selection.armyId;
        const previousArmyRegionId = wasArmySelected
            ? this.armiesProvider?.().find(a => a.id === this.selection.armyId)?.regionId
            : null;
    
        // Состояние 1: армия уже выбрана
        if (wasArmySelected) {
            if (this.selection.reachableSet && this.selection.reachableSet.has(idx)) {
                if (this.selection.onMoveRequest) this.selection.onMoveRequest(this.selection.armyId, idx);
                this.interaction.clearSelection();
                return null;
            }
            // снимаем армию безусловно
            this.selection.armyId = null;
            this.selection.reachableSet = null;
    
            // если второй клик пришёлся ровно на тот же регион, где стояла армия —
            // принудительно выбираем регион, минуя повторную проверку "есть ли тут своя армия"
            if (idx === previousArmyRegionId) {
                this.selection.regionId = region.id;
                this.scheduleRender();
                const regionData = this.getRegionData(region);
                if (this.selection.onSelect) this.selection.onSelect(regionData);
                return regionData;
            }
            // иначе (клик по другому региону, не входящему в зону и не тому, где была армия) —
            // просто продолжаем выполнение вниз как обычный клик по новому месту
        }
    
        // Состояние 2: армии не выбрано — проверяем, есть ли своя армия в этом регионе
        const armiesHere = this.armiesProvider ? this.armiesProvider().filter(a => a.regionId === region.id) : [];
        const ownArmy = armiesHere.find(a => a.factionId === this.playerFactionId);
    
        if (ownArmy) {
            this.selection.regionId = null;
            this.armies.selectArmy(ownArmy.id);
            return null;
        }
    
        this.selection.regionId = region.id;
        this.selection.armyId = null;
        this.selection.reachableSet = null;
        this.scheduleRender();
    
        const regionData = this.getRegionData(region);
        if (this.selection.onSelect) this.selection.onSelect(regionData);
        return regionData;
    },
    
    clearSelection() {
        if (this.selection.regionId === null && this.selection.armyId === null) return;
        this.selection.regionId = null;
        this.selection.armyId = null;
        this.selection.reachableSet = null;
        this.scheduleRender();
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

        this.scheduleRender();
        this.interaction.hideTooltip();
    },
    _handleMouseDown(e) {
        this._isPanning = true;
        this._panStart = { x: e.clientX, y: e.clientY };
        this._transformStart = { x: this.viewTransform.x, y: this.viewTransform.y };
        this.canvas.style.cursor = 'grabbing';
    },
    _handleMouseUp(e) {
        this._isPanning = false;
        this.canvas.style.cursor = 'grab';
    
        const dx = e.clientX - this._panStart.x;
        const dy = e.clientY - this._panStart.y;
        const dragDistance = Math.hypot(dx, dy);
    
        if (dragDistance < 5) {
            this.interaction.selectRegionAt(e.clientX, e.clientY);
        }
    
        this.scheduleRender();
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
    
            this.scheduleRender();
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
        const scaled = Math.round(this.terrain.config.regionCount / 40);
        return Math.max(8, Math.min(70, scaled));
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
    drawBorders(ctx, zoomScale = 1, visibleRect = null) {
        if (!this.factions.list || !this.factions.list.length || !this.edgeMap) return;
        ctx.lineJoin = 'round';

        let borderWidth = 1;
        let offset = 0.6;
        if (zoomScale > 4) {
            borderWidth = 0.6;
            offset = 0.3;
        }
        const outlineWidth = borderWidth * 1.5;
        const outlineColor = '#00000073';
        
        this.factions.mapFactionEdges(ctx, offset, outlineColor, outlineWidth, visibleRect);
        this.factions.mapFactionEdges(ctx, offset, null, borderWidth, visibleRect);
        this.factions.mapFactionEdges(ctx, 0, '#a3aa9b', 0.3, visibleRect);
    },
    mapFactionEdges(ctx, offset, color, width, visibleRect){
        const useFactionColors = this.viewMode === 'factions'; 
        const resolveColor = (ownerId) => {
            if (ownerId === null || ownerId === undefined) return this.factions.colors.neutral;
            if (useFactionColors) return this.factions.list[ownerId]?.color || this.factions.colors.neutral;
            return this.factions.getDiplomaticColor
                ? this.factions.getDiplomaticColor(ownerId)
                : (this.factions.list[ownerId]?.color || this.factions.colors.neutral);
        };
        this.edgeMap.forEach(edge => {
            if (edge.regionIds.length < 2) return;
            const [a, b] = edge.regionIds;
            const regionA = this.terrain.regions[a], regionB = this.terrain.regions[b];
            
            if (regionA.ownerId === regionB.ownerId) return;

            if (visibleRect) {
                const ex = Math.min(edge.p1[0], edge.p2[0]), eX = Math.max(edge.p1[0], edge.p2[0]);
                const ey = Math.min(edge.p1[1], edge.p2[1]), eY = Math.max(edge.p1[1], edge.p2[1]);
                if (eX < visibleRect.minX || ex > visibleRect.maxX || eY < visibleRect.minY || ey > visibleRect.maxY) return;
            }

            const segments = this.getNoisyLineSegments(edge.p1[0], edge.p1[1], edge.p2[0], edge.p2[1]);

            const dx = edge.p2[0] - edge.p1[0], dy = edge.p2[1] - edge.p1[1];
            const len = Math.hypot(dx, dy) || 1;
            let nx = -dy / len, ny = dx / len;

            const midX = (edge.p1[0] + edge.p2[0]) / 2, midY = (edge.p1[1] + edge.p2[1]) / 2;
            const towardA = (regionA.x - midX) * nx + (regionA.y - midY) * ny;
            if (towardA < 0) { nx = -nx; ny = -ny; }

            let colorA = color;
            let colorB= color;
            if(!color){
                colorA = resolveColor(regionA.ownerId);
                colorB = resolveColor(regionB.ownerId);
            } 
           
            this.utils.strokeOffsetPolyline(ctx, segments, nx, ny, offset, colorA, width);
            this.utils.strokeOffsetPolyline(ctx, segments, -nx, -ny, offset, colorB, width);

        });
    },
    getFactionAdjacency() {
        const count = this.factions.list.length;
        const adjacency = Array.from({ length: count }, () => new Set());
    
        for (let i = 0; i < this.terrain.regions.length; i++) {
            const ownerI = this.terrain.regions[i].ownerId;
            if (ownerI === null || ownerI === undefined) continue;
        }
    
        this.edgeMap.forEach(edge => {
            if (edge.regionIds.length < 2) return;
            const [a, b] = edge.regionIds;
            const ownerA = this.terrain.regions[a].ownerId;
            const ownerB = this.terrain.regions[b].ownerId;
            if (ownerA === null || ownerB === null || ownerA === undefined || ownerB === undefined) return;
            if (ownerA === ownerB) return;
            adjacency[ownerA].add(ownerB);
            adjacency[ownerB].add(ownerA);
        });
    
        return adjacency;
    },
    getNeighboringFactions(factionId) {
        const adjacency = this.factions.getFactionAdjacency();
        return adjacency[factionId] ? [...adjacency[factionId]] : [];
    },
    computeVisibility(factionId, visionHops = 1) {
        const n = this.terrain.regions.length;
        const visible = new Uint8Array(n);
        if (factionId === null || factionId === undefined) return visible;
    
        let frontier = [];
        this.terrain.regions.forEach((r, i) => {
            if (r.ownerId === factionId) { visible[i] = 1; frontier.push(i); }
        });
    
        for (let hop = 0; hop < visionHops; hop++) {
            const next = [];
            frontier.forEach(id => {
                (this.regionNeighbors?.[id] || []).forEach(nb => {
                    if (!visible[nb]) { visible[nb] = 1; next.push(nb); }
                });
            });
            frontier = next;
        }
        return visible;
    },
    computeLabelPath(factionId) {
        const owned = this.terrain.regions.filter(r => r.ownerId === factionId && !r.isWater);
        if (!owned.length) return null;
    
        // центр масс
        let cx = 0, cy = 0;
        owned.forEach(r => { cx += r.x; cy += r.y; });
        cx /= owned.length; cy /= owned.length;
    
        // главная ось через 2x2 матрицу ковариации (упрощённый PCA)
        let sxx = 0, syy = 0, sxy = 0;
        owned.forEach(r => {
            const dx = r.x - cx, dy = r.y - cy;
            sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
        });
        const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    
        // приблизительная длина владений вдоль главной оси
        let minProj = Infinity, maxProj = -Infinity;
        owned.forEach(r => {
            const proj = (r.x - cx) * Math.cos(angle) + (r.y - cy) * Math.sin(angle);
            if (proj < minProj) minProj = proj;
            if (proj > maxProj) maxProj = proj;
        });
        const length = maxProj - minProj;
    
        return { cx, cy, angle, length };
    },
    renderFactionLabels(ctx, zoomScale) {
        if (!['factions', 'political'].includes(this.viewMode)) return;
        if (!this.factions.list?.length) return;
    
        this.factions.list.forEach(faction => {
            const path = this.factions.getLabelPath(faction.id);
            if (!path || path.length < 15) return; // слишком маленькая территория — подпись не влезет разумно
    
            this.utils.drawCurvedLabel(ctx, faction.name.toUpperCase(), path.cx, path.cy, path.angle, path.length, zoomScale, {
                fontSize: 9,
                color: 'rgba(20, 15, 10, 0.85)',
            });
        });
    },
    getLabelPath(factionId) {
        if (this.factions.labelPathCache.has(factionId)) return this.factions.labelPathCache.get(factionId);
        const path = this.factions.computeLabelPath(factionId);
        this.factions.labelPathCache.set(factionId, path);
        return path;
    },
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
            val -= landT[i] * 0.2;
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
                    { x: 0.20 + jitter() * 0.12, y: 0.25 + jitter() * 0.25, w: 1.0 },
                    { x: 0.50 + jitter() * 0.12, y: 0.75 + jitter() * 0.25, w: 1.0 },
                    { x: 0.60 + jitter() * 0.12, y: 0.25 + jitter() * 0.25, w: 1.0 },
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
    },
    generateRegionName(isWater) {
        const landPrefixes = ['Нов', 'Стар', 'Верх', 'Ниж', 'Крас', 'Бел', 'Чёрн', 'Зелен', 'Тих', 'Дальн'];
        const landSuffixes = ['город', 'поль', 'озёрск', 'горск', 'дол', 'брод', 'лесье', 'край', 'вин', 'бург'];
        const waterPrefixes = ['Синь', 'Глубь', 'Штиль', 'Волн', 'Прилив'];
        const waterSuffixes = ['море', 'залив', 'пролив', 'воды', 'простор'];
    
        const prefixes = isWater ? waterPrefixes : landPrefixes;
        const suffixes = isWater ? waterSuffixes : landSuffixes;
    
        const p = prefixes[Math.floor(this.utils.seededRandom() * prefixes.length)];
        const s = suffixes[Math.floor(this.utils.seededRandom() * suffixes.length)];
        return p + s;
    },
    drawCurvedLabel(ctx, text, cx, cy, angle, length, zoomScale, options = {}) {
        const fontSize = (options.fontSize ?? 8) / zoomScale;
        const curveStrength = options.curveStrength ?? 0.15; // 0 = прямая линия, выше = сильнее дуга
        const letterSpacingScale = options.letterSpacing ?? 1.1;

        ctx.save();
        ctx.font = `bold ${fontSize}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = options.color ?? 'rgba(20, 15, 10, 0.85)';

        // ширина текста для равномерного распределения по доступной длине
        const totalTextWidth = [...text].reduce((sum, ch) => sum + ctx.measureText(ch).width * letterSpacingScale, 0);
        const usableLength = Math.min(length * 0.85, totalTextWidth * 2.2); // не растягиваем текст сильнее, чем нужно

        let cursor = -usableLength / 2;
        const dx = Math.cos(angle), dy = Math.sin(angle);
        const perpX = -dy, perpY = dx; // перпендикуляр к главной оси — для дуги

        [...text].forEach(ch => {
            const w = ctx.measureText(ch).width * letterSpacingScale;
            const t = (cursor + w / 2) / (usableLength / 2 || 1); // -1..1 вдоль линии
            const bow = curveStrength * length * 0.15 * (1 - t * t); // парабола — выгиб сильнее в центре

            const px = cx + dx * (cursor + w / 2) + perpX * bow;
            const py = cy + dy * (cursor + w / 2) + perpY * bow;
            const letterAngle = angle + t * curveStrength * 0.6; // лёгкий поворот букв по ходу дуги

            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(letterAngle);
            ctx.fillText(ch, 0, 0);
            ctx.restore();

            cursor += w;
        });

        ctx.restore();
    },
}
// ═══════════════════════════════════════════════════════════
// SECTION: MAP_DECORATIONS
// Растровые иконки поверх регионов (деревья, горы, рябь и т.п.).
// Позиции считаются один раз в setup() — статичны для карты.
// Асинхронная загрузка спрайтов не блокирует создание карты.
// ═══════════════════════════════════════════════════════════
const MapDecorations = {
    _loadAssets() {
        const keys = new Set();
        Object.keys(this.decorations.variantsPerKey).forEach(key => {
            for (let v = 1; v <= this.decorations.variantsPerKey[key]; v++) keys.add(`${key}_${v}`);
        });

        const loaders = [...keys].map(name => new Promise(resolve => {
            const img = new Image();
            img.onload = () => { this.decorations.assets[name] = img; resolve(); };
            img.onerror = () => resolve();
            img.src = `${this.decorations.basePath}${name}.png`;
        }));

        Promise.all(loaders).then(() => {
            this.decorations.ready = true;
            if (this.terrain.regions.length) { this.markDirty('terrain'); this.render(); }
        });
    },
    _loadTextures() {
        const loaders = [];
        for (let v = 1; v <= this.decorations.textures.variantCount; v++) {
            loaders.push(new Promise(resolve => {
                const img = new Image();
                img.onload = () => { this.decorations.textures.assets[v] = img; resolve(); };
                img.onerror = () => resolve();
                img.src = `${this.decorations.basePath}texture_${v}.png`;
            }));
        }
        Promise.all(loaders).then(() => {
            this.decorations.textures.ready = true;
            if (this.terrain.regions.length) { this.markDirty('terrain'); this.render(); }
        });
    },
    shrinkPolygon(polygon, factor) {
        let cx = 0, cy = 0;
        polygon.forEach(([x, y]) => { cx += x; cy += y; });
        cx /= polygon.length; cy /= polygon.length;
        return polygon.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor]);
    },

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

    resolveIconSet(region) {
        if (region.isWater) return this.decorations.waterSets[region.biomeBand] || null;
        if (region.climateZone === 'cold' && this.decorations.snowSets[region.biomeBand]) {
            return this.decorations.snowSets[region.biomeBand];
        }
        if (region.climateZone === 'hot' && this.decorations.hotSets[region.biomeBand]) {
            return this.decorations.hotSets[region.biomeBand];
        }
        return this.decorations.sets[region.biomeBand] || null;
    },

    generatePlacements(region, polygon) {
        const set = this.decorations.resolveIconSet(region);
        if (!set) return [];
    
        const inner = this.decorations.shrinkPolygon(polygon, this.decorations.edgeMargin);
        const xs = inner.map(p => p[0]), ys = inner.map(p => p[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        if (maxX - minX < 2 || maxY - minY < 2) return [];
    
        const refDim = Math.min(maxX - minX, maxY - minY);
        const [sizePctMin, sizePctMax] = set.sizePct || this.decorations.defaultSizePct;
    
        const count = set.count[0] + Math.floor(this.utils.seededRandom() * (set.count[1] - set.count[0] + 1));
        const placements = [];
        const gapFactor = this.decorations.gapFactor; // доля от суммы радиусов, требуемая как зазор

        // Особый случай: один крупный доминирующий объект (например, единственная гора) — ставим в центр, без поиска места
        
        const isSingleDominant = set.count[0] === set.count[1] && set.count[0] <= 1 &&
            (set.sizePct?.[0] ?? 0) > 0.7;

        if (isSingleDominant) {
            const xs = inner.map(p => p[0]), ys = inner.map(p => p[1]);
            const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
            const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
            const refDim = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
            const [sMin, sMax] = set.sizePct;
            const size = refDim * (sMin + this.utils.seededRandom() * (sMax - sMin));
            const key = set.keys[Math.floor(this.utils.seededRandom() * set.keys.length)];
            const variant = 1 + Math.floor(this.utils.seededRandom() * (this.decorations.variantsPerKey[key] || 1));
            return [{ assetName: `${key}_${variant}`, x: cx, y: cy, size, rotation: 0 }];
        }
        
        for (let n = 0; n < count; n++) {
            for (let attempt = 0; attempt < 15; attempt++) {
                const x = minX + this.utils.seededRandom() * (maxX - minX);
                const y = minY + this.utils.seededRandom() * (maxY - minY);
                if (!this.decorations.pointInPolygon(x, y, inner)) continue;
        
                const sizePct = sizePctMin + this.utils.seededRandom() * (sizePctMax - sizePctMin);
                const size = refDim * sizePct;
        
                // проверяем не только центр, но и что иконка целиком (по её половине размера в 4 стороны)
                // остаётся внутри сжатого полигона — грубая, но дешёвая аппроксимация через 4 угла bounding box иконки
                const half = size / 4;
                const corners = [
                    [x - half, y - half], [x + half, y - half],
                    [x - half, y + half], [x + half, y + half],
                ];
                /*
                const allInside = corners.every(([cx, cy]) => this.decorations.pointInPolygon(cx, cy, inner));
                if (!allInside) continue;
                */
                const tooClose = placements.some(p => {
                    const required = (p.size / 2 + size / 2) * gapFactor;
                    return Math.hypot(p.x - x, p.y - y) < required;
                });
                if (tooClose) continue;
    
                const key = set.keys[Math.floor(this.utils.seededRandom() * set.keys.length)];
                const variantCount = this.decorations.variantsPerKey[key] || 1;
                const variant = 1 + Math.floor(this.utils.seededRandom() * variantCount);
                const rotation = 0;
    
                placements.push({ assetName: `${key}_${variant}`, x, y, size, rotation });
                break;
            }
        }
        return placements;
    },

    assignTo(region, polygon) {
        region.icons = this.decorations.enabled ? this.decorations.generatePlacements(region, polygon) : [];
        region.textureVariant = (this.decorations.textures.enabled )
            ? 1 + Math.floor(this.utils.seededRandom() * this.decorations.textures.variantCount)
            : null;
    },

    paint(ctx, visibleRect = null) {
        if (!this.decorations.ready || this.viewMode === 'factions' ||
            ['food', 'gold', 'production', 'manpower'].includes(this.viewMode)) return;

        this.terrain.regions.forEach(region => {
            if (!region.icons || !region.icons.length) return;
            if (visibleRect && !this.bboxIntersects(region.bbox, visibleRect)) return;

            region.icons.forEach(icon => {
                const img = this.decorations.assets[icon.assetName];
                if (!img) return;
                ctx.save();
                ctx.translate(icon.x, icon.y);
                ctx.rotate(icon.rotation);
                ctx.drawImage(img, -icon.size / 2, -icon.size / 2, icon.size, icon.size);
                ctx.restore();
            });
        });
    },
    paintTextures(ctx, visibleRect = null) {
        if (!this.decorations.textures.ready) return;
    
        this.terrain.regions.forEach((region, i) => {
            if (!region.textureVariant) return;
            if (visibleRect && !this.bboxIntersects(region.bbox, visibleRect)) return;
    
            const img = this.decorations.textures.assets[region.textureVariant];
            if (!img) return;
    
            const polygon = this.mapVoronoi.cellPolygon(i);
            if (!polygon) return;
    
            const { minX, minY, maxX, maxY } = region.bbox;
            const boxW = (maxX - minX); 
            const boxH = (maxY - minY);
            if (boxW <= 0 || boxH <= 0) return;
    
            // квадрат стороной = большая сторона bbox — гарантированно покрывает bbox по обеим осям
            const side = Math.max(boxW, boxH);
            const cx = minX + boxW / 2, cy = minY + boxH / 2;
            const drawX = cx - side / 2, drawY = cy - side / 2;
    
            ctx.save();
            this.drawRegionPath(ctx, polygon);
            ctx.clip();
    
            ctx.globalAlpha = this.decorations.textures.alpha;
            ctx.drawImage(img, drawX-4, drawY-4, side+8, side+8); 
    
            ctx.restore();
        });
    },
};

const MapArmies = {
    computeReachableRegions(army) {
        const visited = new Map(); // regionId -> оставшиеся очки при прибытии
        const startAP = army.actionPoints;
        if (startAP <= 0) return visited;
    
        visited.set(army.regionId, startAP);
        const queue = [{ id: army.regionId, ap: startAP }];
        let qi = 0;
    
        while (qi < queue.length) {
            const { id, ap } = queue[qi++];
            const neighbors = this.regionNeighbors?.[id] || [];
    
            for (const nb of neighbors) {
                const region = this.terrain.regions[nb];
                if (!region || region.isWater) continue;
    
                // Занято чужой армией — двигаться туда напрямую нельзя (это уже атака/бой, вне текущего скоупа)
                const occupiedByEnemy = this.armiesProvider &&
                    this.armiesProvider().some(a => a.regionId === nb && a.factionId !== army.factionId);
                if (occupiedByEnemy) continue;
    
                // Стоимость шага в целевой регион: 1 очко, если регион не свой; на своей территории тоже 1 очко за шаг,
                // просто там больше стартовых очков в резерве — сама механика "1 регион вне земель, 2-3 внутри"
                // уже выражена через army.actionPoints, здесь считаем именно ПУТЬ по доступному бюджету очков
                const cost = 1;
                const remaining = ap - cost;
                if (remaining < 0) continue;
    
                const already = visited.get(nb);
                if (already !== undefined && already >= remaining) continue; // уже нашли путь не хуже
    
                visited.set(nb, remaining);
                queue.push({ id: nb, ap: remaining });
            }
        }
    
        visited.delete(army.regionId); // сама клетка армии не считается "целью перемещения"
        return visited;
    },
    selectArmy(armyId) {
        if (!this.armiesProvider) return;
        const army = this.armiesProvider().find(a => a.id === armyId);
        if (!army) return;
    
        this.selection.armyId = armyId;
        const reachable = this.armies.computeReachableRegions(army);
        this.selection.reachableSet = new Set(reachable.keys());
    
        if (this.selection.onArmySelect) this.selection.onArmySelect(army, [...this.selection.reachableSet]);
        this.scheduleRender();
    },
    renderReachableArea(ctx, zoomScale) {
        if (!this.selection.reachableSet || !this.selection.reachableSet.size) return;
    
        const reachable = this.selection.reachableSet;
        const borderWidth = 2.5 / zoomScale;
        const fillAlpha = 0.28;
    
        // Лёгкая заливка каждого достижимого региона
        ctx.save();
        ctx.globalAlpha = fillAlpha;
        ctx.fillStyle = '#6fcf39';
        reachable.forEach(regionId => {
            const polygon = this.mapVoronoi.cellPolygon(regionId);
            if (!polygon) return;
            this.drawRegionPath(ctx, polygon);
            ctx.fill();
        });
        ctx.restore();
    
        // Единая чёткая граница по контуру всей достижимой зоны — через edgeMap, тем же принципом, что и у фракций
        ctx.save();
        ctx.strokeStyle = '#6fcf39';
        ctx.lineWidth = borderWidth;
        ctx.lineJoin = 'round';
        this.edgeMap.forEach(edge => {
            if (edge.regionIds.length < 2) return;
            const [a, b] = edge.regionIds;
            const aIn = reachable.has(a), bIn = reachable.has(b);
            if (aIn === bIn) return; // либо обе стороны внутри зоны, либо обе снаружи — граница тут не нужна
    
            const segments = this.getNoisyLineSegments(edge.p1[0], edge.p1[1], edge.p2[0], edge.p2[1]);
            ctx.beginPath();
            segments.forEach((pt, k) => k === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
            ctx.stroke();
        });
        ctx.restore();
    },
    renderArmies(ctx, zoomScale = 1) {
        if (!this.armiesProvider) return;
        const armies = this.armiesProvider();
        const spriteSize = Math.max(20, Math.min(20 / (zoomScale*0.2), 50)); // сам юнит крупнее, чем было
        const plateHeight = 4.5 * (zoomScale * 0.05);
        const plateWidth = 9 * (zoomScale * 0.05);
    
        armies.forEach(army => {
            const region = this.terrain.regions[army.regionId];
            if (!region) return;
    
            const faction = this.factions.list?.[army.factionId];
            const color = faction ? faction.color : '#999999';
            const rank = army.rank || 1;
            const key = `${rank}_${army.assetVariant}`;
            const img = this.armyAssets.ready ? this.armyAssets.images[key] : null;
    
            ctx.save();
    
            // якорь спрайта — низ картинки на центре региона (как юнит "стоит" на клетке в HoMM)
            const spriteBottomY = 4+region.y - plateHeight;
            const spriteTopY = spriteBottomY - spriteSize;
    
            if (img) {
                ctx.drawImage(img, region.x - spriteSize / 2, spriteTopY, spriteSize, spriteSize);
            } else {
                // запасной вариант, пока картинки не загрузились — простой силуэт, чтобы не было пустоты
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(region.x, spriteTopY + spriteSize / 2, spriteSize / 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
    
            // табличка с числом под юнитом — цвет фракции, как рамка/фон
            const plateY = spriteBottomY;
            ctx.fillStyle = color;
            ctx.fillRect(region.x - plateWidth / 2, plateY, plateWidth, plateHeight);
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 0.4 / zoomScale;
            ctx.strokeRect(region.x - plateWidth / 2, plateY, plateWidth, plateHeight);
    
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${plateHeight * 0.75}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(army.strength, region.x, plateY + plateHeight / 2 + 0.3 / zoomScale);
    
            // подсветка выбранной армии — рамка вокруг всей связки спрайт+табличка
            if (this.selection.armyId === army.id) {
                ctx.strokeStyle = this.selection.color;
                ctx.lineWidth = 1 / zoomScale;
                ctx.strokeRect(
                    region.x - plateWidth / 2, plateY, plateWidth, plateHeight
                );
            }
    
            ctx.restore();
        });
    }
}

