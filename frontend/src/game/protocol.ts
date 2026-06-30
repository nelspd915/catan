export type GameId = string;
export type PlayerId = string;
export type CommandId = string;
export type GameVersion = number;
export type TileId = string;
export type NodeId = string;
export type EdgeId = string;

export type ResourceKind = "brick" | "lumber" | "wool" | "grain" | "ore";

export type ResourceCounts = Record<ResourceKind, number>;

export type Terrain =
  | "desert"
  | "hills"
  | "forest"
  | "mountains"
  | "fields"
  | "pasture";

export type PortKind = ResourceKind | "generic";

export type BuildingKind = "settlement" | "city";

export interface BuildingView {
  kind: BuildingKind;
  ownerId: PlayerId;
}

export interface RoadView {
  ownerId: PlayerId;
}

export interface TileView {
  id: TileId;
  terrain: Terrain;
  number?: number;
  nodeIds: NodeId[];
  edgeIds: EdgeId[];
}

export interface NodeView {
  id: NodeId;
  adjacentTileIds: TileId[];
  edgeIds: EdgeId[];
  port?: PortKind;
  building?: BuildingView;
}

export interface EdgeView {
  id: EdgeId;
  nodeIds: [NodeId, NodeId];
  road?: RoadView;
}

export interface BoardView {
  tiles: TileView[];
  nodes: NodeView[];
  edges: EdgeView[];
  robberTileId: TileId;
}

export interface PlayerPublicView {
  id: PlayerId;
  name: string;
  color: string;
  resourceCardCount: number;
  developmentCardCount: number;
  roadsRemaining: number;
  settlementsRemaining: number;
  citiesRemaining: number;
  visibleVictoryPoints: number;
  longestRoadLength?: number;
  armySize: number;
}

export type DevelopmentCardKind =
  | "knight"
  | "victory-point"
  | "road-building"
  | "year-of-plenty"
  | "monopoly";

export interface DevelopmentCardView {
  id: string;
  kind: DevelopmentCardKind;
  playable: boolean;
}

export interface PlayerPrivateView {
  playerId: PlayerId;
  resources: ResourceCounts;
  developmentCards: DevelopmentCardView[];
}

export type GamePhase =
  | "setup"
  | "roll"
  | "main"
  | "discard"
  | "move-robber"
  | "trade-response"
  | "game-over";

export interface TurnView {
  activePlayerId: PlayerId;
  phase: GamePhase;
  dice?: [number, number];
}

export interface AwardView {
  holderId?: PlayerId;
  value: number;
}

export interface AwardsView {
  longestRoad?: AwardView;
  largestArmy?: AwardView;
}

export type ActionKind =
  | "roll-dice"
  | "build-road"
  | "build-settlement"
  | "build-city"
  | "buy-development-card"
  | "play-development-card"
  | "move-robber"
  | "discard-resources"
  | "offer-trade"
  | "accept-trade"
  | "reject-trade"
  | "cancel-trade"
  | "end-turn";

export interface AvailableAction {
  id: string;
  kind: ActionKind;
  label: string;
  targets?: string[];
  disabledReason?: string;
}

export interface PlayerGameView {
  gameId: GameId;
  playerId: PlayerId;
  version: GameVersion;
  board: BoardView;
  players: PlayerPublicView[];
  you: PlayerPrivateView;
  turn: TurnView;
  awards: AwardsView;
  availableActions: AvailableAction[];
  log: GameLogEntry[];
}

export type PlayerBucket = PlayerGameView;

export interface GameLogEntry {
  id: string;
  version: GameVersion;
  text: string;
}

export type CommandPayload = Record<string, unknown>;

export interface GameCommand {
  commandId: CommandId;
  gameId: GameId;
  expectedVersion: GameVersion;
  kind: ActionKind;
  payload: CommandPayload;
}

export type ClientMessage =
  | {
      type: "connect";
      gameId: GameId;
      lastSeenVersion?: GameVersion;
    }
  | {
      type: "request-snapshot";
      gameId: GameId;
      lastSeenVersion?: GameVersion;
    }
  | {
      type: "command";
      command: GameCommand;
    };

export type CommandRejectionCode =
  | "not-your-turn"
  | "wrong-phase"
  | "stale-version"
  | "invalid-target"
  | "missing-resources"
  | "piece-unavailable"
  | "trade-unavailable"
  | "required-action-pending"
  | "game-ended"
  | "unauthorized"
  | "protocol-error";

export type ServerMessage =
  | {
      type: "snapshot";
      gameId: GameId;
      version: GameVersion;
      view: PlayerGameView;
    }
  | {
      type: "command-accepted";
      gameId: GameId;
      version: GameVersion;
      commandId: CommandId;
      view: PlayerGameView;
    }
  | {
      type: "command-rejected";
      gameId: GameId;
      version: GameVersion;
      commandId?: CommandId;
      code: CommandRejectionCode;
      reason: string;
      view?: PlayerGameView;
    }
  | {
      type: "resync-required";
      gameId: GameId;
      version: GameVersion;
      reason: string;
    }
  | {
      type: "game-ended";
      gameId: GameId;
      version: GameVersion;
      winnerId: PlayerId;
      view: PlayerGameView;
    }
  | {
      type: "protocol-error";
      gameId?: GameId;
      code: CommandRejectionCode;
      reason: string;
    };
