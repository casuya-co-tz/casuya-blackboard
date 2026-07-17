export interface MathConfig {
  apiBase?: string;
  katexOptions?: Record<string, unknown>;
}

export interface RenderResult {
  html: string;
  width: number;
  height: number;
}

export interface SolveResult {
  steps: string[];
  solution: string;
  latex: string;
}

export class MathBridge {
  private config: MathConfig;
  private katex: any = null;

  constructor(config: MathConfig = {}) {
    this.config = config;
  }

  async loadKatex(): Promise<void> {
    if (this.katex) return;
    try {
      this.katex = await import('katex');
    } catch {
      throw new Error('KaTeX not available. Install katex package.');
    }
  }

  async renderToHtml(latex: string): Promise<string> {
    await this.loadKatex();
    return this.katex.renderToString(latex, {
      throwOnError: false,
      displayMode: true,
      ...this.config.katexOptions,
    });
  }

  async renderToDom(latex: string, element: HTMLElement): Promise<void> {
    await this.loadKatex();
    this.katex.render(latex, element, {
      throwOnError: false,
      displayMode: true,
      ...this.config.katexOptions,
    });
  }

  async getDimensions(latex: string): Promise<{ width: number; height: number }> {
    await this.loadKatex();
    const html = this.katex.renderToString(latex, { throwOnError: false, displayMode: true });
    const div = document.createElement('div');
    div.style.cssText = 'position:absolute;left:-9999px;visibility:hidden;';
    div.innerHTML = html;
    document.body.appendChild(div);
    const rect = div.firstElementChild?.getBoundingClientRect() ?? { width: 0, height: 0 };
    document.body.removeChild(div);
    return { width: rect.width, height: rect.height };
  }

  async solveEquation(equation: string): Promise<SolveResult> {
    if (this.config.apiBase) {
      try {
        const resp = await fetch(`${this.config.apiBase}/math/solve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ equation }),
        });
        if (resp.ok) return await resp.json();
      } catch { /* fall back */ }
    }
    return this.localSolve(equation);
  }

  async checkEquivalence(expr1: string, expr2: string): Promise<{ equivalent: boolean; confidence: number }> {
    if (this.config.apiBase) {
      try {
        const resp = await fetch(`${this.config.apiBase}/math/equivalence`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expr1, expr2 }),
        });
        if (resp.ok) return await resp.json();
      } catch { /* fall back */ }
    }
    return this.localEquivalence(expr1, expr2);
  }

  private localSolve(equation: string): SolveResult {
    try {
      const math = require('mathjs');
      const expr = math.parse(equation);
      const solution = math.simplify(expr);
      return {
        steps: [equation, solution.toString()],
        solution: solution.toString(),
        latex: solution.toTex(),
      };
    } catch {
      return {
        steps: [equation],
        solution: 'Unable to solve',
        latex: equation,
      };
    }
  }

  private localEquivalence(expr1: string, expr2: string): { equivalent: boolean; confidence: number } {
    try {
      const math = require('mathjs');
      const e1 = math.parse(expr1);
      const e2 = math.parse(expr2);
      const diff = math.simplify(math.subtract(e1, e2));
      const isZero = math.evaluate(diff) === 0;
      return { equivalent: isZero, confidence: isZero ? 0.9 : 0.1 };
    } catch {
      const norm1 = expr1.replace(/\s+/g, '').toLowerCase();
      const norm2 = expr2.replace(/\s+/g, '').toLowerCase();
      return { equivalent: norm1 === norm2, confidence: norm1 === norm2 ? 0.8 : 0.2 };
    }
  }

  latexToText(latex: string): string {
    return latex
      .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)')
      .replace(/\\sqrt\{([^}]+)\}/g, 'sqrt($1)')
      .replace(/\\cdot/g, '·')
      .replace(/\\times/g, '×')
      .replace(/\\div/g, '÷')
      .replace(/\\leq/g, '≤')
      .replace(/\\geq/g, '≥')
      .replace(/\\neq/g, '≠')
      .replace(/\\pm/g, '±')
      .replace(/\\infty/g, '∞')
      .replace(/\^\{([^}]+)\}/g, '^($1)')
      .replace(/_\{([^}]+)\}/g, '_($1)')
      .replace(/\{|\}/g, '');
  }
}