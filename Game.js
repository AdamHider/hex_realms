class Game {
    constructor(options) {
        this.canvas = options.canvas;
        this.tooltip = options.tooltip;
        this.mapGen = null;
        this.turnManager = null;
        this.factionsManager = null;
        this.diplomacyManager = null;

        this.state = null;
        this.aiManager = null;

        this.callbacks = {
            onRegionSelected: options.onRegionSelected || null,
            onGameReady: options.onGameReady || null,
            onTurnEnd: options.onTurnEnd || null,
            onSeasonChange: options.onSeasonChange || null,
            onFactionEliminated: options.onFactionEliminated || null,
            onWarDeclared: options.onWarDeclared || null,
            onPeaceMade: options.onPeaceMade || null,
            onAIAction: options.onAIAction || null,
        };
    }

    newGame(params) {
        const width = this.canvas.clientWidth || window.innerWidth;
        const height = this.canvas.clientHeight || window.innerHeight;

        this.mapGen = new MapGenerator({
            width, height,
            canvas: this.canvas,
            tooltip: this.tooltip,
            seed: params.seed,
            regionCount: params.regionCount,
            shapeType: params.shapeType,
            landAmount: params.landAmount,
            relief: params.relief,
            chaos: params.chaos,
            factions: { count: params.factionCount, names: params.factionNames || null },
            onSelect: (region) => this._handleRegionSelected(region),
        });

        const { regions, factions: mapFactions } = this.mapGen.create(params.seed);

        this.factionsManager = new FactionsManager(this, {
            onFactionEliminated: (f) => { if (this.callbacks.onFactionEliminated) this.callbacks.onFactionEliminated(f); },
        });
        const enrichedFactions = this.factionsManager.init(mapFactions, params.playerFactionId ?? 0);
        
        this.armyManager = new ArmyManager(this, {
            onArmyMoved: (army, from, to) => { /* колбэк наружу при желании */ },
        });
        this.armyManager.initFromFactions(enrichedFactions);

        this.diplomacyManager = new DiplomacyManager(this, {
            onWarDeclared: (a, b) => { if (this.callbacks.onWarDeclared) this.callbacks.onWarDeclared(a, b); },
            onPeaceMade: (a, b) => { if (this.callbacks.onPeaceMade) this.callbacks.onPeaceMade(a, b); },
        });
        this.diplomacyManager.init(enrichedFactions);

        this.mapGen.setDiplomaticColorResolver((factionId) => {
            const player = this.factionsManager.getPlayer();
            if (!player) return this.mapGen.factions.colors.neutral;
            if (factionId === player.id) return this.mapGen.factions.diplomacyColors.player;
        
            const status = this.diplomacyManager.getStatus(player.id, factionId);
            return this.mapGen.factions.diplomacyColors[status] || this.mapGen.factions.diplomacyColors.peace;
        });

        this.state = {
            regions,
            factions: enrichedFactions,
            playerFactionId: params.playerFactionId ?? 0,
            // diplomacy больше не плоский объект в state — читается через game.diplomacyManager
        };
       
        this.turnManager = new TurnManager(this, {
            turnsPerSeason: params.turnsPerSeason ?? 4,
            onTurnEnd: (summary) => { if (this.callbacks.onTurnEnd) this.callbacks.onTurnEnd(summary); },
            onSeasonChange: (season) => { if (this.callbacks.onSeasonChange) this.callbacks.onSeasonChange(season); },
        });

        this.aiManager = new AIManager(this, {
            onAIAction: (factionId, action, details) => {
                if (this.callbacks.onAIAction) this.callbacks.onAIAction(factionId, action, details);
            },
        });
        const playerFaction = this.factionsManager.getPlayer();
        if (playerFaction) {
            this.mapGen.focusOnRegion(playerFaction.capitalRegionId);
            this.mapGen.setPlayerFaction(playerFaction.id);
        }
        const economies = this.mapGen.getAllFactionEconomies();
        this.turnManager._applyEconomies(economies);
        if (this.callbacks.onGameReady) this.callbacks.onGameReady(this.state);
        return this.state;
    }
    getRegionFullInfo(region) {
        const visible = this.mapGen.factions.computeVisibility(this.state.playerFactionId, this.mapGen.fogVisionHops ?? 2);
        if (!visible[region.id]) {
            return { region: { id: region.id, x: region.x, y: region.y }, hidden: true };
        }
        const faction = region.ownerId !== null ? this.factionsManager.get(region.ownerId) : null;
        const player = this.factionsManager.getPlayer();
    
        let diplomacy = null;
        if (faction && player && faction.id !== player.id) {
            diplomacy = this.getDiplomacyStatus(player.id, faction.id);
        }
    
        const armiesHere = faction
            ? faction.armies?.filter(a => a.regionId === region.id) ?? []
            : [];
    
        return {
            region,          // x, y, isWater, biome, climateZone, city, ownerId, population, resources
            temperature: this.mapGen.terrain.regions[region.id]?.temperature ?? null,
            elevation: this.mapGen.terrain.regions[region.id]?.t ?? null,
            faction,         // null если ничей
            diplomacy,       // null если faction === null или faction === player
            isPlayerOwned: faction?.isPlayer ?? false,
            armies: armiesHere,
        };
    }

    endTurn() {
        const summary = this.turnManager?.endTurn() ?? null;
        if (summary) {
            this.factionsManager.checkElimination(this.mapGen);
            this.diplomacyManager.tick();
            this.aiManager.runTurn(); 
        }
        return summary;
    }

    // ── Дипломатия — тонкий проброс, чтобы UI не трогал diplomacyManager напрямую ──
    declareWar(a, b) {
        const result = this.diplomacyManager?.declareWar(a, b) ?? false;
        if (result) { this.mapGen.markDirty('political'); this.mapGen.render(); }
        return result;
    }

    makePeace(a, b) {
        const result = this.diplomacyManager?.makePeace(a, b) ?? false;
        if (result) { this.mapGen.markDirty('political'); this.mapGen.render(); }
        return result;
    }
    formAlliance(a, b) { return this.diplomacyManager?.formAlliance(a, b) ?? false; }
    getDiplomacyStatus(a, b) { return this.diplomacyManager?.getStatus(a, b) ?? 'peace'; }

    _handleRegionSelected(region) {
        if (this.callbacks.onRegionSelected) this.callbacks.onRegionSelected(region, this.state);
    }

    setViewMode(mode) { this.mapGen?.setViewMode(mode); }
    setSeason(season) { this.mapGen?.setSeason(season); }
    setShowClimate(value) { this.mapGen?.setShowClimate(value); }
    zoomIn() { this.mapGen?.zoomIn(); }
    zoomOut() { this.mapGen?.zoomOut(); }
    resetView() { this.mapGen?.resetView(); }
    getSelectedRegion() { return this.mapGen?.getSelectedRegion() ?? null; }
}