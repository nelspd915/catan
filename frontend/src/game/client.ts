import type {
  ActionKind,
  ClientMessage,
  CommandPayload,
  GameCommand,
  GameId,
  PlayerBucket,
  PlayerId,
  ServerMessage,
} from "./protocol";

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export interface GameClientState {
  status: ConnectionStatus;
  bucket: PlayerBucket | null;
  lastError: string | null;
  pendingCommandIds: string[];
}

export interface ConnectOptions {
  url: string;
  gameId: GameId;
  playerId: PlayerId;
}

export type GameClientListener = (state: GameClientState) => void;

export class GameClient {
  #socket: WebSocket | null = null;
  #listeners = new Set<GameClientListener>();
  #state: GameClientState = {
    status: "idle",
    bucket: null,
    lastError: null,
    pendingCommandIds: [],
  };

  get state(): GameClientState {
    return this.#state;
  }

  subscribe(listener: GameClientListener): () => void {
    this.#listeners.add(listener);
    listener(this.#state);

    return () => {
      this.#listeners.delete(listener);
    };
  }

  connect(options: ConnectOptions): void {
    this.disconnect();

    const url = new URL(options.url);
    url.searchParams.set("gameId", options.gameId);
    url.searchParams.set("playerId", options.playerId);

    this.#setState({
      status: "connecting",
      bucket: null,
      lastError: null,
      pendingCommandIds: [],
    });

    const socket = new WebSocket(url);
    this.#socket = socket;

    socket.addEventListener("open", () => {
      this.#setState({ status: "connected", lastError: null });
      this.#send({
        type: "connect",
        gameId: options.gameId,
        lastSeenVersion: this.#state.bucket?.version,
      });
    });

    socket.addEventListener("message", (event) => {
      this.#handleMessage(event.data);
    });

    socket.addEventListener("close", () => {
      if (this.#socket === socket) {
        this.#socket = null;
      }

      if (this.#state.status !== "error") {
        this.#setState({ status: "disconnected" });
      }
    });

    socket.addEventListener("error", () => {
      this.#setState({
        status: "error",
        lastError: "WebSocket connection failed",
      });
    });
  }

  disconnect(): void {
    if (!this.#socket) {
      return;
    }

    this.#socket.close();
    this.#socket = null;
    this.#setState({ status: "disconnected", pendingCommandIds: [] });
  }

  requestSnapshot(): void {
    const bucket = this.#state.bucket;

    if (!bucket) {
      return;
    }

    this.#send({
      type: "request-snapshot",
      gameId: bucket.gameId,
      lastSeenVersion: bucket.version,
    });
  }

  sendCommand(kind: ActionKind, payload: CommandPayload = {}): void {
    const bucket = this.#state.bucket;

    if (!bucket) {
      this.#setState({ lastError: "No game snapshot loaded" });
      return;
    }

    const command: GameCommand = {
      commandId: createCommandId(),
      gameId: bucket.gameId,
      expectedVersion: bucket.version,
      kind,
      payload,
    };

    this.#setState({
      pendingCommandIds: [...this.#state.pendingCommandIds, command.commandId],
      lastError: null,
    });

    this.#send({ type: "command", command });
  }

  #handleMessage(data: unknown): void {
    if (typeof data !== "string") {
      this.#setState({ lastError: "Received non-text WebSocket message" });
      return;
    }

    let message: ServerMessage;

    try {
      message = JSON.parse(data) as ServerMessage;
    } catch {
      this.#setState({ lastError: "Received invalid server message" });
      return;
    }

    switch (message.type) {
      case "snapshot":
      case "command-accepted":
      case "game-ended":
        this.#setState({
          bucket: message.view,
          lastError: null,
          pendingCommandIds: dropCommandId(
            this.#state.pendingCommandIds,
            "commandId" in message ? message.commandId : undefined,
          ),
        });
        break;

      case "command-rejected":
        this.#setState({
          bucket: message.view ?? this.#state.bucket,
          lastError: message.reason,
          pendingCommandIds: dropCommandId(
            this.#state.pendingCommandIds,
            message.commandId,
          ),
        });
        break;

      case "resync-required":
        this.#setState({ lastError: message.reason });
        this.#send({
          type: "request-snapshot",
          gameId: message.gameId,
          lastSeenVersion: this.#state.bucket?.version,
        });
        break;

      case "protocol-error":
        this.#setState({ lastError: message.reason });
        break;
    }
  }

  #send(message: ClientMessage): void {
    if (this.#socket?.readyState !== WebSocket.OPEN) {
      this.#setState({ lastError: "WebSocket is not connected" });
      return;
    }

    this.#socket.send(JSON.stringify(message));
  }

  #setState(update: Partial<GameClientState>): void {
    this.#state = {
      ...this.#state,
      ...update,
    };

    for (const listener of this.#listeners) {
      listener(this.#state);
    }
  }
}

function createCommandId(): string {
  return crypto.randomUUID();
}

function dropCommandId(commandIds: string[], commandId?: string): string[] {
  if (!commandId) {
    return commandIds;
  }

  return commandIds.filter((id) => id !== commandId);
}
