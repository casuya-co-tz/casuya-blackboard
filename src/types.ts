export type Tool = 'select' | 'hand' | 'pen' | 'text' | 'line' | 'rect' | 'circle' | 'arrow' | 'eraser';

export interface Point {
  x: number;
  y: number;
  pressure?: number;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Stroke {
  id: string;
  tool: 'pen' | 'eraser';
  points: Point[];
  color: string;
  width: number;
  opacity: number;
  createdAt?: number;
  zIndex?: number;
  groupId?: string;
  rotation?: number;
}

export interface Shape {
  id: string;
  tool: 'line' | 'rect' | 'circle' | 'arrow';
  start: Point;
  end: Point;
  color: string;
  width: number;
  opacity: number;
  createdAt?: number;
  filled?: boolean;
  dashPattern?: number[];
  cornerRadius?: number;
  roughness?: number;
  zIndex?: number;
  groupId?: string;
  rotation?: number;
}

export interface TextElement {
  id: string;
  tool: 'text';
  position: Point;
  content: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  width: number;
  opacity: number;
  createdAt?: number;
  zIndex?: number;
  groupId?: string;
  rotation?: number;
}

export interface ImageElement {
  id: string;
  tool: 'image';
  position: Point;
  width: number;
  height: number;
  src: string;
  opacity: number;
  createdAt?: number;
  zIndex?: number;
  groupId?: string;
  rotation?: number;
}

export interface GraphConfig {
  enabled: boolean;
  spacing: number;
  color: string;
  showAxes: boolean;
  showLabels: boolean;
}

export interface BlackboardOptions {
  container: HTMLElement;
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
  graph?: Partial<GraphConfig>;
  theme?: 'light' | 'dark';
}

export type Element = Stroke | Shape | TextElement | ImageElement;

export interface Snapshot {
  elements: Element[];
  width: number;
  height: number;
  camera?: Camera;
}

export type BlackboardEvent =
  | 'change'
  | 'toolchange'
  | 'undo'
  | 'redo'
  | 'clear'
  | 'save'
  | 'load';

export type BlackboardEventCallback = (payload: { elements: Element[]; tool?: Tool }) => void;

/** Shared toolbar DOM element references used by both Blackboard and toolbar module. */
export interface ToolbarElements {
  bar: HTMLDivElement;
  toolButtons: Map<Tool, HTMLButtonElement>;
  undoBtn: HTMLButtonElement;
  redoBtn: HTMLButtonElement;
  graphBtn: HTMLButtonElement;
  fillBtn: HTMLButtonElement;
  themeBtn: HTMLButtonElement;
  roughnessBtn: HTMLButtonElement;
  groupBtn: HTMLButtonElement;
  ungroupBtn: HTMLButtonElement;
  rotateBtn: HTMLButtonElement;
  svgBtn: HTMLButtonElement;
  widthLabel: HTMLSpanElement;
  widthDot: HTMLDivElement;
  colorInput: HTMLInputElement;
  zoomLabel: HTMLSpanElement;
}

/**
 * Public API surface that the toolbar calls on the Blackboard instance.
 * Keeps the toolbar decoupled from the concrete Blackboard class.
 */
export interface BlackboardAPI {
  getTool(): Tool;
  setTool(tool: Tool): void;
  getColor(): string;
  setColor(color: string): void;
  getWidth(): number;
  setWidth(width: number): void;
  getFill(): boolean;
  setFill(enabled: boolean): void;
  getTheme(): 'light' | 'dark';
  setTheme(theme: 'light' | 'dark'): void;
  getZoom(): number;
  zoomTo(level: number, center?: Point): void;
  resetView(): void;
  isGraphEnabled(): boolean;
  undo(): void;
  redo(): void;
  clear(): void;
  enableGraph(options?: Partial<GraphConfig>): void;
  disableGraph(): void;
  saveToStorage(key?: string): void;
  showToast(msg: string): void;
  bringForward(): void;
  sendBackward(): void;
  bringToFront(): void;
  sendToBack(): void;
  duplicateSelected(): void;
  rotateSelected(angle: number): void;
  getSelectedRotation(): number;
  getFontSize(): number;
  setFontSize(size: number): void;
  getRoughness(): number;
  setRoughness(level: number): void;
  selectAll(): void;
  groupSelected(): void;
  ungroupSelected(): void;
  exportSVG(): string;
}
