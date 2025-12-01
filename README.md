# Beans World

An interactive 2D sandbox simulation where autonomous "Beans" live, eat, fight, and reproduce. Built with [Phaser 3](https://phaser.io/), [Vite](https://vitejs.dev/), and [TypeScript](https://www.typescriptlang.org/).

## 🌟 Overview

Beans World is a simulation of a tiny ecosystem. Beans are procedurally generated entities with their own genetic traits and behavioral states. They roam the world, gather resources, defend their territory, and pass on their genes to the next generation.

The simulation runs entirely in the browser and features a "jelly-like" physics system using Arcade Physics.

## ✨ Features

### 🧬 Genetic System
*   **Attributes:** Every Bean has distinct attributes:
    *   **Strength (Red):** Determines combat power.
    *   **Speed (Blue):** Determines movement velocity.
    *   **Constitution (Green):** Affects size and maximum satiety.
*   **Inheritance:** Offspring inherit the average traits of their parents with slight mutations, allowing the population to evolve over time.
*   **Visual Representation:** A Bean's color is a direct representation of its genetic makeup (RGB mapped to Strength, Constitution, Speed).

### 🧠 Complex Behaviors
*   **Finite State Machine:** Beans operate on a robust AI system with states including:
    *   **Idle:** Roaming or returning to a home base.
    *   **Seeking Food:** Finding and consuming resources when hungry.
    *   **Hauling:** Carrying excess food to a private hoard location.
    *   **Guarding:** Defending territory from intruders.
    *   **Seeking Mate:** Searching for a partner when healthy and well-fed.
    *   **Fleeing:** Escaping combat when satiety/health is critically low.
*   **Lifecycle:**
    *   **Hatching:** Offspring emerge from Cocoons after a gestation period.
    *   **Growth:** Beans grow visually from childhood to adulthood.
    *   **Death:** Beans die and are removed if they starve (Satiety hits 0).

### ⚔️ Combat & Territory
*   **Guarding:** Beans establish a hoard location and will chase away enemies that get too close.
*   **Combat:** Collisions between enemies result in combat, reducing satiety based on Strength.
*   **Visuals:** Status icons indicate current intent (Shield for guarding, Heart for mating, Anger for combat).

### ⚙️ Simulation Control
*   **Time Scaling:** Control the flow of time with speed toggles (1x, 5x, 20x, 50x).
*   **Stats Visibility:** Toggle overlay to see detailed stats for every Bean.
*   **Procedural Assets:** All graphics and audio are generated procedurally at runtime—no external image or sound assets are required.

## 🛠️ Development

### Prerequisites
*   Node.js (v14+ recommended)
*   npm

### Installation

```bash
npm install
```

### Running Locally

Start the development server:

```bash
npm run dev
```

Visit `http://localhost:5173/beans-world/` (or the port shown in your terminal) to view the simulation.

### Building for Production

Compile the project to the `dist` folder:

```bash
npm run build
```

## 🏗️ Architecture

*   **`GameScene`:** Manages the physics world, entity spawning, and global simulation logic.
*   **`UIScene`:** Handles user interface elements overlaid on the game.
*   **`Bean`:** The core entity class extending `Phaser.GameObjects.Container`. Implements the behavioral FSM, physics body, and rendering logic.
*   **`Cocoon`:** Represents the gestation phase of new Beans.

## 📱 Mobile Support

The game is optimized for mobile devices with:
*   Touch controls.
*   Responsive resizing.
*   Audio context unlocking on first interaction.
