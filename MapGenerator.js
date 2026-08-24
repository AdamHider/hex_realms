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
        this.viewMode = options.viewMode 

        this.canvas = options.canvas;
        this.ctx = this.canvas.getContext('2d');
        this.tooltip = options.tooltip;

        this.initialSeed = options.seed || 12345;
        this.currentSeed = this.initialSeed;
        this.mapSites = [];
        this.mapVoronoi = null;
        this.noisyEdgeCache = new Map();

        this.factionsConfig = options.factions || { count: 0 }; 

        this.viewTransform = { x: 0, y: 0, scale: 1 };
        this.minScale = 0.6;
        this.maxScale = 6;

        this._initEconomy();
        this._initDictionaries();
        this._initSeasonVisuals();
        this._initFactionPalette();
        
        if (this.canvas) {
            this._initEvents();
        }
    }
    _initEconomy() {
        this.seasonOrder = ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'];
        this.seasonLabels = { SPRING: 'Весна', SUMMER: 'Лето', AUTUMN: 'Осень', WINTER: 'Зима' };
    
        this.biomeResourceBase = {
            DEEP_OCEAN:   { food: 0, production: 0, manpower: 0, gold: 0, upkeep: -0.2 },
            OCEAN:        { food: 1, production: 0, manpower: 0, gold: 1, upkeep: -0.3 },
            SHALLOW:      { food: 2, production: 0, manpower: 0, gold: 0, upkeep: -0.3 },
    
            COAST:        { food: 2, production: 1, manpower: 1, gold: 1, upkeep: -0.5 },
            STEPPE:       { food: 1, production: 1, manpower: 2, gold: 0, upkeep: -0.5 },
            PLAINS:       { food: 3, production: 1, manpower: 1, gold: 0, upkeep: -0.6 },
            GRASSLAND:    { food: 3, production: 1, manpower: 2, gold: 0, upkeep: -0.6 },
            WETLANDS:     { food: 2, production: 0, manpower: 1, gold: 0, upkeep: -0.7 },
            WOODLAND:     { food: 1, production: 2, manpower: 1, gold: 0, upkeep: -0.6 },
            FOREST:       { food: 1, production: 3, manpower: 1, gold: 0, upkeep: -0.7 },
            DENSE_FOREST: { food: 0, production: 3, manpower: 1, gold: 0, upkeep: -0.8 },
            HIGHLANDS:    { food: 0, production: 2, manpower: 0, gold: 2, upkeep: -0.9 },
            PEAKS:        { food: 0, production: 1, manpower: 0, gold: 3, upkeep: -1.0 },
        };
    
        this.cityResourceBonus = { production: 1, manpower: 1, gold: 1, upkeep: -0.5 };
    
        this.seasonModifiers = {
            SPRING: {
                cold:      { food: 0.9, production: 1.0, manpower: 1.0, gold: 1.0, upkeep: 1.0 },
                temperate: { food: 1.1, production: 1.0, manpower: 1.0, gold: 1.0, upkeep: 1.0 },
                hot:       { food: 1.0, production: 1.0, manpower: 1.0, gold: 1.0, upkeep: 1.0 },
            },
            SUMMER: {
                cold:      { food: 1.1, production: 1.1, manpower: 1.1, gold: 1.0, upkeep: 1.0 },
                temperate: { food: 1.3, production: 1.1, manpower: 1.1, gold: 1.0, upkeep: 1.0 },
                hot:       { food: 0.8, production: 0.9, manpower: 0.9, gold: 1.1, upkeep: 1.1 },
            },
            AUTUMN: {
                cold:      { food: 0.8, production: 1.0, manpower: 0.9, gold: 1.0, upkeep: 1.0 },
                temperate: { food: 1.2, production: 1.0, manpower: 1.0, gold: 1.0, upkeep: 1.0 },
                hot:       { food: 1.0, production: 1.0, manpower: 1.0, gold: 1.0, upkeep: 1.0 },
            },
            WINTER: {
                cold:      { food: 0.3, production: 0.7, manpower: 0.7, gold: 0.9, upkeep: 1.3 },
                temperate: { food: 0.6, production: 0.9, manpower: 0.9, gold: 1.0, upkeep: 1.15 },
                hot:       { food: 0.9, production: 1.0, manpower: 1.0, gold: 1.0, upkeep: 1.0 },
            },
        };
    }
    _initSeasonVisuals() {
        this.seasonTints = {
            SPRING: {
                land:  { cold: { color: '#cfe8c2', strength: 0.12 }, temperate: { color: '#d9f2a3', strength: 0.15 }, hot: { color: '#f2e6a8', strength: 0.05 } },
                water: { cold: { color: '#dfeff5', strength: 0.05 }, temperate: { color: '#dfeff5', strength: 0.00 }, hot: { color: '#dfeff5', strength: 0.00 } },
            },
            SUMMER: {
                land:  { cold: { color: '#e8f0c2', strength: 0.05 }, temperate: { color: '#fff4b0', strength: 0.05 }, hot: { color: '#ffdd88', strength: 0.18 } },
                water: { cold: { color: '#bfe0e8', strength: 0.00 }, temperate: { color: '#bfe0e8', strength: 0.00 }, hot: { color: '#bfe0e8', strength: 0.00 } },
            },
            AUTUMN: {
                land:  { cold: { color: '#c98a3e', strength: 0.20 }, temperate: { color: '#d9822b', strength: 0.35 }, hot: { color: '#e0a83e', strength: 0.08 } },
                water: { cold: { color: '#7a8fa0', strength: 0.05 }, temperate: { color: '#7a8fa0', strength: 0.05 }, hot: { color: '#7a8fa0', strength: 0.00 } },
            },
            WINTER: {
                land:  { cold: { color: '#ffffff', strength: 0.80 }, temperate: { color: '#ffffff', strength: 0.45 }, hot: { color: '#ffffff', strength: 0.00 } },
                water: { cold: { color: '#e8f4fb', strength: 0.15 }, temperate: { color: '#e8f4fb', strength: 0.20 }, hot: { color: '#e8f4fb', strength: 0.00 } },
            },
        };
    }
    _initDictionaries() {
        this.waterBiomes = [
            { id: 'DEEP_OCEAN', color: '#1a2346', maxT: 0.45 },
            { id: 'OCEAN', color: '#232f5e', maxT: 0.80 },
            { id: 'SHALLOW', color: '#2e3d7a', maxT: Infinity },
        ];

        this.landElevationBands = [
            { id: 'COAST', maxT: 0.08, colors: { cold: '#8fae9c', temperate: '#65a30d', hot: '#d9c27a' } },
            { id: 'STEPPE', maxT: 0.16, colors: { cold: '#7a9a86', temperate: '#88aa55', hot: '#cdb26a' } },
            { id: 'PLAINS', maxT: 0.25, colors: { cold: '#6b8f7a', temperate: '#679459', hot: '#c2a35c' } },
            { id: 'GRASSLAND', maxT: 0.35, colors: { cold: '#5a7d6a', temperate: '#559944', hot: '#b8944a' } },
            { id: 'WETLANDS', maxT: 0.45, colors: { cold: '#4a6b5c', temperate: '#4d7c0f', hot: '#a9863e' } },
            { id: 'WOODLAND', maxT: 0.56, colors: { cold: '#3d5a4d', temperate: '#337755', hot: '#9c7a3a' } },
            { id: 'FOREST', maxT: 0.68, colors: { cold: '#2f4a40', temperate: '#14532d', hot: '#8a6a35' } },
            { id: 'DENSE_FOREST', maxT: 0.80, colors: { cold: '#24413a', temperate: '#064e3b', hot: '#7a5c30' } },
            { id: 'HIGHLANDS', maxT: 0.92, colors: { cold: '#cfd8d6', temperate: '#042f2e', hot: '#8a6048' } },
            { id: 'PEAKS', maxT: Infinity, colors: { cold: '#f2f6f7', temperate: '#707372', hot: '#7a6558' } },
        ];

        this.biomesMap = {};
        this.waterBiomes.forEach(b => this.biomesMap[b.id] = b.color);
        this.landElevationBands.forEach(band => {
            ['cold', 'temperate', 'hot'].forEach(zone => {
                this.biomesMap[band.id + '_' + zone] = band.colors[zone];
            });
        });

        this.elevationBandLabels = {
            COAST: 'Побережье', STEPPE: 'Степь', PLAINS: 'Равнина', GRASSLAND: 'Луга',
            WETLANDS: 'Болота', WOODLAND: 'Редколесье', FOREST: 'Лес', DENSE_FOREST: 'Густой лес',
            HIGHLANDS: 'Плоскогорье', PEAKS: 'Пик',
            DEEP_OCEAN: 'Глубокий океан', OCEAN: 'Океан', SHALLOW: 'Мелководье',
        };
        this.climateZoneLabels = { cold: 'холодный', temperate: 'умеренный', hot: 'жаркий' };
    }

    _initFactionPalette() {
        this.factionColors = ['#e63946', '#457b9d', '#2a9d8f', '#f4a261', '#9b5de5', '#ffbe0b', '#06d6a0', '#ef476f'];
    }

    hexToRgb(hex) {
        const h = hex.replace('#', '');
        return { r: parseInt(h.substring(0, 2), 16), g: parseInt(h.substring(2, 4), 16), b: parseInt(h.substring(4, 6), 16) };
    }
    
    rgbToHex(r, g, b) {
        const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
        return '#' + [clamp(r), clamp(g), clamp(b)].map(v => v.toString(16).padStart(2, '0')).join('');
    }
    
    blendColor(baseHex, tintHex, amount) {
        if (amount <= 0) return baseHex;
        const base = this.hexToRgb(baseHex), tint = this.hexToRgb(tintHex);
        return this.rgbToHex(
            base.r + (tint.r - base.r) * amount,
            base.g + (tint.g - base.g) * amount,
            base.b + (tint.b - base.b) * amount
        );
    }
    getSeasonalColor(site, season = this.currentSeason) {
        const baseColor = this.biomesMap[site.biome];
        if (!baseColor) return baseColor;

        const tintGroup = this.seasonTints[season];
        if (!tintGroup) return baseColor;

        const zone = site.climateZone || 'temperate';
        const tint = (site.isWater ? tintGroup.water : tintGroup.land)[zone];
        if (!tint || tint.strength <= 0) return baseColor;

        return this.blendColor(baseColor, tint.color, tint.strength);
    }
    getBaseFillColor(site) {
        if (this.viewMode === 'factions') {
            return this.getElevationGrayscale(site);
        }
        site.biome = site.isWater ? site.biomeClimate : (this.showClimate ? site.biomeClimate : site.biomeNeutral);
        return this.getSeasonalColor(site);
    }
    getElevationGrayscale(site) {
        if (site.isWater) {
            const v = 25 + site.t * 35; // тёмный, с лёгким синим оттенком
            return this.rgbToHex(v * 0.7, v * 0.8, v * 1.05);
        }
        const v = 110 + site.t * 95; // 85..230, чем выше — тем светлее
        return this.rgbToHex(v, v, v);

        
    }
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
    buildSitePath(polygon) {
        this.ctx.beginPath();
        let firstPoint = true;
        for (let j = 0; j < polygon.length - 1; j++) {
            const p1 = polygon[j], p2 = polygon[j + 1];
            const noisySegment = this.getNoisyLineSegments(p1[0], p1[1], p2[0], p2[1]);
            for (let k = 0; k < noisySegment.length; k++) {
                const pt = noisySegment[k];
                if (firstPoint) { this.ctx.moveTo(pt.x, pt.y); firstPoint = false; }
                else { this.ctx.lineTo(pt.x, pt.y); }
            }
        }
        this.ctx.closePath();
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
    
        this.assignCities(sites);
        this.assignFactions(sites, neighbors);
    
        this.mapSites = sites;
        this.mapVoronoi = voronoi;
        this.edgeMap = this.buildEdgeMap(); // теперь считается один раз здесь, а не в каждом render()
        this.viewTransform = { x: 0, y: 0, scale: 1 };
    }

    assignCities(sites) {
        const landSites = sites.filter(s => !s.isWater);
        landSites.forEach((site, index) => {
            if (index % 25 === 0 && site.biomeBand !== 'PEAKS' && site.biomeBand !== 'HIGHLANDS') {
                site.city = { name: 'Поселение ' + (index + 1) };
            }
        });
    }

    assignFactions(sites, neighborsList) {
        const count = this.factionsConfig.count || 0;
        this.factions = [];
        if (count <= 0) return;
    
        const names = this.factionsConfig.names?.length === count ? this.factionsConfig.names : null;
        const colors = this.factionsConfig.colors?.length === count ? this.factionsConfig.colors : null;
    
        const cityCandidates = sites.filter(s => s.city && !s.isWater);
        if (cityCandidates.length < count) {
            console.warn(`MapGenerator: городов (${cityCandidates.length}) меньше, чем фракций (${count})`);
        }
    
        const chosenCapitals = [];
        const pickCapital = () => {
            let best = null, bestScore = -Infinity;
            for (const c of cityCandidates) {
                if (chosenCapitals.includes(c)) continue;
                const minDist = chosenCapitals.length === 0 ? Infinity :
                    Math.min(...chosenCapitals.map(p => Math.hypot(p.x - c.x, p.y - c.y)));
                const score = minDist + this.seededRandom() * 40; // немного шума, чтобы не всегда брать самый дальний
                if (score > bestScore) { bestScore = score; best = c; }
            }
            return best;
        };
        for (let i = 0; i < count; i++) {
            const capital = pickCapital();
            if (!capital) break;
            chosenCapitals.push(capital);
        }
    
        chosenCapitals.forEach((capital, i) => {
            this.factions.push({
                id: i,
                name: names ? names[i] : `Фракция ${i + 1}`,
                color: colors ? colors[i] : this.factionColors[i % this.factionColors.length],
                capitalSiteId: capital.id,
                ownedRegions: [],
                armies: [],
            });
        });
    
        const ownerOf = new Int16Array(sites.length).fill(-1);
        const startHops = 2;
        chosenCapitals.forEach((capital, factionId) => {
            const queue = [{ id: capital.id, depth: 0 }];
            ownerOf[capital.id] = factionId;
            let qi = 0;
            while (qi < queue.length) {
                const { id, depth } = queue[qi++];
                if (depth >= startHops) continue;
                for (const nb of neighborsList[id]) {
                    if (ownerOf[nb] !== -1 || sites[nb].isWater) continue;
                    ownerOf[nb] = factionId;
                    queue.push({ id: nb, depth: depth + 1 });
                }
            }
        });
    
        sites.forEach((site, i) => { site.ownerId = ownerOf[i] === -1 ? null : ownerOf[i]; });
        this.factions.forEach(faction => {
            faction.ownedRegions = sites.filter(s => s.ownerId === faction.id).map(s => s.id);
            faction.armies.push({ id: `${faction.id}-army-0`, siteId: faction.capitalSiteId, strength: 10 });
        });
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
    setSeason(season) {
        if (!this.seasonOrder.includes(season)) return;
        this.currentSeason = season;
        if (this.mapSites.length) this.render(); // только render(), setup() не трогаем
    }
    
    setShowClimate(value) {
        this.showClimate = value;
        if (this.mapSites.length) this.render();
    }
    getRegionsData() {
        return this.mapSites.map(s => ({
            id: s.id, x: s.x, y: s.y, isWater: s.isWater,
            biome: s.biomeBand, climateZone: s.climateZone,
            city: s.city, ownerId: s.ownerId,
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
        const mod = this.seasonModifiers[season][zone];
    
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

    render() {
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0); // сброс, чтобы очистить весь canvas, а не только видимую область
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();

        this.ctx.save();
        this.ctx.translate(this.viewTransform.x, this.viewTransform.y);
        this.ctx.scale(this.viewTransform.scale, this.viewTransform.scale);
        this.renderRegions();
        if (this.viewMode !== 'factions') this.renderFactionBorders();
    
        this.renderCities();

        this.ctx.restore();
    }
    renderRegions() {
        for (let i = 0; i < this.mapSites.length; i++) {
            const polygon = this.mapVoronoi.cellPolygon(i);
            if (!polygon) continue;
    
            const site = this.mapSites[i];
            this.ctx.fillStyle = this.getBaseFillColor(site);
            this.ctx.strokeStyle = this.viewMode === 'factions' ? 'rgba(0, 0, 0, 0.25)' : 'rgba(2, 44, 34, 0.3)';
            this.ctx.lineWidth = 1;
    
            this.buildSitePath(polygon);
            this.ctx.fill();
            this.ctx.stroke();
    
            if (site.ownerId !== null && site.ownerId !== undefined && this.factions?.[site.ownerId]) {
                this.ctx.save();
                // на карте фракций владение читается сильнее, чем лёгкий тон на обычной карте
                this.ctx.globalAlpha = this.viewMode === 'factions' ? 0.85 : 0.32;
                this.ctx.fillStyle = this.factions[site.ownerId].color;
                this.ctx.fill(); // тот же path, что уже построен buildSitePath
                this.ctx.restore();
            }
        }
    }
    renderFactionBorders() {
        if (!this.factions || !this.factions.length || !this.edgeMap) return;
    
        this.ctx.lineWidth = 2;
        this.ctx.lineJoin = 'round';
    
        this.edgeMap.forEach(edge => {
            if (edge.siteIds.length < 2) return;
    
            const [a, b] = edge.siteIds;
            const siteA = this.mapSites[a], siteB = this.mapSites[b];
            if (siteA.ownerId === siteB.ownerId) return;
    
            const ownerSite = (siteA.ownerId !== null && siteA.ownerId !== undefined) ? siteA : siteB;
            const color = this.factions[ownerSite.ownerId]?.color || '#ffffff';
    
            const segments = this.getNoisyLineSegments(edge.p1[0], edge.p1[1], edge.p2[0], edge.p2[1]);
    
            this.ctx.strokeStyle = color;
            this.ctx.beginPath();
            segments.forEach((pt, k) => {
                if (k === 0) this.ctx.moveTo(pt.x, pt.y);
                else this.ctx.lineTo(pt.x, pt.y);
            });
            this.ctx.stroke();
        });
    }
    
    renderCities() {
        this.mapSites.forEach(site => {
            if (site.city) {
                this.ctx.fillStyle = '#facc15';
                this.ctx.beginPath();
                this.ctx.arc(site.x, site.y, 2.5, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.strokeStyle = '#022c22';
                this.ctx.lineWidth = 1;
                this.ctx.stroke();
            }
        });
    }
    hideTooltip() {
        if (this.tooltip) this.tooltip.classList.add('hidden');
    }

    _initEvents() {
        this.canvas.style.cursor = 'grab';

        this.canvas.addEventListener('mousedown', e => this._handleMouseDown(e));
        window.addEventListener('mouseup', () => this._handleMouseUp());
        this.canvas.addEventListener('mousemove', e => this._handleMouseMove(e));
        this.canvas.addEventListener('mouseleave', () => this.hideTooltip());
        this.canvas.addEventListener('wheel', e => this._handleWheel(e), { passive: false });
        this.canvas.addEventListener('touchstart', e => {
            if (e.touches.length) this.handlePointerAt(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });
    }
   

    findNearestSiteIndex(mx, my) {
        let best = -1, bestD = Infinity;
        for (let i = 0; i < this.mapSites.length; i++) {
            const d = (this.mapSites[i].x - mx) ** 2 + (this.mapSites[i].y - my) ** 2;
            if (d < bestD) { bestD = d; best = i; }
        }
        return best;
    }

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
            lines.push(`Сезон: ${this.seasonLabels[this.currentSeason]}`);
            lines.push(`Еда ${res.food.toFixed(1)} · Произв. ${res.production.toFixed(1)} · Manpower ${res.manpower.toFixed(1)}`);
            lines.push(`Золото ${res.gold.toFixed(1)} · Содержание ${res.upkeep.toFixed(1)}`);
        }
    
        return `<div class="font-semibold text-emerald-400 mb-1">${bandLabel}</div>` +
               lines.map(l => `<div>${l}</div>`).join('');
    }

    handlePointerAt(clientX, clientY) {
        if (!this.mapSites.length) return;
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const px = (clientX - rect.left) * scaleX;
        const py = (clientY - rect.top) * scaleY;
    
        // из экранных пикселей canvas — в мировые координаты карты
        const wx = (px - this.viewTransform.x) / this.viewTransform.scale;
        const wy = (py - this.viewTransform.y) / this.viewTransform.scale;
    
        if (wx < 0 || wy < 0 || wx > this.width || wy > this.height) { this.hideTooltip(); return; }
    
        const idx = this.findNearestSiteIndex(wx, wy);
        if (idx === -1) { this.hideTooltip(); return; }
        this.tooltip.innerHTML = this.describeSite(this.mapSites[idx]);
        this.tooltip.style.left = (clientX + 16) + 'px';
        this.tooltip.style.top = (clientY + 16) + 'px';
        this.tooltip.classList.remove('hidden');
    }
    _handleWheel(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const px = (e.clientX - rect.left) * scaleX;
        const py = (e.clientY - rect.top) * scaleY;
    
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const newScale = Math.min(this.maxScale, Math.max(this.minScale, this.viewTransform.scale * factor));
    
        // точка под курсором должна остаться на месте после зума
        const worldX = (px - this.viewTransform.x) / this.viewTransform.scale;
        const worldY = (py - this.viewTransform.y) / this.viewTransform.scale;
    
        this.viewTransform.scale = newScale;
        this.viewTransform.x = px - worldX * newScale;
        this.viewTransform.y = py - worldY * newScale;
    
        this.render();
        this.hideTooltip();
    }
    _handleMouseDown(e) {
        this._isPanning = true;
        this._panStart = { x: e.clientX, y: e.clientY };
        this._transformStart = { x: this.viewTransform.x, y: this.viewTransform.y };
        this.canvas.style.cursor = 'grabbing';
    }
    
    _handleMouseUp() {
        this._isPanning = false;
        this.canvas.style.cursor = 'grab';
    }
    
    _handleMouseMove(e) {
        if (this._isPanning) {
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            const dx = (e.clientX - this._panStart.x) * scaleX;
            const dy = (e.clientY - this._panStart.y) * scaleY;
    
            this.viewTransform.x = this._transformStart.x + dx;
            this.viewTransform.y = this._transformStart.y + dy;
    
            this.render();
            this.hideTooltip();
            return;
        }
        this.handlePointerAt(e.clientX, e.clientY);
    }
}