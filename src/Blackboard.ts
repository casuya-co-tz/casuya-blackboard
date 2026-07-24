import { getStroke } from 'perfect-freehand';
import type { Tool, Point, Stroke, Shape, TextElement, ImageElement, GraphConfig, BlackboardOptions, Element, Snapshot, BlackboardEvent, BlackboardEventCallback, Camera, ToolbarElements, BlackboardAPI } from './types';
import { createToolbar, updateToolbarState } from './toolbar';

const THEMES = {
  light: { canvasBg: '#ffffff', gridColor: '#e2e8f0', gridAxisColor: '#94a3b8', gridLabelColor: '#64748b', hintColor: '#cbd5e1', selectionColor: '#3b82f6', selectionFill: 'rgba(59, 130, 246, 0.1)' },
  dark: { canvasBg: '#1e1e2e', gridColor: '#313244', gridAxisColor: '#585b70', gridLabelColor: '#6c7086', hintColor: '#45475a', selectionColor: '#89b4fa', selectionFill: 'rgba(137, 180, 250, 0.1)' },
};

function getSvgPathFromStroke(points: number[][]): string {
  if (points.length < 2) return '';
  const max = points.length - 1;
  let d = `M${points[0][0].toFixed(2)},${points[0][1].toFixed(2)}`;
  for (let i = 1; i < max; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    d += ` Q${p0[0].toFixed(2)},${p0[1].toFixed(2)} ${((p0[0] + p1[0]) / 2).toFixed(2)},${((p0[1] + p1[1]) / 2).toFixed(2)}`;
  }
  if (points.length > 1) {
    const last = points[points.length - 1];
    d += ` L${last[0].toFixed(2)},${last[1].toFixed(2)}`;
  }
  return d;
}

export class Blackboard implements BlackboardAPI {
  private container: HTMLElement;
  private root: HTMLDivElement;
  private canvasWrapper: HTMLDivElement;
  private staticCanvas: HTMLCanvasElement;
  private liveCanvas: HTMLCanvasElement;
  private staticCtx: CanvasRenderingContext2D;
  private liveCtx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private dpr: number;

  private activeTool: Tool = 'pen';
  private strokeColor = '#1e293b';
  private strokeWidth = 2;
  private strokeOpacity = 1;
  private fillEnabled = false;

  private elements: Element[] = [];
  private undoStack: Element[][] = [];
  private redoStack: Element[][] = [];
  private static readonly MAX_UNDO = 50;

  private currentElement: Element | null = null;
  private isDrawing = false;

  private graph: GraphConfig;
  private animFrameId: number | null = null;
  private dirty = false;

  private toolbar: ToolbarElements;
  private listeners: Map<string, Set<BlackboardEventCallback>> = new Map();

  private theme: 'light' | 'dark' = 'light';
  private camera: Camera = { x: 0, y: 0, zoom: 1 };
  private selectedIds: Set<string> = new Set();
  private dragState: { type: 'move' | 'resize'; startWorld: Point; origElements: Element[]; handle?: string } | null = null;
  private isSpaceDown = false;
  private isPanning = false;
  private panStart = { x: 0, y: 0 };
  private panCameraStart = { x: 0, y: 0 };
  private textInput: HTMLTextAreaElement | null = null;
  private editingTextId: string | null = null;
  private activePointerId: number | null = null;
  private activePointerType: string = 'mouse';
  private lastPointerWorld: Point | null = null;

  private activePointers: Map<number, { x: number; y: number; type: string }> = new Map();
  private pinchStartDist = 0;
  private pinchStartZoom = 1;
  private pinchCenter: Point = { x: 0, y: 0 };
  private contextMenu: HTMLDivElement | null = null;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressStart: Point | null = null;

  private boundHandleImagePaste: (e: ClipboardEvent) => void;
  private boundHandleDragOver: (e: DragEvent) => void;
  private boundHandleFileDrop: (e: DragEvent) => void;

  private fontSize = 18;
  private clipboard: Element[] = [];
  private roughness = 0;
  private alignmentGuides: { x?: number; y?: number } = {};
  private imageCache = new Map<string, HTMLImageElement>();

  constructor(options: BlackboardOptions) {
    this.container = options.container;
    this.width = options.width || this.container.clientWidth || 800;
    this.height = options.height || this.container.clientHeight || 600;
    this.dpr = window.devicePixelRatio || 1;
    this.strokeColor = options.color || '#1e293b';
    this.strokeWidth = options.strokeWidth || 2;
    this.theme = options.theme || 'light';

    this.boundHandleImagePaste = this.handleImagePaste.bind(this);
    this.boundHandleDragOver = this.handleDragOver.bind(this);
    this.boundHandleFileDrop = this.handleFileDrop.bind(this);

    this.graph = {
      enabled: options.graph?.enabled ?? false,
      spacing: options.graph?.spacing ?? 25,
      color: options.graph?.color ?? '#e2e8f0',
      showAxes: options.graph?.showAxes ?? true,
      showLabels: options.graph?.showLabels ?? true,
    };

    this.root = document.createElement('div');
    this.root.className = 'casuya-blackboard';
    this.root.style.cssText = `
      display: flex;
      flex-direction: column;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04);
      background: ${THEMES[this.theme].canvasBg};
      font-family: system-ui, -apple-system, sans-serif;
      user-select: none;
      width: 100%;
      height: 100%;
    `;

    this.canvasWrapper = document.createElement('div');
    this.canvasWrapper.style.cssText = 'position: relative; overflow: hidden; flex: 1;';

    this.staticCanvas = document.createElement('canvas');
    this.liveCanvas = document.createElement('canvas');

    [this.staticCanvas, this.liveCanvas].forEach(c => {
      c.style.cssText = `
        position: absolute; top: 0; left: 0;
        width: 100%; height: 100%;
        touch-action: none;
      `;
    });

    this.staticCanvas.style.zIndex = '0';
    this.liveCanvas.style.zIndex = '1';

    this.canvasWrapper.appendChild(this.staticCanvas);
    this.canvasWrapper.appendChild(this.liveCanvas);

    this.toolbar = createToolbar(this);
    this.root.appendChild(this.toolbar.bar);
    this.root.appendChild(this.canvasWrapper);
    this.container.appendChild(this.root);

    if (!this.container.style.position) {
      this.container.style.position = 'relative';
    }

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(entries => {
        for (const entry of entries) {
          const { width: w, height: h } = entry.contentRect;
          if (w > 0 && h > 0) {
            this.resize(Math.floor(w), Math.floor(h));
          }
        }
      });
      ro.observe(this.container);
    }

    this.staticCtx = this.staticCanvas.getContext('2d')!;
    this.liveCtx = this.liveCanvas.getContext('2d')!;

    this.setupCanvases();
    this.attachEvents();
    this.setTool('pen');
    this.renderAll();
    this.updateToolbar();
    setTimeout(() => this.showToast('Select a tool and start drawing'), 600);
  }

  private pushUndo(): void {
    this.undoStack.push(JSON.parse(JSON.stringify(this.elements)));
    if (this.undoStack.length > Blackboard.MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
  }

  private screenToWorld(screenX: number, screenY: number): Point {
    return { x: screenX / this.camera.zoom + this.camera.x, y: screenY / this.camera.zoom + this.camera.y };
  }

  private worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return { x: (wx - this.camera.x) * this.camera.zoom, y: (wy - this.camera.y) * this.camera.zoom };
  }

  private snapToGrid(point: Point): Point {
    if (!this.graph.enabled) return point;
    const s = this.graph.spacing;
    return { x: Math.round(point.x / s) * s, y: Math.round(point.y / s) * s };
  }

  private findNearestConnectionPoint(point: Point, excludeId?: string): Point | null {
    let bestDist = 30 / this.camera.zoom;
    let bestPoint: Point | null = null;
    for (const el of this.elements) {
      if (el.id === excludeId) continue;
      const bounds = this.getElementBounds(el);
      const cx = bounds.x + bounds.w / 2;
      const cy = bounds.y + bounds.h / 2;
      const dist = Math.hypot(point.x - cx, point.y - cy);
      if (dist < bestDist) {
        bestDist = dist;
        bestPoint = { x: cx, y: cy };
      }
    }
    return bestPoint;
  }

  private catmullRomInterpolate(points: Point[], tension = 0.5): Point[] {
    if (points.length < 2) return [...points];
    const result: Point[] = [points[0]];
    const alpha = 0.5 + tension * 0.5;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[Math.min(points.length - 1, i + 1)];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      const steps = 3;
      for (let t = 1; t <= steps; t++) {
        const tt = t / steps;
        const tt2 = tt * tt;
        const tt3 = tt2 * tt;
        const x = alpha * (
          (2 * p1.x) +
          (-p0.x + p2.x) * tt +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * tt2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * tt3
        );
        const y = alpha * (
          (2 * p1.y) +
          (-p0.y + p2.y) * tt +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * tt2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * tt3
        );
        result.push({ x, y });
      }
    }
    return result;
  }

  private findNearestEdgePoint(point: Point, excludeId?: string): Point | null {
    let bestDist = 30 / this.camera.zoom;
    let bestPoint: Point | null = null;
    for (const el of this.elements) {
      if (el.id === excludeId) continue;
      if (el.tool === 'pen' || el.tool === 'eraser') continue;
      const bounds = this.getElementBounds(el);
      const rx = bounds.x;
      const ry = bounds.y;
      const rw = bounds.w;
      const rh = bounds.h;
      if (rw <= 0 && rh <= 0) continue;
      const candidates: Point[] = [];
      if (rw > 0) {
        candidates.push({ x: rx, y: this.clamp(point.y, ry, ry + rh) });
        candidates.push({ x: rx + rw, y: this.clamp(point.y, ry, ry + rh) });
      }
      if (rh > 0) {
        candidates.push({ x: this.clamp(point.x, rx, rx + rw), y: ry });
        candidates.push({ x: this.clamp(point.x, rx, rx + rw), y: ry + rh });
      }
      for (const c of candidates) {
        const dist = Math.hypot(point.x - c.x, point.y - c.y);
        if (dist < bestDist) {
          bestDist = dist;
          bestPoint = c;
        }
      }
    }
    return bestPoint;
  }

  private clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
  }

  private findAlignmentGuides(movingBounds: { x: number; y: number; w: number; h: number }, excludeId?: string): { x?: number; y?: number } {
    const guides: { x?: number; y?: number } = {};
    const threshold = 5 / this.camera.zoom;
    const movingEdges = {
      left: movingBounds.x,
      right: movingBounds.x + movingBounds.w,
      cx: movingBounds.x + movingBounds.w / 2,
      top: movingBounds.y,
      bottom: movingBounds.y + movingBounds.h,
      cy: movingBounds.y + movingBounds.h / 2,
    };

    let bestXDist = threshold;
    let bestYDist = threshold;

    for (const el of this.elements) {
      if (excludeId && el.id === excludeId) continue;
      if (this.selectedIds.has(el.id) && el.id !== excludeId) continue;
      const b = this.getElementBounds(el);
      const otherEdges = {
        left: b.x,
        right: b.x + b.w,
        cx: b.x + b.w / 2,
        top: b.y,
        bottom: b.y + b.h,
        cy: b.y + b.h / 2,
      };

      const xChecks = [otherEdges.left, otherEdges.right, otherEdges.cx];
      const movingXChecks = [movingEdges.left, movingEdges.right, movingEdges.cx];
      for (const ox of xChecks) {
        for (const mx of movingXChecks) {
          const d = Math.abs(mx - ox);
          if (d < bestXDist) {
            bestXDist = d;
            guides.x = ox - (mx - movingBounds.x);
          }
        }
      }

      const yChecks = [otherEdges.top, otherEdges.bottom, otherEdges.cy];
      const movingYChecks = [movingEdges.top, movingEdges.bottom, movingEdges.cy];
      for (const oy of yChecks) {
        for (const my of movingYChecks) {
          const d = Math.abs(my - oy);
          if (d < bestYDist) {
            bestYDist = d;
            guides.y = oy - (my - movingBounds.y);
          }
        }
      }
    }
    return guides;
  }

  private drawAlignmentGuides(ctx: CanvasRenderingContext2D): void {
    if (!this.alignmentGuides.x && !this.alignmentGuides.y) return;
    const vl = this.camera.x;
    const vt = this.camera.y;
    const vr = this.camera.x + this.width / this.camera.zoom;
    const vb = this.camera.y + this.height / this.camera.zoom;
    ctx.save();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1 / this.camera.zoom;
    ctx.setLineDash([4 / this.camera.zoom, 4 / this.camera.zoom]);
    if (this.alignmentGuides.x !== undefined) {
      const x = this.alignmentGuides.x;
      ctx.beginPath();
      ctx.moveTo(x, vt);
      ctx.lineTo(x, vb);
      ctx.stroke();
    }
    if (this.alignmentGuides.y !== undefined) {
      const y = this.alignmentGuides.y;
      ctx.beginPath();
      ctx.moveTo(vl, y);
      ctx.lineTo(vr, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  private setupCanvases(): void {
    [this.staticCanvas, this.liveCanvas].forEach(c => {
      c.width = this.width * this.dpr;
      c.height = this.height * this.dpr;
      c.getContext('2d')!.scale(this.dpr, this.dpr);
    });
  }

  private attachEvents(): void {
    this.liveCanvas.addEventListener('pointerdown', this.onPointerDown);
    this.liveCanvas.addEventListener('pointermove', this.onPointerMove);
    this.liveCanvas.addEventListener('pointerup', this.onPointerUp);
    this.liveCanvas.addEventListener('pointerleave', this.onPointerUp);
    this.liveCanvas.addEventListener('pointercancel', this.onPointerUp);
    this.liveCanvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.liveCanvas.addEventListener('contextmenu', this.onContextMenu);
    this.liveCanvas.addEventListener('dragover', this.boundHandleDragOver);
    this.liveCanvas.addEventListener('drop', this.boundHandleFileDrop);
    window.addEventListener('paste', this.boundHandleImagePaste);
    window.addEventListener('click', this.onWindowClick);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  private detachEvents(): void {
    this.liveCanvas.removeEventListener('pointerdown', this.onPointerDown);
    this.liveCanvas.removeEventListener('pointermove', this.onPointerMove);
    this.liveCanvas.removeEventListener('pointerup', this.onPointerUp);
    this.liveCanvas.removeEventListener('pointerleave', this.onPointerUp);
    this.liveCanvas.removeEventListener('pointercancel', this.onPointerUp);
    this.liveCanvas.removeEventListener('wheel', this.onWheel);
    this.liveCanvas.removeEventListener('contextmenu', this.onContextMenu);
    this.liveCanvas.removeEventListener('dragover', this.boundHandleDragOver);
    this.liveCanvas.removeEventListener('drop', this.boundHandleFileDrop);
    window.removeEventListener('paste', this.boundHandleImagePaste);
    window.removeEventListener('click', this.onWindowClick);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  private getPoint = (e: PointerEvent): Point => {
    const rect = this.liveCanvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    return { ...this.screenToWorld(sx, sy), pressure: e.pressure };
  };

  private hitTest(worldPoint: Point): Element | null {
    for (let i = this.elements.length - 1; i >= 0; i--) {
      const el = this.elements[i];
      const bounds = this.getElementBounds(el);
      const pad = 8 / this.camera.zoom;
      if (
        worldPoint.x >= bounds.x - pad &&
        worldPoint.x <= bounds.x + bounds.w + pad &&
        worldPoint.y >= bounds.y - pad &&
        worldPoint.y <= bounds.y + bounds.h + pad
      ) {
        if (el.tool === 'pen' && 'points' in el) {
          const hitDist = Math.max(el.width * 2, 10) / this.camera.zoom;
          const hit = (el as Stroke).points.some(
            p => Math.hypot(p.x - worldPoint.x, p.y - worldPoint.y) < hitDist
          );
          if (hit) return el;
          continue;
        }
        return el;
      }
    }
    return null;
  }

  private getHandleAtPoint(worldPoint: Point): string | null {
    if (this.selectedIds.size !== 1) return null;
    const id = this.selectedIds.values().next().value!;
    const el = this.elements.find(e => e.id === id);
    if (!el) return null;
    const bounds = this.getElementBounds(el);
    const local = this.getLocalBounds(el);
    const rotation = el.rotation ?? 0;
    const pad = 6 / this.camera.zoom;
    const handleSize = 10 / this.camera.zoom;

    let handleDefs: Record<string, Point>;
    if (rotation !== 0) {
      const corners = this.getRotatedCorners({ x: local.x - pad, y: local.y - pad, w: local.w + pad * 2, h: local.h + pad * 2 }, rotation);
      handleDefs = {
        'nw': corners[0],
        'ne': corners[1],
        'se': corners[2],
        'sw': corners[3],
        'n': { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 },
        'e': { x: (corners[1].x + corners[2].x) / 2, y: (corners[1].y + corners[2].y) / 2 },
        's': { x: (corners[2].x + corners[3].x) / 2, y: (corners[2].y + corners[3].y) / 2 },
        'w': { x: (corners[3].x + corners[0].x) / 2, y: (corners[3].y + corners[0].y) / 2 },
      };
    } else {
      handleDefs = {
        'nw': { x: bounds.x - pad, y: bounds.y - pad },
        'n':  { x: bounds.x + bounds.w / 2, y: bounds.y - pad },
        'ne': { x: bounds.x + bounds.w + pad, y: bounds.y - pad },
        'e':  { x: bounds.x + bounds.w + pad, y: bounds.y + bounds.h / 2 },
        'se': { x: bounds.x + bounds.w + pad, y: bounds.y + bounds.h + pad },
        's':  { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h + pad },
        'sw': { x: bounds.x - pad, y: bounds.y + bounds.h + pad },
        'w':  { x: bounds.x - pad, y: bounds.y + bounds.h / 2 },
      };
    }
    for (const [name, pos] of Object.entries(handleDefs)) {
      if (Math.abs(worldPoint.x - pos.x) < handleSize && Math.abs(worldPoint.y - pos.y) < handleSize) {
        return name;
      }
    }
    return null;
  }

  private getElementBounds(el: Element): { x: number; y: number; w: number; h: number } {
    const local = this.getLocalBounds(el);
    const rotation = el.rotation ?? 0;
    if (rotation === 0) return local;
    const corners = this.getRotatedCorners(local, rotation);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of corners) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.dismissContextMenu();

    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (this.activePointers.size === 2) {
      this.startPinch();
      return;
    }
    if (this.activePointers.size > 2) {
      return;
    }

    if (this.activePointerId !== null && this.activePointerId !== e.pointerId) {
      if (e.pointerType === 'pen' && this.activePointerType === 'touch') {
        this.releasePointerCapture();
      } else {
        return;
      }
    }
    
    e.preventDefault();
    this.liveCanvas.setPointerCapture(e.pointerId);
    this.activePointerId = e.pointerId;
    this.activePointerType = e.pointerType;
    
    const point = this.getPoint(e);

    if (e.pointerType === 'touch') {
      this.longPressStart = point;
      this.longPressTimer = setTimeout(() => {
        if (this.longPressStart) {
          const hit = this.hitTest(this.longPressStart);
          if (hit) {
            if (!this.selectedIds.has(hit.id)) {
              this.selectedIds.clear();
              this.selectedIds.add(hit.id);
              this.renderAll();
            }
            this.showContextMenu(e.clientX, e.clientY);
          }
        }
      }, 500);
    }

    if (this.activeTool === 'hand' || (this.isSpaceDown && !this.isPanning)) {
      this.isPanning = true;
      this.panStart = { x: e.clientX, y: e.clientY };
      this.panCameraStart = { x: this.camera.x, y: this.camera.y };
      return;
    }

    if (this.activeTool === 'select') {
      const handle = this.getHandleAtPoint(point);
      if (handle) {
        this.pushUndo();
        this.dragState = { type: 'resize', startWorld: point, origElements: JSON.parse(JSON.stringify(this.elements)), handle };
        this.renderAll();
        return;
      }
      const hit = this.hitTest(point);
        if (hit) {
          if (e.shiftKey) {
            if (this.selectedIds.has(hit.id)) {
              this.selectedIds.delete(hit.id);
            } else {
              if (hit.groupId) {
                for (const el of this.elements) {
                  if (el.groupId === hit.groupId) this.selectedIds.add(el.id);
                }
              } else {
                this.selectedIds.add(hit.id);
              }
            }
            this.renderAll();
            return;
          }
          if (!this.selectedIds.has(hit.id)) {
            this.selectedIds.clear();
            if (hit.groupId) {
              for (const el of this.elements) {
                if (el.groupId === hit.groupId) this.selectedIds.add(el.id);
              }
            } else {
              this.selectedIds.add(hit.id);
            }
          }
        this.pushUndo();
        this.dragState = { type: 'move', startWorld: point, origElements: JSON.parse(JSON.stringify(this.elements)) };
      } else {
        this.selectedIds.clear();
      }
      this.renderAll();
      return;
    }

    if (this.activeTool === 'text') {
      const hit = this.hitTest(point);
      if (hit && hit.tool === 'text') {
        this.startTextEdit(hit.position.x, hit.position.y, hit as TextElement);
      } else {
        this.startTextEdit(point.x, point.y);
      }
      return;
    }
    
    if (this.activeTool === 'eraser') {
      this.pushUndo();
      this.isDrawing = true;
      this.lastPointerWorld = point;
      this.renderAll();
      return;
    }

    this.isDrawing = true;

    if (this.activeTool === 'pen') {
      this.currentElement = {
        id: crypto.randomUUID(),
        tool: 'pen',
        points: [point],
        color: this.strokeColor,
        width: this.strokeWidth,
        opacity: this.strokeOpacity,
      };
    } else {
      const snapped = this.snapToGrid(point);
      this.currentElement = {
        id: crypto.randomUUID(),
        tool: this.activeTool,
        start: snapped,
        end: snapped,
        color: this.strokeColor,
        width: this.strokeWidth,
        opacity: this.strokeOpacity,
        filled: this.fillEnabled,
      };
    }
  };

  private moveSingleElement(el: Element, orig: Element, dx: number, dy: number): void {
    if (el.tool === 'pen' || el.tool === 'eraser') {
      const s = el as Stroke;
      const o = orig as Stroke;
      s.points = o.points.map(p => ({ x: p.x + dx, y: p.y + dy, pressure: p.pressure }));
    } else if (el.tool === 'text') {
      const t = el as TextElement;
      const o = orig as TextElement;
      t.position = { x: o.position.x + dx, y: o.position.y + dy };
    } else if (el.tool === 'image') {
      const img = el as ImageElement;
      const o = orig as ImageElement;
      img.position = { x: o.position.x + dx, y: o.position.y + dy };
    } else {
      const s = el as Shape;
      const o = orig as Shape;
      s.start = { x: o.start.x + dx, y: o.start.y + dy };
      s.end = { x: o.end.x + dx, y: o.end.y + dy };
    }
  }

  private getRotationCenter(el: Element): Point {
    const bounds = this.getLocalBounds(el);
    return { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
  }

  private rotatePoint(point: Point, center: Point, angle: number): Point {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
  }

  private getLocalBounds(el: Element): { x: number; y: number; w: number; h: number } {
    if (el.tool === 'pen' || el.tool === 'eraser') {
      const stroke = el as Stroke;
      if (stroke.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of stroke.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    if (el.tool === 'text') {
      const t = el as TextElement;
      const ctx = this.staticCtx;
      ctx.font = `${t.fontSize}px ${t.fontFamily}`;
      const lines = t.content.split('\n');
      const lineHeight = t.fontSize * 1.4;
      let maxW = 0;
      for (const line of lines) maxW = Math.max(maxW, ctx.measureText(line).width);
      return { x: t.position.x, y: t.position.y, w: Math.max(maxW, 20), h: Math.max(lines.length * lineHeight, t.fontSize) };
    }
    if (el.tool === 'image') {
      const img = el as ImageElement;
      return { x: img.position.x, y: img.position.y, w: img.width, h: img.height };
    }
    const s = el as Shape;
    const x = Math.min(s.start.x, s.end.x);
    const y = Math.min(s.start.y, s.end.y);
    return { x, y, w: Math.abs(s.end.x - s.start.x), h: Math.abs(s.end.y - s.start.y) };
  }

  private getRotatedCorners(bounds: { x: number; y: number; w: number; h: number }, rotation: number): Point[] {
    const cx = bounds.x + bounds.w / 2;
    const cy = bounds.y + bounds.h / 2;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const corners = [
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.w, y: bounds.y },
      { x: bounds.x + bounds.w, y: bounds.y + bounds.h },
      { x: bounds.x, y: bounds.y + bounds.h },
    ];
    return corners.map(p => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
    });
  }

  private moveSelectedElements(dx: number, dy: number): void {
    if (!this.dragState) return;
    const origMap = new Map(this.dragState.origElements.map(e => [e.id, e]));
    for (const id of this.selectedIds) {
      const el = this.elements.find(e => e.id === id);
      const orig = origMap.get(id);
      if (!el || !orig) continue;
      this.moveSingleElement(el, orig, dx, dy);
    }
  }

  private resizeSelected(handle: string, currentWorld: Point): void {
    if (!this.dragState) return;
    const origMap = new Map(this.dragState.origElements.map(e => [e.id, e]));
    const rawDx = currentWorld.x - this.dragState.startWorld.x;
    const rawDy = currentWorld.y - this.dragState.startWorld.y;
    for (const id of this.selectedIds) {
      const el = this.elements.find(e => e.id === id);
      const orig = origMap.get(id);
      if (!el || !orig) continue;
      const rotation = el.rotation ?? 0;
      let dx = rawDx;
      let dy = rawDy;
      if (rotation !== 0) {
        const cos = Math.cos(-rotation);
        const sin = Math.sin(-rotation);
        dx = rawDx * cos - rawDy * sin;
        dy = rawDx * sin + rawDy * cos;
      }
      if (el.tool === 'pen' || el.tool === 'eraser' || el.tool === 'text') {
        this.moveSingleElement(el, orig, dx, dy);
        continue;
      }
      if (el.tool === 'image') {
        const img = el as ImageElement;
        const o = orig as ImageElement;
        let newX = o.position.x;
        let newY = o.position.y;
        let newW = o.width;
        let newH = o.height;
        if (handle === 'nw') { newX = o.position.x + dx; newY = o.position.y + dy; newW = o.width - dx; newH = o.height - dy; }
        else if (handle === 'ne') { newY = o.position.y + dy; newW = o.width + dx; newH = o.height - dy; }
        else if (handle === 'sw') { newX = o.position.x + dx; newW = o.width - dx; newH = o.height + dy; }
        else if (handle === 'se') { newW = o.width + dx; newH = o.height + dy; }
        else if (handle === 'n') { newY = o.position.y + dy; newH = o.height - dy; }
        else if (handle === 's') { newH = o.height + dy; }
        else if (handle === 'e') { newW = o.width + dx; }
        else if (handle === 'w') { newX = o.position.x + dx; newW = o.width - dx; }
        if (newW > 0 && newH > 0) {
          img.position = { x: newX, y: newY };
          img.width = newW;
          img.height = newH;
        }
        continue;
      }
      const s = el as Shape;
      const o = orig as Shape;
      let newStart = { x: o.start.x, y: o.start.y };
      let newEnd = { x: o.end.x, y: o.end.y };
      if (handle === 'nw') { newStart.x = o.start.x + dx; newStart.y = o.start.y + dy; }
      if (handle === 'ne') { newEnd.x = o.end.x + dx; newStart.y = o.start.y + dy; }
      if (handle === 'sw') { newStart.x = o.start.x + dx; newEnd.y = o.end.y + dy; }
      if (handle === 'se') { newEnd.x = o.end.x + dx; newEnd.y = o.end.y + dy; }
      if (handle === 'n') { newStart.y = o.start.y + dy; }
      if (handle === 's') { newEnd.y = o.end.y + dy; }
      if (handle === 'e') { newEnd.x = o.end.x + dx; }
      if (handle === 'w') { newStart.x = o.start.x + dx; }
      if (newStart.x > newEnd.x) { const tmp = newStart.x; newStart.x = newEnd.x; newEnd.x = tmp; }
      if (newStart.y > newEnd.y) { const tmp = newStart.y; newStart.y = newEnd.y; newEnd.y = tmp; }
      if (Math.abs(newEnd.x - newStart.x) < 5 || Math.abs(newEnd.y - newStart.y) < 5) continue;
      s.start = newStart;
      s.end = newEnd;
    }
  }

  private startPinch(): void {
    const pts = Array.from(this.activePointers.values());
    this.pinchStartDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    this.pinchStartZoom = this.camera.zoom;
    const rect = this.liveCanvas.getBoundingClientRect();
    this.pinchCenter = {
      x: (pts[0].x + pts[1].x) / 2 - rect.left,
      y: (pts[0].y + pts[1].y) / 2 - rect.top,
    };
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (this.activePointers.has(e.pointerId)) {
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    }
    if (this.activePointers.size === 2) {
      const pts = Array.from(this.activePointers.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      if (this.pinchStartDist > 0) {
        const newZoom = this.pinchStartZoom * (dist / this.pinchStartDist);
        this.zoomTo(newZoom, this.pinchCenter);
      }
      return;
    }

    if (this.activePointerId !== null && this.activePointerId !== e.pointerId) return;

    if (this.isPanning) {
      const dx = (e.clientX - this.panStart.x) / this.camera.zoom;
      const dy = (e.clientY - this.panStart.y) / this.camera.zoom;
      this.camera.x = this.panCameraStart.x - dx;
      this.camera.y = this.panCameraStart.y - dy;
      this.renderAll();
      return;
    }

    if (this.activeTool === 'select' && this.dragState?.type === 'resize') {
      const point = this.getPoint(e);
      this.resizeSelected(this.dragState.handle!, point);
      this.renderAll();
      return;
    }

    if (this.activeTool === 'select' && this.dragState?.type === 'move') {
      const point = this.getPoint(e);
      const dx = point.x - this.dragState.startWorld.x;
      const dy = point.y - this.dragState.startWorld.y;
      this.moveSelectedElements(dx, dy);

      let combinedBounds = { x: Infinity, y: Infinity, w: 0, h: 0 };
      let hasBounds = false;
      for (const id of this.selectedIds) {
        const el = this.elements.find(e => e.id === id);
        if (!el) continue;
        const b = this.getElementBounds(el);
        if (!hasBounds) {
          combinedBounds = { x: b.x, y: b.y, w: b.w, h: b.h };
          hasBounds = true;
        } else {
          const nx = Math.min(combinedBounds.x, b.x);
          const ny = Math.min(combinedBounds.y, b.y);
          combinedBounds = {
            x: nx, y: ny,
            w: Math.max(combinedBounds.x + combinedBounds.w, b.x + b.w) - nx,
            h: Math.max(combinedBounds.y + combinedBounds.h, b.y + b.h) - ny,
          };
        }
      }
      if (hasBounds) {
        this.alignmentGuides = this.findAlignmentGuides(combinedBounds);
      }

      this.renderAll();
      return;
    }

    if (this.activeTool === 'eraser' && this.isDrawing) {
      const point = this.getPoint(e);
      this.lastPointerWorld = point;
      const hitDist = this.strokeWidth * 2.5;
      const toRemove: string[] = [];
      for (const el of this.elements) {
        if (el.tool === 'pen' || el.tool === 'eraser') {
          const stroke = el as Stroke;
          const rotation = (stroke as any).rotation ?? 0;
          const center = this.getRotationCenter(stroke);
          const localPoint = rotation !== 0 ? this.rotatePoint(point, center, -rotation) : point;
          const hit = stroke.points.some(p => Math.hypot(p.x - localPoint.x, p.y - localPoint.y) < hitDist);
          if (hit) toRemove.push(el.id);
        } else {
          const bounds = this.getElementBounds(el);
          const pad = hitDist;
          if (point.x >= bounds.x - pad && point.x <= bounds.x + bounds.w + pad &&
              point.y >= bounds.y - pad && point.y <= bounds.y + bounds.h + pad) {
            toRemove.push(el.id);
          }
        }
      }
      if (toRemove.length > 0) {
        this.elements = this.elements.filter(e => !toRemove.includes(e.id));
        this.renderStatic();
        this.emit('change');
      }
      this.dirty = true;
      if (!this.animFrameId) this.animFrameId = requestAnimationFrame(this.flush);
      return;
    }

    if (!this.isDrawing || !this.currentElement) return;
    e.preventDefault();

    if (this.currentElement.tool === 'pen') {
      const events = (e as any).getCoalescedEvents?.() ?? [e];
      for (const ce of events) {
        const p = this.getPoint(ce as PointerEvent);
        const last = this.currentElement.points[this.currentElement.points.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) >= 1) {
          this.currentElement.points.push(p);
        }
      }
      if (this.currentElement.points.length >= 3) {
        const rawPoints = this.currentElement.points;
        const lastFew = rawPoints.slice(Math.max(0, rawPoints.length - 4));
        const interpolated = this.catmullRomInterpolate(lastFew, 0.5);
        if (interpolated.length > 2) {
          const existing = rawPoints.slice(0, rawPoints.length - lastFew.length + 1);
          this.currentElement.points = [...existing, ...interpolated.slice(1)];
        }
      }
    } else {
      const point = this.getPoint(e);
      const shape = this.currentElement as Shape;
      let endPoint = this.snapToGrid(point);
      if (shape.tool === 'arrow') {
        const conn = this.findNearestEdgePoint(endPoint, this.currentElement?.id);
        if (conn) endPoint = conn;
      }
      shape.end = endPoint;
      
      if (e.shiftKey && 'start' in this.currentElement) {
        const dx = shape.end.x - shape.start.x;
        const dy = shape.end.y - shape.start.y;
        if (shape.tool === 'rect') {
          const size = Math.max(Math.abs(dx), Math.abs(dy));
          shape.end = { x: shape.start.x + size * Math.sign(dx || 1), y: shape.start.y + size * Math.sign(dy || 1) };
        } else if (shape.tool === 'circle') {
          const size = Math.max(Math.abs(dx), Math.abs(dy));
          shape.end = { x: shape.start.x + size * Math.sign(dx || 1), y: shape.start.y + size * Math.sign(dy || 1) };
        } else if (shape.tool === 'line' || shape.tool === 'arrow') {
          const angle = Math.atan2(dy, dx);
          const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
          const len = Math.hypot(dx, dy);
          shape.end = { x: shape.start.x + len * Math.cos(snapped), y: shape.start.y + len * Math.sin(snapped) };
        }
      }
    }

    this.dirty = true;
    if (!this.animFrameId) {
      this.animFrameId = requestAnimationFrame(this.flush);
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.activePointers.delete(e.pointerId);
    if (this.longPressTimer) { clearTimeout(this.longPressTimer); this.longPressTimer = null; }
    this.longPressStart = null;

    if (this.activePointerId !== null && this.activePointerId !== e.pointerId) return;
    this.activePointerId = null;
    this.activePointerType = 'mouse';
    
    if (this.isPanning) {
      this.isPanning = false;
      return;
    }

    if (this.activeTool === 'select' && this.dragState) {
      this.alignmentGuides = {};
      this.dragState = null;
      this.emit('change');
      return;
    }

    if (this.activeTool === 'eraser' && this.isDrawing) {
      this.isDrawing = false;
      this.lastPointerWorld = null;
      this.renderAll();
      this.updateToolbar();
      return;
    }

    if (!this.isDrawing || !this.currentElement) return;
    this.isDrawing = false;

    if (this.currentElement.tool === 'pen') {
      if ((this.currentElement as Stroke).points.length < 2) {
        const p = (this.currentElement as Stroke).points[0];
        (this.currentElement as Stroke).points = [
          { x: p.x, y: p.y, pressure: 0.5 },
          { x: p.x + 0.5, y: p.y + 0.5, pressure: 0.5 },
        ];
      }
    }

    this.pushUndo();
    this.elements.push(this.currentElement);
    this.currentElement = null;
    this.flushLive();
    this.renderStatic();
    this.updateToolbar();
    this.emit('change');
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = this.liveCanvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const worldBefore = this.screenToWorld(sx, sy);
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    this.camera.zoom = Math.max(0.1, Math.min(10, this.camera.zoom * factor));
    const worldAfter = this.screenToWorld(sx, sy);
    this.camera.x += worldBefore.x - worldAfter.x;
    this.camera.y += worldBefore.y - worldAfter.y;
    this.renderAll();
    this.updateToolbar();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.textInput) return;

    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      e.shiftKey ? this.redo() : this.undo();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      this.zoomTo(this.camera.zoom * 1.1);
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === '-') {
      e.preventDefault();
      this.zoomTo(this.camera.zoom * 0.9);
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === '0') {
      e.preventDefault();
      this.resetView();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      e.preventDefault();
      this.duplicateSelected();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      e.preventDefault();
      this.copySelected();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      e.preventDefault();
      this.pasteClipboard();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      this.selectAll();
      return;
    }

    if (e.key === ' ') {
      if (!this.isSpaceDown) {
        this.isSpaceDown = true;
        this.liveCanvas.style.cursor = 'grab';
      }
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      this.deleteSelected();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === ']') {
      e.preventDefault();
      if (e.shiftKey) this.bringToFront(); else this.bringForward();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === '[') {
      e.preventDefault();
      if (e.shiftKey) this.sendToBack(); else this.sendBackward();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'g' && !e.shiftKey) {
      e.preventDefault();
      this.groupSelected();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'G') {
      e.preventDefault();
      this.ungroupSelected();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
      e.preventDefault();
      const svg = this.exportSVG();
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'blackboard.svg';
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    if (e.shiftKey && e.key === 'R') {
      e.preventDefault();
      this.rotateSelected(Math.PI / 12);
      return;
    }

    const keyToolMap: Record<string, Tool> = {
      'v': 'select', 'h': 'hand', 'p': 'pen', 'd': 'pen',
      't': 'text', 'l': 'line', 'r': 'rect', 'o': 'circle',
      'a': 'arrow', 'e': 'eraser'
    };

    if ((e.ctrlKey || e.metaKey) && !['z','+','-','0','d','c','v','a','g',']','['].includes(e.key.toLowerCase())) {
      return;
    }

    const tool = keyToolMap[e.key.toLowerCase()];
    if (tool) this.setTool(tool);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === ' ') {
      this.isSpaceDown = false;
      this.setTool(this.activeTool);
    }
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    const point = this.getPoint(e as any);
    const hit = this.hitTest(point);
    if (hit) {
      if (!this.selectedIds.has(hit.id)) {
        this.selectedIds.clear();
        this.selectedIds.add(hit.id);
        this.renderAll();
      }
      this.showContextMenu(e.clientX, e.clientY);
    }
  };

  private showContextMenu(clientX: number, clientY: number): void {
    this.dismissContextMenu();
    const menu = document.createElement('div');
    menu.style.cssText = `
      position: fixed; left: ${clientX}px; top: ${clientY}px;
      background: ${THEMES[this.theme].canvasBg}; border: 1px solid ${THEMES[this.theme].gridColor};
      border-radius: 8px; padding: 4px; z-index: 1000; min-width: 160px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-family: system-ui, sans-serif;
    `;
    const items = [
      { label: 'Delete', shortcut: 'Del', action: () => this.deleteSelected() },
      { label: 'Duplicate', shortcut: 'Ctrl+D', action: () => this.duplicateSelected() },
      { label: 'Group', shortcut: 'Ctrl+G', action: () => this.groupSelected() },
      { label: 'Ungroup', shortcut: 'Ctrl+Shift+G', action: () => this.ungroupSelected() },
      { type: 'separator' as const },
      { label: 'Bring Forward', shortcut: ']', action: () => this.bringForward() },
      { label: 'Send Backward', shortcut: '[', action: () => this.sendBackward() },
      { label: 'Bring to Front', shortcut: 'Ctrl+]', action: () => this.bringToFront() },
      { label: 'Send to Back', shortcut: 'Ctrl+[', action: () => this.sendToBack() },
    ];
    for (const item of items) {
      if (item.type === 'separator') {
        const sep = document.createElement('div');
        sep.style.cssText = `height: 1px; background: ${THEMES[this.theme].gridColor}; margin: 4px 0;`;
        menu.appendChild(sep);
        continue;
      }
      const btn = document.createElement('button');
      btn.style.cssText = `
        display: flex; justify-content: space-between; align-items: center;
        width: 100%; padding: 6px 12px; border: none; background: transparent;
        cursor: pointer; font-size: 13px; border-radius: 4px; color: ${THEMES[this.theme].gridLabelColor};
        font-family: inherit;
      `;
      btn.innerHTML = `<span>${item.label}</span><span style="font-size: 11px; opacity: 0.5;">${item.shortcut}</span>`;
      btn.addEventListener('mouseenter', () => { btn.style.background = THEMES[this.theme].gridColor; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
      btn.addEventListener('click', (ev) => { ev.stopPropagation(); item.action(); this.dismissContextMenu(); });
      menu.appendChild(btn);
    }
    document.body.appendChild(menu);
    this.contextMenu = menu;
  }

  private dismissContextMenu(): void {
    if (this.contextMenu) {
      this.contextMenu.remove();
      this.contextMenu = null;
    }
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.longPressStart = null;
  }

  private onWindowClick = (): void => {
    this.dismissContextMenu();
  };

  private deleteSelected(): void {
    if (this.selectedIds.size === 0) return;
    this.pushUndo();
    this.elements = this.elements.filter(e => !this.selectedIds.has(e.id));
    this.selectedIds.clear();
    this.renderAll();
    this.emit('change');
  }

  private releasePointerCapture(): void {
    if (this.activePointerId !== null) {
      try { this.liveCanvas.releasePointerCapture(this.activePointerId); } catch {}
      const upEvt = new PointerEvent('pointerup', { pointerId: this.activePointerId });
      this.onPointerUp(upEvt);
    }
  }

  private startTextEdit(worldX: number, worldY: number, existing?: TextElement): void {
    this.commitText();
    const screen = this.worldToScreen(worldX, worldY);
    const ta = document.createElement('textarea');
    ta.style.cssText = `
      position: absolute; left: ${screen.x}px; top: ${screen.y}px;
      min-width: 60px; min-height: 28px;
      background: transparent; border: 2px solid ${THEMES[this.theme].selectionColor};
      border-radius: 4px; padding: 4px 6px;
      font-size: ${(existing?.fontSize ?? this.fontSize) * this.camera.zoom}px;
      font-family: ${existing?.fontFamily ?? 'system-ui, -apple-system, sans-serif'};
      color: ${existing?.color ?? this.strokeColor};
      outline: none; resize: none; overflow: hidden;
      z-index: 10; box-sizing: border-box;
      line-height: 1.4; white-space: pre;
    `;
    ta.value = existing?.content ?? '';
    ta.addEventListener('blur', () => this.commitText());
    ta.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { ta.blur(); }
      ev.stopPropagation();
    });
    ta.addEventListener('input', () => {
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
      ta.style.width = Math.max(60, ta.scrollWidth + 10) + 'px';
    });
    this.canvasWrapper.appendChild(ta);
    this.textInput = ta;
    this.editingTextId = existing?.id ?? null;
    if (existing) {
      this.pushUndo();
      this.elements = this.elements.filter(e => e.id !== existing.id);
      this.renderStatic();
    }
    setTimeout(() => { ta.focus(); ta.style.height = ta.scrollHeight + 'px'; }, 0);
  }

  private commitText(): void {
    if (!this.textInput) return;
    const ta = this.textInput;
    const content = ta.value.trim();
    this.textInput = null;
    ta.remove();
    if (content) {
      const screenX = parseFloat(ta.style.left);
      const screenY = parseFloat(ta.style.top);
      const world = this.screenToWorld(screenX, screenY);
      const el: TextElement = {
        id: this.editingTextId ?? crypto.randomUUID(),
        tool: 'text',
        position: world,
        content,
        fontSize: this.fontSize,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: ta.style.color,
        width: 1,
        opacity: this.strokeOpacity,
      };
      if (!this.editingTextId) this.pushUndo();
      this.elements.push(el);
      this.renderStatic();
      this.emit('change');
    }
    this.editingTextId = null;
  }

  private flush = (): void => {
    this.animFrameId = null;
    if (!this.dirty) return;
    this.dirty = false;
    this.flushLive();
  };

  private renderAll(): void {
    this.renderStatic();
    this.flushLive();
  }

  private renderStatic(): void {
    const ctx = this.staticCtx;
    const t = THEMES[this.theme];
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = t.canvasBg;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);
    if (this.graph.enabled) this.drawGraph(ctx);
    for (const el of this.elements) this.drawElement(ctx, el);
    ctx.restore();
    if (this.elements.length === 0 && !this.currentElement) {
      ctx.fillStyle = t.hintColor;
      ctx.font = '14px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Choose a tool and start drawing', this.width / 2, this.height / 2);
    }
  }

  private flushLive(): void {
    const ctx = this.liveCtx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);
    if (this.currentElement) this.drawElement(ctx, this.currentElement);
    this.drawSelectionIndicators(ctx);
    this.drawAlignmentGuides(ctx);
    
    if (this.activeTool === 'eraser' && this.lastPointerWorld) {
      ctx.beginPath();
      ctx.arc(this.lastPointerWorld.x, this.lastPointerWorld.y, this.strokeWidth * 2.5, 0, Math.PI * 2);
      ctx.strokeStyle = THEMES[this.theme].selectionColor;
      ctx.lineWidth = 1 / this.camera.zoom;
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawGraph(ctx: CanvasRenderingContext2D): void {
    const { spacing, showAxes, showLabels } = this.graph;
    const t = THEMES[this.theme];
    const vl = this.camera.x;
    const vt = this.camera.y;
    const vr = this.camera.x + this.width / this.camera.zoom;
    const vb = this.camera.y + this.height / this.camera.zoom;
    const startX = Math.floor(vl / spacing) * spacing;
    const endX = Math.ceil(vr / spacing) * spacing;
    const startY = Math.floor(vt / spacing) * spacing;
    const endY = Math.ceil(vb / spacing) * spacing;

    ctx.strokeStyle = t.gridColor;
    ctx.lineWidth = 0.5 / this.camera.zoom;
    ctx.beginPath();
    for (let x = startX; x <= endX; x += spacing) {
      ctx.moveTo(x, vt);
      ctx.lineTo(x, vb);
    }
    for (let y = startY; y <= endY; y += spacing) {
      ctx.moveTo(vl, y);
      ctx.lineTo(vr, y);
    }
    ctx.stroke();

    if (showAxes) {
      ctx.strokeStyle = t.gridAxisColor;
      ctx.lineWidth = 1.5 / this.camera.zoom;
      ctx.beginPath();
      if (0 >= vt && 0 <= vb) { ctx.moveTo(vl, 0); ctx.lineTo(vr, 0); }
      if (0 >= vl && 0 <= vr) { ctx.moveTo(0, vt); ctx.lineTo(0, vb); }
      ctx.stroke();

      if (showLabels) {
        ctx.fillStyle = t.gridLabelColor;
        ctx.font = `${10 / this.camera.zoom}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        if (0 >= vt && 0 <= vb) {
          for (let x = startX; x <= endX; x += spacing * 2) {
            if (x !== 0) ctx.fillText(String(x / spacing), x, 14 / this.camera.zoom);
          }
        }
        ctx.textAlign = 'right';
        if (0 >= vl && 0 <= vr) {
          for (let y = startY; y <= endY; y += spacing * 2) {
            if (y !== 0) ctx.fillText(String(-y / spacing), -6 / this.camera.zoom, y + 4 / this.camera.zoom);
          }
        }
      }
    }
  }

  private drawElement(ctx: CanvasRenderingContext2D, el: Element): void {
    ctx.save();
    ctx.globalAlpha = el.opacity;
    const rotation = el.rotation ?? 0;
    if (rotation !== 0) {
      const center = this.getRotationCenter(el);
      ctx.translate(center.x, center.y);
      ctx.rotate(rotation);
      ctx.translate(-center.x, -center.y);
    }
    if (el.tool === 'pen' || el.tool === 'eraser') {
      this.drawFreehand(ctx, el as Stroke);
    } else if (el.tool === 'text') {
      this.drawText(ctx, el as TextElement);
    } else if (el.tool === 'image') {
      this.drawImage(ctx, el as ImageElement);
    } else {
      this.drawShape(ctx, el as Shape);
    }
    ctx.restore();
  }

  private drawFreehand(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
    const { points, color, width, tool } = stroke;
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = color;
    }
    const outlinePoints = getStroke(
      points.map(p => [p.x, p.y, p.pressure ?? 0.5]),
      { size: width, thinning: 0.5, smoothing: 0.5, streamline: 0.5, simulatePressure: true }
    );
    const pathData = getSvgPathFromStroke(outlinePoints);
    if (pathData) ctx.fill(new Path2D(pathData));
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawText(ctx: CanvasRenderingContext2D, el: TextElement): void {
    ctx.fillStyle = el.color;
    ctx.font = `${el.fontSize}px ${el.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const maxWidth = el.width > 1 ? el.width : 300;
    const rawLines = el.content.split('\n');
    const wrappedLines: string[] = [];
    for (const rawLine of rawLines) {
      if (rawLine === '') { wrappedLines.push(''); continue; }
      const words = rawLine.split(' ');
      let currentLine = '';
      for (const word of words) {
        const testLine = currentLine ? currentLine + ' ' + word : word;
        if (ctx.measureText(testLine).width > maxWidth && currentLine) {
          wrappedLines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      wrappedLines.push(currentLine);
    }
    const lineHeight = el.fontSize * 1.4;
    for (let i = 0; i < wrappedLines.length; i++) {
      ctx.fillText(wrappedLines[i], el.position.x, el.position.y + i * lineHeight);
    }
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  private drawShape(ctx: CanvasRenderingContext2D, shape: Shape): void {
    if (shape.roughness !== undefined && shape.roughness > 0 || this.roughness > 0) {
      this.drawRoughShape(ctx, shape);
      return;
    }
    const { start, end, color, width } = shape;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (shape.tool) {
      case 'line':
        if (shape.dashPattern) ctx.setLineDash(shape.dashPattern);
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        if (shape.dashPattern) ctx.setLineDash([]);
        break;
      case 'rect': {
        const rx = Math.min(start.x, end.x);
        const ry = Math.min(start.y, end.y);
        const rw = Math.abs(end.x - start.x);
        const rh = Math.abs(end.y - start.y);
        const cr = (shape as Shape).cornerRadius ?? 0;
        if (shape.filled) {
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.25;
          if (cr > 0) { this.roundRect(ctx, rx, ry, rw, rh, cr); ctx.fill(); }
          else ctx.fillRect(rx, ry, rw, rh);
          ctx.globalAlpha = shape.opacity;
        }
        if (shape.dashPattern) ctx.setLineDash(shape.dashPattern);
        if (cr > 0) { this.roundRect(ctx, rx, ry, rw, rh, cr); ctx.stroke(); }
        else ctx.strokeRect(rx, ry, rw, rh);
        if (shape.dashPattern) ctx.setLineDash([]);
        break;
      }
      case 'circle': {
        const cx = (start.x + end.x) / 2;
        const cy = (start.y + end.y) / 2;
        const rrx = Math.abs(end.x - start.x) / 2;
        const rry = Math.abs(end.y - start.y) / 2;
        if (shape.dashPattern) ctx.setLineDash(shape.dashPattern);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rrx, rry, 0, 0, Math.PI * 2);
        if (shape.filled) {
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.25;
          ctx.fill();
          ctx.globalAlpha = shape.opacity;
        }
        ctx.stroke();
        if (shape.dashPattern) ctx.setLineDash([]);
        break;
      }
      case 'arrow': {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const len = Math.hypot(dx, dy);
        if (len < 1) break;
        if (shape.dashPattern) ctx.setLineDash(shape.dashPattern);
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        if (shape.dashPattern) ctx.setLineDash([]);
        const headLen = Math.min(15, len * 0.3);
        const angle = Math.atan2(dy, dx);
        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - headLen * Math.cos(angle - Math.PI / 6), end.y - headLen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - headLen * Math.cos(angle + Math.PI / 6), end.y - headLen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
        break;
      }
    }
  }

  private seededRandom(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 16807 + 0) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  private drawRoughShape(ctx: CanvasRenderingContext2D, shape: Shape): void {
    const roughLevel = shape.roughness ?? this.roughness;
    const maxOffset = roughLevel * 1.5;
    const passes = roughLevel + 1;
    const seedVal = shape.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const rand = this.seededRandom(seedVal);
    const { start, end, color, width } = shape;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let pass = 0; pass < passes; pass++) {
      const off = () => (rand() - 0.5) * maxOffset;
      ctx.globalAlpha = Math.max(0.3, 1 - pass * 0.15);
      ctx.beginPath();

      switch (shape.tool) {
        case 'line': {
          ctx.moveTo(start.x + off(), start.y + off());
          ctx.lineTo(end.x + off(), end.y + off());
          ctx.stroke();
          break;
        }
        case 'rect': {
          const rx = Math.min(start.x, end.x);
          const ry = Math.min(start.y, end.y);
          const rw = Math.abs(end.x - start.x);
          const rh = Math.abs(end.y - start.y);
          const pts = [
            { x: rx, y: ry }, { x: rx + rw, y: ry },
            { x: rx + rw, y: ry + rh }, { x: rx, y: ry + rh },
          ];
          for (let i = 0; i < 4; i++) {
            const a = pts[i];
            const b = pts[(i + 1) % 4];
            ctx.moveTo(a.x + off(), a.y + off());
            const segs = 4;
            for (let s = 1; s <= segs; s++) {
              const t = s / segs;
              ctx.lineTo(
                a.x + (b.x - a.x) * t + off(),
                a.y + (b.y - a.y) * t + off()
              );
            }
          }
          ctx.closePath();
          if (shape.filled) {
            ctx.fillStyle = color;
            const savedAlpha = ctx.globalAlpha;
            ctx.globalAlpha = 0.25;
            ctx.fill();
            ctx.globalAlpha = savedAlpha;
          }
          ctx.stroke();
          break;
        }
        case 'circle': {
          const cx = (start.x + end.x) / 2;
          const cy = (start.y + end.y) / 2;
          const rrx = Math.abs(end.x - start.x) / 2;
          const rry = Math.abs(end.y - start.y) / 2;
          const segs = 36;
          for (let i = 0; i <= segs; i++) {
            const a = (i / segs) * Math.PI * 2;
            const px = cx + Math.cos(a) * rrx + off();
            const py = cy + Math.sin(a) * rry + off();
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          if (shape.filled) {
            ctx.fillStyle = color;
            const savedAlpha = ctx.globalAlpha;
            ctx.globalAlpha = 0.25;
            ctx.fill();
            ctx.globalAlpha = savedAlpha;
          }
          ctx.stroke();
          break;
        }
        case 'arrow': {
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const len = Math.hypot(dx, dy);
          if (len < 1) break;
          ctx.moveTo(start.x + off(), start.y + off());
          ctx.lineTo(end.x + off(), end.y + off());
          ctx.stroke();
          const headLen = Math.min(15, len * 0.3);
          const angle = Math.atan2(dy, dx);
          ctx.beginPath();
          ctx.moveTo(end.x + off(), end.y + off());
          ctx.lineTo(end.x - headLen * Math.cos(angle - Math.PI / 6) + off(), end.y - headLen * Math.sin(angle - Math.PI / 6) + off());
          ctx.moveTo(end.x + off(), end.y + off());
          ctx.lineTo(end.x - headLen * Math.cos(angle + Math.PI / 6) + off(), end.y - headLen * Math.sin(angle + Math.PI / 6) + off());
          ctx.stroke();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private drawSelectionIndicators(ctx: CanvasRenderingContext2D): void {
    if (this.selectedIds.size === 0) return;
    const t = THEMES[this.theme];
    for (const id of this.selectedIds) {
      const el = this.elements.find(e => e.id === id);
      if (!el) continue;
      const bounds = this.getElementBounds(el);
      const local = this.getLocalBounds(el);
      const rotation = el.rotation ?? 0;
      const pad = 6 / this.camera.zoom;
      ctx.save();
      ctx.strokeStyle = t.selectionColor;
      ctx.lineWidth = 1.5 / this.camera.zoom;
      ctx.fillStyle = t.selectionFill;

      if (rotation !== 0) {
        const corners = this.getRotatedCorners({ x: local.x - pad, y: local.y - pad, w: local.w + pad * 2, h: local.h + pad * 2 }, rotation);
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        ctx.lineTo(corners[1].x, corners[1].y);
        ctx.lineTo(corners[2].x, corners[2].y);
        ctx.lineTo(corners[3].x, corners[3].y);
        ctx.closePath();
        ctx.fill();
        ctx.setLineDash([6 / this.camera.zoom, 4 / this.camera.zoom]);
        ctx.stroke();
        ctx.setLineDash([]);

        const handles = [
          corners[0],
          { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 },
          corners[1],
          { x: (corners[1].x + corners[2].x) / 2, y: (corners[1].y + corners[2].y) / 2 },
          corners[2],
          { x: (corners[2].x + corners[3].x) / 2, y: (corners[2].y + corners[3].y) / 2 },
          corners[3],
          { x: (corners[3].x + corners[0].x) / 2, y: (corners[3].y + corners[0].y) / 2 },
        ];
        const handleSize = 8 / this.camera.zoom;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = t.selectionColor;
        ctx.lineWidth = 1.5 / this.camera.zoom;
        for (const c of handles) {
          ctx.fillRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
          ctx.strokeRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
        }
      } else {
        ctx.setLineDash([6 / this.camera.zoom, 4 / this.camera.zoom]);
        ctx.fillRect(bounds.x - pad, bounds.y - pad, bounds.w + pad * 2, bounds.h + pad * 2);
        ctx.strokeRect(bounds.x - pad, bounds.y - pad, bounds.w + pad * 2, bounds.h + pad * 2);
        ctx.setLineDash([]);

        const handleSize = 8 / this.camera.zoom;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = t.selectionColor;
        ctx.lineWidth = 1.5 / this.camera.zoom;
        const handles = [
          { x: bounds.x - pad, y: bounds.y - pad },
          { x: bounds.x + bounds.w / 2, y: bounds.y - pad },
          { x: bounds.x + bounds.w + pad, y: bounds.y - pad },
          { x: bounds.x + bounds.w + pad, y: bounds.y + bounds.h / 2 },
          { x: bounds.x + bounds.w + pad, y: bounds.y + bounds.h + pad },
          { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h + pad },
          { x: bounds.x - pad, y: bounds.y + bounds.h + pad },
          { x: bounds.x - pad, y: bounds.y + bounds.h / 2 },
        ];
        for (const c of handles) {
          ctx.fillRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
          ctx.strokeRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
        }
      }
      ctx.restore();
    }
  }

  private updateToolbar(): void {
    updateToolbarState(this.toolbar, this.activeTool, this.strokeColor, this.strokeWidth, this.fillEnabled, this.theme, this.camera.zoom, this.fontSize, this.roughness);
  }

  setTool(tool: Tool): void {
    this.activeTool = tool;
    let cursor = 'crosshair';
    if (tool === 'select') cursor = 'default';
    else if (tool === 'hand') cursor = 'grab';
    else if (tool === 'text') cursor = 'text';
    else if (tool === 'eraser') cursor = 'cell';
    this.liveCanvas.style.cursor = cursor;
    this.updateToolbar();
    this.emit('toolchange');
  }

  getTool(): Tool { return this.activeTool; }
  
  setColor(color: string): void {
    this.strokeColor = color;
    this.updateToolbar();
  }
  
  getColor(): string { return this.strokeColor; }
  
  setWidth(width: number): void {
    this.strokeWidth = Math.max(1, Math.min(50, width));
    this.updateToolbar();
  }
  
  getWidth(): number { return this.strokeWidth; }
  
  getFontSize(): number { return this.fontSize; }
  
  setFontSize(size: number): void {
    this.fontSize = Math.max(8, Math.min(72, size));
    this.updateToolbar();
  }

  getRoughness(): number { return this.roughness; }
  
  setRoughness(level: number): void {
    this.roughness = Math.max(0, Math.min(3, level));
    this.renderAll();
  }
  
  setFill(enabled: boolean): void {
    this.fillEnabled = enabled;
    this.updateToolbar();
  }
  
  getFill(): boolean { return this.fillEnabled; }
  
  getTheme(): 'light' | 'dark' { return this.theme; }
  
  setTheme(theme: 'light' | 'dark'): void {
    this.theme = theme;
    this.root.style.background = THEMES[this.theme].canvasBg;
    this.renderAll();
    this.updateToolbar();
  }
  
  getZoom(): number { return this.camera.zoom; }
  
  zoomTo(level: number, center?: Point): void {
    const cx = center?.x ?? (this.width / 2);
    const cy = center?.y ?? (this.height / 2);
    const worldBefore = this.screenToWorld(cx, cy);
    this.camera.zoom = Math.max(0.1, Math.min(10, level));
    const worldAfter = this.screenToWorld(cx, cy);
    this.camera.x += worldBefore.x - worldAfter.x;
    this.camera.y += worldBefore.y - worldAfter.y;
    this.renderAll();
    this.updateToolbar();
  }
  
  resetView(): void {
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.renderAll();
    this.updateToolbar();
  }
  
  isGraphEnabled(): boolean { return this.graph.enabled; }

  enableGraph(options?: Partial<GraphConfig>): void {
    this.graph = { ...this.graph, ...options, enabled: true };
    this.renderStatic();
  }

  disableGraph(): void {
    this.graph.enabled = false;
    this.renderStatic();
  }

  undo(): void {
    if (this.undoStack.length === 0) return;
    this.redoStack.push(JSON.parse(JSON.stringify(this.elements)));
    this.elements = this.undoStack.pop()!;
    this.selectedIds.clear();
    this.renderAll();
    this.updateToolbar();
    this.emit('undo');
    this.emit('change');
  }

  redo(): void {
    if (this.redoStack.length === 0) return;
    this.undoStack.push(JSON.parse(JSON.stringify(this.elements)));
    this.elements = this.redoStack.pop()!;
    this.selectedIds.clear();
    this.renderAll();
    this.updateToolbar();
    this.emit('redo');
    this.emit('change');
  }

  clear(): void {
    if (this.elements.length === 0) {
      this.emit('clear');
      return;
    }
    this.pushUndo();
    this.elements = [];
    this.selectedIds.clear();
    this.currentElement = null;
    this.imageCache.clear();
    this.renderAll();
    this.updateToolbar();
    this.emit('clear');
    this.emit('change');
  }

  getElements(): readonly Element[] { return this.elements; }

  on(event: BlackboardEvent, callback: BlackboardEventCallback): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(callback);
  }

  off(event: BlackboardEvent, callback: BlackboardEventCallback): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: BlackboardEvent): void {
    const set = this.listeners.get(event);
    if (!set) return;
    const payload = { elements: this.elements, tool: this.activeTool };
    set.forEach((cb) => cb(payload));
  }

  bringForward(): void {
    if (this.selectedIds.size !== 1) return;
    const id = this.selectedIds.values().next().value!;
    const idx = this.elements.findIndex(e => e.id === id);
    if (idx < 0 || idx >= this.elements.length - 1) return;
    this.pushUndo();
    [this.elements[idx], this.elements[idx + 1]] = [this.elements[idx + 1], this.elements[idx]];
    this.renderAll();
    this.emit('change');
  }

  sendBackward(): void {
    if (this.selectedIds.size !== 1) return;
    const id = this.selectedIds.values().next().value!;
    const idx = this.elements.findIndex(e => e.id === id);
    if (idx <= 0) return;
    this.pushUndo();
    [this.elements[idx], this.elements[idx - 1]] = [this.elements[idx - 1], this.elements[idx]];
    this.renderAll();
    this.emit('change');
  }

  bringToFront(): void {
    if (this.selectedIds.size !== 1) return;
    const id = this.selectedIds.values().next().value!;
    const idx = this.elements.findIndex(e => e.id === id);
    if (idx < 0 || idx >= this.elements.length - 1) return;
    this.pushUndo();
    const [el] = this.elements.splice(idx, 1);
    this.elements.push(el);
    this.renderAll();
    this.emit('change');
  }

  sendToBack(): void {
    if (this.selectedIds.size !== 1) return;
    const id = this.selectedIds.values().next().value!;
    const idx = this.elements.findIndex(e => e.id === id);
    if (idx <= 0) return;
    this.pushUndo();
    const [el] = this.elements.splice(idx, 1);
    this.elements.unshift(el);
    this.renderAll();
    this.emit('change');
  }

  duplicateSelected(): void {
    if (this.selectedIds.size === 0) return;
    this.pushUndo();
    const newIds = new Set<string>();
    const groupMap = new Map<string, string>();
    for (const id of this.selectedIds) {
      const el = this.elements.find(e => e.id === id);
      if (!el) continue;
      const clone = JSON.parse(JSON.stringify(el));
      clone.id = crypto.randomUUID();
      if (el.groupId) {
        if (!groupMap.has(el.groupId)) groupMap.set(el.groupId, crypto.randomUUID());
        clone.groupId = groupMap.get(el.groupId);
      } else {
        clone.groupId = undefined;
      }
      if ('start' in clone) { clone.start = { x: clone.start.x + 20, y: clone.start.y + 20 }; clone.end = { x: clone.end.x + 20, y: clone.end.y + 20 }; }
      if ('position' in clone) { clone.position = { x: clone.position.x + 20, y: clone.position.y + 20 }; }
      if ('points' in clone) { clone.points = clone.points.map((p: any) => ({ x: p.x + 20, y: p.y + 20, pressure: p.pressure })); }
      this.elements.push(clone);
      newIds.add(clone.id);
    }
    this.selectedIds = newIds;
    this.renderAll();
    this.emit('change');
  }

  rotateSelected(angle: number): void {
    if (this.selectedIds.size === 0) return;
    this.pushUndo();
    for (const id of this.selectedIds) {
      const el = this.elements.find(e => e.id === id);
      if (!el) continue;
      el.rotation = ((el.rotation ?? 0) + angle) % (Math.PI * 2);
    }
    this.renderAll();
    this.emit('change');
  }

  getSelectedRotation(): number {
    if (this.selectedIds.size !== 1) return 0;
    const id = this.selectedIds.values().next().value!;
    const el = this.elements.find(e => e.id === id);
    return el ? (el.rotation ?? 0) : 0;
  }

  copySelected(): void {
    if (this.selectedIds.size === 0) return;
    this.clipboard = [];
    for (const id of this.selectedIds) {
      const el = this.elements.find(e => e.id === id);
      if (!el) continue;
      const clone = JSON.parse(JSON.stringify(el));
      clone.id = crypto.randomUUID();
      this.clipboard.push(clone);
    }
  }

  pasteClipboard(): void {
    if (this.clipboard.length === 0) return;
    this.pushUndo();
    const newIds = new Set<string>();
    for (const el of this.clipboard) {
      const clone = JSON.parse(JSON.stringify(el));
      clone.id = crypto.randomUUID();
      if ('start' in clone) { clone.start = { x: clone.start.x + 20, y: clone.start.y + 20 }; clone.end = { x: clone.end.x + 20, y: clone.end.y + 20 }; }
      if ('position' in clone) { clone.position = { x: clone.position.x + 20, y: clone.position.y + 20 }; }
      if ('points' in clone) { clone.points = clone.points.map((p: any) => ({ x: p.x + 20, y: p.y + 20, pressure: p.pressure })); }
      this.elements.push(clone);
      newIds.add(clone.id);
    }
    this.selectedIds = newIds;
    this.clipboard = this.clipboard.map(c => JSON.parse(JSON.stringify(c)));
    this.renderAll();
    this.emit('change');
  }

  selectAll(): void {
    this.selectedIds = new Set(this.elements.map(el => el.id));
    this.renderAll();
    this.emit('change');
  }

  toDataURL(type = 'image/png', quality = 1): string {
    const c = document.createElement('canvas');
    c.width = this.width * this.dpr;
    c.height = this.height * this.dpr;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(this.staticCanvas, 0, 0);
    ctx.drawImage(this.liveCanvas, 0, 0);
    return c.toDataURL(type, quality);
  }

  toBlob(type = 'image/png', quality = 1): Promise<Blob | null> {
    return new Promise(resolve => {
      const c = document.createElement('canvas');
      c.width = this.width * this.dpr;
      c.height = this.height * this.dpr;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(this.staticCanvas, 0, 0);
      ctx.drawImage(this.liveCanvas, 0, 0);
      c.toBlob(resolve, type, quality);
    });
  }

  exportJSON(): Snapshot {
    return { elements: JSON.parse(JSON.stringify(this.elements)), width: this.width, height: this.height, camera: { ...this.camera } };
  }

  importJSON(snapshot: Snapshot): void {
    this.elements = snapshot.elements;
    this.undoStack = [];
    this.redoStack = [];
    this.imageCache.clear();
    if (snapshot.camera) this.camera = snapshot.camera;
    this.selectedIds.clear();
    this.renderAll();
    this.emit('load');
    this.emit('change');
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.setupCanvases();
    this.renderAll();
  }

  saveToStorage(key = 'casuya-blackboard'): void {
    const data = JSON.stringify(this.exportJSON());
    if (data.length > 4 * 1024 * 1024) {
      this.showToast('⚠️ Large data — some images may not persist');
    }
    try {
      localStorage.setItem(key, data);
      this.emit('save');
    } catch {
      this.showToast('⚠️ Storage full — clear browser data');
    }
  }

  loadFromStorage(key = 'casuya-blackboard'): boolean {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    try {
      this.importJSON(JSON.parse(raw));
      return true;
    } catch { return false; }
  }

  showToast(msg: string): void {
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.cssText = `
      position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
      background: #1e293b; color: white; padding: 8px 16px; border-radius: 8px;
      font-size: 13px; z-index: 100; pointer-events: none; white-space: nowrap;
      animation: fadeInOut 2s ease forwards;
    `;
    const style = document.createElement('style');
    style.textContent = `@keyframes fadeInOut { 0% { opacity: 0; transform: translateX(-50%) translateY(8px); } 15% { opacity: 1; transform: translateX(-50%) translateY(0); } 80% { opacity: 1; } 100% { opacity: 0; } }`;
    toast.appendChild(style);
    this.root.appendChild(style);
    this.root.appendChild(toast);
    setTimeout(() => { toast.remove(); style.remove(); }, 2000);
  }

  private handleImagePaste(e: ClipboardEvent): void {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;
        const reader = new FileReader();
        reader.onload = () => {
          const src = reader.result as string;
          const img = new Image();
          img.onload = () => {
            const centerX = this.width / 2;
            const centerY = this.height / 2;
            const world = this.screenToWorld(centerX, centerY);
            const el: ImageElement = {
              id: crypto.randomUUID(),
              tool: 'image',
              position: { x: world.x - img.width / 2, y: world.y - img.height / 2 },
              width: img.width,
              height: img.height,
              src,
              opacity: 1,
            };
            this.pushUndo();
            this.elements.push(el);
            this.renderAll();
            this.emit('change');
          };
          img.src = src;
        };
        reader.readAsDataURL(blob);
        break;
      }
    }
  }

  private handleDragOver(e: DragEvent): void {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }

  private handleFileDrop(e: DragEvent): void {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (!files) return;
    const rect = this.liveCanvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = this.screenToWorld(sx, sy);
    this.pushUndo();
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const src = reader.result as string;
        const img = new Image();
        img.onload = () => {
          const el: ImageElement = {
            id: crypto.randomUUID(),
            tool: 'image',
            position: { x: world.x - img.width / 2, y: world.y - img.height / 2 },
            width: img.width,
            height: img.height,
            src,
            opacity: 1,
          };
          this.elements.push(el);
          this.renderAll();
          this.emit('change');
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    }
  }

  private drawImage(ctx: CanvasRenderingContext2D, el: ImageElement): void {
    let cached = this.imageCache.get(el.src);
    if (!cached) {
      cached = new Image();
      cached.src = el.src;
      this.imageCache.set(el.src, cached);
      if (!cached.complete) {
        cached.onload = () => this.renderAll();
      }
    }
    if (cached.complete && cached.naturalWidth > 0) {
      ctx.drawImage(cached, el.position.x, el.position.y, el.width, el.height);
    }
  }

  groupSelected(): void {
    if (this.selectedIds.size < 2) return;
    this.pushUndo();
    const groupId = crypto.randomUUID();
    for (const id of this.selectedIds) {
      const el = this.elements.find(e => e.id === id);
      if (el) el.groupId = groupId;
    }
    this.renderAll();
    this.emit('change');
  }

  ungroupSelected(): void {
    if (this.selectedIds.size === 0) return;
    this.pushUndo();
    for (const id of this.selectedIds) {
      const el = this.elements.find(e => e.id === id);
      if (el) el.groupId = undefined;
    }
    this.renderAll();
    this.emit('change');
  }

  exportSVG(): string {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of this.elements) {
      const b = this.getElementBounds(el);
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.x + b.w > maxX) maxX = b.x + b.w;
      if (b.y + b.h > maxY) maxY = b.y + b.h;
    }
    if (minX === Infinity) { minX = 0; minY = 0; maxX = this.width; maxY = this.height; }
    const pad = 10;
    const vx = minX - pad;
    const vy = minY - pad;
    const vw = maxX - minX + pad * 2;
    const vh = maxY - minY + pad * 2;
    const parts: string[] = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" width="${vw}" height="${vh}">`);
    parts.push(`<g transform="scale(${1/this.camera.zoom}) translate(${-this.camera.x}, ${-this.camera.y})">`);
    for (const el of this.elements) {
      parts.push(this.elementToSVG(el));
    }
    parts.push('</g>');
    parts.push('</svg>');
    return parts.join('\n');
  }

  private elementToSVG(el: Element): string {
    const rotation = el.rotation ?? 0;
    const op = el.opacity !== undefined ? ` opacity="${el.opacity}"` : '';
    if (el.tool === 'pen' || el.tool === 'eraser') {
      const stroke = el as Stroke;
      if (stroke.points.length < 2) return '';
      const outlinePoints = getStroke(
        stroke.points.map(p => [p.x, p.y, p.pressure ?? 0.5]),
        { size: stroke.width, thinning: 0.5, smoothing: 0.5, streamline: 0.5, simulatePressure: true }
      );
      const pathData = getSvgPathFromStroke(outlinePoints);
      if (!pathData) return '';
      const fill = stroke.tool === 'eraser' ? 'none' : stroke.color;
      const rot = rotation !== 0 ? ` transform="rotate(${rotation * 180 / Math.PI}, ${this.getRotationCenter(el).x}, ${this.getRotationCenter(el).y})"` : '';
      return `<path d="${pathData}" fill="${fill}"${rot}${op}/>`;
    }
    if (el.tool === 'line') {
      const s = el as Shape;
      const rot = rotation !== 0 ? ` transform="rotate(${rotation * 180 / Math.PI}, ${this.getRotationCenter(el).x}, ${this.getRotationCenter(el).y})"` : '';
      return `<line x1="${s.start.x}" y1="${s.start.y}" x2="${s.end.x}" y2="${s.end.y}" stroke="${s.color}" stroke-width="${s.width}" stroke-linecap="round"${rot}${op}/>`;
    }
    if (el.tool === 'rect') {
      const s = el as Shape;
      const rx = Math.min(s.start.x, s.end.x);
      const ry = Math.min(s.start.y, s.end.y);
      const rw = Math.abs(s.end.x - s.start.x);
      const rh = Math.abs(s.end.y - s.start.y);
      const cr = s.cornerRadius ? ` rx="${s.cornerRadius}" ry="${s.cornerRadius}"` : '';
      const fill = s.filled ? ` fill="${s.color}" fill-opacity="0.25"` : ' fill="none"';
      const rot = rotation !== 0 ? ` transform="rotate(${rotation * 180 / Math.PI}, ${this.getRotationCenter(el).x}, ${this.getRotationCenter(el).y})"` : '';
      return `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}"${cr} stroke="${s.color}" stroke-width="${s.width}"${fill}${rot}${op}/>`;
    }
    if (el.tool === 'circle') {
      const s = el as Shape;
      const cx = (s.start.x + s.end.x) / 2;
      const cy = (s.start.y + s.end.y) / 2;
      const rrx = Math.abs(s.end.x - s.start.x) / 2;
      const rry = Math.abs(s.end.y - s.start.y) / 2;
      const fill = s.filled ? ` fill="${s.color}" fill-opacity="0.25"` : ' fill="none"';
      const rot = rotation !== 0 ? ` transform="rotate(${rotation * 180 / Math.PI}, ${this.getRotationCenter(el).x}, ${this.getRotationCenter(el).y})"` : '';
      return `<ellipse cx="${cx}" cy="${cy}" rx="${rrx}" ry="${rry}" stroke="${s.color}" stroke-width="${s.width}"${fill}${rot}${op}/>`;
    }
    if (el.tool === 'arrow') {
      const s = el as Shape;
      const dx = s.end.x - s.start.x;
      const dy = s.end.y - s.start.y;
      const len = Math.hypot(dx, dy);
      if (len < 1) return '';
      const headLen = Math.min(15, len * 0.3);
      const angle = Math.atan2(dy, dx);
      const ax1 = s.end.x - headLen * Math.cos(angle - Math.PI / 6);
      const ay1 = s.end.y - headLen * Math.sin(angle - Math.PI / 6);
      const ax2 = s.end.x - headLen * Math.cos(angle + Math.PI / 6);
      const ay2 = s.end.y - headLen * Math.sin(angle + Math.PI / 6);
      const dash = s.dashPattern ? ` stroke-dasharray="${s.dashPattern.join(',')}"` : '';
      const rot = rotation !== 0 ? ` transform="rotate(${rotation * 180 / Math.PI}, ${this.getRotationCenter(el).x}, ${this.getRotationCenter(el).y})"` : '';
      return `<g${rot}${op}><line x1="${s.start.x}" y1="${s.start.y}" x2="${s.end.x}" y2="${s.end.y}" stroke="${s.color}" stroke-width="${s.width}" stroke-linecap="round"${dash}/><line x1="${s.end.x}" y1="${s.end.y}" x2="${ax1}" y2="${ay1}" stroke="${s.color}" stroke-width="${s.width}" stroke-linecap="round"${dash}/><line x1="${s.end.x}" y1="${s.end.y}" x2="${ax2}" y2="${ay2}" stroke="${s.color}" stroke-width="${s.width}" stroke-linecap="round"${dash}/></g>`;
    }
    if (el.tool === 'text') {
      const t = el as TextElement;
      const lines = this.wordWrapTextForSVG(t.content, t.fontSize, t.width > 1 ? t.width : 300, t.fontFamily);
      const lineHeight = t.fontSize * 1.4;
      const tspans = lines.map((line, i) =>
        `<tspan x="${t.position.x}" dy="${i === 0 ? 0 : lineHeight}">${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</tspan>`
      ).join('');
      const rot = rotation !== 0 ? ` transform="rotate(${rotation * 180 / Math.PI}, ${this.getRotationCenter(el).x}, ${this.getRotationCenter(el).y})"` : '';
      return `<text x="${t.position.x}" y="${t.position.y}" font-size="${t.fontSize}" font-family="${t.fontFamily}" fill="${t.color}"${rot}${op}>${tspans}</text>`;
    }
    if (el.tool === 'image') {
      const img = el as ImageElement;
      const rot = rotation !== 0 ? ` transform="rotate(${rotation * 180 / Math.PI}, ${this.getRotationCenter(el).x}, ${this.getRotationCenter(el).y})"` : '';
      return `<image href="${img.src}" x="${img.position.x}" y="${img.position.y}" width="${img.width}" height="${img.height}"${rot}${op}/>`;
    }
    return '';
  }

  private wordWrapTextForSVG(text: string, fontSize: number, maxWidth: number, fontFamily = 'system-ui, -apple-system, sans-serif'): string[] {
    const rawLines = text.split('\n');
    const wrappedLines: string[] = [];
    const ctx = this.staticCtx;
    ctx.font = `${fontSize}px ${fontFamily}`;
    for (const rawLine of rawLines) {
      if (rawLine === '') { wrappedLines.push(''); continue; }
      const words = rawLine.split(' ');
      let currentLine = '';
      for (const word of words) {
        const testLine = currentLine ? currentLine + ' ' + word : word;
        if (ctx.measureText(testLine).width > maxWidth && currentLine) {
          wrappedLines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      wrappedLines.push(currentLine);
    }
    return wrappedLines;
  }

  destroy(): void {
    this.detachEvents();
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.imageCache.clear();
    this.root.remove();
  }
}
