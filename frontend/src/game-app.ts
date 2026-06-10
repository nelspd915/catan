import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";

type ResourceName = "Brick" | "Lumber" | "Wool" | "Grain" | "Ore";
type BuildingName = "Road" | "Settlement" | "City";
type PhaseKey = "Lobby" | "Setup" | "TurnStart" | "MainTurn" | "GameOver" | "Unknown";

const RESOURCE_NAMES: ResourceName[] = ["Brick", "Lumber", "Wool", "Grain", "Ore"];
const BUILDING_NAMES: BuildingName[] = ["Road", "Settlement", "City"];

const DEFAULT_ROOM_CONFIG = {
  min_players: 2,
  max_players: 4,
  target_victory_points: 10,
};

type HealthResponse = {
  status: string;
};

type GameConfig = {
  min_players: number;
  max_players: number;
  target_victory_points: number;
};

type ResourceBank = {
  resources?: Partial<Record<ResourceName, number>>;
};

type PlayerState = {
  id: number;
  name: string;
  resources: ResourceBank;
  victory_points: number;
  roads_left: number;
  roads_built?: number;
  settlements_left: number;
  settlements_built?: number;
  cities_left: number;
  cities_built?: number;
};

type GameState = {
  game_id: string;
  config: GameConfig;
  phase: unknown;
  players: PlayerState[];
  turn_order: number[];
  active_index: number;
  winner: number | null;
  bank: ResourceBank;
  version: number;
};

type CreateGameResponse = {
  game_id: string;
  state: GameState;
};

type GameStateResponse = {
  state: GameState;
};

type CommandResponse = {
  events: unknown[];
  state: GameState;
};

@customElement("game-app")
export class GameApp extends LitElement {
  @state() private apiBase = "http://127.0.0.1:3000";
  @state() private roomCode = "harbor-night";
  @state() private playerName = "";
  @state() private playerId: number | null = null;

  @state() private busy = false;
  @state() private joined = false;
  @state() private status = "Join a room to start playing.";
  @state() private statusError = false;
  @state() private health = "unknown";
  @state() private state: GameState | null = null;
  @state() private purchaseBuilding: BuildingName = "Road";
  @state() private activity: string[] = [];

  private pollTimerId: number | null = null;

  disconnectedCallback(): void {
    this.stopPolling();
    super.disconnectedCallback();
  }

  render() {
    if (!this.joined) {
      return this.renderEntryScreen();
    }

    return this.renderGameScreen();
  }

  private renderEntryScreen() {
    return html`
      <main class="entry-shell">
        <section class="entry-card">
          <p class="eyebrow">CATAN ONLINE PROTOTYPE</p>
          <h1>Join A Room</h1>
          <p class="subtitle">
            Open this page in separate tabs, choose a unique player name in each,
            and join the same room code.
          </p>

          <div class="entry-grid">
            <label>
              Room Code
              <input
                .value=${this.roomCode}
                @input=${this.onRoomCodeInput}
                placeholder="harbor-night"
              />
            </label>
            <label>
              Your Name
              <input
                .value=${this.playerName}
                @input=${this.onPlayerNameInput}
                placeholder="Alice"
              />
            </label>
            <label>
              Server URL
              <input
                .value=${this.apiBase}
                @input=${this.onApiBaseInput}
                placeholder="http://127.0.0.1:3000"
              />
            </label>
          </div>

          <div class="entry-actions">
            <button ?disabled=${this.busy} @click=${this.handleJoinRoom}>Join Room</button>
            <button ?disabled=${this.busy} @click=${this.handleHealthCheck}>Check Server</button>
            <a class="admin-link" href="/admin.html" target="_blank" rel="noreferrer">
              Open Admin Page
            </a>
          </div>

          <p class="meta">Server: <strong>${this.health}</strong></p>
          <p class=${this.statusError ? "status error" : "status ok"}>${this.status}</p>
        </section>
      </main>
    `;
  }

  private renderGameScreen() {
    const game = this.state;
    const players = game?.players ?? [];
    const me = this.currentPlayer(players);
    const activePlayerId = this.activePlayerId();
    const activeName = this.playerNameFor(activePlayerId) ?? "-";
    const phase = this.phaseKey(game?.phase);
    const winnerName = this.playerNameFor(game?.winner ?? null);
    const isMyTurn = me !== null && me.id === activePlayerId;
    const canStart =
      phase === "Lobby" &&
      game !== null &&
      game.players.length >= game.config.min_players;

    return html`
      <main class="game-shell">
        <header class="topbar card">
          <div>
            <p class="eyebrow">ROOM ${this.roomCode.toUpperCase()}</p>
            <h1>Catan Match</h1>
          </div>
          <div class="top-meta">
            <p><strong>You:</strong> ${me?.name ?? "Observer"}</p>
            <p><strong>Phase:</strong> ${this.formatPhase(game?.phase)}</p>
            <p><strong>Active:</strong> ${activeName}</p>
            <p><strong>Version:</strong> ${game?.version ?? 0}</p>
            ${winnerName === null
              ? html``
              : html`<p class="winner"><strong>Winner:</strong> ${winnerName}</p>`}
          </div>
        </header>

        <section class="main-layout">
          <article class="card your-panel">
            <h2>Your Hand</h2>
            ${me === null
              ? html`<p class="empty">You are not seated in this room.</p>`
              : html`
                  <div class="resource-row">
                    ${RESOURCE_NAMES.map(
                      (resource) => html`
                        <span>${resource}: ${this.resourceAmount(me.resources, resource)}</span>
                      `,
                    )}
                  </div>
                  <p class="vp">${me.victory_points} VP</p>
                  <p class="pieces">
                    Built: Roads ${this.builtCount(me, "Road")} · Settlements ${this.builtCount(me, "Settlement")} · Cities ${this.builtCount(me, "City")}
                  </p>
                  <p class="pieces">
                    In Stock: Roads ${me.roads_left} · Settlements ${me.settlements_left} · Cities ${me.cities_left}
                  </p>
                `}

            <h3>Actions</h3>
            ${phase === "Lobby"
              ? html`
                  <p class="empty">Waiting in lobby. Add players and start when ready.</p>
                  <button ?disabled=${this.busy || !canStart} @click=${this.handleStartGame}>
                    Start Match
                  </button>
                `
              : phase === "Setup"
                ? html`
                    <p class="empty">Setup stage in progress.</p>
                    <button ?disabled=${this.busy} @click=${this.handleAdvancePhase}>
                      Continue Setup
                    </button>
                  `
                : phase === "TurnStart"
                  ? html`
                      <p class="empty">
                        ${isMyTurn
                          ? "Begin your turn to trigger income distribution."
                          : `Waiting for ${activeName} to begin turn.`}
                      </p>
                      <button ?disabled=${this.busy || !isMyTurn} @click=${this.handleAdvancePhase}>
                        Begin Turn (Income)
                      </button>
                    `
                  : phase === "MainTurn"
                    ? html`
                        <label>
                          Building
                          <select
                            .value=${this.purchaseBuilding}
                            @change=${this.onPurchaseBuildingChange}
                          >
                            ${BUILDING_NAMES.map(
                              (building) => html`<option value=${building}>${building}</option>`,
                            )}
                          </select>
                        </label>
                        <button ?disabled=${this.busy || !isMyTurn || me === null} @click=${this.handleBuyBuilding}>
                          Buy Building
                        </button>
                        <button ?disabled=${this.busy || !isMyTurn} @click=${this.handleEndTurn}>
                          End Turn
                        </button>
                        <p class="cost-note">
                          Road: Brick + Lumber. Settlement: Brick + Lumber + Wool + Grain. City: 2 Grain + 3 Ore.
                        </p>
                      `
                    : phase === "GameOver"
                      ? html`
                          <p class="winner-banner">Game over. ${winnerName ?? "A player"} won.</p>
                        `
                      : html`<p class="empty">Unknown phase state.</p>`}
          </article>

          <article class="card table-panel">
            <h2>Table</h2>
            <div class="player-grid">
              ${players.length === 0
                ? html`<p class="empty">No players in room yet.</p>`
                : players.map((player) => {
                    const isActive = player.id === activePlayerId;
                    const isYou = me?.id === player.id;
                    return html`
                      <article class=${isActive ? "player-card active" : "player-card"}>
                        <header>
                          <h3>${player.name}${isYou ? " (You)" : ""}</h3>
                          <p>P${player.id}</p>
                        </header>
                        <p class="vp">${player.victory_points} VP</p>
                        <p class="pieces">
                          Built: R ${this.builtCount(player, "Road")} · S ${this.builtCount(player, "Settlement")} · C ${this.builtCount(player, "City")}
                        </p>
                        ${isYou
                          ? html`
                              <p class="pieces">
                                Cards: ${RESOURCE_NAMES.map(
                                  (resource) => `${resource.slice(0, 2)} ${this.resourceAmount(player.resources, resource)}`,
                                ).join(" · ")}
                              </p>
                            `
                          : html`<p class="hidden-hand">Opponent hand hidden.</p>`}
                      </article>
                    `;
                  })}
            </div>
          </article>
        </section>

        <section class="foot-grid">
          <article class="card activity-panel">
            <h2>Activity</h2>
            ${this.activity.length === 0
              ? html`<p class="empty">No activity yet.</p>`
              : html`<ul>${this.activity.map((entry) => html`<li>${entry}</li>`)}</ul>`}
          </article>

          <article class="card status-panel">
            <h2>Room Controls</h2>
            <div class="button-column">
              <button ?disabled=${this.busy} @click=${this.handleRefresh}>Refresh</button>
              <button ?disabled=${this.busy} @click=${this.handleLeaveRoom}>Leave Room</button>
              <a class="admin-link" href="/admin.html" target="_blank" rel="noreferrer">
                Open Admin Page
              </a>
            </div>
            <h3>Bank</h3>
            <div class="resource-row">
              ${RESOURCE_NAMES.map(
                (resource) => html`<span>${resource}: ${this.bankAmount(resource)}</span>`,
              )}
            </div>
            <p class=${this.statusError ? "status error" : "status ok"}>${this.status}</p>
          </article>
        </section>
      </main>
    `;
  }

  private async handleJoinRoom(): Promise<void> {
    const room = this.roomCode.trim();
    const name = this.playerName.trim();

    if (room.length === 0) {
      this.status = "Room code is required.";
      this.statusError = true;
      return;
    }

    if (name.length === 0) {
      this.status = "Player name is required.";
      this.statusError = true;
      return;
    }

    await this.runAction("Join room", async () => {
      const roomState = await this.ensureRoom(room);
      let player = roomState.players.find((entry) => entry.name === name) ?? null;

      if (player === null) {
        if (this.phaseKey(roomState.phase) !== "Lobby") {
          throw new Error("Room already started. Use an existing player name to spectate as that seat.");
        }

        const nextId = this.nextPlayerId(roomState);
        const joinResponse = await this.sendCommand(room, {
          AddPlayer: { id: nextId, name },
        });
        this.updateGameState(joinResponse.state);
        this.activity = this.mergeActivity(joinResponse.events, this.activity);
        player = joinResponse.state.players.find((entry) => entry.id === nextId) ?? null;
      } else {
        this.updateGameState(roomState);
      }

      this.playerId = player?.id ?? null;
      this.playerName = name;
      this.joined = true;
      this.startPolling();
      this.status = `Joined room ${room} as ${name}.`;
      this.statusError = false;
    });
  }

  private async handleLeaveRoom(): Promise<void> {
    this.stopPolling();
    this.joined = false;
    this.playerId = null;
    this.state = null;
    this.activity = [];
    this.status = "Left room.";
    this.statusError = false;
  }

  private async handleRefresh(): Promise<void> {
    await this.runAction("Refresh", async () => {
      const state = await this.fetchState(this.requireRoomCode());
      this.updateGameState(state);
    });
  }

  private async handleHealthCheck(): Promise<void> {
    await this.runAction("Health check", async () => {
      const response = await this.requestJson<HealthResponse>("/health", "GET");
      this.health = response.status;
    });
  }

  private async handleStartGame(): Promise<void> {
    await this.runAction("Start match", async () => {
      const response = await this.sendCommand(this.requireRoomCode(), "StartGame");
      this.updateGameState(response.state);
      this.activity = this.mergeActivity(response.events, this.activity);
    });
  }

  private async handleAdvancePhase(): Promise<void> {
    await this.runAction("Advance phase", async () => {
      const response = await this.sendCommand(this.requireRoomCode(), "AdvancePhase");
      this.updateGameState(response.state);
      this.activity = this.mergeActivity(response.events, this.activity);
    });
  }

  private async handleEndTurn(): Promise<void> {
    await this.runAction("End turn", async () => {
      const response = await this.sendCommand(this.requireRoomCode(), "EndTurn");
      this.updateGameState(response.state);
      this.activity = this.mergeActivity(response.events, this.activity);
    });
  }

  private async handleBuyBuilding(): Promise<void> {
    if (this.playerId === null) {
      this.status = "You are not seated in this room.";
      this.statusError = true;
      return;
    }

    await this.runAction("Buy building", async () => {
      const response = await this.sendCommand(this.requireRoomCode(), {
        BuyBuilding: {
          player_id: this.playerId,
          building: this.purchaseBuilding,
        },
      });
      this.updateGameState(response.state);
      this.activity = this.mergeActivity(response.events, this.activity);
    });
  }

  private async ensureRoom(room: string): Promise<GameState> {
    try {
      return await this.fetchState(room);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.startsWith("404:")) {
        throw error;
      }
    }

    const createResponse = await this.requestJson<CreateGameResponse>("/games", "POST", {
      game_id: room,
      config: DEFAULT_ROOM_CONFIG,
    });
    return createResponse.state;
  }

  private async fetchState(room: string): Promise<GameState> {
    const response = await this.requestJson<GameStateResponse>(
      `/games/${encodeURIComponent(room)}`,
      "GET",
    );
    return response.state;
  }

  private async sendCommand(room: string, command: unknown): Promise<CommandResponse> {
    return await this.requestJson<CommandResponse>(
      `/games/${encodeURIComponent(room)}/commands`,
      "POST",
      command,
    );
  }

  private updateGameState(state: GameState): void {
    this.state = state;

    if (this.playerId !== null && !state.players.some((player) => player.id === this.playerId)) {
      this.playerId = null;
    }
  }

  private mergeActivity(events: unknown[], existing: string[]): string[] {
    const next = events.map((event) => this.describeEvent(event));
    return [...next, ...existing].slice(0, 28);
  }

  private describeEvent(event: unknown): string {
    if (typeof event !== "object" || event === null) {
      return this.pretty(event);
    }

    const entries = Object.entries(event as Record<string, unknown>);
    if (entries.length !== 1) {
      return this.pretty(event);
    }

    const [kind, payload] = entries[0];
    if (kind === "PlayerAdded") {
      const value = payload as { player_id?: number };
      return `Player ${value.player_id ?? "?"} joined the room.`;
    }
    if (kind === "GameStarted") {
      return "Match started.";
    }
    if (kind === "PhaseAdvanced") {
      const value = payload as { phase?: unknown };
      return `Phase advanced to ${this.formatPhase(value.phase)}.`;
    }
    if (kind === "TurnEnded") {
      const value = payload as { active_player?: number };
      return `Turn ended. Active player is now ${this.playerNameFor(value.active_player ?? null) ?? value.active_player ?? "?"}.`;
    }
    if (kind === "ResourceGranted") {
      const value = payload as { player_id?: number; resource?: string; amount?: number };
      return `${this.playerNameFor(value.player_id ?? null) ?? `P${value.player_id ?? "?"}`} gained ${value.amount ?? "?"} ${value.resource ?? "resource"}.`;
    }
    if (kind === "BuildingPurchased") {
      const value = payload as { player_id?: number; building?: string };
      return `${this.playerNameFor(value.player_id ?? null) ?? `P${value.player_id ?? "?"}`} bought ${value.building ?? "building"}.`;
    }
    if (kind === "GameWon") {
      const value = payload as { player_id?: number; victory_points?: number };
      return `${this.playerNameFor(value.player_id ?? null) ?? `P${value.player_id ?? "?"}`} won with ${value.victory_points ?? "?"} VP.`;
    }

    return this.pretty(event);
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollTimerId = window.setInterval(() => {
      void this.syncStateSilently();
    }, 1800);
  }

  private stopPolling(): void {
    if (this.pollTimerId !== null) {
      window.clearInterval(this.pollTimerId);
      this.pollTimerId = null;
    }
  }

  private async syncStateSilently(): Promise<void> {
    if (!this.joined || this.busy) {
      return;
    }

    try {
      const state = await this.fetchState(this.requireRoomCode());
      this.updateGameState(state);
    } catch {
      // Keep silent polling failures non-blocking for UX.
    }
  }

  private currentPlayer(players: PlayerState[]): PlayerState | null {
    if (this.playerId === null) {
      return null;
    }
    return players.find((player) => player.id === this.playerId) ?? null;
  }

  private activePlayerId(): number | null {
    if (this.state === null || this.state.turn_order.length === 0) {
      return null;
    }
    return this.state.turn_order[this.state.active_index] ?? null;
  }

  private playerNameFor(playerId: number | null): string | null {
    if (playerId === null || this.state === null) {
      return null;
    }

    const player = this.state.players.find((entry) => entry.id === playerId);
    return player?.name ?? null;
  }

  private phaseKey(phase: unknown): PhaseKey {
    if (phase === "Lobby") {
      return "Lobby";
    }
    if (phase === "TurnStart") {
      return "TurnStart";
    }
    if (phase === "MainTurn") {
      return "MainTurn";
    }
    if (phase === "GameOver") {
      return "GameOver";
    }

    if (typeof phase === "object" && phase !== null) {
      const entries = Object.entries(phase as Record<string, unknown>);
      if (entries.length === 1 && entries[0][0] === "Setup") {
        return "Setup";
      }
    }

    return "Unknown";
  }

  private formatPhase(phase: unknown): string {
    const key = this.phaseKey(phase);
    if (key !== "Setup") {
      return key;
    }

    if (typeof phase === "object" && phase !== null) {
      const payload = (phase as { Setup?: { round?: number; direction?: string } }).Setup;
      if (payload !== undefined) {
        return `Setup (round ${payload.round ?? "?"}, ${payload.direction ?? "?"})`;
      }
    }

    return "Setup";
  }

  private nextPlayerId(state: GameState): number {
    if (state.players.length === 0) {
      return 1;
    }

    return Math.max(...state.players.map((player) => player.id)) + 1;
  }

  private resourceAmount(bank: ResourceBank, resource: ResourceName): number {
    return bank.resources?.[resource] ?? 0;
  }

  private bankAmount(resource: ResourceName): number {
    return this.state?.bank.resources?.[resource] ?? 0;
  }

  private builtCount(player: PlayerState, building: BuildingName): number {
    if (building === "Road") {
      return player.roads_built ?? Math.max(0, 15 - player.roads_left);
    }

    if (building === "Settlement") {
      return player.settlements_built ?? Math.max(0, 5 - player.settlements_left);
    }

    return player.cities_built ?? Math.max(0, 4 - player.cities_left);
  }

  private pretty(value: unknown): string {
    return JSON.stringify(value, null, 2);
  }

  private requireRoomCode(): string {
    const code = this.roomCode.trim();
    if (code.length === 0) {
      throw new Error("Room code is required.");
    }
    return code;
  }

  private async requestJson<T>(
    path: string,
    method: "GET" | "POST",
    body?: unknown,
  ): Promise<T> {
    const init: RequestInit = {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    };

    const response = await fetch(`${this.apiBase}${path}`, init);
    const text = await response.text();
    const payload = this.parseJsonOrText(text);

    if (!response.ok) {
      throw new Error(this.extractError(response.status, payload));
    }

    return payload as T;
  }

  private parseJsonOrText(raw: string): unknown {
    if (raw.trim().length === 0) {
      return {};
    }

    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  private extractError(statusCode: number, payload: unknown): string {
    if (typeof payload === "object" && payload !== null) {
      const errorPayload = payload as { message?: unknown; error?: unknown };
      if (typeof errorPayload.message === "string") {
        return `${statusCode}: ${errorPayload.message}`;
      }
      if (typeof errorPayload.error === "string") {
        return `${statusCode}: ${errorPayload.error}`;
      }
    }

    if (typeof payload === "string") {
      return `${statusCode}: ${payload}`;
    }

    return `${statusCode}: request failed`;
  }

  private async runAction(label: string, fn: () => Promise<void>): Promise<void> {
    if (this.busy) {
      return;
    }

    this.busy = true;
    this.statusError = false;
    this.status = `${label} in progress...`;

    try {
      await fn();
      this.status = `${label} complete.`;
      this.statusError = false;
    } catch (error) {
      this.status = error instanceof Error ? error.message : String(error);
      this.statusError = true;
    } finally {
      this.busy = false;
    }
  }

  private onApiBaseInput(event: Event): void {
    this.apiBase = (event.target as HTMLInputElement).value;
  }

  private onRoomCodeInput(event: Event): void {
    this.roomCode = (event.target as HTMLInputElement).value;
  }

  private onPlayerNameInput(event: Event): void {
    this.playerName = (event.target as HTMLInputElement).value;
  }

  private onPurchaseBuildingChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (this.isBuildingName(value)) {
      this.purchaseBuilding = value;
    }
  }

  private isBuildingName(value: string): value is BuildingName {
    return BUILDING_NAMES.includes(value as BuildingName);
  }

  static styles = css`
    :host {
      display: block;
      color: #1c2332;
      font-family: "Avenir Next Condensed", "Gill Sans", "Trebuchet MS", sans-serif;
    }

    .entry-shell,
    .game-shell {
      width: min(1180px, 100% - 2rem);
      margin: 1rem auto 2rem;
      display: grid;
      gap: 0.9rem;
      animation: fade-in 220ms ease-out;
    }

    .entry-card,
    .card {
      background: linear-gradient(160deg, rgba(255, 250, 240, 0.95), rgba(241, 247, 255, 0.94));
      border: 1px solid rgba(255, 255, 255, 0.8);
      border-radius: 16px;
      box-shadow: 0 14px 30px rgba(24, 32, 62, 0.13);
      padding: 1rem;
    }

    .eyebrow {
      margin: 0;
      letter-spacing: 0.14em;
      font-size: 0.74rem;
      font-weight: 800;
      color: #8f3f0e;
    }

    h1 {
      margin: 0.15rem 0 0;
      font-size: clamp(2rem, 4vw, 3rem);
      line-height: 1.04;
      font-family: "Rockwell", "Palatino", "Bookman", serif;
      color: #252139;
    }

    h2,
    h3 {
      margin: 0;
      font-family: "Rockwell", "Palatino", "Bookman", serif;
      color: #2b2232;
    }

    .subtitle {
      margin: 0.45rem 0 0;
      color: #2d3b50;
      max-width: 62ch;
    }

    .entry-grid {
      margin-top: 0.8rem;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.6rem;
    }

    .entry-actions {
      margin-top: 0.8rem;
      display: flex;
      flex-wrap: wrap;
      gap: 0.55rem;
      align-items: center;
    }

    .topbar {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 1rem;
    }

    .top-meta {
      text-align: right;
      display: grid;
      gap: 0.25rem;
      font-size: 0.9rem;
    }

    .top-meta p {
      margin: 0;
    }

    .winner {
      color: #8e2f1d;
      font-weight: 700;
    }

    .main-layout {
      display: grid;
      gap: 0.85rem;
      grid-template-columns: minmax(280px, 1fr) minmax(0, 2fr);
      align-items: start;
    }

    .your-panel,
    .table-panel,
    .status-panel,
    .activity-panel {
      display: grid;
      gap: 0.55rem;
      align-content: start;
    }

    .player-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 0.6rem;
    }

    .player-card {
      border-radius: 12px;
      border: 1px solid rgba(108, 118, 144, 0.24);
      background: rgba(255, 255, 255, 0.78);
      padding: 0.66rem;
      display: grid;
      gap: 0.4rem;
    }

    .player-card.active {
      border-color: rgba(195, 81, 27, 0.5);
      box-shadow: 0 0 0 2px rgba(195, 81, 27, 0.14);
      background: rgba(255, 247, 234, 0.88);
    }

    .player-card header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 0.45rem;
    }

    .player-card h3 {
      margin: 0;
      font-size: 1.08rem;
    }

    .player-card header p {
      margin: 0;
      color: #50596e;
      font-weight: 700;
    }

    .vp {
      margin: 0;
      font-size: 1rem;
      font-weight: 700;
      color: #8e2f1d;
    }

    .pieces {
      margin: 0;
      font-size: 0.82rem;
      color: #495269;
    }

    .hidden-hand,
    .empty,
    .cost-note,
    .meta {
      margin: 0;
      color: #555f75;
      font-size: 0.84rem;
    }

    .winner-banner {
      margin: 0;
      border-radius: 10px;
      background: rgba(193, 70, 38, 0.14);
      color: #7d1f14;
      padding: 0.55rem 0.68rem;
      font-weight: 700;
    }

    .resource-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }

    .resource-row span {
      border-radius: 999px;
      padding: 0.16rem 0.52rem;
      background: rgba(94, 110, 139, 0.14);
      font-size: 0.8rem;
      font-weight: 700;
      color: #2d3a54;
    }

    .foot-grid {
      display: grid;
      gap: 0.85rem;
      grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
    }

    .activity-panel ul {
      margin: 0;
      padding-left: 1.2rem;
      display: grid;
      gap: 0.4rem;
      max-height: 260px;
      overflow: auto;
      font-size: 0.86rem;
      color: #2a344c;
    }

    .button-column {
      display: grid;
      gap: 0.48rem;
    }

    input,
    select,
    button,
    .admin-link {
      font: inherit;
      border-radius: 10px;
      box-sizing: border-box;
    }

    label {
      display: grid;
      gap: 0.25rem;
      font-size: 0.84rem;
      font-weight: 700;
      color: #3d465d;
    }

    input,
    select {
      border: 1px solid rgba(57, 76, 106, 0.25);
      background: rgba(255, 255, 255, 0.92);
      padding: 0.5rem 0.62rem;
    }

    input:focus,
    select:focus {
      outline: none;
      border-color: #be5c21;
      box-shadow: 0 0 0 3px rgba(190, 92, 33, 0.17);
    }

    button {
      border: none;
      color: #fff5ea;
      font-weight: 700;
      cursor: pointer;
      padding: 0.5rem 0.7rem;
      background: linear-gradient(130deg, #9a4114, #cf6d26);
      transition: 140ms ease;
    }

    button:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 10px 20px rgba(138, 59, 19, 0.32);
    }

    button:disabled {
      opacity: 0.58;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    .admin-link {
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #f4fffb;
      background: linear-gradient(140deg, #0f7d68, #0a9a7f);
      font-weight: 700;
      padding: 0.5rem 0.75rem;
      min-height: 38px;
    }

    .status {
      margin: 0;
      border-radius: 10px;
      padding: 0.55rem 0.64rem;
      font-weight: 700;
      font-size: 0.88rem;
    }

    .status.ok {
      background: rgba(64, 147, 94, 0.13);
      color: #165b33;
    }

    .status.error {
      background: rgba(191, 74, 54, 0.14);
      color: #7b1f14;
    }

    @media (max-width: 980px) {
      .entry-grid {
        grid-template-columns: 1fr;
      }

      .topbar {
        flex-direction: column;
      }

      .top-meta {
        text-align: left;
      }

      .main-layout,
      .foot-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 640px) {
      .entry-shell,
      .game-shell {
        width: min(1180px, 100% - 1rem);
      }
    }

    @keyframes fade-in {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "game-app": GameApp;
  }
}
