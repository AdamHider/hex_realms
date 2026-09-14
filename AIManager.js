class AIManager {
    constructor(game, options = {}) {
        this.game = game;
    
        this.weights = {
            warDesireBase: 0.35,           // было 0.15 — фракции чаще решаются на конфликт
            peaceDesireIfLosing: 0.5,       // чуть меньше, чтобы войны не гасли слишком быстро
            treasuryDangerThreshold: 8,     // порог "в беде" снижен — фракция терпит войну дольше
            recruitChance: 0.7,             // было 0.35 — почти каждый ход пытается нанять, если хватает средств
            recruitGoldReserve: 15,         // ниже резерв — тратит золото охотнее
            expansionChance: 0.95,          // было 0.7 — почти всегда пытается двигать свободные армии
            warCooldownTurns: 1,            // было 3 — почти без охлаждения между войнами
            maxSimultaneousWars: 2,         // новое — теперь можно воевать на 2 фронта, не на 1
            aggressiveMoveChance: 0.6,      // новое — шанс атаковать вражеский регион вместо нейтрального
        };
    
        this.callbacks = {
            onAIAction: options.onAIAction || null,
        };
    
        this.lastWarTurn = {};
    }

    runTurn() {
        const factions = this.game.factionsManager.getAlive().filter(f => !f.isPlayer);
        console.log('[AI] runTurn, factions:', factions.length);
    
        factions.forEach(faction => {
            this._decideDiplomacy(faction);
            this._decideRecruitment(faction);
            this._decideArmyActions(faction);
        });
    }
    
    _decideArmyActions(faction) {
        const armies = this.game.armyManager.getArmiesOf(faction.id);
    
        armies.forEach(army => {
            const region = this.game.mapGen.terrain.regions.all[army.regionId];
            if (!region) return;
    
            // Стоим на нейтральной или вражеской земле — оккупация разрешается автоматически через resolveOccupations(),
            // здесь только решаем, двигаться ли ДАЛЬШЕ, если очков ещё хватает (после занятия клетки очков обычно уже нет,
            // но если движение стоило меньше полного actionPoints — проверяем)
            if (army.actionPoints <= 0) return;
            if (Math.random() > this.weights.expansionChance) return;
    
            const isAtWarSomewhere = this.game.mapGen.factions.getNeighboringFactions(faction.id)
                .some(id => this.game.getDiplomacyStatus(faction.id, id) === 'war');
    
            let target = null;
    
            // Если фракция воюет и personality достаточно агрессивна — с шансом идём НА врага, а не на нейтралку
            if (isAtWarSomewhere && Math.random() < this.weights.aggressiveMoveChance * (faction.personality?.aggression ?? 0.5)) {
                target = this._findNearestEnemyRegion(faction, army);
            }
    
            if (!target) target = this._findNearestNeutralRegion(faction, army);
            if (!target) return;
    
            const result = this.game.armyManager.moveArmy(army.id, target);
            if (result.success && this.callbacks.onAIAction) {
                this.callbacks.onAIAction(faction.id, 'move_army', { armyId: army.id, to: target });
            }
        });
    }
    
    _findNearestEnemyRegion(faction, army) {
        const mapGen = this.game.mapGen;
        const reachable = mapGen.armies.computeReachable(army);
        if (!reachable.size) return null;
    
        let best = null, bestAP = -Infinity;
        reachable.forEach((remainingAP, regionId) => {
            const region = mapGen.terrain.regions.all[regionId];
            if (!region) return;
            if (region.ownerId === null || region.ownerId === undefined) return; 
            if (region.ownerId === faction.id) return;
            const status = this.game.getDiplomacyStatus(faction.id, region.ownerId);
            if (status !== 'war') return;
            if (remainingAP > bestAP) { bestAP = remainingAP; best = regionId; }
        });
        return best;
    }

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
    
        const currentTurn = this.game.turnManager?.state?.turnNumber ?? 0;
        const lastWar = this.lastWarTurn[faction.id] ?? -Infinity;
        if (currentTurn - lastWar < this.weights.warCooldownTurns) return;
    
        const currentWars = neighbors.filter(id => this.game.getDiplomacyStatus(faction.id, id) === 'war').length;
        if (currentWars >= this.weights.maxSimultaneousWars) return; // лимит фронтов, не полный запрет
    
        const peaceNeighbors = neighbors.filter(id => this.game.getDiplomacyStatus(faction.id, id) === 'peace');
        const shuffled = [...peaceNeighbors].sort(() => Math.random() - 0.5);
    
        let declaredThisTurn = 0;
        const remainingSlots = this.weights.maxSimultaneousWars - currentWars;
    
        for (const neighborId of shuffled) {
            if (declaredThisTurn >= remainingSlots) break;
            const chance = this.weights.warDesireBase * (faction.personality?.aggression ?? 0.5);
            if (Math.random() < chance) {
                this._tryDeclareWar(faction.id, neighborId);
                this.lastWarTurn[faction.id] = currentTurn;
                declaredThisTurn++;
            }
        }
    }

    _decideRecruitment(faction) {
        if (Math.random() > this.weights.recruitChance) return;
    
        const cost = this.game.armyManager.recruitCost;
        if (faction.treasury.gold - cost.gold < this.weights.recruitGoldReserve) return;
        if (faction.treasury.manpower < cost.manpower) return;
    
        // выбираем случайный СВОЙ регион, не обязательно столицу — распределяет армии по территории, не только в центре
        const ownRegions = this.game.mapGen.terrain.regions.all.filter(r => r.ownerId === faction.id);
        if (!ownRegions.length) return;
    
        const target = Math.random() < 0.5
            ? this.game.mapGen.terrain.regions.all[faction.capitalRegionId]
            : ownRegions[Math.floor(Math.random() * ownRegions.length)];
    
        const result = this.game.armyManager.recruitArmy(faction.id, target.id);
        if (result.success && this.callbacks.onAIAction) {
            this.callbacks.onAIAction(faction.id, 'recruit_army', { regionId: target.id });
        }
    }

    // Ищем ближайший (по BFS-достижимости за этот ход) нейтральный регион, куда армия реально может дойти
    _findNearestNeutralRegion(faction, army) {
        const mapGen = this.game.mapGen;
        const reachable = mapGen.armies.computeReachable(army);
        if (!reachable.size) return null;

        let best = null, bestAP = -Infinity; // предпочитаем цель, до которой останется больше очков (то есть ближе)
        reachable.forEach((remainingAP, regionId) => {
            const region = mapGen.terrain.regions.all[regionId];
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