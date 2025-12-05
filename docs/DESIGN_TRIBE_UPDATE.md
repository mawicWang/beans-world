# Design Document: Tribe Update

## 1. Overview
The **Tribe Update** transforms the existing "Hoard" mechanic into a robust **Tribal System**. Currently, Beans simply pile food at a central point and defend it. In this update, Beans will construct physical structures, adopt specialized roles based on their genetics, and engage in complex group behaviors.

**Core Goal:** Foster cooperation, specialization, and large-scale settlement growth.

---

## 2. Core Concepts

### 2.1. From Hoard to Village
The abstract "Hoard" point is replaced by a physical **Town Center** (or Totem).
*   **Town Center:** A static building entity. It stores resources (Food/Biomass). If destroyed, the tribe is disbanded/scattered.
*   **Expansion:** As the stockpile grows, the Tribe can construct additional buildings:
    *   **Storage Pit:** Increases resource capacity.
    *   **Nursery:** Protects cocoons/larvae and accelerates growth.
    *   **Watchtower:** Increases guard vision range.

### 2.2. Division of Labor (Roles)
Beans are no longer generalists. Upon reaching adulthood, a Bean is assigned a **Role** based on its highest genetic attributes.

| Role | Primary Stat | Behavior |
| :--- | :--- | :--- |
| **Worker** | Constitution/Speed | Harvests food, builds structures, repairs damage. Ignores enemies unless cornered. |
| **Guard** | Strength/Aggression | Patrols territory borders, chases intruders, stays near the Town Center. |
| **Explorer** | Speed/Wanderlust | Roams far from the village to find new food sources. Marks locations for Workers. |

### 2.3. The Economy
*   **Currency:** "Biomass" (Food).
*   **Flow:**
    1.  Explorers find food.
    2.  Workers harvest and haul it to the Town Center.
    3.  Biomass in the Town Center is "spent" to spawn new buildings or heal injured beans (passive regeneration near center).

---

## 3. Technical Implementation Strategy

### 3.1. Prerequisite: Refactoring `Bean.ts`
The current `Bean` class is a "God Class" (~800 lines) handling rendering, physics, and AI. Before adding Tribal logic, we must decompose it.

**Planned Architecture:**
*   **`BeanCore`:** The main container and data holder (Stats, State).
*   **`BeanRenderer`:** Handles `drawJelly`, icons, and animations.
*   **`BeanPhysics`:** Handles velocity, tail simulation, and collision.
*   **`BeanBrain`:** The AI controller.
    *   *Input:* Surroundings (Vision), Internal State (Hunger).
    *   *Output:* Desired Action (Move Target, Attack, Eat).
    *   *Logic:* Hierarchical State Machine (HSM) or Behavior Tree.

### 3.2. The `TribeManager`
A new global manager (singleton in `GameScene`) that tracks all active Tribes.
*   **Data:** Map of `TribeID` -> `TribeData` (Resources, Building List, Member List).
*   **Logic:**
    *   Handles Tribe creation (when a lone Bean places a starter Hoard).
    *   Handles Tribe merging (diplomacy - later phase).
    *   Handles "Global" decisions (e.g., "We have enough food, spawn a blueprint for a Nursery").

### 3.3. New Entities: `Structure`
*   Extends `Phaser.GameObjects.Sprite` or `Container`.
*   Implements `IHealth` (can be destroyed).
*   Static physics body (immovable).
*   Rendering: Procedural graphics (Geometric stone/wood shapes).

---

## 4. Detailed Roadmap

### Phase 1: The Great Refactor (Technical Debt)
*   **Goal:** Clean up `Bean.ts` to support modular AI.
*   **Tasks:**
    1.  Extract visual logic to `BeanRenderer`.
    2.  Extract movement physics to `BeanPhysics`.
    3.  Isolate the `think()` loop into a `BeanBrain` class.

### Phase 2: The Foundation (Structures)
*   **Goal:** Physicalize the Hoard.
*   **Tasks:**
    1.  Create `Structure` base class.
    2.  Replace `HoardManager` points with `TownCenter` entities.
    3.  Implement collision (Beans bounce off buildings).

### Phase 3: Specialization (Roles)
*   **Goal:** Beans act differently based on stats.
*   **Tasks:**
    1.  Define `Role` enum.
    2.  Implement `RoleAssigner` logic (on `growUp()`).
    3.  Create distinct AI strategies for each role (e.g., Worker flees, Guard charges).
    4.  Visual cues: Hats or slight color tints for roles.

### Phase 4: Construction (Economy)
*   **Goal:** Dynamic village growth.
*   **Tasks:**
    1.  Implement `ConstructionSite` (blueprints).
    2.  Update Worker AI to "Haul to Site" instead of just "Haul to Hoard".
    3.  Visual feedback for building progress.

---

## 5. Future Considerations
*   **Warfare:** Organized raids between tribes.
*   **Diplomacy:** Trading food or merging peaceful tribes.
*   **Tech Tree:** Unlocking better buildings (Walls, Traps) based on Tribe age/population.
