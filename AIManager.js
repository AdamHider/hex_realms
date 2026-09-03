class AIManager {
    constructor(game, options = {}) {
        this.game = game;

        this.weights = {
            warDesireBase: 0.15,
            peaceDesireIfLosing: 0.6,
            treasuryDangerThreshold: 10,
            recruitChance: 0.35,       // шанс попытаться нанять армию за ход, если есть средства
            recruitGoldReserve: 40,    // не нанимать, если после найма золота останется меньше этого
            expansionChance: 0.7,      // шанс, что свободная армия попытается двигаться к нейтральной земле
        };

        this.callbacks = {
            onAIAction: options.onAIAction || null,
        };
    }

    runTurn() {
        const factions = this.game.factionsManager.getAlive().filter(f => !f.isPlayer);
        factions.forEach(faction => {
            this._decideDiplomacy(faction);
            this._decideRecruitment(faction);
            this._decideArmyActions(faction);
        });
    }

    // ── Дипломатия — как было ──
    _decideDiplomacy(faction) {
        const neighbors = this.game.mapGen.factions.getNeighboringFactions(faction.id)
            .filter(id => this.game.factionsManager.get(id)?.isAlive);
        if (!neighbors.length) return;

        const inDanger = faction.treasury.gold < this.weights.treasuryDangerThreshold;
        if (inDanger) {
            const warEnemies = neighbors.filter(id => this.game.getDiplomacyStatus(faction.id, id) === 'war');
            warEnemies.forEach(enemyId => {
                if (Math.random() < this.weights.peaceDesireIfLosing) this._tryMakePeace(faction.id, enemyId);
            });
            return;
        }

        const peaceNeighbors = neighbors.filter(id => this.game.getDiplomacyStatus(faction.id, id) === 'peace');
        peaceNeighbors.forEach(neighborId => {
            const chance = this.weights.warDesireBase * (faction.personality?.aggression ?? 0.5);
            if (Math.random() < chance) this._tryDeclareWar(faction.id, neighborId);
        });
    }

    // ── Найм ──
    _decideRecruitment(faction) {
        if (Math.random() > this.weights.recruitChance) return;

        const cost = this.game.armyManager.recruitCost;
        if (faction.treasury.gold - cost.gold < this.weights.recruitGoldReserve) return;
        if (faction.treasury.manpower < cost.manpower) return;

        // нанимаем в столице — самый безопасный и очевидный вариант для простого ИИ
        const result = this.game.armyManager.recruitArmy(faction.id, faction.capitalRegionId);
        if (result.success && this.callbacks.onAIAction) {
            this.callbacks.onAIAction(faction.id, 'recruit_army', { regionId: faction.capitalRegionId });
        }
    }

    // ── Управление армиями: движение к ближайшей нейтральной земле + захват ──
    _decideArmyActions(faction) {
        const armies = this.game.armyManager.getArmiesOf(faction.id);

        armies.forEach(army => {
            const region = this.game.mapGen.terrain.regions[army.regionId];
            if (!region) return;

            // Если стоим на нейтральной territory — захватываем сразу, это приоритетнее движения
            if (region.ownerId === null || region.ownerId === undefined) {
                const actions = this.game.armyManager.getAvailableActions(army.id);
                if (actions.includes('capture')) {
                    const result = this.game.armyManager.captureRegion(army.id);
                    if (result.success && this.callbacks.onAIAction) {
                        this.callbacks.onAIAction(faction.id, 'capture_region', { regionId: region.id });
                    }
                    return; // очки хода потрачены на захват — двигаться в этот ход уже некуда
                }
            }

            if (Math.random() > this.weights.expansionChance) return;
            if (army.actionPoints <= 0) return;

            const target = this._findNearestNeutralRegion(faction, army);
            if (!target) return;

            const result = this.game.armyManager.moveArmy(army.id, target);
            if (result.success && this.callbacks.onAIAction) {
                this.callbacks.onAIAction(faction.id, 'move_army', { armyId: army.id, to: target });
            }
        });
    }

    // Ищем ближайший (по BFS-достижимости за этот ход) нейтральный регион, куда армия реально может дойти
    _findNearestNeutralRegion(faction, army) {
        const mapGen = this.game.mapGen;
        const reachable = mapGen.computeReachableRegions(army);
        if (!reachable.size) return null;

        let best = null, bestAP = -Infinity; // предпочитаем цель, до которой останется больше очков (то есть ближе)
        reachable.forEach((remainingAP, regionId) => {
            const region = mapGen.terrain.regions[regionId];
            if (!region || region.ownerId !== null && region.ownerId !== undefined) return; // только нейтральные
            if (remainingAP > bestAP) { bestAP = remainingAP; best = regionId; }
        });
        return best;
    }

    _tryDeclareWar(a, b) {
        const success = this.game.declareWar(a, b);
        if (success && this.callbacks.onAIAction) this.callbacks.onAIAction(a, 'declare_war', { target: b });
    }

    _tryMakePeace(a, b) {
        const success = this.game.makePeace(a, b);
        if (success && this.callbacks.onAIAction) this.callbacks.onAIAction(a, 'make_peace', { target: b });
    }
}