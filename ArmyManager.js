class ArmyManager {
    constructor(game, options = {}) {
        this.game = game;
        this.list = [];
        this.nextId = 0;

        this.callbacks = {
            onArmyMoved: options.onArmyMoved || null,
        };
    }

    // Вызывается один раз в Game.newGame(), после того как mapGen.create() уже расставил стартовые армии
    initFromFactions(factions) {
        this.list = [];
        factions.forEach(faction => {
            (faction.armies || []).forEach(a => {
                this.list.push({
                    id: `army-${this.nextId++}`,
                    factionId: faction.id,
                    regionId: a.regionId,
                    strength: a.strength,
                });
            });
        });
        return this.list;
    }

    getArmiesAt(regionId) {
        return this.list.filter(a => a.regionId === regionId);
    }

    getArmiesOf(factionId) {
        return this.list.filter(a => a.factionId === factionId);
    }

    // Простое перемещение — только на соседний регион, без боя/провинций в процессе (заготовка)
    moveArmy(armyId, targetRegionId) {
        const army = this.list.find(a => a.id === armyId);
        if (!army) return false;

        const mapGen = this.game.mapGen;
        const neighbors = mapGen.regionNeighbors?.[army.regionId] || [];
        if (!neighbors.includes(targetRegionId)) return false; // разрешаем только шаг на соседний регион

        const targetRegion = mapGen.terrain.regions[targetRegionId];
        if (!targetRegion || targetRegion.isWater) return false;

        const fromRegionId = army.regionId;
        army.regionId = targetRegionId;

        if (this.callbacks.onArmyMoved) this.callbacks.onArmyMoved(army, fromRegionId, targetRegionId);
        mapGen.scheduleRender();
        return true;
    }
}