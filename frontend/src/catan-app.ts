import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";

const REGION_ORDER = [
  "board",
  "left-ui-region",
  "right-ui-region",
  "self",
  "toast-region",
  "cheats",
  "pending-trades",
  "turn-region",
  "players",
  "trading",
  "trade-main",
  "bank-trades",
  "right-tools",
  "log",
  "minimal-log",
  "expanded-log",
  "trade-button",
  "hand",
  "actions",
] as const;

type RegionId = (typeof REGION_ORDER)[number];
type RegionKind = "map" | "container" | "panel" | "self-item";
type LayoutMetricField = keyof LayoutMetrics;
type ResizeHandle = "n" | "e" | "s" | "w";
type ToastTone = "info" | "success" | "warning";
type LogTone = "info" | "gain" | "build" | "trade";
type ActionKind =
  | "end-turn"
  | "build-road"
  | "build-settlement"
  | "build-city"
  | "buy-dev-card";

const RESOURCE_KINDS = ["Brick", "Lumber", "Ore", "Grain", "Wool"] as const;

type ResourceKind = (typeof RESOURCE_KINDS)[number];
type ResourceCounts = Partial<Record<ResourceKind, number>>;
type TradeSide = "give" | "get";
type TradeDragSource = "hand" | "want" | TradeSide;
type TradeResponseState = "accepted" | "pending" | "declined";
type PendingTradeKind = "offer" | "counter";
type PlayerId = string;

interface LayoutFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LayoutMetrics {
  selfHeight: number;
  leftWidth: number;
  rightWidth: number;
  panelInset: number;
  panelGap: number;
  bottomInset: number;
  statusHeight: number;
  playersHeight: number;
  rightToolsHeight: number;
  logHeight: number;
  minimalLogHeight: number;
  bankTradesHeight: number;
  tradeButtonWidth: number;
  actionsWidth: number;
  toastWidth: number;
  toastHeight: number;
  pendingTradesWidth: number;
}

interface RegionMeta {
  id: RegionId;
  name: string;
  color: string;
  kind: RegionKind;
  zIndex: number;
}

interface LayoutRegion extends RegionMeta {
  frame: LayoutFrame;
}

interface StoredLayout {
  version: 6;
  metrics: LayoutMetrics;
  names: Partial<Record<RegionId, string>>;
  colors: Partial<Record<RegionId, string>>;
}

interface LayoutVisibility {
  tradeOpen: boolean;
  expandedLogOpen: boolean;
  activePlayerCount: number;
  cheatsCollapsed: boolean;
  showActions: boolean;
  showTradeShortcut: boolean;
}

interface DragState {
  regionId: RegionId;
  handle: ResizeHandle;
  startMetrics: LayoutMetrics;
  canvasRect: DOMRect;
}

interface MockPlayer {
  id: PlayerId;
  name: string;
  color: string;
  isYou: boolean;
  isActive: boolean;
  victoryPoints: number;
  resources: number;
  devCards: number;
  roads: number;
  settlements: number;
  cities: number;
  army: number;
  longestRoad: number;
}

interface MockAction {
  id: ActionKind;
  label: string;
  enabled: boolean;
  detail: string;
}

interface TradeDragPayload {
  source: TradeDragSource;
  resource: ResourceKind;
}

interface MockTradeResponse {
  playerId: PlayerId;
  state: TradeResponseState;
}

interface PendingTradeRequest {
  id: string;
  label: string;
  kind: PendingTradeKind;
  senderId: PlayerId;
  give: ResourceCounts;
  get: ResourceCounts;
  responses: MockTradeResponse[];
}

interface PendingTradeMatch {
  trade: PendingTradeRequest;
  isSender: boolean;
  response?: MockTradeResponse;
}

interface TradeControl {
  label: string;
  primary?: boolean;
  disabled?: boolean;
  run: () => void;
}

interface MockLogEntry {
  id: string;
  tone: LogTone;
  time: string;
  text: string;
}

interface MockToast {
  id: string;
  tone: ToastTone;
  title: string;
  detail: string;
}

type PlayerHands = Record<PlayerId, ResourceCounts>;
type PortKind = ResourceKind | "ThreeToOne";
type PlayerPorts = Record<PlayerId, Partial<Record<PortKind, boolean>>>;

interface BankPaymentOption {
  resource: ResourceKind;
  cost: number;
  available: boolean;
}

const STORAGE_KEY = "catan-layout-sandbox-v6";
const MIN_REGION_SIZE = 4;
const MIN_PLAYER_COUNT = 2;
const MAX_PLAYER_COUNT = 8;
const MAX_PLAYER_COLUMNS = 4;
const ACTIVE_PLAYER_ID: PlayerId = "p1";
const MAX_VISIBLE_TOASTS = 5;
const TOAST_LIFETIME_MS = 5000;
const DICE_ROLL_INTERVAL_MS = 250;
const CHEATS_COLLAPSED_HEIGHT = 5.5;

const DEFAULT_METRICS: LayoutMetrics = {
  selfHeight: 22,
  leftWidth: 31.5,
  rightWidth: 26.5,
  panelInset: 2,
  panelGap: 1,
  bottomInset: 1.5,
  statusHeight: 8,
  playersHeight: 13,
  rightToolsHeight: 5.5,
  logHeight: 67.5,
  minimalLogHeight: 17,
  bankTradesHeight: 8,
  tradeButtonWidth: 13,
  actionsWidth: 27,
  toastWidth: 16,
  toastHeight: 25,
  pendingTradesWidth: 24,
};

const DEFAULT_META: Record<RegionId, RegionMeta> = {
  board: {
    id: "board",
    name: "Map",
    color: "#234f3d",
    kind: "map",
    zIndex: 0,
  },
  "left-ui-region": {
    id: "left-ui-region",
    name: "Left UI Region",
    color: "#1d3557",
    kind: "container",
    zIndex: 20,
  },
  "right-ui-region": {
    id: "right-ui-region",
    name: "Right UI Region",
    color: "#4c2d59",
    kind: "container",
    zIndex: 20,
  },
  self: {
    id: "self",
    name: "Self Bar",
    color: "#2f2b24",
    kind: "container",
    zIndex: 30,
  },
  "toast-region": {
    id: "toast-region",
    name: "Toast Region",
    color: "#526a76",
    kind: "container",
    zIndex: 55,
  },
  cheats: {
    id: "cheats",
    name: "Cheats",
    color: "#5a5d37",
    kind: "panel",
    zIndex: 54,
  },
  "pending-trades": {
    id: "pending-trades",
    name: "Pending Trades",
    color: "#4e665c",
    kind: "container",
    zIndex: 48,
  },
  "turn-region": {
    id: "turn-region",
    name: "Turn",
    color: "#356b75",
    kind: "container",
    zIndex: 56,
  },
  players: {
    id: "players",
    name: "Players",
    color: "#526331",
    kind: "panel",
    zIndex: 45,
  },
  trading: {
    id: "trading",
    name: "Trading",
    color: "#6b4d31",
    kind: "container",
    zIndex: 35,
  },
  "trade-main": {
    id: "trade-main",
    name: "Trade Main",
    color: "#6b4d31",
    kind: "panel",
    zIndex: 45,
  },
  "bank-trades": {
    id: "bank-trades",
    name: "Bank Trades",
    color: "#735d32",
    kind: "panel",
    zIndex: 50,
  },
  "right-tools": {
    id: "right-tools",
    name: "Room Tools",
    color: "#3d5368",
    kind: "panel",
    zIndex: 50,
  },
  log: {
    id: "log",
    name: "Log Region",
    color: "#3f4463",
    kind: "container",
    zIndex: 35,
  },
  "minimal-log": {
    id: "minimal-log",
    name: "Minimal Log",
    color: "#3f4463",
    kind: "panel",
    zIndex: 50,
  },
  "expanded-log": {
    id: "expanded-log",
    name: "Expanded Log",
    color: "#46456f",
    kind: "panel",
    zIndex: 52,
  },
  "trade-button": {
    id: "trade-button",
    name: "Trade",
    color: "#7a5b2e",
    kind: "self-item",
    zIndex: 50,
  },
  hand: {
    id: "hand",
    name: "Hand Area",
    color: "#34495e",
    kind: "self-item",
    zIndex: 50,
  },
  actions: {
    id: "actions",
    name: "Actions",
    color: "#6f3d47",
    kind: "self-item",
    zIndex: 50,
  },
};

const METRIC_LABELS: Record<LayoutMetricField, string> = {
  selfHeight: "Self bar height",
  leftWidth: "Left region width",
  rightWidth: "Right region width",
  panelInset: "Panel inset",
  panelGap: "Panel gap",
  bottomInset: "Self item inset",
  statusHeight: "Turn region height",
  playersHeight: "Players height",
  rightToolsHeight: "Right tools height",
  logHeight: "Log region height",
  minimalLogHeight: "Minimal log height",
  bankTradesHeight: "Bank trades height",
  tradeButtonWidth: "Trade button width",
  actionsWidth: "Actions width",
  toastWidth: "Toast region width",
  toastHeight: "Toast region height",
  pendingTradesWidth: "Pending trades width",
};

const MOCK_PLAYER_NAME_POOL = [
  "Nick",
  "Nels",
  "Kobe",
  "Rover",
  "Jacob",
  "Tango",
  "Haley",
  "Jiao",
] as const;

const MOCK_PLAYER_NAMES = shuffledPlayerNames();

const MOCK_PLAYERS: MockPlayer[] = [
  {
    id: "p1",
    name: MOCK_PLAYER_NAMES[0] ?? "Nick",
    color: "#d85745",
    isYou: true,
    isActive: true,
    victoryPoints: 6,
    resources: 9,
    devCards: 1,
    roads: 8,
    settlements: 3,
    cities: 1,
    army: 2,
    longestRoad: 4,
  },
  {
    id: "p2",
    name: MOCK_PLAYER_NAMES[1] ?? "Nels",
    color: "#4f7fda",
    isYou: false,
    isActive: false,
    victoryPoints: 5,
    resources: 6,
    devCards: 2,
    roads: 6,
    settlements: 4,
    cities: 0,
    army: 1,
    longestRoad: 5,
  },
  {
    id: "p3",
    name: MOCK_PLAYER_NAMES[2] ?? "Kobe",
    color: "#e2b245",
    isYou: false,
    isActive: false,
    victoryPoints: 4,
    resources: 7,
    devCards: 0,
    roads: 7,
    settlements: 2,
    cities: 2,
    army: 3,
    longestRoad: 3,
  },
  {
    id: "p4",
    name: MOCK_PLAYER_NAMES[3] ?? "Rover",
    color: "#45a56f",
    isYou: false,
    isActive: false,
    victoryPoints: 3,
    resources: 4,
    devCards: 1,
    roads: 5,
    settlements: 4,
    cities: 0,
    army: 0,
    longestRoad: 2,
  },
  {
    id: "p5",
    name: MOCK_PLAYER_NAMES[4] ?? "Jacob",
    color: "#9d6bcb",
    isYou: false,
    isActive: false,
    victoryPoints: 4,
    resources: 5,
    devCards: 1,
    roads: 6,
    settlements: 3,
    cities: 1,
    army: 1,
    longestRoad: 4,
  },
  {
    id: "p6",
    name: MOCK_PLAYER_NAMES[5] ?? "Tango",
    color: "#d1843f",
    isYou: false,
    isActive: false,
    victoryPoints: 5,
    resources: 8,
    devCards: 0,
    roads: 7,
    settlements: 3,
    cities: 1,
    army: 2,
    longestRoad: 6,
  },
  {
    id: "p7",
    name: MOCK_PLAYER_NAMES[6] ?? "Haley",
    color: "#4db5b5",
    isYou: false,
    isActive: false,
    victoryPoints: 3,
    resources: 4,
    devCards: 2,
    roads: 5,
    settlements: 4,
    cities: 0,
    army: 1,
    longestRoad: 3,
  },
  {
    id: "p8",
    name: MOCK_PLAYER_NAMES[7] ?? "Jiao",
    color: "#c95f94",
    isYou: false,
    isActive: false,
    victoryPoints: 6,
    resources: 7,
    devCards: 1,
    roads: 8,
    settlements: 2,
    cities: 2,
    army: 3,
    longestRoad: 5,
  },
];

const SHOP_ACTIONS: MockAction[] = [
  {
    id: "build-road",
    label: "Road",
    enabled: true,
    detail: "B + L",
  },
  {
    id: "build-settlement",
    label: "House",
    enabled: true,
    detail: "B L W G",
  },
  {
    id: "build-city",
    label: "City",
    enabled: false,
    detail: "No target",
  },
  {
    id: "buy-dev-card",
    label: "Dev",
    enabled: true,
    detail: "O W G",
  },
];

const END_TURN_ACTION: MockAction = {
  id: "end-turn",
  label: "End Turn",
  enabled: true,
  detail: "Ben",
};

const DEFAULT_PLAYER_HANDS: PlayerHands = {
  p1: {
    Brick: 2,
    Lumber: 2,
    Ore: 1,
    Grain: 2,
    Wool: 2,
  },
  p2: {
    Brick: 1,
    Lumber: 3,
    Grain: 2,
    Wool: 1,
  },
  p3: {
    Brick: 2,
    Ore: 2,
    Grain: 1,
    Wool: 2,
  },
  p4: {
    Lumber: 2,
    Ore: 1,
    Grain: 3,
  },
  p5: {
    Brick: 1,
    Lumber: 1,
    Ore: 1,
    Grain: 1,
    Wool: 1,
  },
  p6: {
    Brick: 3,
    Lumber: 2,
    Ore: 2,
    Grain: 1,
  },
  p7: {
    Brick: 1,
    Lumber: 1,
    Grain: 2,
    Wool: 3,
  },
  p8: {
    Lumber: 2,
    Ore: 2,
    Grain: 2,
    Wool: 1,
  },
};

const DEFAULT_PLAYER_PORTS: PlayerPorts = {};

const TRADE_RESPONSE_LABELS: Record<TradeResponseState, string> = {
  accepted: "Accepted",
  pending: "Pending",
  declined: "Declined",
};

const DIE_PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

const MOCK_LOG: MockLogEntry[] = [
  {
    id: "l1",
    tone: "gain",
    time: "12:18",
    text: "Alice collected brick and lumber.",
  },
  {
    id: "l2",
    tone: "build",
    time: "12:17",
    text: "Chloe upgraded a settlement to a city.",
  },
  {
    id: "l3",
    tone: "trade",
    time: "12:16",
    text: "Ben traded 2 grain for 1 ore with Alice.",
  },
  {
    id: "l4",
    tone: "info",
    time: "12:15",
    text: "Drew rolled an 8.",
  },
  {
    id: "l5",
    tone: "build",
    time: "12:14",
    text: "Alice built a road toward the sheep hex.",
  },
  {
    id: "l6",
    tone: "gain",
    time: "12:13",
    text: "Ben collected two grain.",
  },
  {
    id: "l7",
    tone: "info",
    time: "12:12",
    text: "Robber moved to the mountain hex.",
  },
  {
    id: "l8",
    tone: "trade",
    time: "12:11",
    text: "Chloe declined Drew's trade offer.",
  },
];

const TOAST_MESSAGES: Omit<MockToast, "id">[] = [
  {
    tone: "success",
    title: "Road placed",
    detail: "Select another action or end your turn.",
  },
  {
    tone: "warning",
    title: "Longest road contested",
    detail: "Ben is one road away.",
  },
  {
    tone: "info",
    title: "Trade reply",
    detail: "Chloe sent a counter offer.",
  },
  {
    tone: "success",
    title: "Trade accepted",
    detail: "A player accepted the current offer.",
  },
  {
    tone: "warning",
    title: "Robber moved",
    detail: "A resource may need to be discarded.",
  },
  {
    tone: "info",
    title: "Turn updated",
    detail: "The next player is choosing an action.",
  },
  {
    tone: "success",
    title: "Resource gained",
    detail: "A production result added cards.",
  },
  {
    tone: "warning",
    title: "Trade declined",
    detail: "A player passed on the offer.",
  },
];

@customElement("catan-app")
export class CatanApp extends LitElement {
  @state()
  private layout = loadLayout();

  @state()
  private selectedRegionId: RegionId = "board";

  @state()
  private settingsOpen = false;

  @state()
  private cheatsCollapsed = true;

  @state()
  private ctrlPressed = false;

  @state()
  private selectedActionId: ActionKind = "build-road";

  @state()
  private selectedPlayerId = "p1";

  @state()
  private activePlayerId: PlayerId = ACTIVE_PLAYER_ID;

  @state()
  private perspectivePlayerId: PlayerId = ACTIVE_PLAYER_ID;

  @state()
  private activePlayerCount = MIN_PLAYER_COUNT;

  @state()
  private diceValues: [number, number] = randomDicePair();

  @state()
  private diceRolled = false;

  @state()
  private expandedLogOpen = false;

  @state()
  private tradeOpen = false;

  @state()
  private tradeGive: ResourceCounts = {};

  @state()
  private tradeGet: ResourceCounts = {};

  @state()
  private dragPayload: TradeDragPayload | null = null;

  @state()
  private pendingTradeRequests: PendingTradeRequest[] = [];

  @state()
  private selectedTradeRequestId: string | null = null;

  @state()
  private selectedBankTradeResource: ResourceKind | null = null;

  @state()
  private toasts: MockToast[] = [];

  @state()
  private playerHands: PlayerHands = clonePlayerHands(DEFAULT_PLAYER_HANDS);

  @state()
  private playerPorts: PlayerPorts = clonePlayerPorts(DEFAULT_PLAYER_PORTS);

  private dragState: DragState | null = null;
  private tradeDropHandled = false;
  private tradeSequence = 0;
  private toastSequence = 0;
  private toastTimers = new Map<string, number>();
  private diceTimer: number | undefined;

  static styles = css`
    :host {
      display: block;
      width: 100vw;
      height: 100svh;
      color: #f4efe6;
      background: #15171a;
    }

    * {
      box-sizing: border-box;
    }

    button,
    input {
      color: inherit;
      font: inherit;
    }

    button {
      cursor: pointer;
    }

    button:disabled {
      cursor: not-allowed;
    }

    .layout-lab {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background:
        radial-gradient(circle at 47% 42%, rgba(230, 210, 150, 0.1), transparent 26%),
        linear-gradient(135deg, #182a24, #15171a 56%, #202126);
    }

    .workspace {
      position: absolute;
      inset: 0;
      overflow: hidden;
    }

    .region {
      position: absolute;
      min-width: 2px;
      min-height: 2px;
      color: #f7f1e8;
      outline: 1px solid transparent;
      transition:
        box-shadow 160ms ease,
        outline-color 160ms ease;
    }

    .region.selected {
      outline-color: rgba(255, 255, 255, 0.75);
      box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.34);
    }

    .region-chrome {
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
    }

    .region.map {
      color: rgba(255, 255, 255, 0.58);
      background:
        radial-gradient(circle at 25% 28%, rgba(236, 178, 77, 0.2) 0 7%, transparent 7.5%),
        radial-gradient(circle at 60% 38%, rgba(69, 165, 111, 0.2) 0 8%, transparent 8.5%),
        radial-gradient(circle at 45% 68%, rgba(216, 87, 69, 0.18) 0 7%, transparent 7.5%),
        linear-gradient(135deg, #223f38, #1f2c42 48%, #32302a);
    }

    .region.container {
      background: color-mix(in srgb, var(--region-color) 18%, transparent);
      border: 1px dashed color-mix(in srgb, var(--region-color) 68%, #f4efe6);
      pointer-events: auto;
    }

    .region.panel .region-chrome,
    .region.self-item .region-chrome {
      overflow: hidden;
      border: 1px solid color-mix(in srgb, var(--region-color) 46%, #f4efe6);
      border-radius: 8px;
      background:
        linear-gradient(
          180deg,
          color-mix(in srgb, var(--region-color) 36%, #1d2025) 0%,
          color-mix(in srgb, var(--region-color) 18%, #14171c) 100%
        );
      box-shadow:
        0 16px 36px rgba(0, 0, 0, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.08);
    }

    .region-label {
      position: absolute;
      inset: 7px auto auto 9px;
      max-width: calc(100% - 18px);
      overflow: hidden;
      color: rgba(255, 255, 255, 0.5);
      font-size: 0.62rem;
      font-weight: 800;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: nowrap;
      pointer-events: none;
    }

    .region.map .region-label {
      inset: 18px auto auto 18px;
      font-size: 0.78rem;
    }

    .map-grid {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
      background-size: 64px 64px;
      mask-image: radial-gradient(circle at 50% 48%, black 0 62%, transparent 78%);
    }

    .map-center {
      position: absolute;
      left: 50%;
      top: 47%;
      width: min(42vw, 48vh);
      aspect-ratio: 1;
      transform: translate(-50%, -50%);
      border: 1px solid rgba(255, 255, 255, 0.11);
      background:
        conic-gradient(
          from 30deg,
          rgba(194, 145, 74, 0.36),
          rgba(75, 137, 83, 0.32),
          rgba(92, 126, 176, 0.3),
          rgba(200, 173, 92, 0.34),
          rgba(194, 145, 74, 0.36)
        );
      clip-path: polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%);
      opacity: 0.78;
    }

    .status-shell {
      display: grid;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 4px;
      align-items: center;
      justify-items: end;
      padding: 20px 8px 8px;
      overflow: hidden;
    }

    .turn-state-title {
      max-width: 100%;
      overflow: hidden;
      color: rgba(255, 255, 255, 0.86);
      font-size: 0.74rem;
      font-weight: 950;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .dice-roll-button {
      display: flex;
      width: 100%;
      min-width: 0;
      min-height: 0;
      height: 100%;
      align-items: center;
      justify-content: flex-end;
      gap: 7px;
      padding: 0;
      overflow: hidden;
      border: 0;
      background: transparent;
    }

    .dice-roll-button.rolling .die {
      border-color: rgba(255, 255, 255, 0.48);
      box-shadow: 0 0 14px rgba(255, 255, 255, 0.18);
    }

    .die {
      display: grid;
      width: min(40px, 42%);
      height: min(40px, 100%);
      aspect-ratio: 1;
      flex: 0 0 auto;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      grid-template-rows: repeat(3, minmax(0, 1fr));
      gap: 3px;
      padding: 7px;
      border: 1px solid rgba(255, 255, 255, 0.24);
      border-radius: 7px;
      background: #f3efe5;
      box-shadow: 0 10px 20px rgba(0, 0, 0, 0.28);
    }

    .die-pip {
      width: 100%;
      height: 100%;
      border-radius: 999px;
      background: transparent;
    }

    .die-pip.visible {
      background: #1b1d20;
    }

    .stat-cell,
    .trade-block,
    .resource-pill,
    .log-row,
    .hand-slot,
    .player-tile,
    .bank-trade-button {
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 7px;
      background: rgba(0, 0, 0, 0.16);
    }

    .stat-cell {
      display: grid;
      min-width: 0;
      min-height: 0;
      align-content: center;
      padding: 5px 6px;
    }

    .stat-label,
    .micro-label {
      display: block;
      overflow: hidden;
      color: rgba(255, 255, 255, 0.54);
      font-size: 0.56rem;
      font-weight: 800;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .stat-value {
      display: block;
      min-width: 0;
      overflow: hidden;
      margin-top: 1px;
      font-size: 0.76rem;
      font-weight: 900;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .status-prompt {
      display: grid;
      min-width: 0;
      min-height: 0;
      align-content: center;
      overflow: hidden;
      color: rgba(255, 255, 255, 0.78);
      font-size: 0.68rem;
      font-weight: 700;
      line-height: 1.2;
    }

    .players-grid {
      display: grid;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      grid-template-columns: repeat(var(--player-columns), minmax(0, 1fr));
      grid-auto-rows: minmax(0, 1fr);
      gap: 6px;
      padding: 7px;
      overflow: hidden;
    }

    .player-tile {
      display: grid;
      min-width: 0;
      min-height: 0;
      grid-template-rows: 5px auto auto auto;
      gap: 4px;
      padding: 6px;
      overflow: hidden;
      text-align: left;
    }

    .player-tile.active {
      border-color: rgba(255, 255, 255, 0.34);
      background: rgba(255, 255, 255, 0.08);
    }

    .player-tile.selected {
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.32);
    }

    .player-color-bar {
      min-width: 0;
      border-radius: 999px;
      background: var(--player-color);
      box-shadow: 0 0 12px color-mix(in srgb, var(--player-color) 64%, transparent);
    }

    .player-name-line {
      display: flex;
      min-width: 0;
      gap: 4px;
      align-items: center;
      overflow: hidden;
    }

    .player-name {
      min-width: 0;
      overflow: hidden;
      font-size: 0.72rem;
      font-weight: 900;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tag {
      flex: 0 0 auto;
      padding: 1px 4px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 999px;
      color: rgba(255, 255, 255, 0.72);
      font-size: 0.5rem;
      font-weight: 900;
      text-transform: uppercase;
    }

    .player-metrics,
    .player-pieces,
    .trade-text,
    .action-detail {
      min-width: 0;
      overflow: hidden;
      color: rgba(255, 255, 255, 0.67);
      font-size: 0.58rem;
      font-weight: 750;
      line-height: 1.25;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .trade-main-shell {
      display: grid;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      grid-template-rows:
        minmax(54px, 0.72fr)
        auto
        minmax(0, 1.8fr)
        minmax(34px, auto);
      gap: 8px;
      padding: 8px;
      overflow: hidden;
    }

    .trade-workspace.drop-ready {
      outline: 2px solid rgba(255, 255, 255, 0.34);
      outline-offset: -4px;
    }

    .trade-picker,
    .trade-tray,
    .trade-controls {
      display: grid;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.14);
    }

    .trade-picker {
      grid-template-rows: auto minmax(0, 1fr);
      gap: 5px;
      padding: 6px;
    }

    .trade-section-title {
      overflow: hidden;
      color: rgba(255, 255, 255, 0.72);
      font-size: 0.62rem;
      font-weight: 900;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .trade-resource-row {
      display: grid;
      min-width: 0;
      min-height: 0;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 4px;
      overflow: hidden;
    }

    .trade-builder-header {
      display: flex;
      min-width: 0;
      min-height: 28px;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 0 2px;
      overflow: hidden;
    }

    .trade-builder-heading {
      min-width: 0;
      overflow: hidden;
      color: rgba(255, 255, 255, 0.72);
      font-size: 0.62rem;
      font-weight: 900;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .trade-clear-button {
      flex: 0 0 auto;
      min-width: 54px;
      height: 24px;
      padding: 0 8px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.08);
      font-size: 0.58rem;
      font-weight: 900;
      text-transform: uppercase;
    }

    .trade-clear-button:disabled {
      color: rgba(255, 255, 255, 0.38);
      background: rgba(0, 0, 0, 0.16);
    }

    .trade-workspace {
      display: grid;
      min-width: 0;
      min-height: 0;
      grid-template-rows: repeat(2, minmax(0, 1fr));
      gap: 6px;
      overflow: hidden;
    }

    .trade-tray {
      grid-template-rows: auto minmax(0, 1fr);
      gap: 6px;
      padding: 6px;
      border-style: dashed;
    }

    .trade-tray.drop-ready {
      border-color: rgba(255, 255, 255, 0.42);
      background: rgba(255, 255, 255, 0.07);
    }

    .trade-tray-header {
      display: flex;
      min-width: 0;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .trade-tray-count {
      flex: 0 0 auto;
      color: rgba(255, 255, 255, 0.56);
      font-size: 0.58rem;
      font-weight: 900;
      text-transform: uppercase;
    }

    .trade-tray-content {
      display: grid;
      min-width: 0;
      min-height: 0;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      grid-auto-rows: minmax(42px, 1fr);
      gap: 5px;
      overflow: hidden;
    }

    .trade-empty {
      display: grid;
      min-width: 0;
      min-height: 0;
      grid-column: 1 / -1;
      place-items: center;
      padding: 8px;
      border: 1px dashed rgba(255, 255, 255, 0.13);
      border-radius: 7px;
      color: rgba(255, 255, 255, 0.48);
      font-size: 0.64rem;
      font-weight: 800;
      text-align: center;
    }

    .resource-card {
      display: grid;
      min-width: 0;
      min-height: 0;
      grid-template-rows: auto auto;
      align-content: center;
      gap: 2px;
      padding: 5px 6px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 7px;
      background:
        linear-gradient(
          180deg,
          color-mix(in srgb, var(--resource-color) 38%, #23262d) 0%,
          color-mix(in srgb, var(--resource-color) 20%, #15171c) 100%
        );
      text-align: left;
    }

    .resource-card[draggable="true"] {
      cursor: grab;
    }

    .resource-card[draggable="true"]:active {
      cursor: grabbing;
    }

    .resource-card.disabled,
    .resource-card:disabled {
      cursor: not-allowed;
      opacity: 0.42;
    }

    .resource-card-name,
    .resource-card-count {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .resource-card-name {
      font-size: 0.66rem;
      font-weight: 900;
    }

    .resource-card-count {
      color: rgba(255, 255, 255, 0.68);
      font-size: 0.58rem;
      font-weight: 850;
    }

    .trade-controls {
      display: grid;
      grid-template-columns: minmax(0, auto) minmax(0, 1fr);
      gap: 7px;
      align-items: center;
      padding: 7px;
    }

    .trade-control-actions {
      display: flex;
      min-width: 0;
      height: 100%;
      gap: 7px;
      overflow: hidden;
    }

    .trade-control-button {
      min-width: 0;
      height: 100%;
      min-height: 28px;
      padding: 0 8px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.08);
      font-size: 0.62rem;
      font-weight: 900;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .trade-control-button.primary {
      background: rgba(255, 255, 255, 0.15);
    }

    .trade-control-button:disabled {
      color: rgba(255, 255, 255, 0.38);
      background: rgba(0, 0, 0, 0.16);
    }

    .trade-status {
      min-width: 0;
      overflow: hidden;
      color: rgba(255, 255, 255, 0.64);
      font-size: 0.62rem;
      font-weight: 800;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .pending-trades-shell {
      display: grid;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      padding: 32px 8px 8px;
      overflow: hidden;
    }

    .pending-trade-list {
      display: grid;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      align-content: start;
      justify-items: start;
      gap: 8px;
      overflow: auto;
      scrollbar-width: thin;
    }

    .pending-trade-row {
      --pending-trade-size: 94px;
      --pending-player-gap: 6px;
      --pending-player-size: 44px;
      --pending-context-height: 22px;
      display: inline-grid;
      width: fit-content;
      max-width: none;
      grid-template-rows: max-content auto;
      gap: 8px;
      padding: 7px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.22);
      cursor: pointer;
    }

    .pending-trade-row:hover,
    .pending-trade-row.selected {
      border-color: rgba(255, 255, 255, 0.32);
      background: rgba(255, 255, 255, 0.07);
    }

    .pending-trade-body {
      display: grid;
      min-width: 0;
      grid-template-columns: var(--pending-trade-size) max-content;
      gap: 8px;
    }

    .pending-trade-row .trade-preview-block {
      width: var(--pending-trade-size);
      height: var(--pending-trade-size);
      align-self: start;
    }

    .pending-trade-players {
      display: grid;
      width: max-content;
      align-content: start;
      overflow: hidden;
    }

    .pending-trade-player-list {
      display: grid;
      width: max-content;
      grid-auto-columns: var(--pending-player-size);
      grid-auto-flow: column;
      grid-template-rows: repeat(2, var(--pending-player-size));
      gap: var(--pending-player-gap);
      overflow: hidden;
    }

    .pending-trade-context-actions {
      display: grid;
      width: max-content;
      min-width: 0;
      grid-template-columns: repeat(var(--pending-action-columns), var(--pending-player-size));
      grid-auto-rows: var(--pending-context-height);
      gap: var(--pending-player-gap);
      overflow: hidden;
    }

    .pending-trade-context-button {
      min-width: 0;
      min-height: 0;
      padding: 0 4px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.08);
      font-size: 0.48rem;
      font-weight: 900;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .pending-trade-context-button.primary {
      background: rgba(255, 255, 255, 0.15);
    }

    .pending-trade-context-button:disabled {
      color: rgba(255, 255, 255, 0.36);
      background: rgba(0, 0, 0, 0.18);
    }

    .pending-trade-kind-marker {
      display: grid;
      width: var(--pending-trade-size);
      height: var(--pending-context-height);
      place-items: center;
      padding: 0 6px;
      overflow: hidden;
      border: 1px solid rgba(117, 167, 255, 0.3);
      border-radius: 6px;
      background: rgba(117, 167, 255, 0.1);
      color: rgba(255, 255, 255, 0.78);
      font-size: 0.48rem;
      font-weight: 900;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .trade-preview-block {
      position: relative;
      display: grid;
      min-width: 0;
      min-height: 0;
      grid-template-rows: repeat(2, minmax(0, 1fr));
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 7px;
      background: rgba(0, 0, 0, 0.18);
    }

    .trade-preview-block.compact {
      border-radius: 6px;
    }

    .trade-preview-half {
      display: flex;
      min-width: 0;
      min-height: 0;
      flex-wrap: wrap;
      align-content: center;
      gap: 3px;
      padding: 4px;
      overflow: hidden;
    }

    .trade-preview-get {
      background:
        radial-gradient(circle at 50% 50%, rgba(89, 216, 137, 0.22), transparent 68%),
        rgba(50, 132, 85, 0.16);
      box-shadow: inset 0 0 14px rgba(89, 216, 137, 0.14);
    }

    .trade-preview-give {
      background:
        radial-gradient(circle at 50% 50%, rgba(232, 92, 76, 0.2), transparent 68%),
        rgba(150, 56, 49, 0.16);
      box-shadow: inset 0 0 14px rgba(232, 92, 76, 0.14);
    }

    .trade-preview-divider {
      position: absolute;
      top: 50%;
      left: 11%;
      right: 11%;
      height: 1px;
      transform: translateY(-50%);
      background: rgba(255, 255, 255, 0.34);
    }

    .trade-preview-resource {
      display: inline-grid;
      min-width: 0;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 3px;
      align-items: center;
      max-width: 100%;
      padding: 2px 4px;
      overflow: hidden;
      border: 1px solid color-mix(in srgb, var(--resource-color) 58%, transparent);
      border-radius: 999px;
      background: color-mix(in srgb, var(--resource-color) 24%, rgba(0, 0, 0, 0.34));
      font-size: 0.5rem;
      font-weight: 900;
    }

    .trade-preview-block.compact .trade-preview-resource {
      gap: 2px;
      padding: 1px 3px;
      font-size: 0.46rem;
    }

    .trade-preview-resource-name,
    .trade-preview-resource-count,
    .trade-preview-empty {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .trade-preview-resource-count {
      color: rgba(255, 255, 255, 0.66);
    }

    .trade-preview-empty {
      width: 100%;
      color: rgba(255, 255, 255, 0.38);
      font-size: 0.5rem;
      font-weight: 800;
      text-align: center;
      text-transform: uppercase;
    }

    .player-token.state-accepted {
      --response-color: #59d889;
    }

    .player-token.state-pending {
      --response-color: #d6bd67;
    }

    .player-token.state-declined {
      --response-color: #e85c4c;
    }

    .player-token {
      display: inline-grid;
      min-width: 0;
      grid-template-columns: 6px minmax(0, 1fr);
      align-items: center;
      gap: 4px;
      max-width: 100%;
      padding: 2px 5px;
      overflow: hidden;
      border: 1px solid color-mix(in srgb, var(--response-color) 52%, transparent);
      border-radius: 999px;
      background: color-mix(in srgb, var(--response-color) 14%, rgba(0, 0, 0, 0.22));
      font-size: 0.54rem;
      font-weight: 900;
      text-align: left;
    }

    .player-token.compact {
      grid-template-columns: 5px minmax(0, 1fr);
      gap: 3px;
      padding: 1px 3px;
      font-size: 0.46rem;
    }

    .pending-trade-player-list .player-token {
      display: grid;
      width: 100%;
      height: 100%;
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: 8px minmax(0, 1fr);
      gap: 4px;
      justify-items: stretch;
      align-items: center;
      padding: 5px;
      border-radius: 7px;
      font-size: 0.56rem;
      text-align: center;
    }

    .pending-trade-player-list .player-token.compact {
      grid-template-columns: minmax(0, 1fr);
    }

    .player-token-dot {
      width: 100%;
      aspect-ratio: 1;
      border-radius: 999px;
      background: var(--player-color);
      box-shadow: 0 0 8px color-mix(in srgb, var(--player-color) 68%, transparent);
    }

    .pending-trade-player-list .player-token-dot {
      height: 100%;
      aspect-ratio: auto;
    }

    .player-token-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .bank-trades-shell {
      position: relative;
      display: grid;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 7px;
      padding: 7px;
      overflow: hidden;
    }

    .bank-trade-button {
      display: grid;
      min-width: 0;
      min-height: 0;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 4px;
      padding: 6px 5px;
      overflow: hidden;
      text-align: left;
    }

    .bank-trade-button.unavailable {
      color: rgba(255, 255, 255, 0.42);
      background: rgba(0, 0, 0, 0.14);
    }

    .bank-trade-button.selected {
      border-color: rgba(255, 255, 255, 0.38);
      background: rgba(255, 255, 255, 0.13);
    }

    .bank-trade-header {
      display: grid;
      min-width: 0;
      grid-template-columns: 10px minmax(0, 1fr);
      gap: 5px;
      align-items: center;
    }

    .resource-mark {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: var(--resource-color);
    }

    .bank-resource {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.66rem;
      font-weight: 900;
    }

    .bank-cost-grid {
      display: grid;
      min-width: 0;
      min-height: 0;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 3px;
      overflow: hidden;
    }

    .bank-cost-column {
      display: grid;
      min-width: 0;
      min-height: 0;
      grid-template-rows: repeat(4, minmax(0, 1fr)) auto;
      justify-items: center;
      gap: 2px;
      overflow: hidden;
    }

    .bank-cost-column.unavailable {
      opacity: 0.38;
    }

    .bank-cost-dot {
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: transparent;
    }

    .bank-cost-dot.filled {
      background: var(--payment-color);
      box-shadow: 0 0 6px color-mix(in srgb, var(--payment-color) 58%, transparent);
    }

    .bank-cost-number {
      min-width: 0;
      overflow: hidden;
      color: rgba(255, 255, 255, 0.64);
      font-size: 0.48rem;
      font-weight: 900;
      line-height: 1;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .bank-payment-popover {
      position: absolute;
      left: 7px;
      right: 7px;
      bottom: 7px;
      z-index: 8;
      display: grid;
      min-width: 0;
      gap: 6px;
      padding: 7px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 8px;
      background: rgba(17, 19, 23, 0.96);
      box-shadow: 0 16px 34px rgba(0, 0, 0, 0.42);
    }

    .bank-payment-header {
      display: flex;
      min-width: 0;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .bank-payment-title {
      min-width: 0;
      overflow: hidden;
      font-size: 0.62rem;
      font-weight: 900;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .bank-payment-close {
      display: grid;
      width: 22px;
      height: 22px;
      place-items: center;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.08);
      font-size: 0.7rem;
      font-weight: 900;
    }

    .bank-payment-options {
      display: grid;
      min-width: 0;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 5px;
    }

    .bank-payment-option {
      display: grid;
      min-width: 0;
      min-height: 34px;
      grid-template-columns: 8px minmax(0, 1fr);
      gap: 4px;
      align-items: center;
      padding: 5px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.08);
      text-align: left;
    }

    .bank-payment-option:disabled {
      color: rgba(255, 255, 255, 0.38);
      background: rgba(0, 0, 0, 0.18);
    }

    .bank-payment-text {
      min-width: 0;
      overflow: hidden;
      font-size: 0.52rem;
      font-weight: 900;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tools-shell {
      display: grid;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 7px;
      padding: 7px;
      overflow: hidden;
    }

    .tool-button {
      display: grid;
      min-width: 0;
      min-height: 0;
      place-items: center;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.08);
      font-size: 0.7rem;
      font-weight: 900;
      text-transform: uppercase;
    }

    .tool-button:hover {
      background: rgba(255, 255, 255, 0.14);
    }

    .cheats-shell {
      display: grid;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      grid-template-rows: auto auto auto minmax(0, 1fr);
      gap: 5px;
      padding: 6px;
      overflow: hidden;
    }

    .cheats-shell.collapsed {
      height: auto;
      min-height: 0;
      grid-template-rows: auto;
      align-content: start;
    }

    .cheat-header-button {
      display: flex;
      width: 100%;
      min-width: 0;
      min-height: 28px;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 5px 7px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.1);
      font-size: 0.6rem;
      font-weight: 950;
      text-transform: uppercase;
    }

    .cheat-header-title,
    .cheat-header-state {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .cheat-header-state {
      flex: 0 0 auto;
      color: rgba(255, 255, 255, 0.62);
      font-size: 0.5rem;
    }

    .cheat-top-row {
      display: grid;
      min-width: 0;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }

    .cheat-button {
      display: grid;
      min-width: 0;
      min-height: 22px;
      place-items: center;
      padding: 4px 5px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.08);
      font-size: 0.54rem;
      font-weight: 900;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .cheat-button.active {
      border-color: rgba(255, 255, 255, 0.36);
      background: rgba(255, 255, 255, 0.17);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
    }

    .cheat-port-grid {
      display: grid;
      min-width: 0;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 5px;
      overflow: hidden;
    }

    .cheat-port-grid .cheat-button {
      min-height: 22px;
      padding: 3px 4px;
      font-size: 0.48rem;
    }

    .cheat-resource-grid {
      align-self: end;
      display: grid;
      min-width: 0;
      min-height: 0;
      gap: 5px;
      overflow: hidden;
    }

    .cheat-resource-row {
      display: grid;
      min-width: 0;
      grid-template-columns: minmax(0, 1fr) 24px 24px;
      gap: 4px;
      align-items: stretch;
    }

    .cheat-resource-label {
      display: grid;
      min-width: 0;
      grid-template-columns: 9px minmax(0, 1fr) auto;
      gap: 5px;
      align-items: center;
      padding: 4px 5px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 7px;
      background: rgba(0, 0, 0, 0.16);
      font-size: 0.52rem;
      font-weight: 900;
    }

    .cheat-resource-dot {
      width: 9px;
      height: 9px;
      border-radius: 999px;
      background: var(--resource-color);
    }

    .cheat-resource-name,
    .cheat-resource-count {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .cheat-resource-count {
      color: rgba(255, 255, 255, 0.62);
    }

    .minimal-log-shell,
    .expanded-log-shell {
      display: grid;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      grid-template-rows: auto 1fr;
      overflow: hidden;
    }

    .log-header {
      display: flex;
      min-width: 0;
      min-height: 30px;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.035);
    }

    .log-title {
      min-width: 0;
      overflow: hidden;
      font-size: 0.7rem;
      font-weight: 900;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .log-toggle {
      flex: 0 0 auto;
      min-width: 58px;
      height: 23px;
      padding: 0 7px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.82);
      font-size: 0.62rem;
      font-weight: 900;
    }

    .log-list {
      display: grid;
      min-width: 0;
      min-height: 0;
      align-content: start;
      gap: 5px;
      padding: 7px;
      overflow: hidden;
    }

    .expanded-log-list {
      overflow: auto;
      scrollbar-width: thin;
    }

    .log-row {
      display: grid;
      min-width: 0;
      min-height: 28px;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 7px;
      align-items: center;
      padding: 5px 7px;
    }

    .log-row::before {
      content: "";
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: var(--log-tone);
      box-shadow: 0 0 10px var(--log-tone);
    }

    .log-text {
      min-width: 0;
      overflow: hidden;
      font-size: 0.66rem;
      line-height: 1.25;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .log-time {
      color: rgba(255, 255, 255, 0.48);
      font-weight: 900;
    }

    .expanded-placeholder {
      display: grid;
      place-items: center;
      padding: 10px;
      color: rgba(255, 255, 255, 0.58);
      font-size: 0.68rem;
      font-weight: 800;
      text-align: center;
    }

    .toast-shell {
      display: grid;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      align-content: start;
      grid-auto-rows: calc((100% - 32px) / 5);
      gap: 8px;
      padding: 8px;
      overflow: hidden;
    }

    .toast {
      display: grid;
      min-width: 0;
      min-height: 0;
      gap: 3px;
      align-content: center;
      padding: 5px 8px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      background:
        linear-gradient(
          180deg,
          color-mix(in srgb, var(--toast-color) 34%, #1d2025) 0%,
          color-mix(in srgb, var(--toast-color) 18%, #14171c) 100%
        );
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.26);
    }

    .toast-title,
    .toast-detail {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .toast-title {
      font-size: 0.7rem;
      font-weight: 900;
    }

    .toast-detail {
      color: rgba(255, 255, 255, 0.7);
      font-size: 0.62rem;
      font-weight: 700;
    }

    .trade-shortcut {
      display: grid;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      padding: 10px;
      overflow: hidden;
    }

    .trade-shortcut-button {
      width: 100%;
      height: 100%;
      min-height: 0;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.08);
      font-size: 0.84rem;
      font-weight: 900;
      text-transform: uppercase;
    }

    .trade-shortcut-button.active {
      border-color: rgba(255, 255, 255, 0.38);
      background: rgba(255, 255, 255, 0.16);
    }

    .hand-shell {
      display: grid;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      grid-template-rows: auto 1fr;
      gap: 8px;
      padding: 10px;
      overflow: hidden;
    }

    .hand-header {
      display: flex;
      min-width: 0;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .hand-title {
      overflow: hidden;
      font-size: 0.78rem;
      font-weight: 900;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .hand-counts {
      display: flex;
      flex: 0 0 auto;
      gap: 6px;
    }

    .hand-grid {
      display: grid;
      min-width: 0;
      min-height: 0;
      grid-template-columns: repeat(5, minmax(44px, 1fr));
      gap: 8px;
      overflow: hidden;
    }

    .hand-slot {
      display: grid;
      min-width: 0;
      min-height: 0;
      place-items: center;
      color: rgba(255, 255, 255, 0.54);
      font-size: 0.68rem;
      font-weight: 900;
      text-transform: uppercase;
    }

    .actions-layout {
      display: grid;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      grid-template-columns: minmax(0, 1fr) minmax(74px, 0.36fr);
      gap: 7px;
      padding: 9px;
      overflow: hidden;
    }

    .action-section {
      display: grid;
      min-width: 0;
      min-height: 0;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 6px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 7px;
      background: rgba(0, 0, 0, 0.12);
      padding: 7px;
    }

    .shop-action-grid {
      display: grid;
      min-width: 0;
      min-height: 0;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: repeat(2, minmax(0, 1fr));
      gap: 6px;
      overflow: hidden;
    }

    .turn-action-grid {
      display: grid;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }

    .action-button {
      display: flex;
      min-width: 0;
      min-height: 0;
      flex-direction: column;
      justify-content: center;
      gap: 3px;
      padding: 7px 8px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.08);
      text-align: left;
    }

    .action-button.end-turn {
      align-items: center;
      text-align: center;
      background: rgba(255, 255, 255, 0.12);
    }

    .action-button.active {
      border-color: rgba(255, 255, 255, 0.38);
      background: rgba(255, 255, 255, 0.16);
    }

    .action-button:disabled {
      color: rgba(255, 255, 255, 0.4);
      background: rgba(0, 0, 0, 0.14);
    }

    .action-label {
      min-width: 0;
      overflow: hidden;
      font-size: 0.72rem;
      font-weight: 900;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .settings-panel {
      position: absolute;
      top: 56px;
      right: 12px;
      z-index: 1900;
      display: grid;
      grid-template-columns: minmax(160px, 0.85fr) minmax(240px, 1.15fr);
      width: min(760px, calc(100vw - 24px));
      max-height: calc(100svh - 72px);
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 8px;
      background: rgba(16, 18, 22, 0.96);
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.48);
      backdrop-filter: blur(16px);
    }

    .settings-list,
    .settings-detail {
      min-height: 0;
      overflow: auto;
      padding: 12px;
      scrollbar-width: thin;
    }

    .settings-list {
      border-right: 1px solid rgba(255, 255, 255, 0.08);
    }

    .settings-heading {
      margin: 0 0 10px;
      color: rgba(255, 255, 255, 0.68);
      font-size: 0.72rem;
      font-weight: 900;
      text-transform: uppercase;
    }

    .region-list {
      display: grid;
      gap: 5px;
      margin-bottom: 12px;
    }

    .region-list-button {
      display: grid;
      width: 100%;
      grid-template-columns: 14px minmax(0, 1fr);
      gap: 8px;
      align-items: center;
      padding: 8px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.05);
      text-align: left;
    }

    .region-list-button.active {
      border-color: rgba(255, 255, 255, 0.32);
      background: rgba(255, 255, 255, 0.12);
    }

    .region-swatch {
      width: 14px;
      height: 14px;
      border-radius: 4px;
      background: var(--region-color);
    }

    .region-list-name {
      min-width: 0;
      overflow: hidden;
      font-size: 0.75rem;
      font-weight: 800;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .settings-section {
      display: grid;
      gap: 8px;
      margin-bottom: 14px;
    }

    .field {
      display: grid;
      gap: 4px;
    }

    .field label {
      color: rgba(255, 255, 255, 0.62);
      font-size: 0.68rem;
      font-weight: 800;
      text-transform: uppercase;
    }

    .field input {
      width: 100%;
      min-width: 0;
      height: 32px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.07);
      padding: 0 8px;
    }

    .field input[type="color"] {
      padding: 2px;
    }

    .metric-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 88px;
      gap: 8px;
      align-items: center;
    }

    .frame-readout {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
    }

    .frame-chip {
      min-width: 0;
      padding: 6px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      background: rgba(0, 0, 0, 0.16);
      font-size: 0.68rem;
      font-weight: 800;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .reset-button {
      width: 100%;
      height: 34px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.08);
      font-size: 0.74rem;
      font-weight: 900;
    }

    .resize-handle {
      position: absolute;
      z-index: 5;
      background: rgba(255, 255, 255, 0.72);
      opacity: 0;
      transition: opacity 120ms ease;
    }

    .workspace.editing .region.selected .resize-handle,
    .workspace.editing .region:hover .resize-handle {
      opacity: 1;
    }

    .resize-handle.n,
    .resize-handle.s {
      left: 0;
      width: 100%;
      height: 6px;
      cursor: ns-resize;
    }

    .resize-handle.n {
      top: -3px;
    }

    .resize-handle.s {
      bottom: -3px;
    }

    .resize-handle.e,
    .resize-handle.w {
      top: 0;
      width: 6px;
      height: 100%;
      cursor: ew-resize;
    }

    .resize-handle.e {
      right: -3px;
    }

    .resize-handle.w {
      left: -3px;
    }

    @media (max-width: 900px) {
      .settings-panel {
        grid-template-columns: 1fr;
        width: min(480px, calc(100vw - 24px));
      }

      .settings-list {
        max-height: 180px;
        border-right: 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    this.startDiceTimer();
  }

  disconnectedCallback() {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    this.removeDragListeners();
    this.clearToastTimers();
    this.clearDiceTimer();
    super.disconnectedCallback();
  }

  render() {
    const showTurnControls = this.isTurnPlayerPerspective();
    const regions = deriveRegions(this.layout, {
      tradeOpen: this.tradeOpen,
      expandedLogOpen: this.expandedLogOpen,
      activePlayerCount: this.activePlayerCount,
      cheatsCollapsed: this.cheatsCollapsed,
      showActions: showTurnControls,
      showTradeShortcut: showTurnControls || this.tradeOpen,
    });
    const selectedRegion =
      regions.find((region) => region.id === this.selectedRegionId) ?? regions[0];

    return html`
      <main class="layout-lab">
        <section class=${this.ctrlPressed ? "workspace editing" : "workspace"}>
          ${regions.map((region) => this.renderRegion(region))}
        </section>
        ${this.settingsOpen && selectedRegion
          ? this.renderSettingsPanel(regions, selectedRegion)
          : html``}
      </main>
    `;
  }

  private renderRegion(region: LayoutRegion) {
    const selected = region.id === this.selectedRegionId;
    const resizeHandles = selected ? resizeHandlesFor(region.id) : [];
    const classes = ["region", region.kind, selected ? "selected" : ""]
      .filter(Boolean)
      .join(" ");

    return html`
      <article
        class=${classes}
        style=${regionStyle(region)}
        data-region-id=${region.id}
        @pointerdown=${() => this.selectRegion(region.id)}
      >
        <div class="region-chrome">
          ${showRegionLabel(region) ? html`<span class="region-label">${region.name}</span>` : html``}
          ${this.renderRegionContent(region)}
        </div>
        ${resizeHandles.map(
          (handle) => html`
            <span
              class=${`resize-handle ${handle}`}
              @pointerdown=${(event: PointerEvent) =>
                this.startResize(event, region.id, handle)}
            ></span>
          `,
        )}
      </article>
    `;
  }

  private renderRegionContent(region: LayoutRegion) {
    switch (region.id) {
      case "board":
        return this.renderBoardBackdrop();
      case "turn-region":
        return this.renderTurnRegion();
      case "players":
        return this.renderPlayersRegion();
      case "trade-main":
        return this.renderTradeMainRegion();
      case "bank-trades":
        return this.renderBankTradesRegion();
      case "right-tools":
        return this.renderRightToolsRegion();
      case "minimal-log":
        return this.renderMinimalLogRegion();
      case "expanded-log":
        return this.renderExpandedLogRegion();
      case "toast-region":
        return this.renderToastRegion();
      case "cheats":
        return this.renderCheatsRegion();
      case "pending-trades":
        return this.renderPendingTradesRegion();
      case "trade-button":
        return this.renderTradeShortcut();
      case "hand":
        return this.renderHandPlaceholder(region);
      case "actions":
        return this.renderActionsRegion();
      case "left-ui-region":
      case "right-ui-region":
      case "self":
      case "trading":
      case "log":
        return html``;
    }
  }

  private renderBoardBackdrop() {
    return html`
      <div class="map-grid"></div>
      <div class="map-center" aria-hidden="true"></div>
    `;
  }

  private renderTurnRegion() {
    const activePlayer = this.activePlayer();

    return html`
      <div class="status-shell">
        <span class="turn-state-title">Turn ${activePlayer.name}</span>
        <button
          class=${this.diceRolled ? "dice-roll-button" : "dice-roll-button rolling"}
          type="button"
          @click=${this.rollDice}
          aria-label=${this.diceRolled
            ? `Rolled ${this.diceValues[0]} and ${this.diceValues[1]}`
            : "Roll dice"}
        >
          ${this.renderDie(this.diceValues[0])}
          ${this.renderDie(this.diceValues[1])}
        </button>
      </div>
    `;
  }

  private renderDie(value: number) {
    const visiblePips = new Set(DIE_PIPS[value] ?? []);

    return html`
      <span class="die" aria-hidden="true">
        ${Array.from({ length: 9 }, (_, index) => html`
          <span class=${visiblePips.has(index) ? "die-pip visible" : "die-pip"}></span>
        `)}
      </span>
    `;
  }

  private renderPlayersRegion() {
    const players = this.activePlayers();

    return html`
      <div
        class="players-grid"
        style=${`--player-columns: ${playerColumnCount(players.length)}`}
      >
        ${players.map((player) => this.renderPlayer(player))}
      </div>
    `;
  }

  private renderPlayer(player: MockPlayer) {
    const isPerspectivePlayer = player.id === this.perspectivePlayerId;
    const isActivePlayer = player.id === this.activePlayerId;
    const resourceTotal = countResources(this.playerHands[player.id] ?? {});
    const classes = [
      "player-tile",
      isActivePlayer ? "active" : "",
      this.selectedPlayerId === player.id ? "selected" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return html`
      <button
        class=${classes}
        type="button"
        style=${`--player-color: ${player.color}`}
        @click=${() => this.switchPerspectivePlayer(player.id)}
      >
        <span class="player-color-bar" aria-hidden="true"></span>
        <span class="player-name-line">
          <span class="player-name">${player.name}</span>
          ${isPerspectivePlayer ? html`<span class="tag">You</span>` : html``}
          ${isActivePlayer ? html`<span class="tag">Turn</span>` : html``}
        </span>
        <span class="player-metrics">
          ${player.victoryPoints}VP ${resourceTotal}R ${player.devCards}D
        </span>
        <span class="player-pieces">
          Rd${player.roads} S${player.settlements} C${player.cities} A${player.army}
        </span>
      </button>
    `;
  }

  private renderPendingTradesRegion() {
    return html`
      <div class="pending-trades-shell">
        <div class="pending-trade-list">
          ${this.pendingTradeRequests.map((trade) => this.renderPendingTradeRow(trade))}
        </div>
      </div>
    `;
  }

  private renderPendingTradeRow(trade: PendingTradeRequest) {
    const selected = this.selectedTradeRequestId === trade.id;

    return html`
      <article
        class=${selected ? "pending-trade-row selected" : "pending-trade-row"}
        @click=${() => this.openPendingTrade(trade.id)}
      >
        ${trade.kind === "counter"
          ? html`<span class="pending-trade-kind-marker">Counter Offer</span>`
          : html``}
        <div class="pending-trade-body">
          ${this.renderTradePreviewBlock(trade, "feature")}
          <section class="pending-trade-players">
            <div class="pending-trade-player-list">
              ${trade.responses.map((response) =>
                this.renderPlayerToken(response.playerId, response.state, false, trade.id),
              )}
            </div>
          </section>
        </div>
        ${this.renderPendingTradeContextActions(trade)}
      </article>
    `;
  }

  private renderPendingTradeContextActions(trade: PendingTradeRequest) {
    const actions = this.pendingTradeContextActions(trade);

    return html`
      <div
        class="pending-trade-context-actions"
        style=${`--pending-action-columns: ${actions.length}`}
      >
        ${actions.map(
          (action) => html`
            <button
              class=${action.primary
                ? "pending-trade-context-button primary"
                : "pending-trade-context-button"}
              type="button"
              @click=${(event: MouseEvent) => {
                event.stopPropagation();
                action.run();
              }}
              ?disabled=${Boolean(action.disabled)}
            >
              ${action.label}
            </button>
          `,
        )}
      </div>
    `;
  }

  private pendingTradeContextActions(trade: PendingTradeRequest): Array<{
    label: string;
    primary?: boolean;
    disabled?: boolean;
    run: () => void;
  }> {
    if (this.perspectivePlayerId === trade.senderId) {
      return [
        {
          label: "Dismiss",
          run: () => this.dismissPendingTrade(trade.id),
        },
        {
          label: "Edit",
          primary: true,
          run: () => this.editPendingTrade(trade.id),
        },
      ];
    }

    return [
      {
        label: "Accept",
        primary: true,
        disabled: !this.canPlayerAffordTrade(trade, this.perspectivePlayerId),
        run: () => this.setPendingTradeResponse(trade.id, "accepted"),
      },
      {
        label: "Reject",
        run: () => this.setPendingTradeResponse(trade.id, "declined"),
      },
      {
        label: "Counter",
        run: () => this.openPendingTrade(trade.id),
      },
    ];
  }

  private renderTradeMainRegion() {
    const canEditBuilder = this.canEditTradeBuilder();
    const matchedTrade = this.currentTradeMatch();
    const canCreateTrade =
      canEditBuilder &&
      !matchedTrade &&
      canSendTrade(this.tradeGive, this.tradeGet) &&
      this.canAffordTradeGive();
    const canClear = hasAnyResources(this.tradeGive) || hasAnyResources(this.tradeGet);
    const statusText = this.tradeBuilderStatusText(matchedTrade, canCreateTrade);
    const controls = this.tradeBuilderControls(matchedTrade, canCreateTrade);
    const exchangeClasses = [
      "trade-workspace",
      "trade-exchange-region",
      this.canDropOnTradeBuilder() ? "drop-ready" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return html`
      <div class="trade-main-shell">
        <section class="trade-picker">
          <span class="trade-section-title">You Want</span>
          <div class="trade-resource-row">
            ${RESOURCE_KINDS.map((resource) =>
              this.renderWantResource(resource, !canEditBuilder),
            )}
          </div>
        </section>
        <header class="trade-builder-header">
          <span class="trade-builder-heading">You Get / You Give</span>
          <button
            class="trade-clear-button"
            type="button"
            ?disabled=${!canClear}
            @click=${this.clearTrade}
          >
            Clear
          </button>
        </header>
        <section
          class=${exchangeClasses}
          @dragover=${this.handleTradeBuilderDragOver}
          @drop=${this.dropOnTradeBuilder}
        >
          ${this.renderTradeTray(
            "get",
            "You Get",
            this.tradeGet,
            "Drop wanted resources here.",
            canEditBuilder,
          )}
          ${this.renderTradeTray(
            "give",
            "You Give",
            this.tradeGive,
            "Drop hand resources here.",
            canEditBuilder,
          )}
        </section>
        <footer class="trade-controls">
          <div class="trade-control-actions">
            ${controls.map((control) => this.renderTradeControl(control))}
          </div>
          <span class="trade-status">${statusText}</span>
        </footer>
      </div>
    `;
  }

  private renderTradeControl(control: TradeControl) {
    return html`
      <button
        class=${control.primary
          ? "trade-control-button primary"
          : "trade-control-button"}
        type="button"
        ?disabled=${Boolean(control.disabled)}
        @click=${control.run}
      >
        ${control.label}
      </button>
    `;
  }

  private tradeBuilderControls(
    matchedTrade: PendingTradeMatch | undefined,
    canCreateTrade: boolean,
  ): TradeControl[] {
    if (matchedTrade) {
      if (matchedTrade.isSender) {
        return [
          {
            label: "Cancel Trade",
            primary: true,
            run: () => this.dismissPendingTrade(matchedTrade.trade.id),
          },
        ];
      }

      const response = matchedTrade.response;

      if (!response) {
        return [];
      }

      const canAccept = this.canAffordTradeGive();

      switch (response.state) {
        case "pending":
          return [
            {
              label: "Accept",
              primary: true,
              disabled: !canAccept,
              run: () => this.setPendingTradeResponse(matchedTrade.trade.id, "accepted"),
            },
            {
              label: "Reject",
              run: () => this.setPendingTradeResponse(matchedTrade.trade.id, "declined"),
            },
            {
              label: "Counter",
              run: () => this.openPendingTrade(matchedTrade.trade.id),
            },
          ];
        case "accepted":
          return [
            {
              label: "Decline Response",
              run: () => this.setPendingTradeResponse(matchedTrade.trade.id, "declined"),
            },
          ];
        case "declined":
          return [
            {
              label: "Accept",
              primary: true,
              disabled: !canAccept,
              run: () => this.setPendingTradeResponse(matchedTrade.trade.id, "accepted"),
            },
            {
              label: "Counter",
              run: () => this.openPendingTrade(matchedTrade.trade.id),
            },
          ];
      }
    }

    return [
      {
        label: this.isTurnPlayerPerspective() ? "Send Trade" : "Counter Offer",
        primary: true,
        disabled: !canCreateTrade,
        run: this.createTradeRequest,
      },
    ];
  }

  private tradeBuilderStatusText(
    matchedTrade: PendingTradeMatch | undefined,
    canCreateTrade: boolean,
  ): string {
    if (matchedTrade) {
      if (matchedTrade.isSender) {
        return matchedTrade.trade.kind === "counter"
          ? "Counter offer already sent."
          : "Trade already sent.";
      }

      const response = matchedTrade.response;

      if (!response) {
        return "No response needed.";
      }

      if (response.state === "accepted") {
        return "You accepted this trade.";
      }

      if (response.state === "declined") {
        return "You declined this trade.";
      }

      return "This trade is waiting for your response.";
    }

    if (!canSendTrade(this.tradeGive, this.tradeGet)) {
      return "Drag resources into You Get / You Give.";
    }

    if (!this.canAffordTradeGive()) {
      return "Not enough resources in hand.";
    }

    return canCreateTrade
      ? this.isTurnPlayerPerspective()
        ? "Ready to send."
        : "Ready to counter."
      : "Trade already exists.";
  }

  private renderWantResource(resource: ResourceKind, disabled: boolean) {
    return html`
      <button
        class=${disabled
          ? "resource-card want-resource-card disabled"
          : "resource-card want-resource-card"}
        type="button"
        draggable=${disabled ? "false" : "true"}
        style=${`--resource-color: ${resourceColor(resource)}`}
        ?disabled=${disabled}
        @dragstart=${(event: DragEvent) =>
          this.startTradeDrag(event, { source: "want", resource })}
        @dragend=${this.endTradeDrag}
      >
        <span class="resource-card-name">${resource}</span>
        <span class="resource-card-count">Request</span>
      </button>
    `;
  }

  private renderTradeTray(
    side: TradeSide,
    title: string,
    counts: ResourceCounts,
    emptyText: string,
    canEdit: boolean,
  ) {
    const resources = RESOURCE_KINDS.filter((resource) => resourceCount(counts, resource) > 0);

    return html`
      <section class="trade-tray">
        <header class="trade-tray-header">
          <span class="trade-section-title">${title}</span>
          <span class="trade-tray-count">${countResources(counts)}</span>
        </header>
        <div class="trade-tray-content">
          ${resources.length > 0
            ? resources.map((resource) =>
                this.renderSelectedTradeResource(
                  side,
                  resource,
                  resourceCount(counts, resource),
                  canEdit,
                ),
              )
            : html`<span class="trade-empty">${emptyText}</span>`}
        </div>
      </section>
    `;
  }

  private renderSelectedTradeResource(
    side: TradeSide,
    resource: ResourceKind,
    count: number,
    canEdit: boolean,
  ) {
    return html`
      <button
        class=${canEdit
          ? "resource-card selected-trade-card"
          : "resource-card selected-trade-card disabled"}
        type="button"
        draggable=${canEdit ? "true" : "false"}
        title="Drag away to remove"
        style=${`--resource-color: ${resourceColor(resource)}`}
        ?disabled=${!canEdit}
        @dragstart=${(event: DragEvent) =>
          this.startTradeDrag(event, { source: side, resource })}
        @dragend=${this.endTradeDrag}
      >
        <span class="resource-card-name">${resource}</span>
        <span class="resource-card-count">x${count}</span>
      </button>
    `;
  }

  private renderTradePreviewBlock(
    trade: PendingTradeRequest,
    scale: "feature" | "compact",
  ) {
    const displayedTrade = tradeForPerspective(trade, this.perspectivePlayerId);

    return html`
      <div class=${`trade-preview-block ${scale}`} aria-label=${trade.label}>
        <div class="trade-preview-half trade-preview-get">
          ${this.renderTradePreviewResources(displayedTrade.get, "None")}
        </div>
        <span class="trade-preview-divider" aria-hidden="true"></span>
        <div class="trade-preview-half trade-preview-give">
          ${this.renderTradePreviewResources(displayedTrade.give, "None")}
        </div>
      </div>
    `;
  }

  private renderTradePreviewResources(counts: ResourceCounts, emptyText: string) {
    const resources = RESOURCE_KINDS.filter((resource) => resourceCount(counts, resource) > 0);

    if (resources.length === 0) {
      return html`<span class="trade-preview-empty">${emptyText}</span>`;
    }

    return resources.map((resource) =>
      this.renderTradePreviewResource(resource, resourceCount(counts, resource)),
    );
  }

  private renderTradePreviewResource(resource: ResourceKind, count: number) {
    return html`
      <span
        class="trade-preview-resource"
        style=${`--resource-color: ${resourceColor(resource)}`}
      >
        <span class="trade-preview-resource-name">${resource}</span>
        <span class="trade-preview-resource-count">${count > 1 ? `x${count}` : ""}</span>
      </span>
    `;
  }

  private renderPlayerToken(
    playerId: PlayerId,
    responseState: TradeResponseState,
    compact: boolean,
    tradeId?: string,
  ) {
    const player = playerById(playerId);
    const playerName = player?.name ?? playerId;
    const playerColor = player?.color ?? "#8c96a3";
    const classes = [
      "player-token",
      `state-${responseState}`,
      compact ? "compact" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const content = html`
      <span class="player-token-dot" aria-hidden="true"></span>
      <span class="player-token-name">${playerName}</span>
    `;
    const title = `${playerName}: ${TRADE_RESPONSE_LABELS[responseState]}`;

    if (tradeId) {
      return html`
        <button
          class=${classes}
          type="button"
          style=${`--player-color: ${playerColor}`}
          title=${title}
          @click=${(event: MouseEvent) => {
            event.stopPropagation();
            this.cyclePendingTradePlayer(tradeId, playerId);
          }}
        >
          ${content}
        </button>
      `;
    }

    return html`
      <span
        class=${classes}
        style=${`--player-color: ${playerColor}`}
        title=${title}
      >
        ${content}
      </span>
    `;
  }

  private renderBankTradesRegion() {
    const handCounts = this.currentHandCounts();
    const ports = this.currentPorts();
    const bankTrades = RESOURCE_KINDS.map((resource) => {
      const payments = bankPaymentOptions(resource, handCounts, ports);
      const available = payments.some((payment) => payment.available);

      return {
        resource,
        payments,
        available,
      };
    });
    const selectedTrade = this.selectedBankTradeResource
      ? bankTrades.find((trade) => trade.resource === this.selectedBankTradeResource)
      : undefined;

    return html`
      <div class="bank-trades-shell">
        ${bankTrades.map((trade) => this.renderBankTradeButton(trade))}
        ${selectedTrade ? this.renderBankPaymentPopover(selectedTrade) : html``}
      </div>
    `;
  }

  private renderBankTradeButton(trade: {
    resource: ResourceKind;
    payments: BankPaymentOption[];
    available: boolean;
  }) {
    const selected = this.selectedBankTradeResource === trade.resource;
    const classes = [
      "bank-trade-button",
      trade.available ? "" : "unavailable",
      selected ? "selected" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return html`
      <button
        class=${classes}
        type="button"
        style=${`--resource-color: ${resourceColor(trade.resource)}`}
        @click=${() => this.openBankPaymentOptions(trade.resource)}
      >
        <span class="bank-trade-header">
          <span class="resource-mark" aria-hidden="true"></span>
          <span class="bank-resource">${trade.resource}</span>
        </span>
        <span class="bank-cost-grid">
          ${trade.payments.map((payment) => this.renderBankCostColumn(payment))}
        </span>
      </button>
    `;
  }

  private renderBankCostColumn(payment: BankPaymentOption) {
    const classes = payment.available
      ? "bank-cost-column"
      : "bank-cost-column unavailable";

    return html`
      <span
        class=${classes}
        style=${`--payment-color: ${resourceColor(payment.resource)}`}
        title=${`${payment.cost} ${payment.resource}`}
      >
        ${[0, 1, 2, 3].map(
          (index) => html`
            <span
              class=${index < payment.cost
                ? "bank-cost-dot filled"
                : "bank-cost-dot"}
              aria-hidden="true"
            ></span>
          `,
        )}
        <span class="bank-cost-number">${payment.cost}</span>
      </span>
    `;
  }

  private renderBankPaymentPopover(trade: {
    resource: ResourceKind;
    payments: BankPaymentOption[];
    available: boolean;
  }) {
    return html`
      <aside class="bank-payment-popover">
        <header class="bank-payment-header">
          <span class="bank-payment-title">Pay for ${trade.resource}</span>
          <button
            class="bank-payment-close"
            type="button"
            @click=${this.closeBankPaymentOptions}
          >
            x
          </button>
        </header>
        <div class="bank-payment-options">
          ${trade.payments.map(
            (payment) => html`
              <button
                class="bank-payment-option"
                type="button"
                style=${`--resource-color: ${resourceColor(payment.resource)}`}
                ?disabled=${!payment.available}
                @click=${() => this.performBankTrade(trade.resource, payment.resource)}
              >
                <span class="resource-mark" aria-hidden="true"></span>
                <span class="bank-payment-text">
                  ${payment.cost} ${payment.resource}
                </span>
              </button>
            `,
          )}
        </div>
      </aside>
    `;
  }

  private renderRightToolsRegion() {
    return html`
      <div class="tools-shell">
        <button class="tool-button" type="button" @click=${this.toggleSettings}>
          Settings
        </button>
        <button class="tool-button" type="button">Leave</button>
        <button class="tool-button" type="button">Room</button>
      </div>
    `;
  }

  private renderMinimalLogRegion() {
    return html`
      <div class="minimal-log-shell">
        <header class="log-header">
          <span class="log-title">Log</span>
          <button class="log-toggle" type="button" @click=${this.openExpandedLog}>
            Expand
          </button>
        </header>
        <div class="log-list">
          ${MOCK_LOG.slice(0, 4).map((entry) => this.renderLogEntry(entry))}
        </div>
      </div>
    `;
  }

  private renderExpandedLogRegion() {
    return html`
      <div class="expanded-log-shell">
        <header class="log-header">
          <span class="log-title">Expanded Log</span>
          <button class="log-toggle" type="button" @click=${this.closeExpandedLog}>
            Collapse
          </button>
        </header>
        <div class="log-list expanded-log-list">
          ${MOCK_LOG.map((entry) => this.renderLogEntry(entry))}
        </div>
      </div>
    `;
  }

  private renderLogEntry(entry: MockLogEntry) {
    return html`
      <div class="log-row" style=${`--log-tone: ${logToneColor(entry.tone)}`}>
        <span class="log-text">
          <span class="log-time">${entry.time}</span>
          ${entry.text}
        </span>
      </div>
    `;
  }

  private renderToastRegion() {
    return html`
      <div class="toast-shell">
        ${this.toasts.map(
          (toast) => html`
            <div
              class="toast"
              style=${`--toast-color: ${toastToneColor(toast.tone)}`}
            >
              <span class="toast-title">${toast.title}</span>
              <span class="toast-detail">${toast.detail}</span>
            </div>
          `,
        )}
      </div>
    `;
  }

  private renderCheatsRegion() {
    const handCounts = this.currentHandCounts();
    const ports = this.currentPorts();

    return html`
      <div class=${this.cheatsCollapsed ? "cheats-shell collapsed" : "cheats-shell"}>
        <button class="cheat-header-button" type="button" @click=${this.toggleCheats}>
          <span class="cheat-header-title">Cheat UI</span>
          <span class="cheat-header-state">
            ${this.cheatsCollapsed ? "Expand" : "Minimize"}
          </span>
        </button>
        ${this.cheatsCollapsed
          ? html``
          : html`
              <div class="cheat-top-row">
                <button class="cheat-button" type="button" @click=${this.cyclePlayerCount}>
                  Players ${this.activePlayerCount}
                </button>
                <button class="cheat-button" type="button" @click=${this.addRandomToast}>
                  Toast
                </button>
              </div>
              <div class="cheat-port-grid">
                ${RESOURCE_KINDS.map((resource) =>
                  this.renderPortCheat(
                    `${resource} Port`,
                    resource,
                    Boolean(ports[resource]),
                  ),
                )}
                ${this.renderPortCheat(
                  "3:1 Port",
                  "ThreeToOne",
                  Boolean(ports.ThreeToOne),
                )}
              </div>
              <div class="cheat-resource-grid">
                ${RESOURCE_KINDS.map((resource) =>
                  this.renderResourceCheat(resource, resourceCount(handCounts, resource)),
                )}
              </div>
            `}
      </div>
    `;
  }

  private toggleCheats = () => {
    this.cheatsCollapsed = !this.cheatsCollapsed;
  };

  private renderPortCheat(label: string, port: PortKind, enabled: boolean) {
    return html`
      <button
        class=${enabled ? "cheat-button active" : "cheat-button"}
        type="button"
        @click=${() => this.toggleCurrentPlayerPort(port)}
      >
        ${label}
      </button>
    `;
  }

  private renderResourceCheat(resource: ResourceKind, count: number) {
    return html`
      <div class="cheat-resource-row">
        <span
          class="cheat-resource-label"
          style=${`--resource-color: ${resourceColor(resource)}`}
        >
          <span class="cheat-resource-dot" aria-hidden="true"></span>
          <span class="cheat-resource-name">${resource}</span>
          <span class="cheat-resource-count">${count}</span>
        </span>
        <button
          class="cheat-button"
          type="button"
          ?disabled=${count <= 0}
          @click=${() => this.updateCurrentHandResource(resource, -1)}
        >
          -
        </button>
        <button
          class="cheat-button"
          type="button"
          @click=${() => this.updateCurrentHandResource(resource, 1)}
        >
          +
        </button>
      </div>
    `;
  }

  private renderTradeShortcut() {
    return html`
      <div class="trade-shortcut">
        <button
          class=${this.tradeOpen
            ? "trade-shortcut-button active"
            : "trade-shortcut-button"}
          type="button"
          @click=${this.toggleTradeRegion}
        >
          ${this.tradeOpen ? "Close Trade" : "Trade"}
        </button>
      </div>
    `;
  }

  private renderHandPlaceholder(region: LayoutRegion) {
    const handCounts = this.currentHandCounts();
    const playerName = playerById(this.perspectivePlayerId)?.name ?? "Player";
    const totalResources = countResources(handCounts);
    const availableResources = RESOURCE_KINDS.reduce(
      (total, resource) => total + this.availableHandCount(resource),
      0,
    );

    return html`
      <div class="hand-shell">
        <header class="hand-header">
          <span class="hand-title">${playerName} ${region.name}</span>
          <span class="hand-counts">
            <span class="tag">${availableResources}/${totalResources} resources</span>
          </span>
        </header>
        <div class="hand-grid">
          ${RESOURCE_KINDS.map((resource) => this.renderHandResource(resource))}
        </div>
      </div>
    `;
  }

  private renderHandResource(resource: ResourceKind) {
    const owned = resourceCount(this.currentHandCounts(), resource);
    const available = this.availableHandCount(resource);
    const disabled = available <= 0;

    return html`
      <button
        class=${disabled ? "hand-slot resource-card disabled" : "hand-slot resource-card"}
        type="button"
        draggable=${disabled ? "false" : "true"}
        style=${`--resource-color: ${resourceColor(resource)}`}
        ?disabled=${disabled}
        @dragstart=${(event: DragEvent) =>
          this.startTradeDrag(event, { source: "hand", resource })}
        @dragend=${this.endTradeDrag}
      >
        <span class="resource-card-name">${resource}</span>
        <span class="resource-card-count">${available}/${owned}</span>
      </button>
    `;
  }

  private renderActionsRegion() {
    const nextPlayer = playerById(this.nextActivePlayerId());
    const endTurnAction = {
      ...END_TURN_ACTION,
      detail: nextPlayer?.name ?? END_TURN_ACTION.detail,
    };

    return html`
      <div class="actions-layout">
        <section class="action-section">
          <span class="micro-label">Shop</span>
          <div class="shop-action-grid">
            ${SHOP_ACTIONS.map((action) => this.renderActionButton(action))}
          </div>
        </section>
        <section class="action-section">
          <span class="micro-label">Turn</span>
          <div class="turn-action-grid">
            ${this.renderActionButton(endTurnAction, "end-turn")}
          </div>
        </section>
      </div>
    `;
  }

  private renderActionButton(action: MockAction, variant = "") {
    const active = this.selectedActionId === action.id;
    const classes = ["action-button", active ? "active" : "", variant]
      .filter(Boolean)
      .join(" ");

    return html`
      <button
        class=${classes}
        type="button"
        ?disabled=${!action.enabled}
        @click=${() => {
          if (action.id === "end-turn") {
            this.endTurn();
            return;
          }

          this.selectedActionId = action.id;
        }}
      >
        <span class="action-label">${action.label}</span>
        <span class="action-detail">${action.detail}</span>
      </button>
    `;
  }

  private renderSettingsPanel(regions: LayoutRegion[], selectedRegion: LayoutRegion) {
    const selectedMeta = this.regionMeta(selectedRegion.id);

    return html`
      <aside class="settings-panel">
        <section class="settings-list">
          <h2 class="settings-heading">Regions</h2>
          <div class="region-list">
            ${regions.map((region) => this.renderRegionListButton(region))}
          </div>
          <button class="reset-button" type="button" @click=${this.resetLayout}>
            Reset layout
          </button>
        </section>
        <section class="settings-detail">
          <div class="settings-section">
            <h2 class="settings-heading">Selected Region</h2>
            <div class="field">
              <label for="region-name">Name</label>
              <input
                id="region-name"
                type="text"
                .value=${selectedMeta.name}
                @input=${(event: InputEvent) =>
                  this.updateRegionName(
                    selectedRegion.id,
                    (event.currentTarget as HTMLInputElement).value,
                  )}
              />
            </div>
            <div class="field">
              <label for="region-color">Color</label>
              <input
                id="region-color"
                type="color"
                .value=${selectedMeta.color}
                @input=${(event: InputEvent) =>
                  this.updateRegionColor(
                    selectedRegion.id,
                    (event.currentTarget as HTMLInputElement).value,
                  )}
              />
            </div>
            ${this.renderFrameReadout(selectedRegion)}
          </div>

          <div class="settings-section">
            <h2 class="settings-heading">Region Controls</h2>
            ${controlsForRegion(selectedRegion.id).map((field) =>
              this.renderMetricInput(field),
            )}
          </div>

          <div class="settings-section">
            <h2 class="settings-heading">Primary Layout</h2>
            ${([
              "leftWidth",
              "rightWidth",
              "selfHeight",
              "panelInset",
              "panelGap",
              "bottomInset",
            ] as const).map((field) => this.renderMetricInput(field))}
          </div>

          <div class="settings-section">
            <h2 class="settings-heading">Left UI</h2>
            ${(["bankTradesHeight"] as const).map((field) =>
              this.renderMetricInput(field),
            )}
          </div>

          <div class="settings-section">
            <h2 class="settings-heading">Pending Trades</h2>
            ${(["pendingTradesWidth"] as const).map((field) =>
              this.renderMetricInput(field),
            )}
          </div>

          <div class="settings-section">
            <h2 class="settings-heading">Turn Region</h2>
            ${(["statusHeight"] as const).map((field) => this.renderMetricInput(field))}
          </div>

          <div class="settings-section">
            <h2 class="settings-heading">Right UI</h2>
            ${([
              "rightToolsHeight",
              "minimalLogHeight",
              "playersHeight",
            ] as const).map((field) => this.renderMetricInput(field))}
          </div>

          <div class="settings-section">
            <h2 class="settings-heading">Toast Region</h2>
            ${(["toastWidth", "toastHeight"] as const).map((field) =>
              this.renderMetricInput(field),
            )}
          </div>
        </section>
      </aside>
    `;
  }

  private renderRegionListButton(region: LayoutRegion) {
    return html`
      <button
        class=${region.id === this.selectedRegionId
          ? "region-list-button active"
          : "region-list-button"}
        type="button"
        @click=${() => this.selectRegion(region.id)}
      >
        <span
          class="region-swatch"
          style=${`--region-color: ${region.color}`}
          aria-hidden="true"
        ></span>
        <span class="region-list-name">${region.name}</span>
      </button>
    `;
  }

  private renderFrameReadout(region: LayoutRegion) {
    return html`
      <div class="frame-readout" aria-label="Region frame">
        <span class="frame-chip">x ${formatPercent(region.frame.x)}</span>
        <span class="frame-chip">y ${formatPercent(region.frame.y)}</span>
        <span class="frame-chip">w ${formatPercent(region.frame.width)}</span>
        <span class="frame-chip">h ${formatPercent(region.frame.height)}</span>
      </div>
    `;
  }

  private renderMetricInput(field: LayoutMetricField) {
    return html`
      <div class="field metric-row">
        <label for=${field}>${METRIC_LABELS[field]}</label>
        <input
          id=${field}
          type="number"
          min="0"
          max="100"
          step="0.1"
          .value=${String(this.layout.metrics[field])}
          @input=${(event: InputEvent) =>
            this.updateMetric(field, (event.currentTarget as HTMLInputElement).value)}
        />
      </div>
    `;
  }

  private selectRegion(regionId: RegionId) {
    this.selectedRegionId = regionId;
  }

  private toggleSettings = () => {
    this.settingsOpen = !this.settingsOpen;
  };

  private openExpandedLog = () => {
    this.expandedLogOpen = true;
  };

  private closeExpandedLog = () => {
    this.expandedLogOpen = false;
  };

  private toggleTradeRegion = () => {
    if (this.tradeOpen) {
      this.tradeOpen = false;
      this.selectedTradeRequestId = null;
      return;
    }

    if (!this.isTurnPlayerPerspective()) {
      return;
    }

    this.selectedTradeRequestId = null;
    this.tradeOpen = true;
  };

  private startDiceTimer() {
    this.clearDiceTimer();
    this.diceTimer = window.setInterval(() => {
      if (!this.diceRolled) {
        this.diceValues = randomAnimatedDicePair(this.diceValues);
      }
    }, DICE_ROLL_INTERVAL_MS);
  }

  private clearDiceTimer() {
    if (this.diceTimer === undefined) {
      return;
    }

    window.clearInterval(this.diceTimer);
    this.diceTimer = undefined;
  }

  private rollDice = () => {
    if (this.diceRolled) {
      return;
    }

    this.diceValues = randomDicePair();
    this.diceRolled = true;
  };

  private resetDiceForTurn() {
    this.diceValues = randomDicePair();
    this.diceRolled = false;
  }

  private activePlayer(): MockPlayer {
    return (
      this.activePlayers().find((player) => player.id === this.activePlayerId) ??
      this.activePlayers()[0] ??
      MOCK_PLAYERS[0]
    );
  }

  private nextActivePlayerId(): PlayerId {
    const players = this.activePlayers();
    const currentIndex = players.findIndex((player) => player.id === this.activePlayerId);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % players.length;

    return players[nextIndex]?.id ?? ACTIVE_PLAYER_ID;
  }

  private endTurn = () => {
    if (!this.isTurnPlayerPerspective()) {
      return;
    }

    this.activePlayerId = this.nextActivePlayerId();
    this.pendingTradeRequests = [];
    this.selectedTradeRequestId = null;
    this.tradeGive = {};
    this.tradeGet = {};
    this.selectedBankTradeResource = null;
    this.tradeOpen = this.isTurnPlayerPerspective();
    this.selectedActionId = "build-road";
    this.resetDiceForTurn();
  };

  private activePlayers(): MockPlayer[] {
    return MOCK_PLAYERS.slice(0, this.activePlayerCount);
  }

  private isTurnPlayerPerspective(): boolean {
    return this.perspectivePlayerId === this.activePlayerId;
  }

  private canEditTradeBuilder(): boolean {
    return this.tradeOpen;
  }

  private currentTradeMatch(): PendingTradeMatch | undefined {
    if (!canSendTrade(this.tradeGive, this.tradeGet)) {
      return undefined;
    }

    const matchingTrades = this.pendingTradeRequests.filter((pendingTrade) => {
      const displayedTrade = tradeForPerspective(
        pendingTrade,
        this.perspectivePlayerId,
      );

      return (
        resourceCountsEqual(displayedTrade.give, this.tradeGive) &&
        resourceCountsEqual(displayedTrade.get, this.tradeGet)
      );
    });
    const trade =
      matchingTrades.find(({ id }) => id === this.selectedTradeRequestId) ??
      matchingTrades[0];

    if (!trade) {
      return undefined;
    }

    return {
      trade,
      isSender: trade.senderId === this.perspectivePlayerId,
      response: responseForPlayer(trade, this.perspectivePlayerId),
    };
  }

  private canAffordTradeGive(): boolean {
    return canAffordCounts(this.tradeGive, this.currentHandCounts());
  }

  private canPlayerAffordTrade(trade: PendingTradeRequest, playerId: PlayerId): boolean {
    const displayedTrade = tradeForPerspective(trade, playerId);
    const handCounts = this.playerHands[playerId] ?? {};

    return canAffordCounts(displayedTrade.give, handCounts);
  }

  private openPendingTrade(tradeId: string) {
    const trade = this.pendingTradeRequests.find(({ id }) => id === tradeId);

    if (!trade) {
      return;
    }

    const displayedTrade = tradeForPerspective(trade, this.perspectivePlayerId);

    this.tradeGet = { ...displayedTrade.get };
    this.tradeGive = { ...displayedTrade.give };
    this.selectedTradeRequestId = tradeId;
    this.tradeOpen = true;
  }

  private dismissPendingTrade(tradeId: string) {
    this.pendingTradeRequests = this.pendingTradeRequests.filter(
      (trade) => trade.id !== tradeId,
    );

    if (this.selectedTradeRequestId === tradeId) {
      this.selectedTradeRequestId = null;
      this.tradeOpen = this.isTurnPlayerPerspective();
    }
  }

  private editPendingTrade(tradeId: string) {
    const trade = this.pendingTradeRequests.find(({ id }) => id === tradeId);

    if (!trade || trade.senderId !== this.perspectivePlayerId) {
      return;
    }

    this.tradeGet = { ...trade.get };
    this.tradeGive = { ...trade.give };
    this.pendingTradeRequests = this.pendingTradeRequests.filter(({ id }) => id !== tradeId);
    this.selectedTradeRequestId = null;
    this.tradeOpen = true;
  }

  private switchPerspectivePlayer(playerId: PlayerId) {
    if (!this.activePlayers().some((player) => player.id === playerId)) {
      return;
    }

    if (playerId === this.perspectivePlayerId) {
      this.selectedPlayerId = playerId;

      if (playerId !== this.activePlayerId) {
        this.switchTurnToPlayer(playerId);
      }

      return;
    }

    this.perspectivePlayerId = playerId;
    this.selectedPlayerId = playerId;
    this.selectedBankTradeResource = null;

    if (playerId !== this.activePlayerId) {
      this.tradeOpen = false;
      this.selectedTradeRequestId = null;
    }
  }

  private switchTurnToPlayer(playerId: PlayerId) {
    this.activePlayerId = playerId;
    this.pendingTradeRequests = [];
    this.selectedTradeRequestId = null;
    this.tradeGive = {};
    this.tradeGet = {};
    this.selectedBankTradeResource = null;
    this.tradeOpen = false;
    this.selectedActionId = "build-road";
    this.resetDiceForTurn();
  }

  private addRandomToast = () => {
    const template =
      TOAST_MESSAGES[Math.floor(Math.random() * TOAST_MESSAGES.length)] ??
      TOAST_MESSAGES[0];
    const toast: MockToast = {
      ...template,
      id: `toast-${Date.now()}-${this.toastSequence++}`,
    };
    const nextToasts = [...this.toasts, toast];
    const overflow = Math.max(0, nextToasts.length - MAX_VISIBLE_TOASTS);
    const removedToasts = nextToasts.slice(0, overflow);

    for (const removedToast of removedToasts) {
      this.clearToastTimer(removedToast.id);
    }

    this.toasts = nextToasts.slice(overflow);
    this.toastTimers.set(
      toast.id,
      window.setTimeout(() => this.expireToast(toast.id), TOAST_LIFETIME_MS),
    );
  };

  private expireToast(toastId: string) {
    this.clearToastTimer(toastId);
    this.toasts = this.toasts.filter((toast) => toast.id !== toastId);
  }

  private clearToastTimer(toastId: string) {
    const timer = this.toastTimers.get(toastId);

    if (timer === undefined) {
      return;
    }

    window.clearTimeout(timer);
    this.toastTimers.delete(toastId);
  }

  private clearToastTimers() {
    for (const timer of this.toastTimers.values()) {
      window.clearTimeout(timer);
    }

    this.toastTimers.clear();
  }

  private cyclePlayerCount = () => {
    const nextCount =
      this.activePlayerCount >= MAX_PLAYER_COUNT
        ? MIN_PLAYER_COUNT
        : this.activePlayerCount + 1;
    const activePlayerIds = new Set(
      MOCK_PLAYERS.slice(0, nextCount).map((player) => player.id),
    );

    this.activePlayerCount = nextCount;
    this.pendingTradeRequests = [];
    this.selectedTradeRequestId = null;
    this.selectedBankTradeResource = null;

    if (!activePlayerIds.has(this.selectedPlayerId)) {
      this.selectedPlayerId = ACTIVE_PLAYER_ID;
    }

    if (!activePlayerIds.has(this.activePlayerId)) {
      this.activePlayerId = ACTIVE_PLAYER_ID;
      this.resetDiceForTurn();
    }

    if (!activePlayerIds.has(this.perspectivePlayerId)) {
      this.perspectivePlayerId = ACTIVE_PLAYER_ID;
      this.tradeOpen = true;
    }

    if (!this.isTurnPlayerPerspective()) {
      this.tradeOpen = false;
    }
  };

  private cyclePendingTradePlayer(tradeId: string, playerId: PlayerId) {
    const nextTrades = this.pendingTradeRequests
      .map((trade) => {
        if (trade.id !== tradeId) {
          return trade;
        }

        return {
          ...trade,
          responses: trade.responses.map((response): MockTradeResponse => {
            if (response.playerId !== playerId) {
              return response;
            }

            const nextState = nextTradeResponseState(response.state);

            if (nextState === "accepted" && !this.canPlayerAffordTrade(trade, playerId)) {
              return { ...response, state: "declined" };
            }

            return { ...response, state: nextState };
          }),
        };
      })
      .filter((trade) => !trade.responses.every(({ state }) => state === "declined"));

    this.pendingTradeRequests = nextTrades;

    if (
      this.selectedTradeRequestId === tradeId &&
      !nextTrades.some((trade) => trade.id === tradeId)
    ) {
      this.selectedTradeRequestId = null;
      this.tradeOpen = this.isTurnPlayerPerspective();
    }
  }

  private setPendingTradeResponse(tradeId: string, state: TradeResponseState) {
    const playerId = this.perspectivePlayerId;
    const targetTrade = this.pendingTradeRequests.find((trade) => trade.id === tradeId);

    if (
      state === "accepted" &&
      (!targetTrade || !this.canPlayerAffordTrade(targetTrade, playerId))
    ) {
      return;
    }

    const nextTrades = this.pendingTradeRequests
      .map((trade) => {
        if (trade.id !== tradeId) {
          return trade;
        }

        return {
          ...trade,
          responses: trade.responses.map((response) =>
            response.playerId === playerId ? { ...response, state } : response,
          ),
        };
      })
      .filter((trade) => !trade.responses.every((response) => response.state === "declined"));

    this.pendingTradeRequests = nextTrades;

    if (!nextTrades.some((trade) => trade.id === tradeId)) {
      this.selectedTradeRequestId = null;
      this.tradeOpen = this.isTurnPlayerPerspective();
    }
  }

  private currentHandCounts(): ResourceCounts {
    return this.playerHands[this.perspectivePlayerId] ?? {};
  }

  private currentPorts(): Partial<Record<PortKind, boolean>> {
    return this.playerPorts[this.perspectivePlayerId] ?? {};
  }

  private updateCurrentHandResource(resource: ResourceKind, delta: number) {
    const playerId = this.perspectivePlayerId;
    const currentCounts = this.playerHands[playerId] ?? {};
    const nextCount = Math.max(0, resourceCount(currentCounts, resource) + delta);
    const nextCounts = { ...currentCounts };

    if (nextCount > 0) {
      nextCounts[resource] = nextCount;
    } else {
      delete nextCounts[resource];
    }

    this.setCurrentHandCounts(nextCounts);
  }

  private toggleCurrentPlayerPort(port: PortKind) {
    const playerId = this.perspectivePlayerId;
    const currentPorts = this.playerPorts[playerId] ?? {};
    const nextPorts = { ...currentPorts };

    if (nextPorts[port]) {
      delete nextPorts[port];
    } else {
      nextPorts[port] = true;
    }

    this.playerPorts = {
      ...this.playerPorts,
      [playerId]: nextPorts,
    };
  }

  private openBankPaymentOptions(resource: ResourceKind) {
    this.selectedBankTradeResource =
      this.selectedBankTradeResource === resource ? null : resource;
  }

  private closeBankPaymentOptions = () => {
    this.selectedBankTradeResource = null;
  };

  private performBankTrade(targetResource: ResourceKind, paymentResource: ResourceKind) {
    if (!this.isTurnPlayerPerspective()) {
      return;
    }

    const handCounts = this.currentHandCounts();
    const cost = bankTradeRatio(paymentResource, this.currentPorts());

    if (
      paymentResource === targetResource ||
      resourceCount(handCounts, paymentResource) < cost
    ) {
      return;
    }

    this.setCurrentHandCounts(
      addResourceCount(
        removeResourceAmount(handCounts, paymentResource, cost),
        targetResource,
      ),
    );
    this.selectedBankTradeResource = null;
  }

  private availableHandCount(resource: ResourceKind): number {
    const reservedCount = resourceCount(this.tradeGive, resource);

    return Math.max(0, resourceCount(this.currentHandCounts(), resource) - reservedCount);
  }

  private setCurrentHandCounts(nextCounts: ResourceCounts) {
    const playerId = this.perspectivePlayerId;

    this.playerHands = {
      ...this.playerHands,
      [playerId]: nextCounts,
    };

    this.tradeGive = capResourceCounts(this.tradeGive, nextCounts);
  }

  private startTradeDrag(event: DragEvent, payload: TradeDragPayload) {
    if (payload.source !== "hand" && !this.canEditTradeBuilder()) {
      event.preventDefault();
      return;
    }

    if (payload.source === "hand" && this.availableHandCount(payload.resource) <= 0) {
      event.preventDefault();
      return;
    }

    this.dragPayload = payload;
    this.tradeDropHandled = false;
    event.dataTransfer?.setData("text/plain", `${payload.source}:${payload.resource}`);

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed =
        payload.source === "give" || payload.source === "get" ? "move" : "copy";
    }
  }

  private canDropOnTradeBuilder(): boolean {
    return Boolean(
      this.canEditTradeBuilder() && this.dragPayload && tradeSideForPayload(this.dragPayload),
    );
  }

  private handleTradeBuilderDragOver = (event: DragEvent) => {
    const payload = this.dragPayload;

    if (!this.canEditTradeBuilder() || !payload || !tradeSideForPayload(payload)) {
      return;
    }

    event.preventDefault();

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect =
        payload.source === "give" || payload.source === "get"
          ? "move"
          : "copy";
    }
  };

  private dropOnTradeBuilder = (event: DragEvent) => {
    if (!this.canEditTradeBuilder() || !this.dragPayload) {
      return;
    }

    const side = tradeSideForPayload(this.dragPayload);

    if (!side) {
      return;
    }

    event.preventDefault();
    this.tradeDropHandled = true;

    if (this.dragPayload.source === "hand" || this.dragPayload.source === "want") {
      this.addTradeResource(side, this.dragPayload.resource);
    }
  };

  private endTradeDrag = () => {
    const payload = this.dragPayload;

    if (
      payload &&
      !this.tradeDropHandled &&
      (payload.source === "give" || payload.source === "get")
    ) {
      this.removeTradeResource(payload.source, payload.resource);
    }

    this.dragPayload = null;
    this.tradeDropHandled = false;
  };

  private addTradeResource(side: TradeSide, resource: ResourceKind) {
    if (!this.canEditTradeBuilder()) {
      return;
    }

    if (side === "give" && this.availableHandCount(resource) <= 0) {
      return;
    }

    if (side === "give") {
      this.tradeGive = addResourceCount(this.tradeGive, resource);
    } else {
      this.tradeGet = addResourceCount(this.tradeGet, resource);
    }

    this.selectedTradeRequestId = null;
  }

  private removeTradeResource(side: TradeSide, resource: ResourceKind) {
    if (side === "give") {
      this.tradeGive = removeResourceCount(this.tradeGive, resource);
    } else {
      this.tradeGet = removeResourceCount(this.tradeGet, resource);
    }

    this.selectedTradeRequestId = null;
  }

  private clearTrade = () => {
    this.tradeGive = {};
    this.tradeGet = {};
    this.selectedTradeRequestId = null;
  };

  private createTradeRequest = () => {
    if (
      !canSendTrade(this.tradeGive, this.tradeGet) ||
      !this.canAffordTradeGive() ||
      this.currentTradeMatch()
    ) {
      return;
    }

    const tradeNumber = ++this.tradeSequence;
    const request: PendingTradeRequest = {
      id: `pending-trade-${tradeNumber}`,
      label: `Trade ${tradeNumber}`,
      kind: this.isTurnPlayerPerspective() ? "offer" : "counter",
      senderId: this.perspectivePlayerId,
      get: { ...this.tradeGet },
      give: { ...this.tradeGive },
      responses: pendingPlayerResponses(this.activePlayers(), this.perspectivePlayerId),
    };

    this.pendingTradeRequests = [...this.pendingTradeRequests, request];
    this.selectedTradeRequestId = request.id;
  };

  private resetLayout = () => {
    const next = defaultLayout();
    this.layout = next;
    saveLayout(next);
  };

  private updateMetric(field: LayoutMetricField, rawValue: string) {
    const numericValue = Number(rawValue);

    if (!Number.isFinite(numericValue)) {
      return;
    }

    const nextLayout: StoredLayout = {
      ...this.layout,
      metrics: sanitizeMetrics({
        ...this.layout.metrics,
        [field]: numericValue,
      }),
    };
    this.layout = nextLayout;
    saveLayout(nextLayout);
  }

  private updateRegionName(regionId: RegionId, name: string) {
    const trimmed = name.trim();
    const nextNames = { ...this.layout.names };

    if (trimmed.length === 0 || trimmed === DEFAULT_META[regionId].name) {
      delete nextNames[regionId];
    } else {
      nextNames[regionId] = trimmed;
    }

    const nextLayout = { ...this.layout, names: nextNames };
    this.layout = nextLayout;
    saveLayout(nextLayout);
  }

  private updateRegionColor(regionId: RegionId, color: string) {
    const nextColors = { ...this.layout.colors };

    if (color === DEFAULT_META[regionId].color) {
      delete nextColors[regionId];
    } else {
      nextColors[regionId] = color;
    }

    const nextLayout = { ...this.layout, colors: nextColors };
    this.layout = nextLayout;
    saveLayout(nextLayout);
  }

  private regionMeta(regionId: RegionId): RegionMeta {
    const base = DEFAULT_META[regionId];

    return {
      ...base,
      name: this.layout.names[regionId] ?? base.name,
      color: this.layout.colors[regionId] ?? base.color,
    };
  }

  private startResize(event: PointerEvent, regionId: RegionId, handle: ResizeHandle) {
    if (!this.ctrlPressed) {
      return;
    }

    const workspace = this.renderRoot.querySelector<HTMLElement>(".workspace");

    if (!workspace) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.dragState = {
      regionId,
      handle,
      startMetrics: this.layout.metrics,
      canvasRect: workspace.getBoundingClientRect(),
    };
    window.addEventListener("pointermove", this.handleWindowPointerMove);
    window.addEventListener("pointerup", this.handleWindowPointerUp);
  }

  private handleWindowPointerMove = (event: PointerEvent) => {
    if (!this.dragState) {
      return;
    }

    const nextLayout = {
      ...this.layout,
      metrics: metricsForDrag(this.dragState, event),
    };
    this.layout = nextLayout;
    saveLayout(nextLayout);
  };

  private handleWindowPointerUp = () => {
    this.dragState = null;
    this.removeDragListeners();
  };

  private removeDragListeners() {
    window.removeEventListener("pointermove", this.handleWindowPointerMove);
    window.removeEventListener("pointerup", this.handleWindowPointerUp);
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Control") {
      this.ctrlPressed = true;
    }
  };

  private handleKeyUp = (event: KeyboardEvent) => {
    if (event.key === "Control") {
      this.ctrlPressed = false;
      this.dragState = null;
      this.removeDragListeners();
    }
  };
}

function tradeSideForPayload(payload: TradeDragPayload): TradeSide | null {
  if (payload.source === "hand" || payload.source === "give") {
    return "give";
  }

  if (payload.source === "want" || payload.source === "get") {
    return "get";
  }

  return null;
}

function canSendTrade(give: ResourceCounts, get: ResourceCounts): boolean {
  return hasAnyResources(give) && hasAnyResources(get);
}

function canAffordCounts(costs: ResourceCounts, counts: ResourceCounts): boolean {
  return RESOURCE_KINDS.every(
    (resource) => resourceCount(costs, resource) <= resourceCount(counts, resource),
  );
}

function hasAnyResources(counts: ResourceCounts): boolean {
  return countResources(counts) > 0;
}

function countResources(counts: Partial<Record<ResourceKind, number>>): number {
  return RESOURCE_KINDS.reduce(
    (total, resource) => total + resourceCount(counts, resource),
    0,
  );
}

function resourceCountsEqual(first: ResourceCounts, second: ResourceCounts): boolean {
  return RESOURCE_KINDS.every(
    (resource) => resourceCount(first, resource) === resourceCount(second, resource),
  );
}

function randomDicePair(): [number, number] {
  return [randomDieValue(), randomDieValue()];
}

function randomAnimatedDicePair(previousValues: [number, number]): [number, number] {
  return [
    randomDieValueExcept(previousValues[0]),
    randomDieValueExcept(previousValues[1]),
  ];
}

function randomDieValue(): number {
  return Math.floor(Math.random() * 6) + 1;
}

function shuffledPlayerNames(): string[] {
  const names = [...MOCK_PLAYER_NAME_POOL];

  for (let index = names.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [names[index], names[swapIndex]] = [names[swapIndex], names[index]];
  }

  return names;
}

function randomDieValueExcept(excludedValue: number): number {
  const nextValue = randomDieValue();

  if (nextValue !== excludedValue) {
    return nextValue;
  }

  return (excludedValue % 6) + 1;
}

function resourceCount(
  counts: Partial<Record<ResourceKind, number>>,
  resource: ResourceKind,
): number {
  return counts[resource] ?? 0;
}

function playerById(playerId: PlayerId): MockPlayer | undefined {
  return MOCK_PLAYERS.find((player) => player.id === playerId);
}

function pendingPlayerResponses(
  players: MockPlayer[],
  senderId: PlayerId,
): MockTradeResponse[] {
  return players.filter((player) => player.id !== senderId).map((player) => ({
    playerId: player.id,
    state: "pending",
  }));
}

function tradeForPerspective(
  trade: PendingTradeRequest,
  perspectivePlayerId: PlayerId,
): { get: ResourceCounts; give: ResourceCounts } {
  if (trade.senderId === perspectivePlayerId) {
    return {
      get: trade.get,
      give: trade.give,
    };
  }

  return {
    get: trade.give,
    give: trade.get,
  };
}

function responseForPlayer(
  trade: PendingTradeRequest,
  playerId: PlayerId,
): MockTradeResponse | undefined {
  return trade.responses.find((response) => response.playerId === playerId);
}

function playerColumnCount(playerCount: number): number {
  return clamp(playerCount, 1, MAX_PLAYER_COLUMNS);
}

function playerRegionHeight(metrics: LayoutMetrics, playerCount: number): number {
  const maxRows = playerRowCount(MAX_PLAYER_COUNT);
  const activeRows = playerRowCount(playerCount);
  const totalRowGap = metrics.panelGap * (maxRows - 1);
  const rowHeight = Math.max(
    MIN_REGION_SIZE,
    (metrics.playersHeight - totalRowGap) / maxRows,
  );

  return activeRows * rowHeight + metrics.panelGap * (activeRows - 1);
}

function playerRowCount(playerCount: number): number {
  return Math.max(1, Math.ceil(playerCount / MAX_PLAYER_COLUMNS));
}

function nextTradeResponseState(state: TradeResponseState): TradeResponseState {
  switch (state) {
    case "pending":
      return "accepted";
    case "accepted":
      return "declined";
    case "declined":
      return "pending";
  }
}

function addResourceCount(counts: ResourceCounts, resource: ResourceKind): ResourceCounts {
  return {
    ...counts,
    [resource]: resourceCount(counts, resource) + 1,
  };
}

function removeResourceCount(counts: ResourceCounts, resource: ResourceKind): ResourceCounts {
  const next = { ...counts };
  const count = resourceCount(next, resource) - 1;

  if (count > 0) {
    next[resource] = count;
  } else {
    delete next[resource];
  }

  return next;
}

function removeResourceAmount(
  counts: ResourceCounts,
  resource: ResourceKind,
  amount: number,
): ResourceCounts {
  const next = { ...counts };
  const count = resourceCount(next, resource) - amount;

  if (count > 0) {
    next[resource] = count;
  } else {
    delete next[resource];
  }

  return next;
}

function capResourceCounts(counts: ResourceCounts, limits: ResourceCounts): ResourceCounts {
  const next: ResourceCounts = {};

  for (const resource of RESOURCE_KINDS) {
    const count = Math.min(resourceCount(counts, resource), resourceCount(limits, resource));

    if (count > 0) {
      next[resource] = count;
    }
  }

  return next;
}

function bankTradeRatio(
  resource: ResourceKind,
  ports: Partial<Record<PortKind, boolean>>,
): number {
  if (ports[resource]) {
    return 2;
  }

  if (ports.ThreeToOne) {
    return 3;
  }

  return 4;
}

function bankPaymentOptions(
  targetResource: ResourceKind,
  counts: ResourceCounts,
  ports: Partial<Record<PortKind, boolean>>,
): BankPaymentOption[] {
  return RESOURCE_KINDS.filter((resource) => resource !== targetResource).map((resource) => {
    const cost = bankTradeRatio(resource, ports);

    return {
      resource,
      cost,
      available: resourceCount(counts, resource) >= cost,
    };
  });
}

function clonePlayerHands(hands: PlayerHands): PlayerHands {
  return Object.fromEntries(
    Object.entries(hands).map(([playerId, counts]) => [playerId, { ...counts }]),
  );
}

function clonePlayerPorts(ports: PlayerPorts): PlayerPorts {
  return Object.fromEntries(
    Object.entries(ports).map(([playerId, values]) => [playerId, { ...values }]),
  );
}

function defaultLayout(): StoredLayout {
  return {
    version: 6,
    metrics: { ...DEFAULT_METRICS },
    names: {},
    colors: {},
  };
}

function loadLayout(): StoredLayout {
  const fallback = defaultLayout();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw) as Partial<StoredLayout>;

    if (parsed.version !== 6) {
      return fallback;
    }

    return {
      version: 6,
      metrics: sanitizeMetrics({
        ...DEFAULT_METRICS,
        ...(parsed.metrics ?? {}),
      }),
      names: pickRegionValues(parsed.names),
      colors: pickRegionValues(parsed.colors),
    };
  } catch {
    return fallback;
  }
}

function saveLayout(layout: StoredLayout) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
}

function pickRegionValues(
  values: Partial<Record<RegionId, string>> | undefined,
): Partial<Record<RegionId, string>> {
  const picked: Partial<Record<RegionId, string>> = {};

  if (!values) {
    return picked;
  }

  for (const id of REGION_ORDER) {
    const value = values[id];

    if (typeof value === "string" && value.length > 0) {
      picked[id] = value;
    }
  }

  return picked;
}

function deriveRegions(layout: StoredLayout, visibility: LayoutVisibility): LayoutRegion[] {
  const metrics = sanitizeMetrics(layout.metrics);
  const mainHeight = 100 - metrics.selfHeight;
  const leftWidth = metrics.leftWidth;
  const rightWidth = metrics.rightWidth;
  const rightX = 100 - rightWidth;
  const panelInset = metrics.panelInset;
  const panelGap = metrics.panelGap;
  const leftPanelWidth = Math.max(MIN_REGION_SIZE, leftWidth - panelInset * 2);
  const rightPanelWidth = Math.max(MIN_REGION_SIZE, rightWidth - panelInset * 2);
  const visibleLeftWidth = visibility.tradeOpen ? leftWidth : 0;
  const effectivePlayersHeight = playerRegionHeight(metrics, visibility.activePlayerCount);
  const tradingY = panelInset;
  const tradingHeight = Math.max(MIN_REGION_SIZE, mainHeight - tradingY - panelInset);
  const showBankTrades = visibility.showActions;
  const bankY = tradingY + tradingHeight - metrics.bankTradesHeight;
  const tradeMainAvailableHeight = showBankTrades
    ? Math.max(MIN_REGION_SIZE, bankY - tradingY - panelGap)
    : tradingHeight;
  const rightToolsY = panelInset;
  const logY = rightToolsY + metrics.rightToolsHeight + panelGap;
  const rightStackBottom = mainHeight - panelInset;
  const turnRegionY = mainHeight - metrics.statusHeight;
  const turnRegionWidth = Math.min(
    metrics.toastWidth,
    Math.max(MIN_REGION_SIZE, rightX - visibleLeftWidth),
  );
  const turnRegionX = rightX - turnRegionWidth;
  const playersY = rightStackBottom - effectivePlayersHeight;
  const collapsedLogAvailableHeight = Math.max(MIN_REGION_SIZE, playersY - logY - panelGap);
  const expandedLogAvailableHeight = Math.max(MIN_REGION_SIZE, mainHeight - logY - panelInset);
  const minimalLogHeight = Math.min(
    metrics.minimalLogHeight,
    collapsedLogAvailableHeight,
  );
  const visibleLogHeight = visibility.expandedLogOpen
    ? expandedLogAvailableHeight
    : minimalLogHeight;
  const toastRight = rightX;
  const toastWidth = metrics.toastWidth;
  const toastX = Math.max(visibleLeftWidth, toastRight - toastWidth);
  const cheatsY = Math.min(
    mainHeight - MIN_REGION_SIZE,
    metrics.toastHeight + panelGap,
  );
  const expandedCheatsHeight = Math.min(
    38,
    Math.max(MIN_REGION_SIZE, mainHeight - cheatsY),
  );
  const cheatsHeight = visibility.cheatsCollapsed
    ? Math.min(
        expandedCheatsHeight,
        Math.max(MIN_REGION_SIZE, CHEATS_COLLAPSED_HEIGHT),
      )
    : expandedCheatsHeight;
  const pendingTradesX = visibleLeftWidth;
  const pendingTradesWidth = Math.min(
    metrics.pendingTradesWidth,
    Math.max(MIN_REGION_SIZE, rightX - pendingTradesX - toastWidth),
  );
  const selfY = mainHeight;
  const selfItemY = selfY + metrics.bottomInset;
  const selfItemHeight = Math.max(MIN_REGION_SIZE, metrics.selfHeight - metrics.bottomInset * 2);
  const tradeX = metrics.bottomInset;
  const actionsX = visibility.showActions ? rightX : 100 - metrics.bottomInset;
  const actionAreaWidth = visibility.showActions
    ? Math.max(MIN_REGION_SIZE, 100 - metrics.bottomInset - actionsX)
    : metrics.actionsWidth;
  const handX = visibility.showTradeShortcut
    ? tradeX + metrics.tradeButtonWidth + metrics.panelGap
    : metrics.bottomInset;
  const handRight = visibility.showActions
    ? actionsX - metrics.panelGap
    : 100 - metrics.bottomInset;
  const handWidth = Math.max(MIN_REGION_SIZE, handRight - handX);

  const frames: Record<RegionId, LayoutFrame> = {
    board: frame(0, 0, 100, 100),
    "left-ui-region": frame(0, 0, leftWidth, mainHeight),
    "right-ui-region": frame(rightX, 0, rightWidth, mainHeight),
    self: frame(0, selfY, 100, metrics.selfHeight),
    "toast-region": frame(toastX, 0, toastWidth, metrics.toastHeight),
    cheats: frame(toastX, cheatsY, toastWidth, cheatsHeight),
    "pending-trades": frame(
      pendingTradesX,
      0,
      pendingTradesWidth,
      mainHeight,
    ),
    players: frame(rightX + panelInset, playersY, rightPanelWidth, effectivePlayersHeight),
    "turn-region": frame(
      turnRegionX,
      turnRegionY,
      turnRegionWidth,
      metrics.statusHeight,
    ),
    trading: frame(panelInset, tradingY, leftPanelWidth, tradingHeight),
    "trade-main": frame(
      panelInset,
      tradingY,
      leftPanelWidth,
      tradeMainAvailableHeight,
    ),
    "bank-trades": frame(
      panelInset,
      bankY,
      leftPanelWidth,
      metrics.bankTradesHeight,
    ),
    "right-tools": frame(
      rightX + panelInset,
      rightToolsY,
      rightPanelWidth,
      metrics.rightToolsHeight,
    ),
    log: frame(rightX + panelInset, logY, rightPanelWidth, visibleLogHeight),
    "minimal-log": frame(rightX + panelInset, logY, rightPanelWidth, minimalLogHeight),
    "expanded-log": frame(
      rightX + panelInset,
      logY,
      rightPanelWidth,
      expandedLogAvailableHeight,
    ),
    "trade-button": frame(
      tradeX,
      selfItemY,
      metrics.tradeButtonWidth,
      selfItemHeight,
    ),
    hand: frame(handX, selfItemY, handWidth, selfItemHeight),
    actions: frame(actionsX, selfItemY, actionAreaWidth, selfItemHeight),
  };

  const hiddenRegions = new Set<RegionId>();

  if (!visibility.tradeOpen) {
    hiddenRegions.add("left-ui-region");
    hiddenRegions.add("trading");
    hiddenRegions.add("trade-main");
    hiddenRegions.add("bank-trades");
  }

  if (!showBankTrades) {
    hiddenRegions.add("bank-trades");
  }

  if (!visibility.showTradeShortcut) {
    hiddenRegions.add("trade-button");
  }

  if (!visibility.showActions) {
    hiddenRegions.add("actions");
  }

  if (visibility.expandedLogOpen) {
    hiddenRegions.add("minimal-log");
    hiddenRegions.add("players");
  } else {
    hiddenRegions.add("expanded-log");
  }

  return REGION_ORDER.filter((id) => !hiddenRegions.has(id)).map((id) => {
    const base = DEFAULT_META[id];

    return {
      ...base,
      name: layout.names[id] ?? base.name,
      color: layout.colors[id] ?? base.color,
      frame: frames[id],
    };
  });
}

function sanitizeMetrics(metrics: LayoutMetrics): LayoutMetrics {
  const selfHeight = clamp(metrics.selfHeight, 14, 34);
  const panelInset = clamp(metrics.panelInset, 0.5, 5);
  const panelGap = clamp(metrics.panelGap, 0, 4);
  const bottomInset = clamp(metrics.bottomInset, 0.5, 4);
  let leftWidth = clamp(metrics.leftWidth, 18, 45);
  let rightWidth = clamp(metrics.rightWidth, 18, 45);

  if (leftWidth + rightWidth > 78) {
    const overflow = leftWidth + rightWidth - 78;
    leftWidth -= overflow / 2;
    rightWidth -= overflow / 2;
  }

  leftWidth = clamp(leftWidth, 18, 45);
  rightWidth = clamp(rightWidth, 18, 45);

  const mainHeight = 100 - selfHeight;
  const bankTradesHeight = clamp(metrics.bankTradesHeight, 5.5, 12);
  const playerRows = Math.max(1, Math.ceil(MAX_PLAYER_COUNT / MAX_PLAYER_COLUMNS));
  const minPlayersHeight = Math.max(9, playerRows * 12 + (playerRows - 1) * panelGap);
  const rightToolsHeight = clamp(metrics.rightToolsHeight, 4, 10);
  const minCollapsedLogHeight = 8;
  const rightStackAvailable = Math.max(
    minCollapsedLogHeight + 4 + minPlayersHeight,
    mainHeight - panelInset * 2 - rightToolsHeight - panelGap * 3,
  );
  const maxStatusHeight = Math.max(
    7,
    rightStackAvailable - minPlayersHeight - minCollapsedLogHeight,
  );
  const statusHeight = clamp(metrics.statusHeight, 7, Math.min(12, maxStatusHeight));
  const maxPlayersHeight = Math.max(
    minPlayersHeight,
    rightStackAvailable - statusHeight - minCollapsedLogHeight,
  );
  const playersHeight = clamp(
    metrics.playersHeight,
    minPlayersHeight,
    Math.min(28, maxPlayersHeight),
  );
  const collapsedLogAvailableHeight = Math.max(
    minCollapsedLogHeight,
    rightStackAvailable - statusHeight - playersHeight,
  );
  const maxLogHeight = Math.max(16, mainHeight - panelInset * 2 - panelGap - rightToolsHeight);
  const logHeight = clamp(metrics.logHeight, 16, maxLogHeight);
  const minimalLogHeight = clamp(
    metrics.minimalLogHeight,
    minCollapsedLogHeight,
    Math.min(24, collapsedLogAvailableHeight),
  );
  const maxSelfItemWidth = 100 - bottomInset * 2 - panelGap * 2 - MIN_REGION_SIZE;
  let tradeButtonWidth = clamp(metrics.tradeButtonWidth, 8, Math.min(24, maxSelfItemWidth));
  let actionsWidth = clamp(metrics.actionsWidth, 14, Math.min(38, maxSelfItemWidth));

  if (tradeButtonWidth + actionsWidth + panelGap * 2 > maxSelfItemWidth) {
    const overflow = tradeButtonWidth + actionsWidth + panelGap * 2 - maxSelfItemWidth;
    actionsWidth -= overflow;
  }

  actionsWidth = clamp(actionsWidth, 14, Math.min(38, maxSelfItemWidth));

  if (tradeButtonWidth + actionsWidth + panelGap * 2 > maxSelfItemWidth) {
    tradeButtonWidth = Math.max(8, maxSelfItemWidth - actionsWidth - panelGap * 2);
  }

  const centerGapWidth = Math.max(22, 100 - leftWidth - rightWidth);
  const toastWidth = clamp(metrics.toastWidth, 10, Math.min(18, centerGapWidth - 12));
  const toastHeight = clamp(metrics.toastHeight, 10, Math.max(10, mainHeight));
  const pendingTradesWidth = clamp(
    metrics.pendingTradesWidth,
    12,
    Math.min(36, centerGapWidth - toastWidth),
  );

  return {
    selfHeight,
    leftWidth,
    rightWidth,
    panelInset,
    panelGap,
    bottomInset,
    statusHeight,
    playersHeight,
    rightToolsHeight,
    logHeight,
    minimalLogHeight,
    bankTradesHeight,
    tradeButtonWidth,
    actionsWidth,
    toastWidth,
    toastHeight,
    pendingTradesWidth,
  };
}

function metricsForDrag(state: DragState, event: PointerEvent): LayoutMetrics {
  const xPercent = clamp(
    ((event.clientX - state.canvasRect.left) / state.canvasRect.width) * 100,
    0,
    100,
  );
  const yPercent = clamp(
    ((event.clientY - state.canvasRect.top) / state.canvasRect.height) * 100,
    0,
    100,
  );
  const metrics = sanitizeMetrics(state.startMetrics);
  const mainHeight = 100 - metrics.selfHeight;
  const rightX = 100 - metrics.rightWidth;
  const tradingBottom = mainHeight - metrics.panelInset;
  const rightToolsY = metrics.panelInset;
  const logY = rightToolsY + metrics.rightToolsHeight + metrics.panelGap;
  const turnRegionBottom = mainHeight;
  const playersBottom = mainHeight - metrics.panelInset;
  const toastRight = rightX;
  const pendingTradesX = metrics.leftWidth;

  switch (state.regionId) {
    case "left-ui-region":
      if (state.handle === "e") {
        metrics.leftWidth = xPercent;
      }
      break;
    case "right-ui-region":
      if (state.handle === "w") {
        metrics.rightWidth = 100 - xPercent;
      }
      break;
    case "self":
      if (state.handle === "n") {
        metrics.selfHeight = 100 - yPercent;
      }
      break;
    case "turn-region":
      if (state.handle === "n") {
        metrics.statusHeight = turnRegionBottom - yPercent;
      }
      break;
    case "players":
      if (state.handle === "n") {
        metrics.playersHeight = playersBottom - yPercent;
      }
      break;
    case "right-tools":
      if (state.handle === "s") {
        metrics.rightToolsHeight = yPercent - rightToolsY;
      }
      break;
    case "log":
    case "minimal-log":
      if (state.handle === "s") {
        metrics.minimalLogHeight = yPercent - logY;
      }
      break;
    case "expanded-log":
      break;
    case "bank-trades":
      if (state.handle === "n") {
        metrics.bankTradesHeight = tradingBottom - yPercent;
      }
      break;
    case "toast-region":
      if (state.handle === "w") {
        metrics.toastWidth = toastRight - xPercent;
      }
      if (state.handle === "s") {
        metrics.toastHeight = yPercent;
      }
      break;
    case "pending-trades":
      if (state.handle === "e") {
        metrics.pendingTradesWidth = xPercent - pendingTradesX;
      }
      break;
    case "trade-button":
      if (state.handle === "e") {
        metrics.tradeButtonWidth = xPercent - metrics.bottomInset;
      }
      break;
    case "actions":
      if (state.handle === "w") {
        metrics.rightWidth = 100 - xPercent;
      }
      break;
    case "cheats":
    case "board":
    case "trading":
    case "trade-main":
    case "hand":
      break;
  }

  return sanitizeMetrics(metrics);
}

function controlsForRegion(regionId: RegionId): LayoutMetricField[] {
  switch (regionId) {
    case "left-ui-region":
      return ["leftWidth"];
    case "right-ui-region":
      return ["rightWidth"];
    case "self":
      return ["selfHeight"];
    case "turn-region":
      return ["statusHeight"];
    case "players":
      return ["playersHeight"];
    case "right-tools":
      return ["rightToolsHeight"];
    case "log":
      return ["minimalLogHeight"];
    case "minimal-log":
      return ["minimalLogHeight"];
    case "expanded-log":
      return [];
    case "bank-trades":
      return ["bankTradesHeight"];
    case "toast-region":
      return ["toastWidth", "toastHeight"];
    case "cheats":
      return [];
    case "pending-trades":
      return ["pendingTradesWidth"];
    case "trade-button":
      return ["tradeButtonWidth"];
    case "actions":
      return ["rightWidth"];
    case "board":
    case "trading":
    case "trade-main":
    case "hand":
      return [];
  }
}

function resizeHandlesFor(regionId: RegionId): ResizeHandle[] {
  switch (regionId) {
    case "left-ui-region":
    case "pending-trades":
    case "trade-button":
      return ["e"];
    case "right-ui-region":
    case "actions":
      return ["w"];
    case "self":
    case "bank-trades":
    case "turn-region":
    case "players":
      return ["n"];
    case "right-tools":
    case "log":
    case "minimal-log":
      return ["s"];
    case "expanded-log":
    case "cheats":
      return [];
    case "toast-region":
      return ["w", "s"];
    case "board":
    case "trading":
    case "trade-main":
    case "hand":
      return [];
  }
}

function showRegionLabel(region: LayoutRegion): boolean {
  return region.kind === "map" || region.kind === "container";
}

function frame(x: number, y: number, width: number, height: number): LayoutFrame {
  return {
    x: roundMetric(x),
    y: roundMetric(y),
    width: roundMetric(width),
    height: roundMetric(height),
  };
}

function regionStyle(region: LayoutRegion): string {
  return [
    `left: ${region.frame.x}%`,
    `top: ${region.frame.y}%`,
    `width: ${region.frame.width}%`,
    `height: ${region.frame.height}%`,
    `z-index: ${region.zIndex}`,
    `--region-color: ${region.color}`,
  ].join("; ");
}

function resourceColor(resource: string): string {
  switch (resource) {
    case "Brick":
      return "#c96c4f";
    case "Lumber":
      return "#4f8e62";
    case "Ore":
      return "#7f8491";
    case "Grain":
      return "#d3ad52";
    case "Wool":
      return "#86b96c";
    default:
      return "#b6bdc8";
  }
}

function logToneColor(tone: LogTone): string {
  switch (tone) {
    case "gain":
      return "#71c88d";
    case "build":
      return "#e2b245";
    case "trade":
      return "#7fb1ff";
    case "info":
      return "#b6bdc8";
  }
}

function toastToneColor(tone: ToastTone): string {
  switch (tone) {
    case "success":
      return "#456f4f";
    case "warning":
      return "#8a6835";
    case "info":
      return "#526a76";
  }
}

function formatPercent(value: number): string {
  return `${roundMetric(value).toFixed(1)}%`;
}

function roundMetric(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

declare global {
  interface HTMLElementTagNameMap {
    "catan-app": CatanApp;
  }
}
