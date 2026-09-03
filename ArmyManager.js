class ArmyManager {
    constructor(game, options = {}) {
        this.game = game;
        this.list = [];
        this.nextId = 0;

        this.recruitCost = options.recruitCost ?? { gold: 30, manpower: 20 };
        this.reinforceCostPerStrength = options.reinforceCostPerStrength ?? { gold: 2, manpower: 1.5 };
        this.upkeepPerStrength = options.upkeepPerStrength ?? 0.3; // золото за очко силы за ход

        this.rankThresholds = options.rankThresholds ?? [10, 25, 50, 90]; 

        this.callbacks = {
            onArmyMoved: options.onArmyMoved || null,
            onArmyRecruited: options.onArmyRecruited || null,
            onRegionCaptured: options.onRegionCaptured || null,
            onRegionPillaged: options.onRegionPillaged || null,
        };
    }

    initFromFactions(factions) {
        this.list = [];
        factions.forEach(faction => {
            (faction.armies || []).forEach(a => {
                this.list.push(this._makeArmy(faction.id, a.regionId, a.strength));
            });
        });
        return this.list;
    }

    _makeArmy(factionId, regionId, strength) {
        return {
            id: `army-${this.nextId++}`,
            factionId,
            regionId,
            strength,
            actionPoints: 0,
            assetVariant: 1 + Math.floor(Math.random() * this.game.mapGen.armyAssets.variantsPerRank),
        };
    }

    getArmiesAt(regionId) {
        return this.list.filter(a => a.regionId === regionId);
    }

    getArmiesOf(factionId) {
        return this.list.filter(a => a.factionId === factionId);
    }
    getArmyRank(strength) {
        let rank = 1;
        for (const threshold of this.rankThresholds) {
            if (strength >= threshold) rank++;
            else break;
        }
        return Math.min(rank, 5);
    }
    getArmiesSnapshot() {
        return this.list.map(army => ({ ...army, rank: this.getArmyRank(army.strength) }));
    }

    // ── Найм / пополнение — только на своей территории ──

    canRecruitAt(factionId, regionId) {
        const region = this.game.mapGen.terrain.regions[regionId];
        return !!region && !region.isWater && region.ownerId === factionId;
    }

    recruitArmy(factionId, regionId) {
        if (!this.canRecruitAt(factionId, regionId)) return { success: false, reason: 'not_own_territory' };

        const faction = this.game.factionsManager.get(factionId);
        if (!faction) return { success: false, reason: 'no_faction' };
        if (faction.treasury.gold < this.recruitCost.gold || faction.treasury.manpower < this.recruitCost.manpower) {
            return { success: false, reason: 'insufficient_resources' };
        }

        faction.treasury.gold -= this.recruitCost.gold;
        faction.treasury.manpower -= this.recruitCost.manpower;

        const army = this._makeArmy(factionId, regionId, 10);
        this.list.push(army);

        if (this.callbacks.onArmyRecruited) this.callbacks.onArmyRecruited(army);
        this.game.mapGen.scheduleRender();
        return { success: true, army };
    }

    reinforceArmy(armyId, addStrength) {
        const army = this.list.find(a => a.id === armyId);
        if (!army) return { success: false, reason: 'no_army' };
        if (!this.canRecruitAt(army.factionId, army.regionId)) return { success: false, reason: 'not_own_territory' };

        const faction = this.game.factionsManager.get(army.factionId);
        const goldCost = addStrength * this.reinforceCostPerStrength.gold;
        const mpCost = addStrength * this.reinforceCostPerStrength.manpower;
        if (faction.treasury.gold < goldCost || faction.treasury.manpower < mpCost) {
            return { success: false, reason: 'insufficient_resources' };
        }

        faction.treasury.gold -= goldCost;
        faction.treasury.manpower -= mpCost;
        army.strength += addStrength;

        this.game.mapGen.scheduleRender();
        return { success: true, army };
    }

    // ── Очки действий — сбрасываются в начале хода фракции ──

    resetActionPoints() {
        this.list.forEach(army => {
            const region = this.game.mapGen.terrain.regions[army.regionId];
            const onOwnLand = region && region.ownerId === army.factionId;
            army.actionPoints = onOwnLand ? 2 : 1; // внутри своих владений — 2-3 хода, за пределами — 1
        });
    }

    // ── Движение ──

    canMoveTo(armyId, targetRegionId) {
        const army = this.list.find(a => a.id === armyId);
        if (!army || army.actionPoints <= 0) return false;
        if (army.regionId === targetRegionId) return false;
    
        const mapGen = this.game.mapGen;
        const targetRegion = mapGen.terrain.regions[targetRegionId];
        if (!targetRegion || targetRegion.isWater) return false;
    
        // проверяем через тот же BFS, что и подсветка зоны — targetRegionId должен быть среди достижимых
        const reachable = mapGen.computeReachableRegions(army);
        if (!reachable.has(targetRegionId)) return false;
    
        // проверка на занятость вражеской армией — переносим сюда из старой логики
        const occupiedByEnemy = mapGen.armiesProvider &&
            mapGen.armiesProvider().some(a => a.regionId === targetRegionId && a.factionId !== army.factionId);
        if (occupiedByEnemy) return false;
    
        return true;
    }

    moveArmy(armyId, targetRegionId) {
        if (!this.canMoveTo(armyId, targetRegionId)) return { success: false, reason: 'cannot_move' };
    
        const army = this.list.find(a => a.id === armyId);
        const fromRegionId = army.regionId;
        army.regionId = targetRegionId;
        army.actionPoints = 0; // весь ход считается использованным, независимо от пройденной дистанции
    
        if (this.callbacks.onArmyMoved) this.callbacks.onArmyMoved(army, fromRegionId, targetRegionId);
        this.game.mapGen.scheduleRender();
        return { success: true, army };
    }

    // ── Действия на вражеской/нейтральной territории: захват / разграбление ──

    getAvailableActions(armyId) {
        const army = this.list.find(a => a.id === armyId);
        if (!army || army.actionPoints <= 0) return [];
    
        const region = this.game.mapGen.terrain.regions[army.regionId];
        if (!region || region.ownerId === army.factionId) return [];
    
        const actions = [];
        if (region.ownerId === null || region.ownerId === undefined) actions.push('capture');
        // pillage требует занятой чужой территории — пока недоступно, раз бой ещё не реализован; оставляю задел:
        // else actions.push('pillage');
    
        return actions;
    }
    captureRegion(armyId) {
        const army = this.list.find(a => a.id === armyId);
        if (!army || army.actionPoints <= 0) return { success: false, reason: 'no_action_points' };
    
        const mapGen = this.game.mapGen;
        const region = mapGen.terrain.regions[army.regionId];
        if (!region) return { success: false, reason: 'invalid_target' };
    
        // пока разрешаем захват только нейтральной (ничейной) территории — вражеские регионы не берутся до системы боя
        if (region.ownerId !== null && region.ownerId !== undefined) {
            return { success: false, reason: 'not_neutral' };
        }
    
        region.ownerId = army.factionId;
        army.actionPoints = 0;
    
        this._refreshFactionOwnedRegions(army.factionId);
    
        mapGen.factions.labelPathCache?.delete(army.factionId);
        mapGen.markDirty('terrain', 'political', 'fog');
        mapGen.render();
    
        if (this.callbacks.onRegionCaptured) this.callbacks.onRegionCaptured(army, region, null);
        return { success: true, region };
    }

    pillageRegion(armyId) {
        const army = this.list.find(a => a.id === armyId);
        if (!army || army.actionPoints <= 0) return { success: false, reason: 'no_action_points' };

        const mapGen = this.game.mapGen;
        const region = mapGen.terrain.regions[army.regionId];
        if (!region || region.ownerId === army.factionId) return { success: false, reason: 'invalid_target' };

        const faction = this.game.factionsManager.get(army.factionId);
        const loot = Math.round(10 + region.population * 0.1);
        faction.treasury.gold += loot;
        region.population = Math.max(0, Math.round(region.population * 0.7)); // разграбление подрывает население региона

        army.actionPoints = 0;

        if (this.callbacks.onRegionPillaged) this.callbacks.onRegionPillaged(army, region, loot);
        return { success: true, loot };
    }

    _refreshFactionOwnedRegions(factionId) {
        if (factionId === null || factionId === undefined) return;
        const faction = this.game.factionsManager.get(factionId);
        if (!faction) return;
        const owned = this.game.mapGen.terrain.regions.filter(r => r.ownerId === factionId);
        faction.ownedRegions = owned.map(r => r.id);
        faction.totalPopulation = owned.reduce((sum, r) => sum + r.population, 0);
    }

    // ── Содержание армий — списывается в конце хода ──

    collectUpkeep() {
        const upkeepByFaction = {};
        this.list.forEach(army => {
            upkeepByFaction[army.factionId] = (upkeepByFaction[army.factionId] || 0) + army.strength * this.upkeepPerStrength;
        });
        Object.entries(upkeepByFaction).forEach(([factionId, cost]) => {
            const faction = this.game.factionsManager.get(Number(factionId));
            if (faction) faction.treasury.gold -= cost;
        });
        return upkeepByFaction;
    }
}