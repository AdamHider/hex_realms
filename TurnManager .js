class TurnManager {
    constructor(game, options = {}) {
        this.game = game; // ссылка на Game — читает mapGen, пишет в game.state
        this.turnsPerSeason = options.turnsPerSeason ?? 4;

        this.state = {
            turnNumber: 1,
            seasonIndex: 0,
        };

        this.callbacks = {
            onTurnStart: options.onTurnStart || null,
            onTurnEnd: options.onTurnEnd || null,
            onSeasonChange: options.onSeasonChange || null,
        };
    }

    // Основной шаг — вызывается по кнопке "Завершить ход" из UI
    endTurn() {
        const mapGen = this.game.mapGen;
        if (!mapGen) return null;

        if (this.callbacks.onTurnStart) this.callbacks.onTurnStart(this.state.turnNumber);

        const economies = mapGen.getAllFactionEconomies();
        this._applyEconomies(economies);
        this._advanceSeasonIfNeeded(mapGen);

        this.state.turnNumber++;

        const summary = { turnNumber: this.state.turnNumber, economies };
        if (this.callbacks.onTurnEnd) this.callbacks.onTurnEnd(summary);
        return summary;
    }

    _applyEconomies(economies) {
        this.game.state.factions.forEach(faction => {
            const eco = economies[faction.id];
            if (!eco || !faction.treasury) return;

            faction.treasury.gold += eco.gold;
            
            faction.treasury.food = eco.food + eco.upkeep; // upkeep уже отрицателен
            faction.treasury.production = eco.production;

            faction.treasury.food = Math.max(0, faction.treasury.food);
            faction.treasury.gold = Math.max(0, faction.treasury.gold);
        });
    }

    _advanceSeasonIfNeeded(mapGen) {
        if (this.state.turnNumber % this.turnsPerSeason !== 0) return;

        this.state.seasonIndex = (this.state.seasonIndex + 1) % mapGen.seasonOrder.length;
        const newSeason = mapGen.seasonOrder[this.state.seasonIndex];
        mapGen.setSeason(newSeason);

        if (this.callbacks.onSeasonChange) this.callbacks.onSeasonChange(newSeason);
    }
}