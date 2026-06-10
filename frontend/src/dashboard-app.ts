import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";

type HealthResponse = {
  status: string;
};

type CreateGameResponse = {
  game_id: string;
  state: unknown;
};

type GameStateResponse = {
  state: unknown;
};

type CommandResponse = {
  events: unknown[];
  state: unknown;
};

@customElement("dashboard-app")
export class DashboardApp extends LitElement {
  @state() private apiBase = "http://127.0.0.1:3000";
  @state() private gameId = "local-ui";

  @state() private minPlayers = 2;
  @state() private maxPlayers = 4;
  @state() private targetVictoryPoints = 10;

  @state() private playerId = 1;
  @state() private playerName = "Alice";

  @state() private grantPlayerId = 1;
  @state() private grantResource = "Brick";
  @state() private grantAmount = 1;

  @state() private customCommand = '"StartGame"';

  @state() private busy = false;
  @state() private status = "Ready.";
  @state() private statusError = false;
  @state() private health = "unknown";
  @state() private latestEvents: unknown[] = [];
  @state() private latestState: unknown | null = null;

  render() {
    return html`
      <main class="shell">
        <header class="hero">
          <p class="eyebrow">CATAN ENGINE TEST LAB</p>
          <h1>Frontend Console</h1>
          <p class="subtitle">
            Create games, send commands, inspect events and state snapshots.
          </p>
          <p class="hero-link-wrap">
            <a class="hero-link" href="/">Open Game Room</a>
          </p>
        </header>

        <section class="card">
          <h2>Connection</h2>
          <div class="field-row two">
            <label>
              API Base URL
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
                placeholder="local-ui"
              />
            </label>
          </div>
          <div class="button-row">
            <button ?disabled=${this.busy} @click=${this.handleHealthCheck}>
              Check Health
            </button>
            <button ?disabled=${this.busy} @click=${this.handleCreateGame}>
              Create Game
            </button>
            <button ?disabled=${this.busy} @click=${this.handleFetchState}>
              Fetch State
            </button>
            <button ?disabled=${this.busy} @click=${this.handleQuickStart}>
              Quick Start
            </button>
          </div>
          <p class="meta">Health: <strong>${this.health}</strong></p>
          <p class=${this.statusError ? "status error" : "status ok"}>
            ${this.status}
          </p>
        </section>

        <section class="card">
          <h2>Game Config</h2>
          <div class="field-row three">
            <label>
              Min Players
              <input
                type="number"
                min="1"
                max="6"
                .value=${String(this.minPlayers)}
                @input=${this.onMinPlayersInput}
              />
            </label>
            <label>
              Max Players
              <input
                type="number"
                min="1"
                max="6"
                .value=${String(this.maxPlayers)}
                @input=${this.onMaxPlayersInput}
              />
            </label>
            <label>
              Target VP
              <input
                type="number"
                min="1"
                max="20"
                .value=${String(this.targetVictoryPoints)}
                @input=${this.onTargetVpInput}
              />
            </label>
          </div>
        </section>

        <section class="card command-grid">
          <article>
            <h3>Add Player</h3>
            <div class="field-row two">
              <label>
                Player ID
                <input
                  type="number"
                  min="1"
                  .value=${String(this.playerId)}
                  @input=${this.onPlayerIdInput}
                />
              </label>
              <label>
                Name
                <input
                  .value=${this.playerName}
                  @input=${this.onPlayerNameInput}
                />
              </label>
            </div>
            <button ?disabled=${this.busy} @click=${this.handleAddPlayer}>
              Send AddPlayer
            </button>
          </article>

          <article>
            <h3>Turn Flow</h3>
            <div class="button-row">
              <button ?disabled=${this.busy} @click=${this.handleStartGame}>
                StartGame
              </button>
              <button ?disabled=${this.busy} @click=${this.handleAdvancePhase}>
                AdvancePhase
              </button>
              <button ?disabled=${this.busy} @click=${this.handleEndTurn}>
                EndTurn
              </button>
            </div>
          </article>

          <article>
            <h3>Grant Resource</h3>
            <div class="field-row three">
              <label>
                Player
                <input
                  type="number"
                  min="1"
                  .value=${String(this.grantPlayerId)}
                  @input=${this.onGrantPlayerIdInput}
                />
              </label>
              <label>
                Resource
                <select
                  .value=${this.grantResource}
                  @change=${this.onGrantResourceChange}
                >
                  <option>Brick</option>
                  <option>Lumber</option>
                  <option>Wool</option>
                  <option>Grain</option>
                  <option>Ore</option>
                </select>
              </label>
              <label>
                Amount
                <input
                  type="number"
                  min="1"
                  max="19"
                  .value=${String(this.grantAmount)}
                  @input=${this.onGrantAmountInput}
                />
              </label>
            </div>
            <button ?disabled=${this.busy} @click=${this.handleGrantResource}>
              Send GrantResource
            </button>
          </article>

          <article>
            <h3>Custom JSON Command</h3>
            <textarea
              .value=${this.customCommand}
              @input=${this.onCustomCommandInput}
              spellcheck="false"
            ></textarea>
            <button ?disabled=${this.busy} @click=${this.handleCustomCommand}>
              Send Custom Command
            </button>
          </article>
        </section>

        <section class="panels">
          <article class="card panel">
            <h2>Latest Events</h2>
            <pre>${this.pretty(this.latestEvents)}</pre>
          </article>
          <article class="card panel">
            <h2>Latest State</h2>
            <pre>${this.pretty(this.latestState)}</pre>
          </article>
        </section>
      </main>
    `;
  }

  private async handleHealthCheck(): Promise<void> {
    await this.runAction("Health check", async () => {
      const response = await this.requestJson<HealthResponse>("/health", "GET");
      this.health = response.status;
      this.latestEvents = [response];
    });
  }

  private async handleCreateGame(): Promise<void> {
    await this.runAction("Create game", async () => {
      const response = await this.createGameInternal();
      this.latestState = response.state;
      this.latestEvents = [{ info: "Game created", game_id: response.game_id }];
    });
  }

  private async handleFetchState(): Promise<void> {
    await this.runAction("Fetch state", async () => {
      const gameId = this.requireGameId();
      const response = await this.requestJson<GameStateResponse>(
        `/games/${encodeURIComponent(gameId)}`,
        "GET",
      );
      this.latestState = response.state;
    });
  }

  private async handleAddPlayer(): Promise<void> {
    const trimmedName = this.playerName.trim();
    if (trimmedName.length === 0) {
      this.status = "Player name is required.";
      this.statusError = true;
      return;
    }

    await this.runAction("Add player", async () => {
      await this.sendCommandInternal({
        AddPlayer: {
          id: this.playerId,
          name: trimmedName,
        },
      });
    });
  }

  private async handleStartGame(): Promise<void> {
    await this.runAction("Start game", async () => {
      await this.sendCommandInternal("StartGame");
    });
  }

  private async handleAdvancePhase(): Promise<void> {
    await this.runAction("Advance phase", async () => {
      await this.sendCommandInternal("AdvancePhase");
    });
  }

  private async handleEndTurn(): Promise<void> {
    await this.runAction("End turn", async () => {
      await this.sendCommandInternal("EndTurn");
    });
  }

  private async handleGrantResource(): Promise<void> {
    await this.runAction("Grant resource", async () => {
      await this.sendCommandInternal({
        GrantResource: {
          player_id: this.grantPlayerId,
          resource: this.grantResource,
          amount: this.grantAmount,
        },
      });
    });
  }

  private async handleCustomCommand(): Promise<void> {
    await this.runAction("Custom command", async () => {
      const command = this.parseCustomCommand();
      await this.sendCommandInternal(command);
    });
  }

  private async handleQuickStart(): Promise<void> {
    await this.runAction("Quick start", async () => {
      const response = await this.createGameInternal();
      this.latestState = response.state;

      await this.sendCommandInternal({ AddPlayer: { id: 1, name: "Alice" } });
      await this.sendCommandInternal({ AddPlayer: { id: 2, name: "Bob" } });
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

    this.latestEvents = [...response.events, ...this.latestEvents].slice(0, 20);
    this.latestState = response.state;
  }

  private parseCustomCommand(): unknown {
    try {
      return JSON.parse(this.customCommand);
    } catch {
      throw new Error("Custom command must be valid JSON.");
    }
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

  private pretty(value: unknown): string {
    return JSON.stringify(value, null, 2);
  }

  private onApiBaseInput(event: Event): void {
    this.apiBase = (event.target as HTMLInputElement).value;
  }

  private onGameIdInput(event: Event): void {
    this.gameId = (event.target as HTMLInputElement).value;
  }

  private onMinPlayersInput(event: Event): void {
    this.minPlayers = this.parsePositiveInt(
      (event.target as HTMLInputElement).value,
      2,
    );
  }

  private onMaxPlayersInput(event: Event): void {
    this.maxPlayers = this.parsePositiveInt(
      (event.target as HTMLInputElement).value,
      4,
    );
  }

  private onTargetVpInput(event: Event): void {
    this.targetVictoryPoints = this.parsePositiveInt(
      (event.target as HTMLInputElement).value,
      10,
    );
  }

  private onPlayerIdInput(event: Event): void {
    this.playerId = this.parsePositiveInt(
      (event.target as HTMLInputElement).value,
      1,
    );
  }

  private onPlayerNameInput(event: Event): void {
    this.playerName = (event.target as HTMLInputElement).value;
  }

  private onGrantPlayerIdInput(event: Event): void {
    this.grantPlayerId = this.parsePositiveInt(
      (event.target as HTMLInputElement).value,
      1,
    );
  }

  private onGrantResourceChange(event: Event): void {
    this.grantResource = (event.target as HTMLSelectElement).value;
  }

  private onGrantAmountInput(event: Event): void {
    this.grantAmount = this.parsePositiveInt(
      (event.target as HTMLInputElement).value,
      1,
    );
  }

  private onCustomCommandInput(event: Event): void {
    this.customCommand = (event.target as HTMLTextAreaElement).value;
  }

  private parsePositiveInt(raw: string, fallback: number): number {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return parsed;
  }

  static styles = css`
    :host {
      display: block;
      width: min(1120px, 100% - 2rem);
      margin: 1.25rem auto 2rem;
      color: #112033;
      font-family: "Avenir Next", "Trebuchet MS", "Segoe UI", sans-serif;
    }

    .shell {
      display: grid;
      gap: 1rem;
      animation: fade-in 280ms ease-out;
    }

    .hero {
      padding: 0.25rem 0.2rem;
    }

    .eyebrow {
      margin: 0;
      letter-spacing: 0.14em;
      font-size: 0.76rem;
      font-weight: 700;
      color: #0f7d68;
    }

    h1 {
      margin: 0.15rem 0 0;
      font-size: clamp(1.8rem, 3.3vw, 2.9rem);
      line-height: 1.08;
    }

    .subtitle {
      margin: 0.4rem 0 0;
      color: #27415b;
      max-width: 54ch;
    }

    .hero-link-wrap {
      margin: 0.55rem 0 0;
    }

    .hero-link {
      text-decoration: none;
      font-weight: 700;
      color: #f4fffb;
      background: linear-gradient(140deg, #0f7d68, #0a9a7f);
      border-radius: 999px;
      padding: 0.34rem 0.8rem;
      display: inline-block;
    }

    .card {
      background: linear-gradient(
        160deg,
        rgba(255, 255, 255, 0.94),
        rgba(243, 248, 255, 0.92)
      );
      border: 1px solid rgba(255, 255, 255, 0.72);
      border-radius: 14px;
      box-shadow: 0 14px 34px rgba(20, 38, 72, 0.12);
      padding: 1rem;
      backdrop-filter: blur(2px);
    }

    h2,
    h3 {
      margin: 0 0 0.55rem;
    }

    .button-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.55rem;
    }

    .field-row {
      display: grid;
      gap: 0.7rem;
      margin-bottom: 0.65rem;
    }

    .field-row.two {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .field-row.three {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    label {
      display: grid;
      gap: 0.25rem;
      font-size: 0.86rem;
      font-weight: 600;
      color: #294560;
    }

    input,
    select,
    textarea,
    button {
      font: inherit;
      border-radius: 10px;
      border: 1px solid rgba(35, 70, 104, 0.22);
      padding: 0.55rem 0.7rem;
      transition: 160ms ease;
      box-sizing: border-box;
    }

    input,
    select,
    textarea {
      background: rgba(255, 255, 255, 0.92);
    }

    input:focus,
    select:focus,
    textarea:focus {
      outline: none;
      border-color: #0f7d68;
      box-shadow: 0 0 0 3px rgba(15, 125, 104, 0.18);
    }

    button {
      background: linear-gradient(140deg, #0f7d68, #0a9a7f);
      color: #f7fdfd;
      font-weight: 700;
      cursor: pointer;
    }

    button:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 6px 18px rgba(15, 125, 104, 0.32);
    }

    button:disabled {
      opacity: 0.58;
      cursor: not-allowed;
    }

    .meta {
      margin: 0;
      font-size: 0.93rem;
    }

    .status {
      margin: 0.35rem 0 0;
      border-radius: 8px;
      padding: 0.6rem 0.7rem;
      font-size: 0.9rem;
      font-weight: 600;
    }

    .status.ok {
      background: rgba(11, 153, 128, 0.15);
      color: #075f50;
    }

    .status.error {
      background: rgba(198, 54, 35, 0.14);
      color: #8c1f12;
    }

    .command-grid {
      display: grid;
      gap: 1rem;
      grid-template-columns: repeat(2, minmax(280px, 1fr));
    }

    textarea {
      min-height: 6.2rem;
      resize: vertical;
      font-family: "Menlo", "Consolas", monospace;
      font-size: 0.84rem;
    }

    .panels {
      display: grid;
      grid-template-columns: repeat(2, minmax(280px, 1fr));
      gap: 1rem;
    }

    .panel {
      overflow: hidden;
    }

    pre {
      margin: 0;
      max-height: 330px;
      overflow: auto;
      background: rgba(10, 24, 45, 0.95);
      color: #e6f3ff;
      border-radius: 10px;
      padding: 0.8rem;
      font-size: 0.81rem;
      line-height: 1.38;
    }

    @media (max-width: 900px) {
      .field-row.two,
      .field-row.three,
      .command-grid,
      .panels {
        grid-template-columns: 1fr;
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
    "dashboard-app": DashboardApp;
  }
}
