class MapGenerator {
    constructor(options = {}) {
        this.width = options.width || 600;
        this.height = options.height || 600;
        this.edgeRoughness = options.edgeRoughness || 0.42;
        this.edgeDepth = options.edgeDepth || 5;
        this.borderMargin = options.borderMargin || 22;
        this.peakCount = options.peakCount || 4;
        this.peakShape = options.peakShape || 0.5;
        this.shapeType = options.shapeType || 'continent';
        this.landAmount = options.landAmount || 1.5;
        this.relief = options.relief || 0.75;
        this.chaos = options.chaos || 0.75;

        this.canvas = document.getElementById(options.canvas);
        this.ctx = this.canvas.getContext('2d');
        this.tooltip = options.tooltip ? (typeof options.tooltip === 'string' ? document.getElementById(options.tooltip) : options.tooltip) : null;

        this.currentSeed = options.seed || 12345;
        this.mapSites = [];
        this.mapVoronoi = null;
        this.noisyEdgeCache = new Map();

        this._initDictionaries();
        
        if (this.canvas) {
            this._initEvents();
        }
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
    seededRandom() {
        this.currentSeed = (this.currentSeed * 48271) % 2147483647;
        return (this.currentSeed / 2147483647);
    }

    setSeed(seed) {
        this.currentSeed = seed || Math.floor(Math.random() * 9999999) + 1;
        return this.currentSeed;
    }


    toggleSeedInput() {
        const isAuto = document.getElementById('checkRandomSeed').checked;
        document.getElementById('inputSeed').disabled = isAuto;
        if (isAuto) {
            this.setSeed(Math.floor(Math.random() * 1000000));
            document.getElementById('inputSeed').value = this.currentSeed;
        }
    }

    randomizeSeedAndGenerate() {
        document.getElementById('checkRandomSeed').checked = false;
        document.getElementById('inputSeed').disabled = false;
        this.setSeed(Math.floor(Math.random() * 9999999) + 1);
        document.getElementById('inputSeed').value = this.currentSeed;
        generate();
    }


    pickBiome(bands, t) {
        for (let i = 0; i < bands.length; i++) if (t <= bands[i].maxT) return bands[i].id;
        return bands[bands.length - 1].id;
    }
    pickElevationBand(bands, t) {
        for (let i = 0; i < bands.length; i++) if (t <= bands[i].maxT) return bands[i];
        return bands[bands.length - 1];
    }
    computeTemperatures(sites, isWater, landT, width, height) {
        const n = sites.length;
        const temp = new Float64Array(n);
        const phase = this.seededRandom() * Math.PI * 2;
        for (let i = 0; i < n; i++) {
            const nx = sites[i].x / width, ny = sites[i].y / height;
            const wobble = Math.sin(nx * Math.PI * 2.2 + phase) * 0.07 + Math.sin(nx * Math.PI * 5.0 - phase) * 0.035;
            let val = ny + wobble;
            if (!isWater[i]) val -= landT[i] * 0.32;
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

    generateElevation(sites, neighborsList, shapeType) {
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
        let channelMask = null;
        for (let i = 0; i < n; i++) {
            const isEdge = sites[i].x < this.borderMargin || sites[i].x > this.width - this.borderMargin
                        || sites[i].y < this.borderMargin || sites[i].y > this.height - this.borderMargin;
            if (isEdge) elevation[i] *= 0.15;
        }
        console.log(elevation)
        return { elevation, channelMask };
    }

    classifyByLandFraction(elevation, targetFraction, reliefCompression, channelMask) {
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

        if (channelMask) {
            for (let i = 0; i < n; i++) {
                if (!channelMask[i]) continue;
                isWater[i] = 1;
                t[i] = Math.min(1, Math.max(0, (elevation[i] - min) / waterRange));
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

    generate() {
        this.noisyEdgeCache.clear();

        const approxSites = 1500;

        const rawSites = this.generateUniformSites(approxSites, this.width, this.height, 2);
        
        const sites = rawSites.map((s, i) => ({
            id: i, x: s.x, y: s.y, elevation: 0, t: 0, biome: 'OCEAN', biomeBand: 'OCEAN',
            biomeClimate: 'OCEAN', biomeNeutral: 'OCEAN', climateZone: null, isWater: true, city: null
        }));

        const points = new Float64Array(sites.length * 2);
        for (let i = 0; i < sites.length; i++) {
            points[i * 2] = sites[i].x;
            points[i * 2 + 1] = sites[i].y;
        }
        const delaunay = new d3.Delaunay(points);
        const voronoi = delaunay.voronoi([0, 0, this.width, this.height]);
        const neighbors = this.buildNeighbors(delaunay, sites.length);
        
        const { elevation, channelMask } = this.generateElevation(sites, neighbors);
        

        const targetFraction = Math.min(0.62, Math.max(0.12, 0.20 + (this.landAmount - 0.5) * 0.35));
        const { isWater, t } = this.classifyByLandFraction(elevation, targetFraction, this.relief, channelMask);

        const minLandSize = Math.max(4, Math.round(approxSites * 0.006));
        this.cleanupLandSpecks(isWater, neighbors, minLandSize);

        const temperature = this.computeTemperatures(sites, isWater, t, this.width, this.height);

        sites.forEach((site, i) => {
            site.elevation = elevation[i];
            site.t = t[i];
            site.isWater = !!isWater[i];
            if (site.isWater) {
                const id = this.pickBiome(this.waterBiomes, t[i]);
                site.biomeBand = id;
                site.biomeClimate = id;
                site.biomeNeutral = id;
                site.climateZone = null;
            } else {
                const band = this.pickElevationBand(this.landElevationBands, t[i]);
                const zone = temperature[i] < 0.28 ? 'cold' : temperature[i] > 0.72 ? 'hot' : 'temperate';
                site.biomeBand = band.id;
                site.biomeClimate = band.id + '_' + zone;
                site.biomeNeutral = band.id + '_temperate';
                site.climateZone = zone;
            }
        });

        this.drawCities(sites)

        this.mapSites = sites;
        this.mapVoronoi = voronoi;
        this.renderMap();
    }

    drawCities(sites){
        const landSites = sites.filter(s => !s.isWater);
        landSites.forEach((site, index) => {
            if (index % 25 === 0 && site.biomeBand !== 'PEAKS' && site.biomeBand !== 'HIGHLANDS') {
                site.city = { name: 'Поселение ' + (index + 1) };
            }
        });
    }

    renderMap() {
        const showClimate = document.getElementById('checkClimate').checked;

        this.ctx.clearRect(0, 0, this.width, this.height);

        for (let i = 0; i < this.mapSites.length; i++) {
            const polygon = this.mapVoronoi.cellPolygon(i);
            if (!polygon) continue;

            const site = this.mapSites[i];
            site.biome = site.isWater ? site.biomeClimate : (showClimate ? site.biomeClimate : site.biomeNeutral);
            this.ctx.fillStyle = this.biomesMap[site.biome];
            this.ctx.strokeStyle = 'rgba(2, 44, 34, 0.3)';
            this.ctx.lineWidth = 1;

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
            this.ctx.fill();
            this.ctx.stroke();
        }

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
        const getClimateState = () => document.getElementById('checkClimate')?.checked || false;

        this.canvas.addEventListener('mousemove', e => this.handlePointerAt(e.clientX, e.clientY, getClimateState()));
        this.canvas.addEventListener('click', e => this.handlePointerAt(e.clientX, e.clientY, getClimateState()));
        this.canvas.addEventListener('mouseleave', () => this.hideTooltip());
        this.canvas.addEventListener('touchstart', e => {
            if (e.touches.length) this.handlePointerAt(e.touches[0].clientX, e.touches[0].clientY, getClimateState());
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

    describeSite(site, showClimate) { 
        const ELEVATION_BAND_LABELS = {
            COAST: 'Побережье', STEPPE: 'Степь', PLAINS: 'Равнина', GRASSLAND: 'Луга',
            WETLANDS: 'Болота', WOODLAND: 'Редколесье', FOREST: 'Лес', DENSE_FOREST: 'Густой лес',
            HIGHLANDS: 'Плоскогорье', PEAKS: 'Пик',
            DEEP_OCEAN: 'Глубокий океан', OCEAN: 'Океан', SHALLOW: 'Мелководье',
        };
        const CLIMATE_ZONE_LABELS = { cold: 'холодный', temperate: 'умеренный', hot: 'жаркий' };
        const bandLabel = ELEVATION_BAND_LABELS[site.biomeBand] || site.biomeBand;
        const lines = [];
        if (site.isWater) {
            lines.push(`Глубина: ${(100 - site.t * 100).toFixed(0)}%`);
        } else {
            if (showClimate && site.climateZone) lines.push(`Климат: ${CLIMATE_ZONE_LABELS[site.climateZone]}`);
            lines.push(`Высота: ${(site.t * 100).toFixed(0)}%`);
        }
        if (site.city) lines.push(`Поселение: ${site.city.name}`);
        return `<div class="font-semibold text-emerald-400 mb-1">${bandLabel}</div>` +
               lines.map(l => `<div>${l}</div>`).join('');
    }

    handlePointerAt(clientX, clientY) {
        if (!this.mapSites.length) return;
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const mx = (clientX - rect.left) * scaleX;
        const my = (clientY - rect.top) * scaleY;
        if (mx < 0 || my < 0 || mx > this.canvas.width || my > this.canvas.height) { this.hideTooltip(); return; }

        const idx = this.findNearestSiteIndex(mx, my);
        if (idx === -1) { this.hideTooltip(); return; }
        const showClimate = document.getElementById('checkClimate').checked;
        const tooltip = document.getElementById('mapTooltip');
        tooltip.innerHTML = this.describeSite(this.mapSites[idx], showClimate);
        tooltip.style.left = (clientX + 16) + 'px';
        tooltip.style.top = (clientY + 16) + 'px';
        tooltip.classList.remove('hidden');
    }
}