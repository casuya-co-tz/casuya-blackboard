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

const TOOL_TITLES: Record<Tool, string> = {
  pen: 'Pen',
  line: 'Line',
  rect: 'Rectangle',
  circle: 'Circle',
  arrow: 'Arrow',
  eraser: 'Eraser',
};

function sep(): HTMLDivElement {
  const s = document.createElement('div');
  s.style.cssText = 'width: 1px; height: 28px; background: #e2e8f0; margin: 0 4px;';
  return s;
}

function actionBtn(icon: string, title: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = icon;
  btn.title = title;
  btn.style.cssText = `
    width: 34px; height: 34px; border: none; border-radius: 8px;
    background: transparent; cursor: pointer; display: flex;
    align-items: center; justify-content: center;
    font-size: 15px; color: #64748b; transition: all 0.15s ease;
  `;
  btn.addEventListener('mouseenter', () => { btn.style.background = '#e2e8f0'; btn.style.color = '#334155'; });
  btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; btn.style.color = '#64748b'; });
  btn.addEventListener('click', onClick);
  return btn;
}

export function createToolbar(board: Blackboard): ToolbarElements {
  const bar = document.createElement('div');
  bar.style.cssText = `
    display: flex; align-items: center; gap: 6px;
    padding: 8px 12px; background: #f8fafc;
    border-bottom: 1px solid #e2e8f0; flex-wrap: wrap;
  `;

  const toolButtons = new Map<Tool, HTMLButtonElement>();
  const toolGroup = document.createElement('div');
  toolGroup.style.cssText = 'display: flex; gap: 4px;';

  for (const tool of ['pen', 'line', 'rect', 'circle', 'arrow', 'eraser'] as Tool[]) {
    const btn = document.createElement('button');
    btn.innerHTML = TOOL_ICONS[tool];
    btn.title = TOOL_TITLES[tool];
    btn.style.cssText = `
      width: 36px; height: 36px; border: 2px solid transparent; border-radius: 8px;
      background: transparent; cursor: pointer; display: flex;
      align-items: center; justify-content: center; color: #64748b;
      transition: all 0.15s ease;
    `;
    btn.addEventListener('mouseenter', () => {
      if (board.getTool() !== tool) { btn.style.background = '#e2e8f0'; btn.style.color = '#334155'; }
    });
    btn.addEventListener('mouseleave', () => {
      if (board.getTool() !== tool) { btn.style.background = 'transparent'; btn.style.color = '#64748b'; }
    });
    btn.addEventListener('click', () => board.setTool(tool));
    toolButtons.set(tool, btn);
    toolGroup.appendChild(btn);
  }
  bar.appendChild(toolGroup);
  bar.appendChild(sep());

  const colorGroup = document.createElement('div');
  colorGroup.style.cssText = 'display: flex; gap: 4px; align-items: center;';
  for (const color of COLORS) {
    const swatch = document.createElement('button');
    swatch.dataset.color = color;
    swatch.style.cssText = `
      width: 24px; height: 24px; border-radius: 50%;
      border: 2px solid transparent; background: ${color};
      cursor: pointer; transition: all 0.15s ease; padding: 0;
    `;
    swatch.addEventListener('mouseenter', () => { swatch.style.transform = 'scale(1.2)'; });
    swatch.addEventListener('mouseleave', () => { swatch.style.transform = 'scale(1)'; });
    swatch.addEventListener('click', () => board.setColor(color));
    colorGroup.appendChild(swatch);
  }
  bar.appendChild(colorGroup);
  bar.appendChild(sep());

  const widthGroup = document.createElement('div');
  widthGroup.style.cssText = 'display: flex; align-items: center; gap: 8px;';
  const widthLabel = document.createElement('span');
  widthLabel.style.cssText = 'font-size: 12px; color: #64748b; min-width: 24px; text-align: center;';
  const slider = document.createElement('input');
  slider.type = 'range'; slider.min = '1'; slider.max = '20';
  slider.value = String(board.getWidth());
  slider.style.cssText = 'width: 80px; height: 4px; -webkit-appearance: none; appearance: none; background: #e2e8f0; border-radius: 2px; outline: none; cursor: pointer;';
  slider.addEventListener('input', () => board.setWidth(Number(slider.value)));
  const widthPreview = document.createElement('div');
  widthPreview.style.cssText = 'width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;';
  const widthDot = document.createElement('div');
  widthDot.style.cssText = `background: ${board.getColor()}; border-radius: 50%; transition: all 0.15s ease;`;
  widthPreview.appendChild(widthDot);
  widthGroup.appendChild(widthLabel);
  widthGroup.appendChild(slider);
  widthGroup.appendChild(widthPreview);
  bar.appendChild(widthGroup);
  bar.appendChild(sep());

  const undoBtn = actionBtn('↩', 'Undo (Ctrl+Z)', () => board.undo());
  const redoBtn = actionBtn('↪', 'Redo (Ctrl+Shift+Z)', () => board.redo());
  const clearBtn = actionBtn('✕', 'Clear all', () => board.clear());
  const graphBtn = actionBtn('⊞', 'Toggle graph paper', () => {
    const b = board as any;
    if (b.graph?.enabled) { board.disableGraph(); graphBtn.style.background = 'transparent'; graphBtn.style.color = '#64748b'; }
    else { board.enableGraph(); graphBtn.style.background = '#dbeafe'; graphBtn.style.color = '#2563eb'; }
  });
  const saveBtn = actionBtn('↓', 'Save to browser', () => { board.saveToStorage(); showToast(board); });

  const actionGroup = document.createElement('div');
  actionGroup.style.cssText = 'display: flex; gap: 4px;';
  actionGroup.appendChild(undoBtn);
  actionGroup.appendChild(redoBtn);
  actionGroup.appendChild(clearBtn);
  actionGroup.appendChild(graphBtn);
  actionGroup.appendChild(saveBtn);
  bar.appendChild(actionGroup);

  return { bar, toolButtons, undoBtn, redoBtn, graphBtn, widthLabel, widthDot };
}

export function updateToolbarState(tb: ToolbarElements, activeTool: Tool, color: string, width: number): void {
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
}

function showToast(board: Blackboard): void {
  const root = (board as any).root as HTMLElement;
  const toast = document.createElement('div');
  toast.textContent = '✓ Saved';
  toast.style.cssText = `
    position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
    background: #1e293b; color: white; padding: 8px 16px; border-radius: 8px;
    font-size: 13px; font-family: system-ui; z-index: 100;
    animation: fadeInOut 2s ease forwards;
  `;
  const style = document.createElement('style');
  style.textContent = `@keyframes fadeInOut { 0% { opacity: 0; transform: translateX(-50%) translateY(8px); } 15% { opacity: 1; transform: translateX(-50%) translateY(0); } 80% { opacity: 1; } 100% { opacity: 0; } }`;
  toast.appendChild(style);
  root.appendChild(style);
  root.appendChild(toast);
  setTimeout(() => { toast.remove(); style.remove(); }, 2000);
}
