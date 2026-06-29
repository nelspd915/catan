import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";

const REGION_ORDER = [
  "board",
  "left-ui-region",
  "right-ui-region",
  "self",
  "toast-region",
  "status",
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
  | "roll"
  | "end-turn"
  | "build-road"
  | "build-settlement"
  | "build-city"
  | "buy-dev-card"
  | "play-dev-card"
  | "trade"
  | "move-robber";

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
}

interface DragState {
  regionId: RegionId;
  handle: ResizeHandle;
  startMetrics: LayoutMetrics;
  canvasRect: DOMRect;
}

interface MockPlayer {
  id: string;
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
  ports: string[];
}

interface MockAction {
  id: ActionKind;
  label: string;
  enabled: boolean;
  detail: string;
}

interface MockBankTrade {
  resource: string;
  cost: string;
  enabled: boolean;
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

interface StatusSnapshot {
  activePlayer: string;
  phase: string;
  dice: [number, number];
  prompt: string;
  round: number;
}

const STORAGE_KEY = "catan-layout-sandbox-v6";
const MIN_REGION_SIZE = 4;

const DEFAULT_METRICS: LayoutMetrics = {
  selfHeight: 22,
  leftWidth: 31.5,
  rightWidth: 26.5,
  panelInset: 2,
  panelGap: 1,
  bottomInset: 1.5,
  statusHeight: 6,
  playersHeight: 13,
  rightToolsHeight: 5.5,
  logHeight: 67.5,
  minimalLogHeight: 17,
  bankTradesHeight: 8,
  tradeButtonWidth: 13,
  actionsWidth: 27,
  toastWidth: 22,
  toastHeight: 25,
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
  status: {
    id: "status",
    name: "Status",
    color: "#356b75",
    kind: "panel",
    zIndex: 45,
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
  statusHeight: "Status height",
  playersHeight: "Players height",
  rightToolsHeight: "Right tools height",
  logHeight: "Log region height",
  minimalLogHeight: "Minimal log height",
  bankTradesHeight: "Bank trades height",
  tradeButtonWidth: "Trade button width",
  actionsWidth: "Actions width",
  toastWidth: "Toast region width",
  toastHeight: "Toast region height",
};

const MOCK_STATUS: StatusSnapshot = {
  activePlayer: "Alice",
  phase: "Main Turn",
  dice: [3, 5],
  prompt: "Build, trade, or end your turn.",
  round: 7,
};

const MOCK_PLAYERS: MockPlayer[] = [
  {
    id: "p1",
    name: "Alice",
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
    ports: ["3:1", "Ore"],
  },
  {
    id: "p2",
    name: "Ben",
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
    ports: ["Brick"],
  },
  {
    id: "p3",
    name: "Chloe",
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
    ports: ["Sheep"],
  },
  {
    id: "p4",
    name: "Drew",
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
    ports: ["3:1"],
  },
];

const MOCK_ACTIONS: MockAction[] = [
  {
    id: "roll",
    label: "Roll",
    enabled: false,
    detail: "Done",
  },
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
  {
    id: "play-dev-card",
    label: "Play Dev",
    enabled: false,
    detail: "None",
  },
  {
    id: "trade",
    label: "Trade",
    enabled: true,
    detail: "Offer",
  },
  {
    id: "move-robber",
    label: "Robber",
    enabled: false,
    detail: "No 7",
  },
  {
    id: "end-turn",
    label: "End",
    enabled: true,
    detail: "Ben",
  },
];

const MOCK_BANK_TRADES: MockBankTrade[] = [
  { resource: "Brick", cost: "4:1", enabled: true },
  { resource: "Lumber", cost: "3:1", enabled: true },
  { resource: "Ore", cost: "2:1", enabled: false },
  { resource: "Grain", cost: "4:1", enabled: true },
  { resource: "Wool", cost: "4:1", enabled: false },
];

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
    text: "Alice built a road toward the sheep port.",
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

const MOCK_TOASTS: MockToast[] = [
  {
    id: "t1",
    tone: "success",
    title: "Road placed",
    detail: "Select another action or end your turn.",
  },
  {
    id: "t2",
    tone: "warning",
    title: "Longest road contested",
    detail: "Ben is one road away.",
  },
  {
    id: "t3",
    tone: "info",
    title: "Trade reply",
    detail: "Chloe sent a counter offer.",
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
  private ctrlPressed = false;

  @state()
  private selectedActionId: ActionKind = "build-road";

  @state()
  private selectedPlayerId = "p1";

  @state()
  private expandedLogOpen = false;

  @state()
  private tradeOpen = true;

  private dragState: DragState | null = null;

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
      grid-template-columns: 0.9fr 0.95fr 0.9fr 0.7fr 1.45fr;
      gap: 6px;
      padding: 7px;
      overflow: hidden;
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
      grid-template-columns: repeat(4, minmax(0, 1fr));
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
    .player-ports,
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
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      padding: 8px;
      overflow: hidden;
    }

    .trade-block {
      display: grid;
      min-width: 0;
      min-height: 0;
      grid-template-rows: auto auto 1fr;
      gap: 7px;
      padding: 8px;
      overflow: hidden;
    }

    .trade-title {
      overflow: hidden;
      font-size: 0.68rem;
      font-weight: 900;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .resource-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 5px;
      min-width: 0;
    }

    .resource-pill {
      min-width: 0;
      padding: 5px 6px;
      overflow: hidden;
      color: rgba(255, 255, 255, 0.8);
      font-size: 0.62rem;
      font-weight: 900;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .bank-trades-shell {
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
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-rows: auto auto;
      gap: 2px 5px;
      align-content: center;
      padding: 6px;
      overflow: hidden;
      text-align: left;
    }

    .bank-trade-button:disabled {
      color: rgba(255, 255, 255, 0.42);
      background: rgba(0, 0, 0, 0.14);
    }

    .resource-mark {
      grid-row: 1 / 3;
      width: 10px;
      border-radius: 999px;
      background: var(--resource-color);
    }

    .bank-resource,
    .bank-cost {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .bank-resource {
      font-size: 0.66rem;
      font-weight: 900;
    }

    .bank-cost {
      color: rgba(255, 255, 255, 0.64);
      font-size: 0.58rem;
      font-weight: 800;
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
      gap: 8px;
      padding: 8px;
      overflow: hidden;
    }

    .toast {
      display: grid;
      min-width: 0;
      gap: 3px;
      padding: 8px 9px;
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

    .actions-grid {
      display: grid;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 7px;
      padding: 9px;
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
  }

  disconnectedCallback() {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    this.removeDragListeners();
    super.disconnectedCallback();
  }

  render() {
    const regions = deriveRegions(this.layout, {
      tradeOpen: this.tradeOpen,
      expandedLogOpen: this.expandedLogOpen,
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
      case "status":
        return this.renderStatusRegion();
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

  private renderStatusRegion() {
    const diceTotal = MOCK_STATUS.dice[0] + MOCK_STATUS.dice[1];

    return html`
      <div class="status-shell">
        ${this.renderStatCell("Turn", MOCK_STATUS.activePlayer)}
        ${this.renderStatCell("Phase", MOCK_STATUS.phase)}
        ${this.renderStatCell("Dice", `${MOCK_STATUS.dice.join("+")}=${diceTotal}`)}
        ${this.renderStatCell("Round", String(MOCK_STATUS.round))}
        <div class="status-prompt">${MOCK_STATUS.prompt}</div>
      </div>
    `;
  }

  private renderStatCell(label: string, value: string) {
    return html`
      <div class="stat-cell">
        <span class="stat-label">${label}</span>
        <span class="stat-value">${value}</span>
      </div>
    `;
  }

  private renderPlayersRegion() {
    return html`
      <div class="players-grid">
        ${MOCK_PLAYERS.map((player) => this.renderPlayer(player))}
      </div>
    `;
  }

  private renderPlayer(player: MockPlayer) {
    const classes = [
      "player-tile",
      player.isActive ? "active" : "",
      this.selectedPlayerId === player.id ? "selected" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const ports = player.ports.join("/");

    return html`
      <button
        class=${classes}
        type="button"
        style=${`--player-color: ${player.color}`}
        @click=${() => {
          this.selectedPlayerId = player.id;
        }}
      >
        <span class="player-color-bar" aria-hidden="true"></span>
        <span class="player-name-line">
          <span class="player-name">${player.name}</span>
          ${player.isYou ? html`<span class="tag">You</span>` : html``}
          ${player.isActive ? html`<span class="tag">Turn</span>` : html``}
        </span>
        <span class="player-metrics">
          ${player.victoryPoints}VP ${player.resources}R ${player.devCards}D
        </span>
        <span class="player-pieces">
          Rd${player.roads} S${player.settlements} C${player.cities} A${player.army}
        </span>
        <span class="player-ports">${ports}</span>
      </button>
    `;
  }

  private renderTradeMainRegion() {
    return html`
      <div class="trade-main-shell">
        <section class="trade-block">
          <span class="trade-title">Offer</span>
          <div class="resource-grid">
            ${["Brick x2", "Lumber x1", "Ore x0", "Grain x1"].map(
              (item) => html`<span class="resource-pill">${item}</span>`,
            )}
          </div>
          <span class="trade-text">Draft resources to send.</span>
        </section>
        <section class="trade-block">
          <span class="trade-title">Request</span>
          <div class="resource-grid">
            ${["Sheep x1", "Ore x1", "Any x0", "Port x1"].map(
              (item) => html`<span class="resource-pill">${item}</span>`,
            )}
          </div>
          <span class="trade-text">Target player or table offer.</span>
        </section>
        <section class="trade-block">
          <span class="trade-title">Responses</span>
          <div class="resource-grid">
            ${["Ben ok", "Chloe counter", "Drew no", "Bank open"].map(
              (item) => html`<span class="resource-pill">${item}</span>`,
            )}
          </div>
          <span class="trade-text">Mock response slots.</span>
        </section>
      </div>
    `;
  }

  private renderBankTradesRegion() {
    return html`
      <div class="bank-trades-shell">
        ${MOCK_BANK_TRADES.map(
          (trade) => html`
            <button
              class="bank-trade-button"
              type="button"
              style=${`--resource-color: ${resourceColor(trade.resource)}`}
              ?disabled=${!trade.enabled}
            >
              <span class="resource-mark" aria-hidden="true"></span>
              <span class="bank-resource">${trade.resource}</span>
              <span class="bank-cost">${trade.cost}</span>
            </button>
          `,
        )}
      </div>
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
        ${MOCK_TOASTS.map(
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
    return html`
      <div class="hand-shell">
        <header class="hand-header">
          <span class="hand-title">${region.name}</span>
          <span class="hand-counts">
            <span class="tag">9 resources</span>
            <span class="tag">1 dev</span>
          </span>
        </header>
        <div class="hand-grid">
          ${["Brick", "Lumber", "Ore", "Grain", "Wool"].map(
            (slot) => html`<div class="hand-slot">${slot}</div>`,
          )}
        </div>
      </div>
    `;
  }

  private renderActionsRegion() {
    return html`
      <div class="actions-grid">
        ${MOCK_ACTIONS.map((action) => {
          const active = this.selectedActionId === action.id;
          return html`
            <button
              class=${active ? "action-button active" : "action-button"}
              type="button"
              ?disabled=${!action.enabled}
              @click=${() => {
                this.selectedActionId = action.id;
              }}
            >
              <span class="action-label">${action.label}</span>
              <span class="action-detail">${action.detail}</span>
            </button>
          `;
        })}
      </div>
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
            ${(["statusHeight", "playersHeight", "bankTradesHeight"] as const).map(
              (field) => this.renderMetricInput(field),
            )}
          </div>

          <div class="settings-section">
            <h2 class="settings-heading">Right UI</h2>
            ${([
              "rightToolsHeight",
              "logHeight",
              "minimalLogHeight",
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
    this.tradeOpen = !this.tradeOpen;
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
  const statusY = panelInset;
  const playersY = statusY + metrics.statusHeight + panelGap;
  const tradingY = playersY + metrics.playersHeight + panelGap;
  const tradingHeight = Math.max(MIN_REGION_SIZE, mainHeight - tradingY - panelInset);
  const bankY = tradingY + tradingHeight - metrics.bankTradesHeight;
  const tradeMainAvailableHeight = Math.max(MIN_REGION_SIZE, bankY - tradingY - panelGap);
  const rightToolsY = panelInset;
  const logY = rightToolsY + metrics.rightToolsHeight + panelGap;
  const expandedLogAvailableHeight = Math.max(
    MIN_REGION_SIZE,
    Math.min(metrics.logHeight, mainHeight - logY - panelInset),
  );
  const minimalLogHeight = Math.min(
    metrics.minimalLogHeight,
    Math.max(MIN_REGION_SIZE, expandedLogAvailableHeight),
  );
  const visibleLogHeight = visibility.expandedLogOpen
    ? expandedLogAvailableHeight
    : minimalLogHeight;
  const toastRight = rightX - panelGap;
  const toastWidth = metrics.toastWidth;
  const toastX = Math.max(leftWidth + panelGap, toastRight - toastWidth);
  const selfY = mainHeight;
  const selfItemY = selfY + metrics.bottomInset;
  const selfItemHeight = Math.max(MIN_REGION_SIZE, metrics.selfHeight - metrics.bottomInset * 2);
  const tradeX = metrics.bottomInset;
  const actionsX = 100 - metrics.bottomInset - metrics.actionsWidth;
  const handX = tradeX + metrics.tradeButtonWidth + metrics.panelGap;
  const handRight = actionsX - metrics.panelGap;
  const handWidth = Math.max(MIN_REGION_SIZE, handRight - handX);

  const frames: Record<RegionId, LayoutFrame> = {
    board: frame(0, 0, 100, 100),
    "left-ui-region": frame(0, 0, leftWidth, mainHeight),
    "right-ui-region": frame(rightX, 0, rightWidth, mainHeight),
    self: frame(0, selfY, 100, metrics.selfHeight),
    "toast-region": frame(toastX, 0, toastWidth, metrics.toastHeight),
    status: frame(panelInset, statusY, leftPanelWidth, metrics.statusHeight),
    players: frame(panelInset, playersY, leftPanelWidth, metrics.playersHeight),
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
    actions: frame(actionsX, selfItemY, metrics.actionsWidth, selfItemHeight),
  };

  const hiddenRegions = new Set<RegionId>();

  if (!visibility.tradeOpen) {
    hiddenRegions.add("trading");
    hiddenRegions.add("trade-main");
    hiddenRegions.add("bank-trades");
  }

  if (visibility.expandedLogOpen) {
    hiddenRegions.add("minimal-log");
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
  const playerRows = Math.max(1, Math.ceil(MOCK_PLAYERS.length / 4));
  const minPlayersHeight = Math.max(9, playerRows * 12 + (playerRows - 1) * panelGap);
  const minTradingHeight = bankTradesHeight + panelGap + MIN_REGION_SIZE;
  const maxStatusHeight = Math.max(
    4,
    mainHeight - panelInset * 2 - panelGap * 2 - minPlayersHeight - minTradingHeight,
  );
  const statusHeight = clamp(metrics.statusHeight, 4, Math.min(10, maxStatusHeight));
  const maxPlayersHeight = Math.max(
    minPlayersHeight,
    mainHeight - panelInset * 2 - panelGap * 2 - statusHeight - minTradingHeight,
  );
  const playersHeight = clamp(
    metrics.playersHeight,
    minPlayersHeight,
    Math.min(28, maxPlayersHeight),
  );
  const rightToolsHeight = clamp(metrics.rightToolsHeight, 4, 10);
  const maxLogHeight = Math.max(12, mainHeight - panelInset * 2 - panelGap - rightToolsHeight);
  const logHeight = clamp(metrics.logHeight, 16, maxLogHeight);
  const minimalLogHeight = clamp(
    metrics.minimalLogHeight,
    8,
    Math.min(24, Math.max(8, logHeight)),
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

  const centerGapWidth = Math.max(12, 100 - leftWidth - rightWidth - panelGap * 2);
  const toastWidth = clamp(metrics.toastWidth, 12, Math.min(32, centerGapWidth));
  const toastHeight = clamp(metrics.toastHeight, 10, Math.max(10, mainHeight));

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
  const statusY = metrics.panelInset;
  const playersY = statusY + metrics.statusHeight + metrics.panelGap;
  const tradingBottom = mainHeight - metrics.panelInset;
  const rightToolsY = metrics.panelInset;
  const logY = rightToolsY + metrics.rightToolsHeight + metrics.panelGap;
  const toastRight = rightX - metrics.panelGap;

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
    case "status":
      if (state.handle === "s") {
        metrics.statusHeight = yPercent - metrics.panelInset;
      }
      break;
    case "players":
      if (state.handle === "s") {
        metrics.playersHeight = yPercent - playersY;
      }
      break;
    case "right-tools":
      if (state.handle === "s") {
        metrics.rightToolsHeight = yPercent - rightToolsY;
      }
      break;
    case "log":
      if (state.handle === "s") {
        metrics.logHeight = yPercent - logY;
      }
      break;
    case "minimal-log":
      if (state.handle === "s") {
        metrics.minimalLogHeight = yPercent - logY;
      }
      break;
    case "expanded-log":
      if (state.handle === "s") {
        metrics.logHeight = yPercent - logY;
      }
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
    case "trade-button":
      if (state.handle === "e") {
        metrics.tradeButtonWidth = xPercent - metrics.bottomInset;
      }
      break;
    case "actions":
      if (state.handle === "w") {
        metrics.actionsWidth = 100 - metrics.bottomInset - xPercent;
      }
      break;
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
    case "status":
      return ["statusHeight"];
    case "players":
      return ["playersHeight"];
    case "right-tools":
      return ["rightToolsHeight"];
    case "log":
      return ["logHeight"];
    case "minimal-log":
      return ["minimalLogHeight"];
    case "expanded-log":
      return ["logHeight"];
    case "bank-trades":
      return ["bankTradesHeight"];
    case "toast-region":
      return ["toastWidth", "toastHeight"];
    case "trade-button":
      return ["tradeButtonWidth"];
    case "actions":
      return ["actionsWidth"];
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
    case "trade-button":
      return ["e"];
    case "right-ui-region":
    case "actions":
      return ["w"];
    case "self":
    case "bank-trades":
      return ["n"];
    case "status":
    case "players":
    case "right-tools":
    case "log":
    case "minimal-log":
    case "expanded-log":
      return ["s"];
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
