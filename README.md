# casuya-blackboard

**Identity**: The Digital Blackboard — collaborative teaching surface for the Casuya ecosystem.

## Mission

Provide a lightweight, embeddable digital blackboard with real-time drawing, annotation, and
ecosystem integrations (lessons, media, and progress sync) so educators can present and explain
concepts directly inside Casuya-powered learning experiences.

## Features

- Freehand drawing and annotation on a canvas surface
- Embedded media and lesson references
- Progress sync via `casuya-bridge` (`/progress/sync`, shared-key `bridge_auth`)
- Static serving through the platform at `/static/pkg/blackboard`

## Problems Solved

- **Live explanation**: teachers illustrate ideas without leaving the lesson context
- **Low-friction authoring**: no separate tooling required
- **Offline-friendly**: works as a static client-side package

## Integration

Built with `tsup`. The compiled `dist/` is mounted by `casuya-platform/backend/main.py`.
