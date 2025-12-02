# Beans World - AI Agent Guide

This file outlines the project structure, coding conventions, and architectural decisions for "Beans World". Use this context when analyzing code or implementing changes.

## 1. Project Overview
Beans World is a 2D genetic simulation sandbox built with Phaser. It simulates the lifecycle of "Beans"—entities with genetic traits (strength, speed, constitution)—that eat, mate, guard territory, and fight.

### Tech Stack
*   **Engine**: Phaser 3 (Arcade Physics).
*   **Language**: TypeScript.
*   **Build**: Vite.
*   **Deployment**: GitHub Pages (via `dist/` folder).

## 2. Directory Structure
*   `src/main.ts`: Entry point. Configures Phaser game instance.
*   `src/scenes/`:
    *   `GameScene.ts`: Main simulation logic, physics world, entity management.
    *   `UIScene.ts`: UI overlay (stat panels, speed controls).
    *   `CollisionTestScene.ts`: Isolated physics testing.
*   `src/objects/`:
    *   `Bean.ts`: Core entity logic (FSM, rendering, stats).
    *   `Cocoon.ts`: Reproduction logic.
    *   `Food.ts`: Consumable items.
*   `public/`: Static assets (minimal, as most are procedural).
*   `tests/`: Playwright verification scripts.

## 3. Core Systems & Architecture

### Simulation Loop & Time
*   **No Global Time Scale**: We do **not** use `this.time.timeScale` to speed up the game.
*   **Sub-stepping**: Simulation speed (1x, 5x, 20x, 50x) is handled in `GameScene.update`. We accumulate `delta * speedFactor` and run a fixed physics/logic step loop to prevent tunneling.
*   **Rendering**: `Bean.update()` accepts a `render` boolean. During sub-steps, we run logic/physics (`render=false`); we only redraw graphics on the final frame pass.

### Bean Logic (The "Brain")
*   **FSM (Finite State Machine)**: Beans switch between states defined in `MoveState` (e.g., `IDLE`, `SEEKING_FOOD`, `CHASING_ENEMY`).
*   **Modes**: Persistent flags track intent:
    *   `isSeekingMate`: Derived from satiety thresholds.
    *   `isGuarding`: Triggered when near `hoardLocation`.
*   **Genetics**: Attributes (1-20) determine color and ability:
    *   Strength (Red): Combat power.
    *   Speed (Blue): Movement velocity.
    *   Constitution (Size/Satiety): Max health/hunger.
*   **Procedural Graphics**: All Bean visuals (body, eyes, icons) are drawn using `Phaser.GameObjects.Graphics` to avoid external assets.

### Physics
*   **Arcade Physics**: Circular bodies.
*   **Collision Callbacks**: Logic for mating and fighting is handled in collision callbacks.
    *   *Note*: Merging entities (Cocoon formation) must return `false` in the `processCallback` to allow overlap.
*   **Stuck Detection**: Beans have logic to detect if they are moving but not changing position, triggering a random burst to free them.

### UI & Communication
*   **Dual Scenes**: `GameScene` runs the world. `UIScene` runs the HUD.
*   **Registry**: Data is shared via `this.registry` (e.g., `simTime`, global stats).
*   **Input**: `GameScene` explicitly ignores clicks that overlap with UI buttons (top-right corner).

## 4. Coding Conventions

### TypeScript Strictness
*   **Unused Variables**: The build **will fail** on unused variables (TS6133).
*   **Handling Unused Args**: If a function signature (like Phaser callbacks) requires an argument you don't use, prefix it with an underscore (e.g., `_time`, `_delta`).

### Asset Management
*   **Procedural First**: Avoid adding image files. Use `Graphics` or `generateTexture`.
*   **Sound**: Use Web Audio API context for procedural sounds.

### Mobile & Input
*   **Context Menu**: Disabled (`disableContextMenu: true`).
*   **Audio**: Must handle "unlocking" AudioContext on first user interaction.

## 5. Workflow & Verification

### Build & Test
1.  **Always Build**: Run `npm run build` before submitting. This catches the strict TypeScript errors.
2.  **Frontend Verification**: Use Playwright (`npx playwright test`) for visual verification if changing UI or rendering.

### Versioning
*   **Update Version**: You **must** update the version number in `src/version.ts` with every code modification.
    *   The magnitude of the version bump should reflect the extent and content of the changes.
    *   This ensures users can verify they are running the latest code.

### Git & Deployment
*   **Branching**: `main` is the primary branch.
*   **Auto-Merge**: Valid PRs are auto-merged if they pass checks.
*   **Deployment**: Pushes to `main` trigger deployment to GitHub Pages. `vite.config.ts` handles the `base` path (`/beans-world/`).

## 6. Common Gotchas
*   **Circular Dependencies**: `Bean` <-> `GameScene`. Use `import type` in `Bean.ts` and cast `this.scene` to `GameScene` inside methods.
*   **Coordinates**: Physics body anchors are usually center (0.5, 0.5) for Circles.
*   **Performance**: Iterating lists (like `beans` array) should often be done in reverse if items might be removed (died) during the loop.
