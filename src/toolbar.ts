import type { Tool, ToolbarElements, BlackboardAPI } from './types';

const TOOLBAR_THEMES = {
  light: { barBg: '#f8fafc', barBorder: '#e2e8f0', btnColor: '#64748b', btnHover: '#334155', btnHoverBg: '#e2e8f0', activeBg: '#dbeafe', activeColor: '#2563eb', activeBorder: '#93c5fd', sep: '#e2e8f0', tipBg: '#f1f5f9', tipBorder: '#e2e8f0', tipColor: '#64748b' },
  dark: { barBg: '#1e1e2e', barBorder: '#313244', btnColor: '#6c7086', btnHover: '#cdd6f4', btnHoverBg: '#313244', activeBg: '#313244', activeColor: '#89b4fa', activeBorder: '#45475a', sep: '#313244', tipBg: '#181825', tipBorder: '#313244', tipColor: '#6c7086' },
};

const TOOL_ICONS: Record<Tool, string> = {
  select: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg>`,
  hand: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V4a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`,
  pen: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`,
  text: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>`,
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

const TOOL_ORDER: Tool[] = ['select', 'hand', 'pen', 'text', 'line', 'rect', 'circle', 'arrow', 'eraser'];

const TOOL_LABELS: Record<Tool, string> = {
  select: 'Select',
  hand: 'Hand',
  pen: 'Pen',
  text: 'Text',
  line: 'Line',
  rect: 'Rect',
  circle: 'Circle',
  arrow: 'Arrow',
  eraser: 'Eraser',
};

const TOOL_DESCRIPTIONS: Record<Tool, string> = {
  select: 'Select, move, and resize elements (V)',
  hand: 'Pan the canvas (H / Space+drag)',
  pen: 'Freehand drawing with pressure sensitivity (P)',
  text: 'Add text labels and notes (T)',
  line: 'Draw a straight line (L)',
  rect: 'Draw a rectangle — hold Shift for square (R)',
  circle: 'Draw an ellipse — hold Shift for circle (O)',
  arrow: 'Draw an arrow (A)',
  eraser: 'Remove elements from your drawing (E)',
};

const TOOLBAR_STYLES = `
.casuya-toolbar-sep { width: 1px; height: 32px; margin: 0 6px; flex-shrink: 0; transition: background 0.15s ease; }
.casuya-toolbar-btn {
  min-width: 48px; height: 48px; border: 2px solid transparent; border-radius: 8px;
  background: transparent; cursor: pointer; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 2px; padding: 4px 6px;
  transition: all 0.15s ease; font-family: inherit;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation;
}
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
  font-size: 16px; transition: all 0.15s ease; flex-shrink: 0;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation;
}
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
.casuya-color-picker::-webkit-color-swatch { border-radius: 50%; transition: border 0.15s ease; }
.casuya-tooltip {
  width: 100%; padding: 6px 10px; font-size: 11px; min-height: 28px;
  box-sizing: border-box; line-height: 1.4; transition: all 0.15s ease;
}
.casuya-tooltip:empty { display: none; }
.casuya-zoom-btn {
  width: 32px; height: 32px; border: none; background: transparent; cursor: pointer;
  font-size: 16px; display: flex; align-items: center; justify-content: center;
  border-radius: 6px; transition: all 0.15s ease; flex-shrink: 0;
}
.casuya-zoom-btn:active { transform: scale(0.95); }
.casuya-zoom-label {
  cursor: pointer; font-size: 11px; min-width: 40px; text-align: center; user-select: none;
  padding: 0 4px; transition: color 0.15s ease;
}
@media (max-width: 640px) {
  .casuya-toolbar-row {
    flex-wrap: nowrap !important;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    padding: 4px 6px !important;
    gap: 3px !important;
    scrollbar-width: none;
  }
  .casuya-toolbar-row::-webkit-scrollbar { display: none; }
  .casuya-toolbar-row > .casuya-toolbar-sep { display: none; }
  .casuya-toolbar-btn { min-width: 34px; min-height: 34px; height: 34px; padding: 2px !important; }
  .casuya-toolbar-label { display: none !important; }
  .casuya-action-btn { width: 30px; height: 30px; font-size: 13px; }
  .casuya-swatch { width: 20px; height: 20px; }
  .casuya-color-picker { width: 20px; height: 20px; }
  .casuya-color-group { flex-wrap: nowrap !important; width: auto !important; max-width: none !important; order: unset !important; gap: 3px !important; }
  .casuya-width-group { order: unset !important; gap: 4px !important; }
  .casuya-width-group input[type="range"] { width: 48px !important; }
  .casuya-action-group { flex-wrap: nowrap !important; order: unset !important; gap: 2px !important; }
  .casuya-zoom-group { order: unset !important; margin-left: 0 !important; gap: 0 !important; }
  .casuya-zoom-btn { width: 26px; height: 26px; font-size: 14px; }
  .casuya-zoom-label { font-size: 10px; min-width: 32px; }
  .casuya-tooltip { display: none !important; }
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
  s.className = 'casuya-toolbar-sep casuya-separator';
  return s;
}

export function createToolbar(board: BlackboardAPI): ToolbarElements {
  injectStyles();

  const bar = document.createElement('div');
  bar.style.cssText = `
    display: flex; flex-direction: column; transition: all 0.15s ease;
    border-bottom-width: 1px; border-bottom-style: solid;
  `;

  const row = document.createElement('div');
  row.className = 'casuya-toolbar-row';
  row.style.cssText = `
    display: flex; align-items: center; gap: 6px;
    padding: 6px 10px; flex-wrap: wrap;
  `;

  const tooltipEl = document.createElement('div');
  tooltipEl.className = 'casuya-tooltip';

  const toolButtons = new Map<Tool, HTMLButtonElement>();
  const toolGroup = document.createElement('div');
  toolGroup.style.cssText = 'display: flex; gap: 4px; flex-wrap: wrap;';

  for (const tool of TOOL_ORDER) {
    const btn = document.createElement('button');
    btn.className = 'casuya-toolbar-btn';
    btn.innerHTML = `${TOOL_ICONS[tool]}<span class="casuya-toolbar-label">${TOOL_LABELS[tool]}</span>`;
    btn.addEventListener('mouseenter', () => {
      if (board.getTool() !== tool) {
        const themeDef = TOOLBAR_THEMES[board.getTheme()];
        btn.style.background = themeDef.btnHoverBg;
        btn.style.color = themeDef.btnHover;
      }
      tooltipEl.textContent = TOOL_DESCRIPTIONS[tool];
    });
    btn.addEventListener('mouseleave', () => {
      if (board.getTool() !== tool) {
        const themeDef = TOOLBAR_THEMES[board.getTheme()];
        btn.style.background = 'transparent';
        btn.style.color = themeDef.btnColor;
      }
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
  colorGroup.className = 'casuya-color-group';
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
  widthGroup.className = 'casuya-width-group';
  widthGroup.style.cssText = 'display: flex; align-items: center; gap: 8px;';
  const widthLabel = document.createElement('span');
  widthLabel.style.cssText = 'font-size: 11px; min-width: 22px; text-align: center; transition: color 0.15s ease;';
  const slider = document.createElement('input');
  slider.type = 'range'; slider.min = '1'; slider.max = '20';
  slider.value = String(board.getWidth());
  slider.style.cssText = 'width: 72px; height: 4px; -webkit-appearance: none; appearance: none; border-radius: 2px; outline: none; cursor: pointer; transition: background 0.15s ease;';
  
  slider.addEventListener('input', () => {
    if (board.getTool() === 'text') {
      board.setFontSize(Number(slider.value));
    } else {
      board.setWidth(Number(slider.value));
    }
  });
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

  const undoBtn = createActionBtn('\u21A9', 'Undo (Ctrl+Z)', tooltipEl, () => board.undo(), board);
  const redoBtn = createActionBtn('\u21AA', 'Redo (Ctrl+Shift+Z)', tooltipEl, () => board.redo(), board);
  const clearBtn = createActionBtn('\u2715', 'Clear all', tooltipEl, () => board.clear(), board);
  const graphBtn = createActionBtn('\u229E', 'Toggle graph paper', tooltipEl, () => {
    if (board.isGraphEnabled()) { board.disableGraph(); }
    else { board.enableGraph(); }
  }, board);
  const fillBtn = createActionBtn('\u25A3', 'Fill: off', tooltipEl, () => {
    board.setFill(!board.getFill());
  }, board);
  const roughnessLabels = ['Clean', 'Light', 'Medium', 'Heavy'];
  let roughnessIdx = board.getRoughness();
  const roughnessBtn = createActionBtn('\u2734', `Roughness: ${roughnessLabels[roughnessIdx]}`, tooltipEl, () => {
    roughnessIdx = (roughnessIdx + 1) % 4;
    board.setRoughness(roughnessIdx);
    roughnessBtn.textContent = '\u2734';
    roughnessBtn.title = `Roughness: ${roughnessLabels[roughnessIdx]}`;
  }, board);
  const groupBtn = createActionBtn('\u2261', 'Group (Ctrl+G)', tooltipEl, () => board.groupSelected(), board);
  const ungroupBtn = createActionBtn('\u2262', 'Ungroup (Ctrl+Shift+G)', tooltipEl, () => board.ungroupSelected(), board);
  const rotateBtn = createActionBtn('\u21BB', 'Rotate 15° (Shift+R)', tooltipEl, () => board.rotateSelected(Math.PI / 12), board);
  const svgBtn = createActionBtn('\u2B1A', 'Export SVG (Ctrl+Shift+S)', tooltipEl, () => {
    const svg = board.exportSVG();
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'blackboard.svg'; a.click();
    URL.revokeObjectURL(url);
  }, board);
  const themeBtn = createActionBtn(board.getTheme() === 'light' ? '\u263E' : '\u2600', 'Toggle Theme', tooltipEl, () => {
    board.setTheme(board.getTheme() === 'light' ? 'dark' : 'light');
  }, board);
  const saveBtn = createActionBtn('\u2193', 'Save to browser', tooltipEl, () => { board.saveToStorage(); board.showToast('\u2713 Saved'); }, board);

  const actionGroup = document.createElement('div');
  actionGroup.className = 'casuya-action-group';
  actionGroup.style.cssText = 'display: flex; gap: 4px; flex-wrap: wrap;';
  actionGroup.appendChild(undoBtn);
  actionGroup.appendChild(redoBtn);
  actionGroup.appendChild(clearBtn);
  actionGroup.appendChild(graphBtn);
  actionGroup.appendChild(fillBtn);
  actionGroup.appendChild(roughnessBtn);
  actionGroup.appendChild(groupBtn);
  actionGroup.appendChild(ungroupBtn);
  actionGroup.appendChild(rotateBtn);
  actionGroup.appendChild(svgBtn);
  actionGroup.appendChild(themeBtn);
  actionGroup.appendChild(saveBtn);
  row.appendChild(actionGroup);
  row.appendChild(sep());

  const zoomGroup = document.createElement('div');
  zoomGroup.className = 'casuya-zoom-group';
  zoomGroup.style.cssText = 'display: flex; align-items: center; gap: 2px;';
  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.className = 'casuya-zoom-btn';
  zoomOutBtn.textContent = '\u2212';
  zoomOutBtn.title = 'Zoom Out';
  zoomOutBtn.addEventListener('click', () => board.zoomTo(board.getZoom() / 1.25));
  bindActionHover(zoomOutBtn, 'Zoom Out', tooltipEl, board);
  
  const zoomLabel = document.createElement('span');
  zoomLabel.className = 'casuya-zoom-label';
  zoomLabel.textContent = Math.round(board.getZoom() * 100) + '%';
  zoomLabel.title = 'Reset Zoom';
  zoomLabel.addEventListener('click', () => board.resetView());

  const zoomInBtn = document.createElement('button');
  zoomInBtn.className = 'casuya-zoom-btn';
  zoomInBtn.textContent = '+';
  zoomInBtn.title = 'Zoom In';
  zoomInBtn.addEventListener('click', () => board.zoomTo(board.getZoom() * 1.25));
  bindActionHover(zoomInBtn, 'Zoom In', tooltipEl, board);

  zoomGroup.appendChild(zoomOutBtn);
  zoomGroup.appendChild(zoomLabel);
  zoomGroup.appendChild(zoomInBtn);
  row.appendChild(zoomGroup);

  bar.appendChild(row);
  bar.appendChild(tooltipEl);

  return { bar, toolButtons, undoBtn, redoBtn, graphBtn, fillBtn, themeBtn, roughnessBtn, groupBtn, ungroupBtn, rotateBtn, svgBtn, widthLabel, widthDot, colorInput, zoomLabel };
}

function bindActionHover(btn: HTMLElement, title: string, tooltipEl: HTMLDivElement, board: BlackboardAPI) {
  btn.addEventListener('mouseenter', () => { 
    tooltipEl.textContent = title;
    const themeDef = TOOLBAR_THEMES[board.getTheme()];
    if (!btn.dataset.active) {
      btn.style.background = themeDef.btnHoverBg;
      btn.style.color = themeDef.btnHover;
    }
  });
  btn.addEventListener('mouseleave', () => { 
    tooltipEl.textContent = '';
    const themeDef = TOOLBAR_THEMES[board.getTheme()];
    if (!btn.dataset.active) {
      btn.style.background = 'transparent';
      btn.style.color = themeDef.btnColor;
    }
  });
  btn.addEventListener('focus', () => { tooltipEl.textContent = title; });
  btn.addEventListener('blur', () => { tooltipEl.textContent = ''; });
}

function createActionBtn(icon: string, title: string, tooltipEl: HTMLDivElement, onClick: () => void, board: BlackboardAPI): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'casuya-action-btn';
  btn.textContent = icon;
  btn.title = title;
  bindActionHover(btn, title, tooltipEl, board);
  btn.addEventListener('click', onClick);
  return btn;
}

export function updateToolbarState(
  tb: ToolbarElements,
  activeTool: Tool,
  color: string,
  width: number,
  fillEnabled: boolean,
  theme: 'light' | 'dark',
  zoom: number,
  fontSize?: number,
  roughness?: number
): void {
  const themeDef = TOOLBAR_THEMES[theme];

  tb.bar.style.background = themeDef.barBg;
  tb.bar.style.borderColor = themeDef.barBorder;

  for (const [tool, btn] of tb.toolButtons) {
    const active = tool === activeTool;
    btn.style.background = active ? themeDef.activeBg : 'transparent';
    btn.style.color = active ? themeDef.activeColor : themeDef.btnColor;
    btn.style.borderColor = active ? themeDef.activeBorder : 'transparent';
  }

  const slider = tb.widthLabel.nextElementSibling as HTMLInputElement;
  if (activeTool === 'text') {
    tb.widthLabel.textContent = `${fontSize ?? 18}px`;
    if (slider) {
      slider.min = '8';
      slider.max = '72';
      slider.value = String(fontSize ?? 18);
    }
  } else {
    tb.widthLabel.textContent = `${width}px`;
    if (slider) {
      slider.min = '1';
      slider.max = '20';
      slider.value = String(width);
    }
  }
  tb.widthLabel.style.color = themeDef.btnColor;
  if (slider) slider.style.background = themeDef.sep;

  tb.widthDot.style.background = color;
  tb.widthDot.style.width = `${Math.max(4, width)}px`;
  tb.widthDot.style.height = `${Math.max(4, width)}px`;
  tb.colorInput.value = color;

  tb.colorInput.style.borderColor = themeDef.sep;

  if (fillEnabled) {
    tb.fillBtn.style.background = themeDef.activeBg;
    tb.fillBtn.style.color = themeDef.activeColor;
    tb.fillBtn.title = 'Fill: on';
    tb.fillBtn.dataset.active = 'true';
  } else {
    tb.fillBtn.style.background = 'transparent';
    tb.fillBtn.style.color = themeDef.btnColor;
    tb.fillBtn.title = 'Fill: off';
    delete tb.fillBtn.dataset.active;
  }

  if (roughness !== undefined) {
    const roughnessLabels = ['Clean', 'Light', 'Medium', 'Heavy'];
    tb.roughnessBtn.title = `Roughness: ${roughnessLabels[roughness]}`;
    if (roughness > 0) {
      tb.roughnessBtn.style.background = themeDef.activeBg;
      tb.roughnessBtn.style.color = themeDef.activeColor;
      tb.roughnessBtn.dataset.active = 'true';
    } else {
      tb.roughnessBtn.style.background = 'transparent';
      tb.roughnessBtn.style.color = themeDef.btnColor;
      delete tb.roughnessBtn.dataset.active;
    }
  }

  tb.themeBtn.textContent = theme === 'light' ? '\u263E' : '\u2600';
  tb.themeBtn.style.color = themeDef.btnColor;
  tb.themeBtn.style.background = 'transparent';

  tb.zoomLabel.textContent = Math.round(zoom * 100) + '%';
  tb.zoomLabel.style.color = themeDef.btnColor;

  const zoomBtns = tb.zoomLabel.parentElement?.querySelectorAll('button') || [];
  zoomBtns.forEach(b => {
    (b as HTMLElement).style.color = themeDef.btnColor;
    (b as HTMLElement).style.background = 'transparent';
  });

  const actionBtns = [tb.undoBtn, tb.redoBtn, tb.graphBtn, tb.themeBtn] as HTMLElement[];
  for (const btn of actionBtns) {
    if (!btn) continue;
    if (!btn.dataset.active) {
      btn.style.color = themeDef.btnColor;
      btn.style.background = 'transparent';
    }
  }

  const seps = tb.bar.querySelectorAll('.casuya-toolbar-sep');
  seps.forEach(s => {
    (s as HTMLElement).style.background = themeDef.sep;
  });

  const tooltip = tb.bar.querySelector('.casuya-tooltip') as HTMLElement;
  if (tooltip) {
    tooltip.style.background = themeDef.tipBg;
    tooltip.style.borderColor = themeDef.tipBorder;
    tooltip.style.color = themeDef.tipColor;
  }
}
