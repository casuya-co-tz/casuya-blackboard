import type { Tool } from './types';
import type { Blackboard, ToolbarElements } from './Blackboard';

const TOOL_ICONS: Record<Tool, string> = {
  pen: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`,
  line: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="19" x2="19" y2="5"/></svg>`,
  rect: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>`,
  circle: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`,
  arrow: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
  eraser: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>`,
};

const COLORS = [
  '#1e293b', '#dc2626', '#2563eb', '#16a34a',
  '#ca8a04', '#9333ea', '#ea580c', '#0891b2',
];

const TOOL_LABELS: Record<Tool, string> = {
  pen: 'Pen',
  line: 'Line',
  rect: 'Rect',
  circle: 'Circle',
  arrow: 'Arrow',
  eraser: 'Eraser',
};

const TOOL_DESCRIPTIONS: Record<Tool, string> = {
  pen: 'Freehand drawing with pressure sensitivity',
  line: 'Draw a straight line',
  rect: 'Draw a rectangle (toggle fill for solid shapes)',
  circle: 'Draw an ellipse (toggle fill for solid shapes)',
  arrow: 'Draw an arrow',
  eraser: 'Erase parts of your drawing',
};

const TOOLBAR_STYLES = `
.casuya-toolbar-sep { width: 1px; height: 32px; background: #e2e8f0; margin: 0 6px; flex-shrink: 0; }
.casuya-toolbar-btn {
  min-width: 48px; height: 48px; border: 2px solid transparent; border-radius: 8px;
  background: transparent; cursor: pointer; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 2px; padding: 4px 6px;
  color: #64748b; transition: all 0.15s ease; font-family: inherit;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation;
}
.casuya-toolbar-btn:hover { background: #e2e8f0; color: #334155; }
.casuya-toolbar-btn:active { transform: scale(0.95); }
.casuya-toolbar-btn svg { flex-shrink: 0; }
.casuya-toolbar-label {
  font-size: 9px; line-height: 1; color: inherit; letter-spacing: 0.02em;
  max-width: 48px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.casuya-action-btn {
  width: 40px; height: 40px; border: none; border-radius: 8px;
  background: transparent; cursor: pointer; display: flex;
  align-items: center; justify-content: center;
  font-size: 16px; color: #64748b; transition: all 0.15s ease; flex-shrink: 0;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation;
}
.casuya-action-btn:hover { background: #e2e8f0; color: #334155; }
.casuya-action-btn:active { transform: scale(0.95); }
.casuya-swatch {
  width: 28px; height: 28px; border-radius: 50%;
  border: 2px solid transparent; cursor: pointer;
  transition: all 0.15s ease; padding: 0; flex-shrink: 0;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation;
}
.casuya-swatch:active { transform: scale(0.9); }
.casuya-color-picker {
  width: 28px; height: 28px; border: none; border-radius: 50%; padding: 0;
  cursor: pointer; flex-shrink: 0; overflow: hidden;
  -webkit-tap-highlight-color: transparent;
}
.casuya-color-picker::-webkit-color-swatch-wrapper { padding: 0; }
.casuya-color-picker::-webkit-color-swatch { border: 2px solid #e2e8f0; border-radius: 50%; }
.casuya-tooltip {
  width: 100%; padding: 6px 10px; font-size: 11px; color: #64748b;
  background: #f1f5f9; border-top: 1px solid #e2e8f0; min-height: 28px;
  box-sizing: border-box; line-height: 1.4;
}
.casuya-tooltip:empty { display: none; }
@media (max-width: 640px) {
  .casuya-toolbar-btn { min-width: 44px; height: 44px; padding: 3px 4px; }
  .casuya-toolbar-label { font-size: 8px; max-width: 40px; }
  .casuya-action-btn { width: 36px; height: 36px; font-size: 14px; }
  .casuya-swatch { width: 24px; height: 24px; }
  .casuya-color-picker { width: 24px; height: 24px; }
}
`;

function injectStyles(): void {
  if (document.getElementById('casuya-toolbar-styles')) return;
  const style = document.createElement('style');
  style.id = 'casuya-toolbar-styles';
  style.textContent = TOOLBAR_STYLES;
  document.head.appendChild(style);
}

function sep(): HTMLDivElement {
  const s = document.createElement('div');
  s.className = 'casuya-toolbar-sep';
  return s;
}

export function createToolbar(board: Blackboard): ToolbarElements {
  injectStyles();

  const bar = document.createElement('div');
  bar.style.cssText = `
    display: flex; flex-direction: column; background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
  `;

  const row = document.createElement('div');
  row.style.cssText = `
    display: flex; align-items: center; gap: 6px;
    padding: 6px 10px; flex-wrap: wrap;
  `;

  const tooltipEl = document.createElement('div');
  tooltipEl.className = 'casuya-tooltip';

  const toolButtons = new Map<Tool, HTMLButtonElement>();
  const toolGroup = document.createElement('div');
  toolGroup.style.cssText = 'display: flex; gap: 4px; flex-wrap: wrap;';

  for (const tool of ['pen', 'line', 'rect', 'circle', 'arrow', 'eraser'] as Tool[]) {
    const btn = document.createElement('button');
    btn.className = 'casuya-toolbar-btn';
    btn.innerHTML = `${TOOL_ICONS[tool]}<span class="casuya-toolbar-label">${TOOL_LABELS[tool]}</span>`;
    btn.addEventListener('mouseenter', () => {
      if (board.getTool() !== tool) { btn.style.background = '#e2e8f0'; btn.style.color = '#334155'; }
      tooltipEl.textContent = TOOL_DESCRIPTIONS[tool];
    });
    btn.addEventListener('mouseleave', () => {
      if (board.getTool() !== tool) { btn.style.background = 'transparent'; btn.style.color = '#64748b'; }
      tooltipEl.textContent = '';
    });
    btn.addEventListener('focus', () => { tooltipEl.textContent = TOOL_DESCRIPTIONS[tool]; });
    btn.addEventListener('blur', () => { tooltipEl.textContent = ''; });
    btn.addEventListener('click', () => board.setTool(tool));
    toolButtons.set(tool, btn);
    toolGroup.appendChild(btn);
  }
  row.appendChild(toolGroup);
  row.appendChild(sep());

  const colorGroup = document.createElement('div');
  colorGroup.style.cssText = 'display: flex; gap: 4px; align-items: center; flex-wrap: wrap;';
  for (const color of COLORS) {
    const swatch = document.createElement('button');
    swatch.className = 'casuya-swatch';
    swatch.dataset.color = color;
    swatch.style.background = color;
    swatch.addEventListener('mouseenter', () => { swatch.style.transform = 'scale(1.2)'; });
    swatch.addEventListener('mouseleave', () => { swatch.style.transform = 'scale(1)'; });
    swatch.addEventListener('click', () => {
      board.setColor(color);
      colorInput.value = color;
    });
    colorGroup.appendChild(swatch);
  }
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.className = 'casuya-color-picker';
  colorInput.value = board.getColor();
  colorInput.title = 'Custom color';
  colorInput.addEventListener('input', () => board.setColor(colorInput.value));
  colorGroup.appendChild(colorInput);
  row.appendChild(colorGroup);
  row.appendChild(sep());

  const widthGroup = document.createElement('div');
  widthGroup.style.cssText = 'display: flex; align-items: center; gap: 8px;';
  const widthLabel = document.createElement('span');
  widthLabel.style.cssText = 'font-size: 11px; color: #64748b; min-width: 22px; text-align: center;';
  const slider = document.createElement('input');
  slider.type = 'range'; slider.min = '1'; slider.max = '20';
  slider.value = String(board.getWidth());
  slider.style.cssText = 'width: 72px; height: 4px; -webkit-appearance: none; appearance: none; background: #e2e8f0; border-radius: 2px; outline: none; cursor: pointer;';
  slider.addEventListener('input', () => board.setWidth(Number(slider.value)));
  const widthPreview = document.createElement('div');
  widthPreview.style.cssText = 'width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;';
  const widthDot = document.createElement('div');
  widthDot.style.cssText = `background: ${board.getColor()}; border-radius: 50%; transition: all 0.15s ease;`;
  widthPreview.appendChild(widthDot);
  widthGroup.appendChild(widthLabel);
  widthGroup.appendChild(slider);
  widthGroup.appendChild(widthPreview);
  row.appendChild(widthGroup);
  row.appendChild(sep());

  const undoBtn = createActionBtn('\u21A9', 'Undo (Ctrl+Z)', tooltipEl, () => board.undo());
  const redoBtn = createActionBtn('\u21AA', 'Redo (Ctrl+Shift+Z)', tooltipEl, () => board.redo());
  const clearBtn = createActionBtn('\u2715', 'Clear all', tooltipEl, () => board.clear());
  const graphBtn = createActionBtn('\u229E', 'Toggle graph paper', tooltipEl, () => {
    const b = board as any;
    if (b.graph?.enabled) { board.disableGraph(); graphBtn.style.background = 'transparent'; graphBtn.style.color = '#64748b'; }
    else { board.enableGraph(); graphBtn.style.background = '#dbeafe'; graphBtn.style.color = '#2563eb'; }
  });
  const saveBtn = createActionBtn('\u2193', 'Save to browser', tooltipEl, () => { board.saveToStorage(); board.showToast('\u2713 Saved'); });
  const fillBtn = createActionBtn('\u25A3', 'Fill: off', tooltipEl, () => {
    board.setFill(!board.getFill());
  });

  const actionGroup = document.createElement('div');
  actionGroup.style.cssText = 'display: flex; gap: 4px; flex-wrap: wrap;';
  actionGroup.appendChild(undoBtn);
  actionGroup.appendChild(redoBtn);
  actionGroup.appendChild(clearBtn);
  actionGroup.appendChild(graphBtn);
  actionGroup.appendChild(saveBtn);
  actionGroup.appendChild(fillBtn);
  row.appendChild(actionGroup);

  bar.appendChild(row);
  bar.appendChild(tooltipEl);

  return { bar, toolButtons, undoBtn, redoBtn, graphBtn, fillBtn, widthLabel, widthDot, colorInput };
}

function createActionBtn(icon: string, title: string, tooltipEl: HTMLDivElement, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'casuya-action-btn';
  btn.textContent = icon;
  btn.title = title;
  btn.addEventListener('mouseenter', () => { tooltipEl.textContent = title; });
  btn.addEventListener('mouseleave', () => { tooltipEl.textContent = ''; });
  btn.addEventListener('focus', () => { tooltipEl.textContent = title; });
  btn.addEventListener('blur', () => { tooltipEl.textContent = ''; });
  btn.addEventListener('click', onClick);
  return btn;
}

export function updateToolbarState(tb: ToolbarElements, activeTool: Tool, color: string, width: number, fillEnabled: boolean): void {
  for (const [tool, btn] of tb.toolButtons) {
    const active = tool === activeTool;
    btn.style.background = active ? '#dbeafe' : 'transparent';
    btn.style.color = active ? '#2563eb' : '#64748b';
    btn.style.borderColor = active ? '#93c5fd' : 'transparent';
  }
  tb.widthLabel.textContent = `${width}px`;
  tb.widthDot.style.background = color;
  tb.widthDot.style.width = `${Math.max(4, width)}px`;
  tb.widthDot.style.height = `${Math.max(4, width)}px`;
  tb.colorInput.value = color;
  if (fillEnabled) {
    tb.fillBtn.style.background = '#dbeafe';
    tb.fillBtn.style.color = '#2563eb';
    tb.fillBtn.title = 'Fill: on';
  } else {
    tb.fillBtn.style.background = 'transparent';
    tb.fillBtn.style.color = '#64748b';
    tb.fillBtn.title = 'Fill: off';
  }
}
