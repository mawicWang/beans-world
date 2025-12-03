# Project Map

This document provides a high-level overview of the file structure and the responsibility of each file in the "Beans World" project.
**Crucial**: This document must be updated whenever files are added, removed, or their core responsibilities change.

## Root Directory
*   `AGENTS.md`: Guidelines and context for AI agents.
*   `PROJECT_MAP.md`: This file. Directory map and responsibilities.
*   `README.md`: General project info for humans.
*   `package.json` / `package-lock.json`: Dependencies and scripts.
*   `tsconfig.json`: TypeScript configuration.
*   `vite.config.ts`: Vite build configuration (base path, output).
*   `index.html`: HTML entry point.
*   `setup.sh`: Quick setup script (npm install, build, etc.).

## Source Code (`src/`)
*   `src/main.ts`: Application entry point. Initializes the Phaser Game instance and configures scenes.
*   `src/version.ts`: Contains the current version string. Must be updated with every code modification.

### Scenes (`src/scenes/`)
*   `src/scenes/GameScene.ts`: The core simulation scene. Handles physics, game loop, entity management (Beans, Food, Hoards), and input.
*   `src/scenes/UIScene.ts`: The UI overlay scene. Handles HUD, stats, buttons, speed controls, and user interaction.
*   `src/scenes/CollisionTestScene.ts`: A scene for isolating and testing physics collisions.
*   `src/scenes/DevScene.ts`: A development scene for testing specific behaviors (e.g., reproduction) in isolation.

### Objects (`src/objects/`)
*   `src/objects/Bean.ts`: The main entity. Handles Bean logic, rendering, FSM (states), genetics, physics, and behavior.
*   `src/objects/Cocoon.ts`: Represents the gestation phase of reproduction. Spawns offspring Beans.
*   `src/objects/Food.ts`: Food items that Beans consume.

### Managers (`src/managers/`)
*   `src/managers/HoardManager.ts`: Manages hoard locations, rendering of territories, and garbage collection of empty hoards.

### Tests & Verification (`src/tests/` & `verification/`)
*   `src/tests/`: Unit/Integration tests (e.g., `devscene.spec.ts` for DevScene logic).
*   `verification/`: Playwright verification scripts and screenshots used for visual regression or behavior testing.

## Configuration & Scripts
*   `.github/`: GitHub Actions workflows (CI/CD) including auto-merge and deploy logic.
*   `scripts/`: Utility scripts (e.g., `notify.js` for Bark notifications).
*   `public/`: Static assets (minimal, mostly procedural).
