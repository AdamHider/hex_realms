class AIManager {
    constructor(game, options = {}) {
        this.game = game;

        this.weights = {
            warDesireBase: 0.15,        // базовый шанс объявить войну соседу за ход
            peaceDesireIfLosing: 0.6,   // шанс предложить мир, если казна почти пуста во время войны
            treasuryDangerThreshold: 10, // ниже этого золота — считаем, что фракция "в беде"
        };

        this.callbacks = {
            onAIAction: options.onAIAction || null, // (factionId, action, details) => void
        };
    }

    // Вызывается из Game.endTurn(), после applyEconomies/tick, для каждой живой ИИ-фракции
    runTurn() {
        const factions = this.game.factionsManager.getAlive().filter(f => !f.isPlayer);
        factions.forEach(faction => this._decideFor(faction));
    }

    _decideFor(faction) {
        const neighbors = this.game.mapGen.factions.getNeighboringFactions(faction.id)
            .filter(id => this.game.factionsManager.get(id)?.isAlive);

        if (!neighbors.length) return; // некому взаимодействовать

        // 1. Если в беде (мало золота) и воюет — с некоторым шансом просит мира
        const inDanger = faction.treasury.gold < this.weights.treasuryDangerThreshold;
        if (inDanger) {
            const warEnemies = neighbors.filter(id => this.game.getDiplomacyStatus(faction.id, id) === 'war');
            warEnemies.forEach(enemyId => {
                if (Math.random() < this.weights.peaceDesireIfLosing) {
                    this._tryMakePeace(faction.id, enemyId);
                }
            });
            return; // фракция в беде не начинает новых войн в этот же ход
        }

        // 2. Иначе — шанс объявить войну соседу в мире, пропорциональный агрессии личности
        const peaceNeighbors = neighbors.filter(id => this.game.getDiplomacyStatus(faction.id, id) === 'peace');
        peaceNeighbors.forEach(neighborId => {
            const chance = this.weights.warDesireBase * (faction.personality?.aggression ?? 0.5);
            if (Math.random() < chance) {
                this._tryDeclareWar(faction.id, neighborId);
            }
        });
    }

    _tryDeclareWar(a, b) {
        const success = this.game.declareWar(a, b);
        if (success && this.callbacks.onAIAction) {
            this.callbacks.onAIAction(a, 'declare_war', { target: b });
        }
    }

    _tryMakePeace(a, b) {
        const success = this.game.makePeace(a, b);
        if (success && this.callbacks.onAIAction) {
            this.callbacks.onAIAction(a, 'make_peace', { target: b });
        }
    }
}