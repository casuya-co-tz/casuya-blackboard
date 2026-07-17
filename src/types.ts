export type Tool = 'pen' | 'line' | 'rect' | 'circle' | 'arrow' | 'eraser';

export interface Point {
  x: number;
  y: number;
  pressure?: number;
}

export interface Stroke {
  id: string;
  tool: 'pen' | 'eraser';
  points: Point[];
  color: string;
  width: number;
  opacity: number;
  createdAt?: number;
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
}

export type Element = Stroke | Shape;

export interface Snapshot {
  elements: Element[];
  width: number;
  height: number;
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
