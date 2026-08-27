class DiplomacyManager {
    constructor(game, options = {}) {
        this.game = game;
        this.relations = new Map(); // ключ "minId-maxId" → { status, turnsInStatus }

        this.callbacks = {
            onWarDeclared: options.onWarDeclared || null,
            onPeaceMade: options.onPeaceMade || null,
            onAllianceFormed: options.onAllianceFormed || null,
        };
    }

    _key(a, b) {
        return a < b ? `${a}-${b}` : `${b}-${a}`;
    }

    // Вызывается один раз в Game.newGame() — все живые фракции стартуют в мире
    init(factions) {
        this.relations.clear();
        for (let i = 0; i < factions.length; i++) {
            for (let j = i + 1; j < factions.length; j++) {
                this.relations.set(this._key(factions[i].id, factions[j].id), {
                    status: 'peace',
                    turnsInStatus: 0,
                });
            }
        }
    }

    getStatus(a, b) {
        if (a === b) return 'self';
        const rel = this.relations.get(this._key(a, b));
        return rel ? rel.status : 'peace'; // fallback на случай новой фракции без записи
    }

    isAtWar(a, b) { return this.getStatus(a, b) === 'war'; }
    isAllied(a, b) { return this.getStatus(a, b) === 'alliance'; }

    // ── Переходы состояний — каждый со своей валидацией ──

    declareWar(a, b) {
        if (a === b) return false;
        const key = this._key(a, b);
        const rel = this.relations.get(key);
        if (!rel || rel.status === 'war') return false; // уже воюют — нет смысла объявлять снова

        rel.status = 'war';
        rel.turnsInStatus = 0;
        if (this.callbacks.onWarDeclared) this.callbacks.onWarDeclared(a, b);
        return true;
    }

    makePeace(a, b) {
        const key = this._key(a, b);
        const rel = this.relations.get(key);
        if (!rel || rel.status !== 'war') return false; // мириться можно только из состояния войны

        rel.status = 'peace';
        rel.turnsInStatus = 0;
        if (this.callbacks.onPeaceMade) this.callbacks.onPeaceMade(a, b);
        return true;
    }

    formAlliance(a, b) {
        const key = this._key(a, b);
        const rel = this.relations.get(key);
        if (!rel || rel.status !== 'peace') return false; // союз можно заключить только из мира, не из войны

        rel.status = 'alliance';
        rel.turnsInStatus = 0;
        if (this.callbacks.onAllianceFormed) this.callbacks.onAllianceFormed(a, b);
        return true;
    }

    breakAlliance(a, b) {
        const key = this._key(a, b);
        const rel = this.relations.get(key);
        if (!rel || rel.status !== 'alliance') return false;

        rel.status = 'peace';
        rel.turnsInStatus = 0;
        return true;
    }

    // Вызывается из Turn на каждый ход — держит счётчик "сколько ходов в текущем статусе"
    tick() {
        this.relations.forEach(rel => { rel.turnsInStatus++; });
    }

    // Все отношения конкретной фракции — удобно для AI/UI
    getRelationsOf(factionId) {
        const result = {};
        this.relations.forEach((rel, key) => {
            const [x, y] = key.split('-').map(Number);
            const otherId = x === factionId ? y : (y === factionId ? x : null);
            if (otherId !== null) result[otherId] = rel.status;
        });
        return result;
    }

    getFactionsAtWarWith(factionId) {
        const rel = this.getRelationsOf(factionId);
        return Object.keys(rel).map(Number).filter(id => rel[id] === 'war');
    }
}