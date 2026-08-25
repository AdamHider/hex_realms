class MapGenerator {
    constructor(options = {}) {
        this.width = options.width || 600;
        this.height = options.height || 600;
        this.sitesAmount = options.sitesAmount || 1500;
        this.edgeRoughness = options.edgeRoughness || 0.42;
        this.edgeDepth = options.edgeDepth || 5;
        this.borderMargin = options.borderMargin || 22;
        this.peakCount = options.peakCount || 4;
        this.peakShape = options.peakShape || 0.5;
        this.shapeType = options.shapeType || 'continent';
        this.landAmount = options.landAmount || 1.5;
        this.relief = options.relief || 0.75;
        this.chaos = options.chaos || 0.75;
        this.showClimate = options.showClimate ?? true;
        this.currentSeason = options.currentSeason ?? 'SPRING';
        this.viewMode = options.viewMode;

        this.canvas = options.canvas;
        this.ctx = this.canvas.getContext('2d');
        this.tooltip = options.tooltip;

        this.initialSeed = options.seed || 12345;
        this.currentSeed = this.initialSeed;
        this.mapSites = [];
        this.mapVoronoi = null;
        this.noisyEdgeCache = new Map();

        this.factionsConfig = options.factions || { count: 0 };
        this.factionStartHops = options.factionStartHops ?? 5;
        this.factionCapitalPopulation = options.factionCapitalPopulation ?? 120;
        this.factionPopulationDecay = options.factionPopulationDecay ?? 0.62;

        this.viewTransform = { x: 0, y: 0, scale: 1 };
        this.minScale = 0.6;
        this.maxScale = 6;
        this.mapLayerScale = Math.min(this.maxScale, 4) * (window.devicePixelRatio || 1) * 2;

        this.mapLayerCanvas = document.createElement('canvas');
        this.mapLayerCanvas.width = this.width * this.mapLayerScale;
        this.mapLayerCanvas.height = this.height * this.mapLayerScale;
        this.mapLayerCtx = this.mapLayerCanvas.getContext('2d');

        this.color = {
            getSeasonalColor: MapColor.getSeasonalColor.bind(this),
            getFaction: MapColor.getFaction.bind(this),
            getBaseFill: MapColor.getBaseFill.bind(this),
            getElevationGrayscale: MapColor.getElevationGrayscale.bind(this),
            hexToRgb: MapColor.hexToRgb.bind(this),
            rgbToHex: MapColor.rgbToHex.bind(this),
            hslToHex: MapColor.hslToHex.bind(this),
            blend: MapColor.blend.bind(this)
        };

        this.interaction = {
            _initEvents: MapInteraction._initEvents.bind(this),
            hideTooltip: MapInteraction.hideTooltip.bind(this),
            findNearestSiteIndex: MapInteraction.findNearestSiteIndex.bind(this),
            describeSite: MapInteraction.describeSite.bind(this),
            handlePointerAt: MapInteraction.handlePointerAt.bind(this),
            _handleWheel: MapInteraction._handleWheel.bind(this),
            _handleMouseDown: MapInteraction._handleMouseDown.bind(this),
            _handleMouseUp: MapInteraction._handleMouseUp.bind(this),
            _handleMouseMove: MapInteraction._handleMouseMove.bind(this)
        }

        this.faction = {
            assignCities: MapFaction.assignCities.bind(this), /**/
            _computeFactionCount: MapFaction._computeFactionCount.bind(this),
            pickCapitals: MapFaction.pickCapitals.bind(this),
            assignFactions: MapFaction.assignFactions.bind(this),
            assignFactionColors: MapFaction.assignFactionColors.bind(this),
        }

        this._initConfig();
        this._initFactionPalette();

        if (this.canvas) {
            this.interaction._initEvents();
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
              colors: { cold: '#8fae9c', temperate: '#65a30d', hot: '#d9c27a' },
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

    _initFactionPalette() {
        this.factionColors = [
            '#e63946', '#457b9d', '#2a9d8f', '#f4a261', '#9b5de5',
            '#ffbe0b', '#06d6a0', '#ef476f', '#118ab2', '#f77f00',
            '#8338ec', '#06a77d', '#d62828', '#3a86ff', '#ffd60a',
        ];
        this.neutralBorderColor = 'rgba(148, 163, 184, 0)';
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION: MAP_UTILS
    // Чистые, не зависящие от карты помощники: RNG, цветовая
    // математика, поиск по порогу. Не трогают this.mapSites.
    // ═══════════════════════════════════════════════════════════

    seededRandom() {
        this.currentSeed = (this.currentSeed * 48271) % 2147483647;
        return (this.currentSeed / 2147483647);
    }

    setSeed(seed) {
        this.initialSeed = seed || Math.floor(Math.random() * 9999999) + 1;
        this.currentSeed = this.initialSeed;
        return this.initialSeed;
    }

    findBand(bands, t) {
        for (const b of bands) if (t <= b.maxT) return b;
        return bands[bands.length - 1];
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION: MAP_TERRAIN
    // Первичный, "тяжёлый" этап: Вороной, elevation, климат.
    // Выполняется один раз за вызов setup(), результат кэшируется
    // в this.mapSites до следующей генерации.
    // ═══════════════════════════════════════════════════════════

    computeTemperatures(sites, isWater, landT) {
        const n = sites.length;
        const temp = new Float64Array(n);
        const phase = this.seededRandom() * Math.PI * 2;
        for (let i = 0; i < n; i++) {
            const nx = sites[i].x / this.width, ny = sites[i].y / this.height;
            const wobble = Math.sin(nx * Math.PI * 2.2 + phase) * 0.07 + Math.sin(nx * Math.PI * 5.0 - phase) * 0.035;
            let val = ny + wobble;
            val -= landT[i] * 0.32;
            temp[i] = Math.min(1, Math.max(0, val));
        }
        return temp;
    }

    generateUniformSites(numSites, width, height, iterations = 2) {
        let sites = [];
        for (let i = 0; i < numSites; i++) {
            sites.push({ x: this.seededRandom() * width, y: this.seededRandom() * height });
        }

        for (let iter = 0; iter < iterations; iter++) {
            const points = new Float64Array(sites.length * 2);
            for (let i = 0; i < sites.length; i++) {
                points[i * 2] = sites[i].x;
                points[i * 2 + 1] = sites[i].y;
            }
            const delaunay = new d3.Delaunay(points);
            const voronoi = delaunay.voronoi([0, 0, width, height]);

            const newSites = [];
            for (let i = 0; i < sites.length; i++) {
                const polygon = voronoi.cellPolygon(i);
                if (!polygon) { newSites.push(sites[i]); continue; }

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
                    newSites.push({ x: cx, y: cy });
                } else {
                    newSites.push(sites[i]);
                }
            }
            sites = newSites;
        }
        return sites;
    }

    buildNeighbors(delaunay, n) {
        const neighbors = new Array(n);
        for (let i = 0; i < n; i++) neighbors[i] = Array.from(delaunay.neighbors(i));
        return neighbors;
    }

    addBlob(elevation, neighborsList, startId, height, decayBase, plateauHops = 0) {
        const used = new Uint8Array(elevation.length);
        const queue = [startId];
        used[startId] = 1;
        elevation[startId] += height;
        let h = height;
        let qi = 0;
        let visited = 0;
        while (qi < queue.length) {
            const id = queue[qi++];
            for (const nb of neighborsList[id]) {
                if (used[nb]) continue;
                used[nb] = 1;
                visited++;
                if (visited > plateauHops) {
                    h = h * (decayBase + (this.seededRandom() * 0.12 - 0.06));
                } else {
                    h = h * (0.97 + (this.seededRandom() * 0.06 - 0.03));
                }
                if (h < 0.02) continue;
                elevation[nb] += h;
                queue.push(nb);
            }
        }
    }

    addRange(elevation, neighborsList, sites, startId, endId, height, decayBase) {
        const path = [startId];
        let current = startId;
        let guard = 0;
        while (current !== endId && guard < neighborsList.length) {
            guard++;
            let best = null, bestScore = Infinity;
            for (const nb of neighborsList[current]) {
                const dx = sites[nb].x - sites[endId].x;
                const dy = sites[nb].y - sites[endId].y;
                const d = Math.hypot(dx, dy) + this.seededRandom() * 60;
                if (d < bestScore) { bestScore = d; best = nb; }
            }
            if (best === null || best === current) break;
            current = best;
            path.push(current);
            if (path.length > 200) break;
        }

        const used = new Uint8Array(elevation.length);
        const queue = [];
        path.forEach(id => {
            used[id] = 1;
            queue.push(id);
            elevation[id] += height * (0.65 + this.seededRandom() * 0.35);
        });

        let h = height * 0.85;
        let qi = 0;
        while (qi < queue.length) {
            const id = queue[qi++];
            for (const nb of neighborsList[id]) {
                if (used[nb]) continue;
                used[nb] = 1;
                h = h * (decayBase + (this.seededRandom() * 0.1 - 0.05));
                if (h < 0.02) continue;
                elevation[nb] += h;
                queue.push(nb);
            }
        }
    }

    findNearestSite(sites, x, y) {
        let best = 0, bestD = Infinity;
        for (let i = 0; i < sites.length; i++) {
            const d = (sites[i].x - x) ** 2 + (sites[i].y - y) ** 2;
            if (d < bestD) { bestD = d; best = i; }
        }
        return best;
    }

    getContinentCenters(shapeType, densityScale) {
        const jitter = () => (this.seededRandom() - 0.5);
        switch (shapeType) {
            case 'two_continents':
                return [
                    { x: 0.28 + jitter() * 0.12, y: 0.5 + jitter() * 0.25, w: 1.0 },
                    { x: 0.72 + jitter() * 0.12, y: 0.5 + jitter() * 0.25, w: 1.0 },
                ];
            case 'island':
                return [{ x: 0.5 + jitter() * 0.1, y: 0.5 + jitter() * 0.1, w: 0.85 }];
            case 'continent':
            default: {
                const centers = [{ x: 0.5 + jitter() * 0.16, y: 0.48 + jitter() * 0.16, w: 1.3 }];
                const satellites = Math.round((1 + Math.floor(this.seededRandom() * 2)) * densityScale);
                for (let i = 0; i < satellites; i++) {
                    const ang = this.seededRandom() * Math.PI * 2;
                    const dist = 0.18 + this.seededRandom() * 0.12;
                    centers.push({
                        x: 0.5 + Math.cos(ang) * dist,
                        y: 0.48 + Math.sin(ang) * dist,
                        w: 0.55 + this.seededRandom() * 0.35,
                    });
                }
                return centers;
            }
        }
    }

    generateElevation(sites, neighborsList) {
        const n = sites.length;
        const elevation = new Float64Array(n);
        const seedTrig = (this.currentSeed % 1000) * 0.017;
        const seedPhase = this.seededRandom() * Math.PI * 2;

        const densityScale = Math.sqrt(n / 700);

        const decayExponent = Math.min(1, 700 / n);
        const scaleDecay = (d) => Math.pow(d, decayExponent);

        for (let i = 0; i < n; i++) {
            const nx = sites[i].x / this.width, ny = sites[i].y / this.height;
            elevation[i] = 0.10 * (Math.sin(nx * Math.PI * 1.4 + seedPhase) * Math.cos(ny * Math.PI * 1.1 - seedPhase) + 1);
        }

        let blobDecay;
        if (this.shapeType === 'island') blobDecay = Math.min(0.997, Math.max(0.985, 0.993 + (this.landAmount - 1.0) * 0.004));
        else blobDecay = Math.min(0.994, Math.max(0.965, 0.982 + (this.landAmount - 1.0) * 0.018));
        blobDecay = scaleDecay(blobDecay);
        const centers = this.getContinentCenters(this.shapeType, densityScale);

        centers.forEach(c => {
            const startId = this.findNearestSite(sites, c.x * this.width, c.y * this.height);
            const peak = (0.75 + this.seededRandom() * 0.35) * c.w * this.landAmount;
            this.addBlob(elevation, neighborsList, startId, peak, blobDecay);
        });

        const scaledPeakCount = Math.round(this.peakCount * densityScale);
        if (scaledPeakCount > 0) {
            const landCandidates = [];
            for (let i = 0; i < n; i++) if (elevation[i] > 0.22) landCandidates.push(i);
            if (landCandidates.length > 3) {
                const peakBlobDecay = scaleDecay(0.86 + this.relief * 0.05);
                const rangeDecay = scaleDecay(0.90 + this.relief * 0.03);
                const peakPlateau = Math.max(3, Math.round(7 * densityScale));

                const chosenPeaks = [];
                const minPeakDist = 0.16;
                const pickSpacedCandidate = (avoidId) => {
                    let fallback = -1;
                    for (let attempt = 0; attempt < 25; attempt++) {
                        const id = landCandidates[Math.floor(this.seededRandom() * landCandidates.length)];
                        if (id === avoidId) continue;
                        if (fallback === -1) fallback = id;
                        const cx = sites[id].x / this.width, cy = sites[id].y / this.height;
                        const tooClose = chosenPeaks.some(p => Math.hypot(p.x - cx, p.y - cy) < minPeakDist);
                        if (!tooClose) return id;
                    }
                    return fallback === -1 ? landCandidates[Math.floor(this.seededRandom() * landCandidates.length)] : fallback;
                };

                for (let i = 0; i < scaledPeakCount; i++) {
                    const startId = pickSpacedCandidate(-1);
                    chosenPeaks.push({ x: sites[startId].x / this.width, y: sites[startId].y / this.height });

                    const peakHeight = (0.85 + this.seededRandom() * 0.3) * (0.6 + this.relief);
                    const asRidge = this.seededRandom() < this.peakShape;
                    if (asRidge) {
                        const endId = pickSpacedCandidate(startId);
                        if (endId === startId) { this.addBlob(elevation, neighborsList, startId, peakHeight, peakBlobDecay, peakPlateau); continue; }
                        this.addRange(elevation, neighborsList, sites, startId, endId, peakHeight, rangeDecay);
                    } else {
                        this.addBlob(elevation, neighborsList, startId, peakHeight, peakBlobDecay, peakPlateau);
                    }
                }
            }
        }

        for (let i = 0; i < n; i++) {
            const nx = sites[i].x / this.width, ny = sites[i].y / this.height;
            const detail = Math.sin(nx * 23.0 * densityScale + seedTrig) * Math.cos(ny * 19.0 * densityScale - seedTrig) * 0.5
                            + Math.sin(nx * 47.0 * densityScale - ny * 31.0 * densityScale) * 0.25;
            const chaosJitter = this.seededRandom() * 2 - 1;
            elevation[i] *= (1 + detail * (0.15 + this.relief * 0.55) + chaosJitter * this.chaos * 0.65);
        }

        for (let i = 0; i < n; i++) {
            const isEdge = sites[i].x < this.borderMargin || sites[i].x > this.width - this.borderMargin
                        || sites[i].y < this.borderMargin || sites[i].y > this.height - this.borderMargin;
            if (isEdge) elevation[i] *= 0.15;
        }
        return elevation;
    }

    classifyByLandFraction(elevation, targetFraction, reliefCompression) {
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

        const landCeiling = 0.35 + 0.65 * reliefCompression;

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
    }

    cleanupLandSpecks(isWater, neighborsList, minLandSize) {
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
        for (let i = 0; i < this.edgeDepth; i++) {
            const nextPoints = [];
            for (let j = 0; j < points.length - 1; j++) {
                const p0 = points[j], p1 = points[j + 1];
                nextPoints.push(p0);

                const mx = (p0.x + p1.x) * 0.5;
                const my = (p0.y + p1.y) * 0.5;
                const dx = p1.x - p0.x, dy = p1.y - p0.y;
                const length = Math.hypot(dx, dy);

                const offset = (this.seededRandom() - 0.5) * length * this.edgeRoughness;
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

    buildSitePath(ctx, polygon) {
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

    _edgeKey(p1, p2) {
        const a = `${Math.round(p1[0] * 10)},${Math.round(p1[1] * 10)}`;
        const b = `${Math.round(p2[0] * 10)},${Math.round(p2[1] * 10)}`;
        return a < b ? `${a}|${b}` : `${b}|${a}`;
    }

    buildEdgeMap() {
        const edgeMap = new Map();
        for (let i = 0; i < this.mapSites.length; i++) {
            const polygon = this.mapVoronoi.cellPolygon(i);
            if (!polygon) continue;
            for (let j = 0; j < polygon.length - 1; j++) {
                const p1 = polygon[j], p2 = polygon[j + 1];
                const key = this._edgeKey(p1, p2);
                if (!edgeMap.has(key)) edgeMap.set(key, { siteIds: [], p1, p2 });
                edgeMap.get(key).siteIds.push(i);
            }
        }
        return edgeMap;
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION: MAP_SETUP
    // Точка входа первичного этапа: собирает terrain + факции
    // в this.mapSites, кэширует edgeMap. generate() — публичная
    // обёртка, которая сразу же вызывает первый render() и отдаёт
    // наружу данные для дальнейшей динамической синхронизации.
    // ═══════════════════════════════════════════════════════════

    generate(seed) {
        this.setup(seed);
        this.render();
        return {
            regions: this.getRegionsData(),
            factions: this.getFactionsData(),
        };
    }

    setup(seed) {
        if (seed !== undefined) this.setSeed(seed);
        else this.currentSeed = this.initialSeed;

        this.noisyEdgeCache.clear();

        const rawSites = this.generateUniformSites(this.sitesAmount, this.width, this.height, 2);

        const sites = rawSites.map((s, i) => ({
            id: i, x: s.x, y: s.y, elevation: 0, t: 0, biome: 'OCEAN', biomeBand: 'OCEAN',
            biomeClimate: 'OCEAN', biomeNeutral: 'OCEAN', climateZone: null, isWater: true, city: null,
            ownerId: null,
        }));

        const points = new Float64Array(sites.length * 2);
        for (let i = 0; i < sites.length; i++) {
            points[i * 2] = sites[i].x;
            points[i * 2 + 1] = sites[i].y;
        }
        const delaunay = new d3.Delaunay(points);
        const voronoi = delaunay.voronoi([0, 0, this.width, this.height]);
        const neighbors = this.buildNeighbors(delaunay, sites.length);

        const elevation = this.generateElevation(sites, neighbors);

        const targetFraction = Math.min(0.62, Math.max(0.12, 0.20 + (this.landAmount - 0.5) * 0.35));
        const { isWater, t } = this.classifyByLandFraction(elevation, targetFraction, this.relief);

        const minLandSize = Math.max(4, Math.round(this.sitesAmount * 0.006));
        this.cleanupLandSpecks(isWater, neighbors, minLandSize);

        const temperature = this.computeTemperatures(sites, isWater, t);

        sites.forEach((site, i) => {
            site.elevation = elevation[i];
            site.t = t[i];
            site.isWater = !!isWater[i];

            const zone = temperature[i] < 0.28 ? 'cold' : temperature[i] > 0.72 ? 'hot' : 'temperate';
            site.climateZone = zone;

            if (site.isWater) {
                const id = this.findBand(this.waterBiomes, t[i]).id;
                site.biomeBand = id;
                site.biomeClimate = id;
                site.biomeNeutral = id;
            } else {
                const band = this.findBand(this.landElevationBands, t[i]);
                site.biomeBand = band.id;
                site.biomeClimate = band.id + '_' + zone;
                site.biomeNeutral = band.id + '_temperate';
            }
        });

        this.faction.assignFactions(sites, neighbors);

        this.mapSites = sites;
        this.mapVoronoi = voronoi;
        this.edgeMap = this.buildEdgeMap();
        this.viewTransform = { x: 0, y: 0, scale: 1 };
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION: MAP_DATA
    // Динамический синтез: превращает статичные mapSites + текущие
    // "живые" параметры (сезон) в данные наружу и в тултип.
    // Вызывается многократно, без пересчёта setup().
    // ═══════════════════════════════════════════════════════════

    getRegionsData() {
        return this.mapSites.map(s => ({
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
        return this.factions || [];
    }

    getRegionResources(site, season = this.currentSeason) {
        const base = this.biomeResourceBase[site.biomeBand];
        if (!base) return null;

        const zone = site.climateZone || 'temperate';
        const mod = this.seasons[season].modifiers[zone];

        const result = {};
        for (const key of Object.keys(base)) {
            const value = base[key] * (mod[key] ?? 1);
            result[key] = key === 'upkeep' ? -Math.abs(value) : value;
        }
        if (site.city) {
            for (const key of Object.keys(this.cityResourceBonus)) {
                result[key] = (result[key] || 0) + this.cityResourceBonus[key];
            }
        }
        return result;
    }

    setSeason(season) {
        if (!this.seasonOrder.includes(season)) return;
        this.currentSeason = season;
        if (this.mapSites.length) this.render();
    }

    setShowClimate(value) {
        this.showClimate = value;
        if (this.mapSites.length) this.render();
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION: MAP_RENDER
    // Второй этап: перекладывает уже готовые this.mapSites на canvas.
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
        if (this.viewMode !== 'factions') this.renderFactionBorders(ctx);
        this.renderCities(ctx);
        this.draw();
    }

    draw() {
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();

        this.ctx.save();
        this.ctx.translate(this.viewTransform.x, this.viewTransform.y);
        this.ctx.scale(this.viewTransform.scale / this.mapLayerScale, this.viewTransform.scale / this.mapLayerScale);
        this.ctx.drawImage(this.mapLayerCanvas, 0, 0);
        this.ctx.restore();
    }

    renderRegions(ctx) {
        for (let i = 0; i < this.mapSites.length; i++) {
            const polygon = this.mapVoronoi.cellPolygon(i);
            if (!polygon) continue;

            const site = this.mapSites[i];
            ctx.fillStyle = this.color.getBaseFill(site);
            ctx.strokeStyle = this.viewMode === 'factions' ? 'rgba(0, 0, 0, 0.25)' : 'rgba(2, 44, 44, 0.65)';
            ctx.lineWidth = 0.3;

            this.buildSitePath(ctx, polygon);
            ctx.fill();
            ctx.stroke();

            if (site.ownerId !== null && site.ownerId !== undefined && this.factions?.[site.ownerId]) {
                ctx.save();
                ctx.globalAlpha = this.viewMode === 'factions' ? 0.65 : (this.viewMode === 'political') ? 0.32 : 0;
                ctx.fillStyle = this.factions[site.ownerId].color;
                ctx.fill();
                ctx.restore();
            }
        }
    }

    _strokeOffsetPolyline(ctx, points, nx, ny, offset, color, width) {
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
    }

    renderFactionBorders(ctx) {
        if (!this.factions || !this.factions.length || !this.edgeMap) return;
        ctx.lineJoin = 'round';

        const borderWidth = 1.4;
        const offset = 0.7;

        this.edgeMap.forEach(edge => {
            if (edge.siteIds.length < 2) return;
            const [a, b] = edge.siteIds;
            const siteA = this.mapSites[a], siteB = this.mapSites[b];
            if (siteA.ownerId === siteB.ownerId) return;

            const segments = this.getNoisyLineSegments(edge.p1[0], edge.p1[1], edge.p2[0], edge.p2[1]);

            const dx = edge.p2[0] - edge.p1[0], dy = edge.p2[1] - edge.p1[1];
            const len = Math.hypot(dx, dy) || 1;
            let nx = -dy / len, ny = dx / len;

            const midX = (edge.p1[0] + edge.p2[0]) / 2, midY = (edge.p1[1] + edge.p2[1]) / 2;
            const towardA = (siteA.x - midX) * nx + (siteA.y - midY) * ny;
            if (towardA < 0) { nx = -nx; ny = -ny; }

            const colorA = (siteA.ownerId !== null && siteA.ownerId !== undefined)
                ? (this.factions[siteA.ownerId]?.color || this.neutralBorderColor)
                : this.neutralBorderColor;
            const colorB = (siteB.ownerId !== null && siteB.ownerId !== undefined)
                ? (this.factions[siteB.ownerId]?.color || this.neutralBorderColor)
                : this.neutralBorderColor;

            this._strokeOffsetPolyline(ctx, segments, nx, ny, offset, colorA, borderWidth);
            this._strokeOffsetPolyline(ctx, segments, -nx, -ny, offset, colorB, borderWidth);
        });
    }

    renderCities(ctx) {
        this.mapSites.forEach(site => {
            if (site.city) {
                ctx.fillStyle = '#facc15';
                ctx.beginPath();
                ctx.arc(site.x, site.y, 2.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#022c22';
                ctx.lineWidth = 1;
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
    getSeasonalColor(site, season = this.currentSeason) {
        const baseColor = this.biomesMap[site.biome];
        if (!baseColor) return baseColor;

        const tintGroup = this.seasons[season]?.tints;
        if (!tintGroup) return baseColor;

        const zone = site.climateZone || 'temperate';
        const tint = (site.isWater ? tintGroup.water : tintGroup.land)[zone];
        if (!tint || tint.strength <= 0) return baseColor;

        return this.color.blend(baseColor, tint.color, tint.strength);
    },
    getFaction(index, seedOffset = 0) {
        if (index < this.factionColors.length) return this.factionColors[index];

        const goldenAngle = 137.508;
        const hue = (seedOffset + index * goldenAngle) % 360;
        const saturation = 70 + (index % 3) * 8;
        const lightness = 48 + (index % 2) * 8;

        return this.color.hslToHex(hue, saturation, lightness);
    },
    getBaseFill(site) {
        if (this.viewMode === 'factions') {
            return this.color.getElevationGrayscale(site);
        }
        site.biome = site.isWater ? site.biomeClimate : (this.showClimate ? site.biomeClimate : site.biomeNeutral);
        return this.color.getSeasonalColor(site);
    },
    getElevationGrayscale(site) {
        if (site.isWater) {
            const v = 25 + site.t * 35;
            return this.color.rgbToHex(v * 0.7, v * 0.8, v * 1.05);
        }
        const v = 110 + site.t * 95;
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
    _initEvents() {
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
    findNearestSiteIndex(mx, my) {
        let best = -1, bestD = Infinity;
        for (let i = 0; i < this.mapSites.length; i++) {
            const d = (this.mapSites[i].x - mx) ** 2 + (this.mapSites[i].y - my) ** 2;
            if (d < bestD) { bestD = d; best = i; }
        }
        return best;
    },
    describeSite(site) {
        const bandLabel = this.elevationBandLabels[site.biomeBand] || site.biomeBand;
        const lines = [];
        if (site.isWater) {
            lines.push(`Глубина: ${(100 - site.t * 100).toFixed(0)}%`);
        } else {
            if (this.showClimate && site.climateZone) lines.push(`Климат: ${this.climateZoneLabels[site.climateZone]}`);
            lines.push(`Высота: ${(site.t * 100).toFixed(0)}%`);
        }
        if (site.city) lines.push(`Поселение: ${site.city.name}`);

        const res = this.getRegionResources(site);
        if (res) {
            lines.push(`<hr class="my-1 border-emerald-800">`);
            lines.push(`Сезон: ${this.seasons[this.currentSeason].label}`);
            lines.push(`Еда ${res.food.toFixed(1)} · Произв. ${res.production.toFixed(1)} · Manpower ${res.manpower.toFixed(1)}`);
            lines.push(`Золото ${res.gold.toFixed(1)} · Содержание ${res.upkeep.toFixed(1)}`);
            if (site.population > 0) lines.push(`Население: ${site.population}`);
        }

        return `<div class="font-semibold text-emerald-400 mb-1">${bandLabel}</div>` +
               lines.map(l => `<div>${l}</div>`).join('');
    },
    handlePointerAt(clientX, clientY) {
        if (!this.mapSites.length) return;
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const px = (clientX - rect.left) * scaleX;
        const py = (clientY - rect.top) * scaleY;

        const wx = (px - this.viewTransform.x) / this.viewTransform.scale;
        const wy = (py - this.viewTransform.y) / this.viewTransform.scale;

        if (wx < 0 || wy < 0 || wx > this.width || wy > this.height) { this.interaction.hideTooltip(); return; }

        const idx = this.interaction.findNearestSiteIndex(wx, wy);
        if (idx === -1) { this.hideTooltip(); return; }
        this.tooltip.innerHTML = this.interaction.describeSite(this.mapSites[idx]);
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
    assignCities(sites) {
        const landSites = sites.filter(s => !s.isWater);
        landSites.forEach((site, index) => {
            if (index % 25 === 0 && site.biomeBand !== 'PEAKS' && site.biomeBand !== 'HIGHLANDS') {
                site.city = { name: 'Поселение ' + (index + 1) };
            }
        });
    },
    _computeFactionCount() {
        if (this.factionsConfig.count) return this.factionsConfig.count;
        const scaled = Math.round(this.sitesAmount / 60);
        return Math.max(8, Math.min(40, scaled));
    },
    pickCapitals(candidates, count) {
        const chosen = [];
        if (!candidates.length || count <= 0) return chosen;

        chosen.push(candidates[Math.floor(this.seededRandom() * candidates.length)]);
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
    assignFactions(sites, neighborsList) {
        sites.forEach(s => { s.city = null; s.population = 0; });

        const count = this.faction._computeFactionCount();
        this.factions = [];
        if (count <= 0) return;

        const capitalCandidates = sites.filter(s => !s.isWater && s.biomeBand !== 'PEAKS' && s.biomeBand !== 'HIGHLANDS');
        if (capitalCandidates.length < count) {
            console.warn(`MapGenerator: клеток под столицы (${capitalCandidates.length}) меньше, чем фракций (${count})`);
        }

        const names = this.factionsConfig.names?.length === count ? this.factionsConfig.names : null;
        const colors = this.factionsConfig.colors?.length === count ? this.factionsConfig.colors : null;

        const capitals = this.faction.pickCapitals(capitalCandidates, count);

        capitals.forEach((capital, i) => {
            const factionName = names ? names[i] : `Фракция ${i + 1}`;
            capital.city = { name: factionName + ' (столица)' };
            this.factions.push({
                id: i,
                name: factionName,
                color: colors ? colors[i] : this.color.getFaction(i, (this.initialSeed % 360)),
                capitalSiteId: capital.id,
                ownedRegions: [],
                totalPopulation: 0,
                armies: [],
            });
        });

        const ownerOf = new Int16Array(sites.length).fill(-1);
        const hopOf = new Int16Array(sites.length).fill(-1);

        let frontier = capitals.map((capital, factionId) => {
            ownerOf[capital.id] = factionId;
            hopOf[capital.id] = 0;
            return capital.id;
        });

        for (let depth = 1; depth <= this.factionStartHops && frontier.length; depth++) {
            const nextFrontier = [];
            for (const id of frontier) {
                const factionId = ownerOf[id];
                for (const nb of neighborsList[id]) {
                    if (ownerOf[nb] !== -1 || sites[nb].isWater) continue;
                    ownerOf[nb] = factionId;
                    hopOf[nb] = depth;
                    nextFrontier.push(nb);
                }
            }
            frontier = nextFrontier;
        }

        sites.forEach((site, i) => {
            site.ownerId = ownerOf[i] === -1 ? null : ownerOf[i];
            site.population = site.ownerId === null
                ? 0
                : Math.round(this.factionCapitalPopulation * Math.pow(this.factionPopulationDecay, hopOf[i]));
        });

        if (!colors) this.faction.assignFactionColors(sites, neighborsList);

        this.factions.forEach(faction => {
            const owned = sites.filter(s => s.ownerId === faction.id);
            faction.ownedRegions = owned.map(s => s.id);
            faction.totalPopulation = owned.reduce((sum, s) => sum + s.population, 0);
            faction.armies.push({ id: `${faction.id}-army-0`, siteId: faction.capitalSiteId, strength: 10 });
        });
    },
    assignFactionColors(sites, neighborsList) {
        const count = this.factions.length;
        if (!count) return;

        const adjacency = Array.from({ length: count }, () => new Set());
        for (let i = 0; i < sites.length; i++) {
            const ownerI = sites[i].ownerId;
            if (ownerI === null || ownerI === undefined) continue;
            for (const nb of neighborsList[i]) {
                const ownerNb = sites[nb].ownerId;
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
            this.factions[factionId].color = candidates[best].hex;
        });
    }
}