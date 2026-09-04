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
        
        this.warCooldownTurns = options.warCooldownTurns ?? 3;
        this.lastWarTurn = {}; 
    }

    runTurn() {
        const factions = this.game.factionsManager.getAlive().filter(f => !f.isPlayer);
        console.log('[AI] runTurn, factions:', factions.length);
    
        factions.forEach(faction => {
            //this._decideDiplomacy(faction);
            console.log('[AI] calling _decideArmyActions for', faction.name);
            //this._decideRecruitment(faction);
            this._decideArmyActions(faction);
        });
    }
    
    _decideArmyActions(faction) {
        const armies = this.game.armyManager.getArmiesOf(faction.id);
        console.log(`[AI ${faction.name}] armies count:`, armies.length);
    
        armies.forEach(army => {
            console.log(`[AI ${faction.name}] army ${army.id}: ap=${army.actionPoints}, region=${army.regionId}`);
    
            const region = this.game.mapGen.terrain.regions[army.regionId];
            if (!region) { console.log('  -> no region found, skip'); return; }
                  
            const roll = Math.random();
            console.log(`  -> expansion roll: ${roll.toFixed(2)} vs chance ${this.weights.expansionChance}`);
            if (roll > this.weights.expansionChance) { console.log('  -> failed roll, skip'); return; }
            if (army.actionPoints <= 0) { console.log('  -> no action points, skip'); return; }
    
            const target = this._findNearestNeutralRegion(faction, army);
            console.log('  -> nearest neutral target:', target);
            if (!target) return;
    
            const result = this.game.armyManager.moveArmy(army.id, target);
            console.log('  -> moveArmy result:', result);
            if (result.success && this.callbacks.onAIAction) {
                this.callbacks.onAIAction(faction.id, 'move_army', { armyId: army.id, to: target });
            }
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
    
        // остывание после недавней войны — не объявляем сразу вторую
        const currentTurn = this.game.turnManager?.state?.turnNumber ?? 0;
        const lastWar = this.lastWarTurn[faction.id] ?? -Infinity;
        if (currentTurn - lastWar < this.warCooldownTurns) return;
    
        // уже воюющая фракция не начинает ещё одну войну одновременно
        const alreadyAtWar = neighbors.some(id => this.game.getDiplomacyStatus(faction.id, id) === 'war');
        if (alreadyAtWar) return;
    
        const peaceNeighbors = neighbors.filter(id => this.game.getDiplomacyStatus(faction.id, id) === 'peace');
        // объявляем войну не всем подряд соседям, а максимум одному за ход
        const shuffled = [...peaceNeighbors].sort(() => Math.random() - 0.5);
        for (const neighborId of shuffled) {
            const chance = this.weights.warDesireBase * (faction.personality?.aggression ?? 0.5);
            if (Math.random() < chance) {
                this._tryDeclareWar(faction.id, neighborId);
                this.lastWarTurn[faction.id] = currentTurn;
                break; // одна война за ход — и хватит
            }
        }
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


    // Ищем ближайший (по BFS-достижимости за этот ход) нейтральный регион, куда армия реально может дойти
    _findNearestNeutralRegion(faction, army) {
        const mapGen = this.game.mapGen;
        const reachable = mapGen.armies.computeReachable(army);
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