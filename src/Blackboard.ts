import { getStroke } from 'perfect-freehand';
import type { Tool, Point, Stroke, Shape, GraphConfig, BlackboardOptions, Element, Snapshot, BlackboardEvent, BlackboardEventCallback } from './types';
import { createToolbar, updateToolbarState } from './toolbar';

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

export interface ToolbarElements {
  bar: HTMLDivElement;
  toolButtons: Map<Tool, HTMLButtonElement>;
  undoBtn: HTMLButtonElement;
  redoBtn: HTMLButtonElement;
  graphBtn: HTMLButtonElement;
  fillBtn: HTMLButtonElement;
  widthLabel: HTMLSpanElement;
  widthDot: HTMLDivElement;
  colorInput: HTMLInputElement;
}

export class Blackboard {
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
  private undoStack: Element[] = [];
  private currentElement: Element | null = null;
  private isDrawing = false;

  private graph: GraphConfig;
  private animFrameId: number | null = null;
  private dirty = false;

  private toolbar: ToolbarElements;

  private listeners: Map<string, Set<BlackboardEventCallback>> = new Map();

  constructor(options: BlackboardOptions) {
    this.container = options.container;
    this.width = options.width || this.container.clientWidth || 800;
    this.height = options.height || 600;
    this.dpr = window.devicePixelRatio || 1;
    this.strokeColor = options.color || '#1e293b';
    this.strokeWidth = options.strokeWidth || 2;

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
      background: #ffffff;
      font-family: system-ui, -apple-system, sans-serif;
      user-select: none;
    `;

    this.canvasWrapper = document.createElement('div');
    this.canvasWrapper.style.cssText = 'position: relative; overflow: hidden;';

    this.staticCanvas = document.createElement('canvas');
    this.liveCanvas = document.createElement('canvas');

    [this.staticCanvas, this.liveCanvas].forEach(c => {
      c.style.cssText = `
        position: absolute; top: 0; left: 0;
        width: ${this.width}px; height: ${this.height}px;
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

    this.staticCtx = this.staticCanvas.getContext('2d')!;
    this.liveCtx = this.liveCanvas.getContext('2d')!;

    this.setupCanvases();
    this.attachEvents();
    this.renderStatic();
    updateToolbarState(this.toolbar, this.activeTool, this.strokeColor, this.strokeWidth, this.fillEnabled);
    setTimeout(() => this.showToast('Select a tool and start drawing'), 600);
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
    window.addEventListener('keydown', this.onKeyDown);
  }

  private detachEvents(): void {
    this.liveCanvas.removeEventListener('pointerdown', this.onPointerDown);
    this.liveCanvas.removeEventListener('pointermove', this.onPointerMove);
    this.liveCanvas.removeEventListener('pointerup', this.onPointerUp);
    this.liveCanvas.removeEventListener('pointerleave', this.onPointerUp);
    this.liveCanvas.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private getPoint = (e: PointerEvent): Point => {
    const rect = this.liveCanvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure,
    };
  };

  private onPointerDown = (e: PointerEvent): void => {
    e.preventDefault();
    this.liveCanvas.setPointerCapture(e.pointerId);
    this.isDrawing = true;
    const point = this.getPoint(e);

    if (this.activeTool === 'pen' || this.activeTool === 'eraser') {
      this.currentElement = {
        id: crypto.randomUUID(),
        tool: this.activeTool,
        points: [point],
        color: this.activeTool === 'eraser' ? '#ffffff' : this.strokeColor,
        width: this.activeTool === 'eraser' ? this.strokeWidth * 5 : this.strokeWidth,
        opacity: this.strokeOpacity,
      };
    } else {
      this.currentElement = {
        id: crypto.randomUUID(),
        tool: this.activeTool,
        start: point,
        end: point,
        color: this.strokeColor,
        width: this.strokeWidth,
        opacity: this.strokeOpacity,
        filled: this.fillEnabled,
      };
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.isDrawing || !this.currentElement) return;
    e.preventDefault();
    const point = this.getPoint(e);

    if (this.currentElement.tool === 'pen' || this.currentElement.tool === 'eraser') {
      const last = this.currentElement.points[this.currentElement.points.length - 1];
      if (Math.hypot(point.x - last.x, point.y - last.y) < 2) return;
      this.currentElement.points.push(point);
    } else {
      (this.currentElement as Shape).end = point;
    }

    this.dirty = true;
    if (!this.animFrameId) {
      this.animFrameId = requestAnimationFrame(this.flush);
    }
  };

  private onPointerUp = (): void => {
    if (!this.isDrawing || !this.currentElement) return;
    this.isDrawing = false;

    if (this.currentElement.tool === 'pen' || this.currentElement.tool === 'eraser') {
      if (this.currentElement.points.length < 2) {
        const p = this.currentElement.points[0];
        this.currentElement.points = [
          { x: p.x, y: p.y, pressure: 0.5 },
          { x: p.x + 0.5, y: p.y + 0.5, pressure: 0.5 },
        ];
      }
    }

    this.elements.push(this.currentElement);
    this.undoStack = [];
    this.currentElement = null;
    this.flushLive();
    this.renderStatic();
    updateToolbarState(this.toolbar, this.activeTool, this.strokeColor, this.strokeWidth, this.fillEnabled);
    this.emit('change');
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      e.shiftKey ? this.redo() : this.undo();
    }
  };

  private flush = (): void => {
    this.animFrameId = null;
    if (!this.dirty) return;
    this.dirty = false;
    this.flushLive();
  };

  private flushLive(): void {
    const ctx = this.liveCtx;
    ctx.clearRect(0, 0, this.width, this.height);
    if (this.currentElement) {
      this.drawElement(ctx, this.currentElement);
    }
  }

  private renderStatic(): void {
    const ctx = this.staticCtx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, this.width, this.height);
    if (this.graph.enabled) this.drawGraph(ctx);
    for (const el of this.elements) this.drawElement(ctx, el);
    if (this.elements.length === 0 && !this.currentElement) {
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '14px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Choose a tool and start drawing', this.width / 2, this.height / 2);
    }
  }

  private drawGraph(ctx: CanvasRenderingContext2D): void {
    const { spacing, color, showAxes, showLabels } = this.graph;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= this.width; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
      ctx.stroke();
    }
    for (let y = 0; y <= this.height; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }
    if (showAxes) {
      const cx = this.width / 2;
      const cy = this.height / 2;
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(this.width, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, this.height); ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.moveTo(this.width - 2, cy);
      ctx.lineTo(this.width - 10, cy - 4);
      ctx.lineTo(this.width - 10, cy + 4);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx, 2);
      ctx.lineTo(cx - 4, 10);
      ctx.lineTo(cx + 4, 10);
      ctx.fill();
      if (showLabels) {
        ctx.fillStyle = '#64748b';
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        for (let x = spacing; x < this.width; x += spacing * 2) {
          const label = Math.round((x - cx) / spacing);
          if (label !== 0) ctx.fillText(String(label), x, cy + 14);
        }
        ctx.textAlign = 'right';
        for (let y = spacing; y < this.height; y += spacing * 2) {
          const label = Math.round((cy - y) / spacing);
          if (label !== 0) ctx.fillText(String(label), cx - 6, y + 4);
        }
      }
    }
  }

  private drawElement(ctx: CanvasRenderingContext2D, el: Element): void {
    ctx.save();
    ctx.globalAlpha = el.opacity;
    if (el.tool === 'pen' || el.tool === 'eraser') {
      this.drawFreehand(ctx, el);
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

  private drawShape(ctx: CanvasRenderingContext2D, shape: Shape): void {
    const { start, end, color, width } = shape;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (shape.tool) {
      case 'line':
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        break;
      case 'rect': {
        const rx = Math.min(start.x, end.x);
        const ry = Math.min(start.y, end.y);
        const rw = Math.abs(end.x - start.x);
        const rh = Math.abs(end.y - start.y);
        if (shape.filled) {
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.25;
          ctx.fillRect(rx, ry, rw, rh);
          ctx.globalAlpha = shape.opacity;
        }
        ctx.strokeRect(rx, ry, rw, rh);
        break;
      }
      case 'circle': {
        const cx = (start.x + end.x) / 2;
        const cy = (start.y + end.y) / 2;
        const rx = Math.abs(end.x - start.x) / 2;
        const ry = Math.abs(end.y - start.y) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        if (shape.filled) {
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.25;
          ctx.fill();
          ctx.globalAlpha = shape.opacity;
        }
        ctx.stroke();
        break;
      }
      case 'arrow': {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const len = Math.hypot(dx, dy);
        if (len < 1) break;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
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

  setTool(tool: Tool): void {
    this.activeTool = tool;
    this.liveCanvas.style.cursor = tool === 'eraser' ? 'cell' : 'crosshair';
    updateToolbarState(this.toolbar, this.activeTool, this.strokeColor, this.strokeWidth, this.fillEnabled);
    this.emit('toolchange');
  }

  getTool(): Tool {
    return this.activeTool;
  }

  setColor(color: string): void {
    this.strokeColor = color;
    updateToolbarState(this.toolbar, this.activeTool, this.strokeColor, this.strokeWidth, this.fillEnabled);
  }

  getColor(): string {
    return this.strokeColor;
  }

  setWidth(width: number): void {
    this.strokeWidth = Math.max(1, Math.min(50, width));
    updateToolbarState(this.toolbar, this.activeTool, this.strokeColor, this.strokeWidth, this.fillEnabled);
  }

  getWidth(): number {
    return this.strokeWidth;
  }

  setFill(enabled: boolean): void {
    this.fillEnabled = enabled;
    updateToolbarState(this.toolbar, this.activeTool, this.strokeColor, this.strokeWidth, this.fillEnabled);
  }

  getFill(): boolean {
    return this.fillEnabled;
  }

  enableGraph(options?: Partial<GraphConfig>): void {
    this.graph = { ...this.graph, ...options, enabled: true };
    this.renderStatic();
  }

  disableGraph(): void {
    this.graph.enabled = false;
    this.renderStatic();
  }

  undo(): void {
    if (this.elements.length === 0) return;
    this.undoStack.push(this.elements.pop()!);
    this.renderStatic();
    updateToolbarState(this.toolbar, this.activeTool, this.strokeColor, this.strokeWidth, this.fillEnabled);
    this.emit('undo');
    this.emit('change');
  }

  redo(): void {
    if (this.undoStack.length === 0) return;
    this.elements.push(this.undoStack.pop()!);
    this.renderStatic();
    updateToolbarState(this.toolbar, this.activeTool, this.strokeColor, this.strokeWidth, this.fillEnabled);
    this.emit('redo');
    this.emit('change');
  }

  clear(): void {
    this.elements = [];
    this.undoStack = [];
    this.currentElement = null;
    this.renderStatic();
    this.flushLive();
    updateToolbarState(this.toolbar, this.activeTool, this.strokeColor, this.strokeWidth, this.fillEnabled);
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
    return { elements: JSON.parse(JSON.stringify(this.elements)), width: this.width, height: this.height };
  }

  importJSON(snapshot: Snapshot): void {
    this.elements = snapshot.elements;
    this.undoStack = [];
    this.renderStatic();
    this.emit('load');
    this.emit('change');
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.canvasWrapper.style.width = `${width}px`;
    this.canvasWrapper.style.height = `${height}px`;
    [this.staticCanvas, this.liveCanvas].forEach(c => {
      c.style.width = `${width}px`;
      c.style.height = `${height}px`;
    });
    this.setupCanvases();
    this.renderStatic();
  }

  saveToStorage(key = 'casuya-blackboard'): void {
    localStorage.setItem(key, JSON.stringify(this.exportJSON()));
    this.emit('save');
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

  destroy(): void {
    this.detachEvents();
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.root.remove();
  }
}
