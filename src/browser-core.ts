// Browser entry: lightweight core only (no heavy integration deps).
// Use this for static frontend embeds via the UMD bundle.
export { Blackboard } from './Blackboard';
export type {
  Tool,
  Point,
  Stroke,
  Shape,
  TextElement,
  GraphConfig,
  BlackboardOptions,
  Element,
  Snapshot,
  Viewport,
  BoundingBox,
  SelectionBox,
} from './types';
export { createToolbar, updateToolbarState } from './toolbar';
