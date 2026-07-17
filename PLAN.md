# casuya-blackboard — Digital Blackboard Module

## Overview

A lightweight TypeScript library providing an interactive digital blackboard for the Casuya educational platform. Students draw freely, write math, create diagrams, and plot graphs using a stylus, finger, nail, or any sharp object on cheap devices.

## Problem Statement

Students in Tanzania and low-connectivity markets need to write math, draw diagrams, and plot graphs on low-end devices with no pressure-sensitive stylus. The blackboard must feel natural and responsive without requiring expensive hardware.

## Architecture

```
casuya-blackboard/
├── src/
│   ├── index.ts          # Public API exports (full package)
│   ├── browser-core.ts   # Browser-only entry (Blackboard + toolbar, no heavy deps)
│   ├── types.ts          # TypeScript interfaces
│   ├── Blackboard.ts     # Core drawing engine + rendering
│   ├── toolbar.ts        # Beautiful UI toolbar
│   └── integrations/
│       ├── ExamsBridge.ts    # casuya-exams step validation + submission
│       ├── MathBridge.ts     # casuya-math KaTeX render + solve + equivalence
│       ├── OcrBridge.ts      # Handwriting OCR (Mathpix / Tesseract / mock)
│       ├── PlatformBridge.ts # Orchestrates all bridges + auto-save
│       └── index.ts          # Re-exports bridges
├── dist/                 # Built output
│   ├── index.js          # ESM (36KB)
│   ├── index.cjs         # CJS (38KB)
│   ├── blackboard.umd.js # Browser UMD bundle (32KB) — core only
│   └── index.d.ts        # Types (6.8KB)
├── demo.html             # Live demo page
├── tests/                # Vitest tests for the 4 integration bridges (25 tests)
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── vitest.config.ts
```

## Tech Stack

| Concern | Choice | Rationale |
|---|---|---|
| Language | TypeScript 5 | Strict mode, clean types |
| Build | tsup | Fast bundling, ESM + CJS + IIFE output |
| Testing | Vitest + happy-dom | Fast, modern test runner |
| Stroke Engine | **perfect-freehand** | Industry standard (5.6k stars, used by tldraw, Excalidraw) |
| Rendering | Canvas 2D API | Direct pixel control, no framework overhead |
| Math | **katex** + mathjs (fallback) | LaTeX rendering + local solve |
| OCR | **tesseract.js** / Mathpix | Handwriting recognition (lazy-loaded) |
| Dependencies | 3 | perfect-freehand, katex, tesseract.js |

## Features

### Drawing

| Tool | Description |
|---|---|
| **Pen** | Freehand drawing with velocity-based pressure simulation |
| **Line** | Straight line between two points |
| **Rectangle** | Rectangle shape |
| **Circle** | Ellipse shape |
| **Arrow** | Line with arrowhead |
| **Eraser** | Remove strokes |

### Stroke Quality (perfect-freehand)

- **Polygon outline rendering** — strokes look like real ink, not centerlines
- **Velocity-based pressure** — fast strokes are thin, slow strokes are thick
- **Thinning (0.5)** — pressure affects width naturally
- **Smoothing (0.5)** — smooth curves without jitter
- **Streamline (0.5)** — reduces noise from cheap touch screens
- **Simulated pressure** — automatic when no hardware pressure available

### Graph Paper

- Toggle grid with coordinate axes
- Configurable spacing (default 25px)
- X/Y axis labels
- Arrow heads on axes

### UI Toolbar

- Tool buttons with SVG icons and hover/active states
- 8-color picker with scale animation
- Width slider (1-20px) with live preview dot
- Undo/Redo/Clear/Graph/Save buttons
- Toast notification on save
- 150ms ease transitions on all interactive elements

### Persistence

- Save to localStorage
- Load from localStorage
- Export to PNG (merged canvas)
- Export to JSON (full scene snapshot)
- Import from JSON

### Integrations (PlatformBridge)

| Bridge | Purpose | Online | Offline fallback |
|---|---|---|---|
| **ExamsBridge** | Validate/substantiate each step against `casuya-exams` | `POST /exams/validate-step`, `/exams/submit` | Local string/normalized grading |
| **MathBridge** | Render LaTeX (KaTeX), solve, equivalence | `POST /math/solve`, `/math/equivalence` | mathjs (require) → string normalization |
| **OcrBridge** | Handwriting → LaTeX | Mathpix API / Tesseract worker | Mock provider returns sample LaTeX |
| **PlatformBridge** | Mount blackboard, auto-save progress (30s), step tracking | `POST /progress/sync`, `GET /progress/:student/:lesson` | Silent (saved locally) |

The browser UMD bundle (`blackboard.umd.js`, ~32KB / ~10KB gzipped) contains **only the core** (Blackboard + toolbar). The integration bridges and their heavy deps (katex, tesseract.js) are kept out of the UMD bundle so the static frontend loads fast on 2G. In the platform, `frontend/assets/js/blackboard-embed.js` mounts the core and calls the REST endpoints directly.

#### Backend endpoints (casuya-api)

Registered in `casuya-api/src/blackboard-handlers.ts` and `server.ts`. Handlers delegate to
`src/integrations/exams-service.ts` (wraps **casuya-exams** `GradingEngine`) and
`src/integrations/math-service.ts` (wraps **casuya-math** `EquationSolver`), each with a
local fallback if the package fails to load:

- `POST /progress/sync` — append a step snapshot for a student+lesson
- `GET  /progress/:studentId/:lessonId` — latest saved snapshot
- `POST /exams/validate-step` — grade one step via `casuya-exams` `GradingEngine` (short-answer strategy)
- `POST /exams/submit` — grade a full exam, return percentage + pass
- `POST /math/solve` — solve a formula via `casuya-math` `EquationSolver`
- `POST /math/equivalence` — numeric + structural equivalence check

Covered by `casuya-api/tests/blackboard-e2e.test.ts` (supertest, 8 cases).

### Exam datastore + structured grading (casuya-api)

The gateway has no persistent store, so blackboard exams live in an in-memory
`examRepository` (`src/integrations/exam-repository.ts`) for the process lifetime
(replaced by postgres/redis in production).

- `POST /exams` — register an exam + its questions (`blackboard-handlers.createExam`)
- `POST /exams/submit` with `{ examId, answers }` — grades via the real
  **casuya-exams `GradingEngine`** (`exams-service.gradeExam`), resolving each
  question from the repository and applying its registered strategy
  (single/multiple-choice, short-answer, etc.). Returns `totalScore`, `maxScore`,
  `percentage`, `passed`, and a per-question `results` array.
- `POST /exams/submit` with `{ steps }` (no `examId`) — step-based grading as before.
- `POST /exams/submit` with an unknown `examId` — `404`.

The platform embed (`blackboard-embed.js`) exposes `api.submitExam(steps)`,
`api.validateStep(step)`, `api.solveMath(eq)`, and `api.checkEquivalence(a, b)`
on the `casuya:blackboard-ready` event detail, so lesson pages can drive the
REST endpoints directly from the core-only UMD bundle.

Unit coverage added in `casuya-blackboard/tests/IntegrationBridges.test.ts`
(mocks `tesseract.js` + `katex`): OcrBridge tesseract path + dispose, MathBridge
KaTeX render/renderToDom/getDimensions, and the KaTeX-load failure path.

### Performance

- **Two-canvas architecture** — static canvas (committed strokes) + live canvas (active stroke)
- **requestAnimationFrame** — dirty flag + rAF for optimal rendering
- **DevicePixelRatio** — HiDPI support
- **< 1ms render** — 23KB bundle, no framework overhead

## Usage

```typescript
import { Blackboard } from 'casuya-blackboard';

const board = new Blackboard({
  container: document.getElementById('app')!,
  width: 800,
  height: 600,
});

// Draw with pen
board.setTool('pen');
board.setColor('#1e293b');
board.setWidth(2);

// Draw shapes
board.setTool('rect');
board.setTool('circle');
board.setTool('line');
board.setTool('arrow');

// Toggle graph paper
board.enableGraph({ spacing: 25, showAxes: true });
board.disableGraph();

// Undo/Redo
board.undo();
board.redo();

// Save/Load
board.saveToStorage();
board.loadFromStorage();

// Export
const png = board.toDataURL();
const json = board.exportJSON();
board.importJSON(json);

// Clean up
board.destroy();
```

## For Tanzanian Students

| Need | Solution |
|---|---|
| Write math | Pen tool with velocity-based pressure |
| Draw diagrams | Shape tools (rect, circle, line, arrow) |
| Plot graphs | Graph paper with coordinate axes |
| Works offline | localStorage save/load |
| Cheap devices | 32KB UMD bundle, rAF rendering |
| No stylus | Velocity simulates pressure from finger/nail |
| 2G network | 32KB (10KB gzipped) loads in < 1 second |
| Platform | Auto-mounts in student lesson view via `blackboard-embed.js` |

## Bundle Size

| Metric | Value |
|---|---|
| ESM (full pkg) | 36KB |
| CJS (full pkg) | 38KB |
| UMD (browser core) | 32KB (~10KB gzipped) |
| Types | 6.8KB |
| Source lines | ~900 |
| Test count | 25 (Exams/Math/Ocr/Platform bridges) |
| Dependencies | 3 (perfect-freehand, katex, tesseract.js) |

## Commands

```bash
pnpm typecheck    # TypeScript validation
pnpm build        # Build to dist/
pnpm test         # Run tests
```
