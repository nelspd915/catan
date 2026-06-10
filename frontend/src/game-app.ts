import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";

type ResourceName = "Brick" | "Lumber" | "Wool" | "Grain" | "Ore";
type BuildingName = "Road" | "Settlement" | "City";

const RESOURCE_NAMES: ResourceName[] = [
  "Brick",
  "Lumber",
  "Wool",
  "Grain",
  "Ore",
];

const BUILDING_NAMES: BuildingName[] = ["Road", "Settlement", "City"];

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
  @state() private gameId = "harbor-night";

  @state() private minPlayers = 3;
  @state() private maxPlayers = 4;
  @state() private targetVictoryPoints = 10;

  @state() private joinName = "Alice";
  @state() private perspectivePlayerId: number | null = null;
  @state() private purchaseBuilding: BuildingName = "Road";

  @state() private busy = false;
  @state() private status = "Ready to create a table.";
  @state() private statusError = false;
  @state() private health = "unknown";
  @state() private state: GameState | null = null;
  @state() private eventFeed: unknown[] = [];

  render() {
    const activePlayerId = this.getActivePlayerId();
    const players = this.state?.players ?? [];
    const perspectivePlayer = this.getPerspectivePlayer(players);
    const phaseKey = this.phaseKey(this.state?.phase);
    const isYourTurn =
      perspectivePlayer !== null && perspectivePlayer.id === activePlayerId;

    return html`
      <main class="table-shell">
        <header class="hero">
          <div>
            <p class="eyebrow">CATAN PLAYTEST TABLE</p>
            <h1>Game Room</h1>
            <p class="subtitle">
              Starter player UI for live game flow. Use the test dashboard for
              full command-level control.
            </p>
          </div>
          <a class="dashboard-link" href="/dashboard.html"
            >Open Test Dashboard</a
          >
        </header>

        <section class="control-row card">
          <label>
            API Base
            <input
              .value=${this.apiBase}
              @input=${this.onApiBaseInput}
              placeholder="http://127.0.0.1:3000"
            />
          </label>
          <label>
            Game ID
            <input
              .value=${this.gameId}
              @input=${this.onGameIdInput}
              placeholder="harbor-night"
            />
          </label>
          <div class="button-row">
            <button ?disabled=${this.busy} @click=${this.handleHealthCheck}>
              Health
            </button>
            <button ?disabled=${this.busy} @click=${this.handleCreateGame}>
              Create Table
            </button>
            <button ?disabled=${this.busy} @click=${this.handleFetchState}>
              Refresh
            </button>
            <button ?disabled=${this.busy} @click=${this.handleQuickSetup}>
              Quick Setup
            </button>
          </div>
        </section>

        <section class="meta-row">
          <article class="status-card card">
            <p class="label">Server</p>
            <p class="value">${this.health}</p>
          </article>
          <article class="status-card card">
            <p class="label">Phase</p>
            <p class="value">${this.formatPhase(this.state?.phase)}</p>
          </article>
          <article class="status-card card">
            <p class="label">Version</p>
            <p class="value">${this.state?.version ?? 0}</p>
          </article>
          <article class="status-card card">
            <p class="label">You</p>
            <p class="value">${perspectivePlayer?.name ?? "Observer"}</p>
          </article>
        </section>

        <section class="layout">
          <article class="board card">
            <h2>Board Preview</h2>
            <div class="board-scene" aria-hidden="true">
              ${this.renderHexTiles()}
            </div>
            <p class="board-note">
              Spatial board interactions are not wired yet. At each Begin Turn,
              all players receive one of every resource as a temporary dice
              simulation rule.
            </p>
          </article>

          <aside class="sidebar">
            <article class="card stack">
              <h3>Your Seat</h3>
              <label>
                Perspective
                <select
                  .value=${this.perspectivePlayerId === null
                    ? ""
                    : String(this.perspectivePlayerId)}
                  @change=${this.onPerspectivePlayerChange}
                >
                  <option value="">Observer</option>
                  ${players.map(
                    (player) =>
                      html`<option value=${String(player.id)}>
                        ${player.id} - ${player.name}
                      </option>`,
                  )}
                </select>
              </label>
              <label>
                Player Name
                <input
                  .value=${this.joinName}
                  @input=${this.onJoinNameInput}
                  placeholder="New player name"
                />
              </label>
              <button ?disabled=${this.busy} @click=${this.handleAddPlayer}>
                Add Player
              </button>
            </article>

            <article class="card stack">
              <h3>Turn Controls</h3>
              <div class="button-column">
                <button
                  ?disabled=${this.busy || phaseKey !== "Lobby"}
                  @click=${this.handleStartGame}
                >
                  Start Game
                </button>
                <button
                  ?disabled=${this.busy ||
                  (phaseKey !== "Setup" && phaseKey !== "TurnStart") ||
                  (phaseKey === "TurnStart" && !isYourTurn)}
                  @click=${this.handleBeginTurnOrSetup}
                >
                  ${phaseKey === "TurnStart"
                    ? "Begin Turn (Income)"
                    : "Advance Setup"}
                </button>
                <button
                  ?disabled=${this.busy ||
                  phaseKey !== "MainTurn" ||
                  !isYourTurn}
                  @click=${this.handleEndTurn}
                >
                  End Turn
                </button>
              </div>
              <p class="turn-note">
                Active: ${this.playerNameFor(activePlayerId) ?? "-"} ·
                ${isYourTurn ? "Your turn" : "Waiting"}
              </p>
            </article>

            <article class="card stack">
              <h3>Buy Building</h3>
              <label>
                Building
                <select
                  .value=${this.purchaseBuilding}
                  @change=${this.onPurchaseBuildingChange}
                >
                  ${BUILDING_NAMES.map(
                    (building) =>
                      html`<option value=${building}>${building}</option>`,
                  )}
                </select>
              </label>
              <button
                ?disabled=${this.busy ||
                !isYourTurn ||
                perspectivePlayer === null}
                @click=${this.handleBuyBuilding}
              >
                Buy
              </button>
              <p class="cost-note">
                Road: Brick + Lumber. Settlement: Brick + Lumber + Wool + Grain.
                City: 2 Grain + 3 Ore.
              </p>
            </article>
          </aside>
        </section>

        <section class="players card">
          <div class="players-head">
            <h2>Players</h2>
            <span>${players.length} seated</span>
          </div>
          <div class="player-grid">
            ${players.length === 0
              ? html`<p class="empty">
                  No players yet. Add players or run Quick Setup.
                </p>`
              : players.map((player) =>
                  this.renderPlayerCard(player, activePlayerId),
                )}
          </div>
        </section>

        <section class="foot-grid">
          <article class="card feed">
            <h2>Latest Events</h2>
            ${this.eventFeed.length === 0
              ? html`<p class="empty">No events yet.</p>`
              : html`<ul>
                  ${this.eventFeed.map(
                    (event) => html`<li><pre>${this.pretty(event)}</pre></li>`,
                  )}
                </ul>`}
          </article>
          <article class="card status-panel">
            <h2>Table Status</h2>
            <p class=${this.statusError ? "status error" : "status ok"}>
              ${this.status}
            </p>
            <h3>Your Hand</h3>
            <div class="bank-row">
              ${perspectivePlayer === null
                ? html`<span>Pick a perspective player.</span>`
                : RESOURCE_NAMES.map(
                    (resource) => html`
                      <span
                        >${resource}:
                        ${this.playerResourceAmount(
                          perspectivePlayer,
                          resource,
                        )}</span
                      >
                    `,
                  )}
            </div>
            <h3>Bank</h3>
            <div class="bank-row">
              ${RESOURCE_NAMES.map(
                (resource) => html`
                  <span>${resource}: ${this.bankAmount(resource)}</span>
                `,
              )}
            </div>
          </article>
        </section>
      </main>
    `;
  }

  private renderHexTiles() {
    const classes = [
      "wheat",
      "brick",
      "ore",
      "wool",
      "lumber",
      "desert",
      "brick",
    ];
    return classes.map((tile, index) => {
      const delay = `${index * 50}ms`;
      return html`<div
        class="hex ${tile}"
        style=${`animation-delay:${delay}`}
      ></div>`;
    });
  }

  private renderPlayerCard(player: PlayerState, activePlayerId: number | null) {
    const isActive = activePlayerId === player.id;
    const isPerspective = this.perspectivePlayerId === player.id;
    return html`
      <article class=${isActive ? "player-card active" : "player-card"}>
        <header>
          <h3>${player.name}</h3>
          <p>P${player.id}</p>
        </header>
        <p class="vp">${player.victory_points} VP</p>
        <p class="vp-subtle">
          Built VP: ${this.builtVictoryPoints(player)} (settlements
          ${this.builtCount(player, "Settlement")}, cities
          ${this.builtCount(player, "City")})
        </p>
        ${isPerspective
          ? html`
              <div class="resource-row">
                ${RESOURCE_NAMES.map(
                  (resource) =>
                    html`<span
                      >${resource.slice(0, 2).toUpperCase()}:
                      ${this.playerResourceAmount(player, resource)}</span
                    >`,
                )}
              </div>
            `
          : html`<p class="hidden-hand">Hand hidden in this viewpoint.</p>`}
        <p class="pieces">
          Built: Roads ${this.builtCount(player, "Road")} · Settlements
          ${this.builtCount(player, "Settlement")} · Cities
          ${this.builtCount(player, "City")}
        </p>
        <p class="pieces">
          In Stock: Roads ${player.roads_left} · Settlements
          ${player.settlements_left} · Cities ${player.cities_left}
        </p>
      </article>
    `;
  }

  private async handleHealthCheck(): Promise<void> {
    await this.runAction("Health check", async () => {
      const response = await this.requestJson<HealthResponse>("/health", "GET");
      this.health = response.status;
    });
  }

  private async handleCreateGame(): Promise<void> {
    await this.runAction("Create table", async () => {
      const response = await this.createGameInternal();
      this.updateFromState(response.state);
      this.eventFeed = [{ info: "game_created", game_id: response.game_id }];
    });
  }

  private async handleFetchState(): Promise<void> {
    await this.runAction("Refresh state", async () => {
      const gameId = this.requireGameId();
      const response = await this.requestJson<GameStateResponse>(
        `/games/${encodeURIComponent(gameId)}`,
        "GET",
      );
      this.updateFromState(response.state);
    });
  }

  private async handleAddPlayer(): Promise<void> {
    const name = this.joinName.trim();
    if (name.length === 0) {
      this.status = "Player name is required.";
      this.statusError = true;
      return;
    }

    await this.runAction("Add player", async () => {
      const id = this.nextPlayerId();
      await this.sendCommandInternal({ AddPlayer: { id, name } });
      if (this.perspectivePlayerId === null) {
        this.perspectivePlayerId = id;
      }
      this.joinName = "";
    });
  }

  private async handleStartGame(): Promise<void> {
    await this.runAction("Start game", async () => {
      await this.sendCommandInternal("StartGame");
    });
  }

  private async handleBeginTurnOrSetup(): Promise<void> {
    const label =
      this.phaseKey(this.state?.phase) === "TurnStart"
        ? "Begin turn"
        : "Advance setup";

    await this.runAction(label, async () => {
      await this.sendCommandInternal("AdvancePhase");
    });
  }

  private async handleEndTurn(): Promise<void> {
    await this.runAction("End turn", async () => {
      await this.sendCommandInternal("EndTurn");
    });
  }

  private async handleBuyBuilding(): Promise<void> {
    if (this.perspectivePlayerId === null) {
      this.status = "Select a perspective player before buying buildings.";
      this.statusError = true;
      return;
    }

    await this.runAction("Buy building", async () => {
      await this.sendCommandInternal({
        BuyBuilding: {
          player_id: this.perspectivePlayerId,
          building: this.purchaseBuilding,
        },
      });
    });
  }

  private async handleQuickSetup(): Promise<void> {
    await this.runAction("Quick setup", async () => {
      const response = await this.createGameInternal();
      this.updateFromState(response.state);

      await this.sendCommandInternal({ AddPlayer: { id: 1, name: "Alice" } });
      await this.sendCommandInternal({ AddPlayer: { id: 2, name: "Bob" } });
      await this.sendCommandInternal({ AddPlayer: { id: 3, name: "Chloe" } });
      await this.sendCommandInternal("StartGame");
      await this.sendCommandInternal("AdvancePhase");
      await this.sendCommandInternal("AdvancePhase");
    });
  }

  private async createGameInternal(): Promise<CreateGameResponse> {
    const gameId = this.requireGameId();
    const response = await this.requestJson<CreateGameResponse>(
      "/games",
      "POST",
      {
        game_id: gameId,
        config: {
          min_players: this.minPlayers,
          max_players: this.maxPlayers,
          target_victory_points: this.targetVictoryPoints,
        },
      },
    );

    this.gameId = response.game_id;
    return response;
  }

  private async sendCommandInternal(command: unknown): Promise<void> {
    const gameId = this.requireGameId();
    const response = await this.requestJson<CommandResponse>(
      `/games/${encodeURIComponent(gameId)}/commands`,
      "POST",
      command,
    );

    this.updateFromState(response.state);
    this.eventFeed = [...response.events, ...this.eventFeed].slice(0, 16);
  }

  private updateFromState(state: GameState): void {
    this.state = state;
    if (state.players.length === 0) {
      this.perspectivePlayerId = null;
      return;
    }

    if (
      this.perspectivePlayerId === null ||
      !state.players.some((player) => player.id === this.perspectivePlayerId)
    ) {
      this.perspectivePlayerId = state.players[0].id;
    }
  }

  private getActivePlayerId(): number | null {
    const state = this.state;
    if (state === null || state.turn_order.length === 0) {
      return null;
    }
    return state.turn_order[state.active_index] ?? null;
  }

  private playerNameFor(playerId: number | null): string | null {
    if (playerId === null || this.state === null) {
      return null;
    }

    const player = this.state.players.find((entry) => entry.id === playerId);
    return player?.name ?? null;
  }

  private getPerspectivePlayer(players: PlayerState[]): PlayerState | null {
    if (this.perspectivePlayerId === null) {
      return null;
    }

    return (
      players.find((player) => player.id === this.perspectivePlayerId) ?? null
    );
  }

  private nextPlayerId(): number {
    if (this.state === null || this.state.players.length === 0) {
      return 1;
    }

    return Math.max(...this.state.players.map((player) => player.id)) + 1;
  }

  private playerResourceAmount(
    player: PlayerState,
    resource: ResourceName,
  ): number {
    return player.resources.resources?.[resource] ?? 0;
  }

  private bankAmount(resource: ResourceName): number {
    return this.state?.bank.resources?.[resource] ?? 0;
  }

  private builtCount(player: PlayerState, building: BuildingName): number {
    if (building === "Road") {
      return player.roads_built ?? Math.max(0, 15 - player.roads_left);
    }

    if (building === "Settlement") {
      return (
        player.settlements_built ?? Math.max(0, 5 - player.settlements_left)
      );
    }

    return player.cities_built ?? Math.max(0, 4 - player.cities_left);
  }

  private builtVictoryPoints(player: PlayerState): number {
    return (
      this.builtCount(player, "Settlement") +
      this.builtCount(player, "City") * 2
    );
  }

  private formatPhase(phase: unknown): string {
    if (typeof phase === "string") {
      return phase;
    }

    if (typeof phase === "object" && phase !== null) {
      const entries = Object.entries(phase as Record<string, unknown>);
      if (entries.length === 1) {
        const [name, payload] = entries[0];
        if (
          name === "Setup" &&
          typeof payload === "object" &&
          payload !== null
        ) {
          const setup = payload as { round?: number; direction?: string };
          const round = setup.round ?? "?";
          const direction = setup.direction ?? "?";
          return `${name} (round ${round}, ${direction})`;
        }
        return name;
      }
    }

    return "Unknown";
  }

  private phaseKey(
    phase: unknown,
  ): "Lobby" | "Setup" | "TurnStart" | "MainTurn" | "GameOver" | "Unknown" {
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

  private pretty(value: unknown): string {
    return JSON.stringify(value, null, 2);
  }

  private requireGameId(): string {
    const id = this.gameId.trim();
    if (id.length === 0) {
      throw new Error("Game ID is required.");
    }
    return id;
  }

  private async requestJson<T>(
    path: string,
    method: "GET" | "POST",
    body?: unknown,
  ): Promise<T> {
    const init: RequestInit = {
      method,
      headers:
        body === undefined ? undefined : { "content-type": "application/json" },
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

  private async runAction(
    label: string,
    fn: () => Promise<void>,
  ): Promise<void> {
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

  private onGameIdInput(event: Event): void {
    this.gameId = (event.target as HTMLInputElement).value;
  }

  private onJoinNameInput(event: Event): void {
    this.joinName = (event.target as HTMLInputElement).value;
  }

  private onPerspectivePlayerChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === "") {
      this.perspectivePlayerId = null;
      return;
    }

    this.perspectivePlayerId = this.parsePositiveInt(
      (event.target as HTMLSelectElement).value,
      1,
    );
  }

  private onPurchaseBuildingChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (this.isBuildingName(value)) {
      this.purchaseBuilding = value;
    }
  }

  private parsePositiveInt(raw: string, fallback: number): number {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return parsed;
  }

  private isBuildingName(value: string): value is BuildingName {
    return BUILDING_NAMES.includes(value as BuildingName);
  }

  static styles = css`
    :host {
      display: block;
      width: min(1180px, 100% - 2rem);
      margin: 1rem auto 2.2rem;
      color: #1b2330;
      font-family:
        "Avenir Next Condensed", "Gill Sans", "Trebuchet MS", sans-serif;
    }

    .table-shell {
      display: grid;
      gap: 1rem;
      animation: intro 360ms ease-out;
    }

    .hero {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.2rem;
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
      font-size: clamp(2.05rem, 4.4vw, 3.25rem);
      line-height: 1.04;
      font-family: "Rockwell", "Palatino", "Bookman", serif;
      color: #232137;
    }

    h2,
    h3 {
      margin: 0;
      font-family: "Rockwell", "Palatino", "Bookman", serif;
      color: #2b2232;
    }

    .subtitle {
      margin: 0.48rem 0 0;
      color: #2b394d;
      max-width: 62ch;
    }

    .dashboard-link {
      align-self: center;
      text-decoration: none;
      font-weight: 700;
      color: #fff4df;
      background: linear-gradient(120deg, #a14a1d, #e37d2f);
      border-radius: 999px;
      padding: 0.55rem 1rem;
      box-shadow: 0 10px 22px rgba(131, 54, 13, 0.3);
      transition: transform 150ms ease;
      white-space: nowrap;
    }

    .dashboard-link:hover {
      transform: translateY(-1px);
    }

    .card {
      background: linear-gradient(
        160deg,
        rgba(255, 250, 240, 0.95),
        rgba(241, 247, 255, 0.94)
      );
      border: 1px solid rgba(255, 255, 255, 0.82);
      border-radius: 16px;
      box-shadow: 0 16px 34px rgba(25, 30, 64, 0.14);
      padding: 0.95rem;
      backdrop-filter: blur(2px);
    }

    .control-row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr)) auto;
      align-items: end;
      gap: 0.75rem;
    }

    .button-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
      justify-content: end;
    }

    .meta-row {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.75rem;
    }

    .status-card {
      padding: 0.75rem 0.85rem;
    }

    .label {
      margin: 0;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #5a5f72;
    }

    .value {
      margin: 0.24rem 0 0;
      font-size: 1.18rem;
      font-weight: 700;
      color: #1f2434;
    }

    .layout {
      display: grid;
      gap: 0.8rem;
      grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
      align-items: start;
    }

    .board {
      display: grid;
      gap: 0.72rem;
      min-height: 300px;
    }

    .board-scene {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.55rem;
      padding: 0.6rem;
      background:
        radial-gradient(
          circle at 10% 10%,
          rgba(253, 231, 197, 0.88),
          transparent 45%
        ),
        radial-gradient(
          circle at 92% 90%,
          rgba(186, 220, 252, 0.74),
          transparent 42%
        ),
        #f2e9d8;
      border-radius: 14px;
      border: 1px solid rgba(129, 95, 67, 0.22);
      overflow: hidden;
    }

    .hex {
      height: 82px;
      clip-path: polygon(24% 6%, 76% 6%, 100% 50%, 76% 94%, 24% 94%, 0% 50%);
      transform: translateY(8px);
      opacity: 0;
      animation: tile-in 320ms ease forwards;
    }

    .hex.wheat {
      background: linear-gradient(160deg, #f6c96e, #e39b33);
    }

    .hex.brick {
      background: linear-gradient(160deg, #d1734f, #b64d2a);
    }

    .hex.ore {
      background: linear-gradient(160deg, #8f95ac, #666f8a);
    }

    .hex.wool {
      background: linear-gradient(160deg, #9ecf77, #6ba44e);
    }

    .hex.lumber {
      background: linear-gradient(160deg, #7fb37b, #4f8054);
    }

    .hex.desert {
      background: linear-gradient(160deg, #f0d4a2, #d2af73);
    }

    .board-note {
      margin: 0;
      color: #4a4f63;
      font-size: 0.92rem;
    }

    .sidebar {
      display: grid;
      gap: 0.8rem;
    }

    .stack {
      display: grid;
      gap: 0.55rem;
    }

    .button-column {
      display: grid;
      gap: 0.45rem;
    }

    .turn-note {
      margin: 0;
      font-size: 0.82rem;
      color: #4f596f;
      font-weight: 600;
    }

    .players {
      display: grid;
      gap: 0.72rem;
    }

    .players-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.8rem;
    }

    .players-head span {
      color: #5c5f70;
      font-weight: 600;
      font-size: 0.9rem;
    }

    .player-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 0.65rem;
    }

    .player-card {
      background: rgba(255, 255, 255, 0.78);
      border: 1px solid rgba(126, 137, 158, 0.24);
      border-radius: 12px;
      padding: 0.68rem;
      display: grid;
      gap: 0.45rem;
    }

    .player-card.active {
      border-color: rgba(195, 81, 27, 0.5);
      box-shadow: 0 0 0 2px rgba(195, 81, 27, 0.15);
      background: rgba(255, 246, 233, 0.86);
    }

    .player-card header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 0.45rem;
    }

    .player-card h3 {
      font-size: 1.14rem;
    }

    .player-card header p {
      margin: 0;
      color: #4e5767;
      font-weight: 700;
    }

    .vp {
      margin: 0;
      font-size: 1rem;
      font-weight: 700;
      color: #902f1c;
    }

    .vp-subtle {
      margin: -0.2rem 0 0;
      color: #5c6173;
      font-size: 0.79rem;
    }

    .resource-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      font-size: 0.8rem;
      color: #2f3442;
    }

    .resource-row span {
      background: rgba(88, 108, 142, 0.1);
      border-radius: 999px;
      padding: 0.14rem 0.46rem;
    }

    .pieces {
      margin: 0;
      font-size: 0.84rem;
      color: #4a4f62;
    }

    .hidden-hand {
      margin: 0;
      font-size: 0.82rem;
      color: #5f6577;
      font-style: italic;
    }

    .foot-grid {
      display: grid;
      gap: 0.8rem;
      grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
    }

    .feed ul {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 0.5rem;
      max-height: 240px;
      overflow: auto;
    }

    .feed pre {
      margin: 0;
      padding: 0.56rem;
      border-radius: 10px;
      background: rgba(16, 25, 46, 0.94);
      color: #dbe8ff;
      font-size: 0.78rem;
      line-height: 1.38;
      font-family: "Menlo", "Consolas", monospace;
    }

    .status-panel {
      display: grid;
      gap: 0.5rem;
      align-content: start;
    }

    .status {
      margin: 0;
      border-radius: 10px;
      padding: 0.56rem 0.64rem;
      font-weight: 700;
      font-size: 0.89rem;
    }

    .status.ok {
      background: rgba(64, 147, 94, 0.13);
      color: #165b33;
    }

    .status.error {
      background: rgba(191, 74, 54, 0.14);
      color: #7b1f14;
    }

    .bank-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
    }

    .bank-row span {
      border-radius: 999px;
      padding: 0.2rem 0.52rem;
      background: rgba(90, 110, 143, 0.14);
      font-size: 0.82rem;
      font-weight: 700;
      color: #29334a;
    }

    label {
      display: grid;
      gap: 0.25rem;
      font-size: 0.84rem;
      font-weight: 700;
      color: #3c4459;
    }

    input,
    select,
    button {
      font: inherit;
      border-radius: 10px;
      border: 1px solid rgba(57, 76, 106, 0.25);
      padding: 0.5rem 0.65rem;
      transition: 140ms ease;
      box-sizing: border-box;
    }

    input,
    select {
      background: rgba(255, 255, 255, 0.9);
    }

    input:focus,
    select:focus {
      outline: none;
      border-color: #bc5c22;
      box-shadow: 0 0 0 3px rgba(188, 92, 34, 0.17);
    }

    button {
      border: none;
      color: #fff5ea;
      font-weight: 700;
      cursor: pointer;
      background: linear-gradient(130deg, #9a4114, #cf6d26);
    }

    button:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 10px 20px rgba(138, 59, 19, 0.34);
    }

    button:disabled {
      opacity: 0.58;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    .empty {
      margin: 0;
      color: #4f586d;
      font-size: 0.9rem;
    }

    .cost-note {
      margin: 0;
      font-size: 0.78rem;
      color: #4b566d;
      line-height: 1.35;
    }

    @media (max-width: 1000px) {
      .control-row {
        grid-template-columns: 1fr;
      }

      .button-row {
        justify-content: start;
      }

      .meta-row {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .layout,
      .foot-grid {
        grid-template-columns: 1fr;
      }

      .hero {
        flex-direction: column;
        align-items: start;
      }
    }

    @media (max-width: 640px) {
      :host {
        width: min(1180px, 100% - 1rem);
      }

      .meta-row {
        grid-template-columns: 1fr;
      }

      .board-scene {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }

    @keyframes intro {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes tile-in {
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
