# Optimization & Refactoring Roadmap

This document outlines the current performance bottlenecks and architectural improvements identified in the `beans-world` project.

## 1. Critical Performance Bottlenecks

### 1.1 AI Logic Executing in Physics Sub-steps
**Problem:**
The `GameScene` employs a manual sub-stepping loop to handle high simulation speeds (up to 50x). Currently, `Bean.update()` is called within this loop.
Although `render=false` is passed to skip drawing, the **AI logic** (State Machine, `findIntruder`, `pickTarget`) still executes *every sub-step*.
*   *Impact:* At 50x speed, expensive neighbor searches ($O(N)$ with Grid) are running 50+ times per frame per Bean.
*   **Solution:** Decouple AI from Physics.
    *   Create a `think()` method for high-level decision making (State transitions, Target selection). Call this **once per frame**.
    *   Keep `update()` strictly for physics integration (Velocity, Position, Tail simulation). Call this in sub-steps.

### 1.2 Food Search Complexity ($O(N \times M)$)
**Problem:**
The `pickTarget()` method in `Bean.ts` calls `scene.getFoods()` which returns *all* food items in the world. The bean then iterates through every food item to find the closest one.
*   *Impact:* As food counts grow (e.g., 500+ items), this becomes a massive CPU drain, especially since `pickTarget` is called frequently.
*   **Solution:** Integrate Food into the `SpatialGrid`.
    *   Beans should only query their local grid cells for food.

### 1.3 Rendering Overhead (Procedural Graphics)
**Problem:**
`Bean.drawJelly` clears and redraws the entire bean (Body, Tail, Icons) every single frame using `Phaser.GameObjects.Graphics`.
*   *Impact:* While LOD exists (drawing circles at low zoom), the high volume of WebGL draw calls for procedural shapes limits the maximum bean count.
*   **Solution:**
    *   **Texture Caching:** For the "Body" (circle/jelly), generate a texture once (or when attributes change) instead of redrawing the path every frame.
    *   **Icon Sprites:** Instead of drawing Hearts/Shields/Anger lines with `graphics.lineTo` every frame, use static images/sprites for these status indicators.
    *   **Dirty Flag:** Only redraw if visual state (satiety/damage) changes significantly.

### 1.4 Aggressive Garbage Collection (Hoards)
**Problem:**
`HoardManager.pruneEmptyHoards` iterates through all Beans and Hoards *every frame* to find unused territories.
*   **Solution:** Throttle this cleanup. Run it once every 60 frames (1 second) or trigger it only when a Bean dies or changes its Hoard ID.

## 2. Architectural Refactoring

### 2.1 Refactor "God Class" (`Bean.ts`)
**Problem:**
`Bean.ts` currently handles:
1.  **Physics:** Custom velocity integration, tail spring dynamics.
2.  **Rendering:** Procedural drawing, LOD.
3.  **AI:** Finite State Machine (10+ states), Strategy processing.
4.  **Stats:** RPG attributes, Satiety, Growth.

**Solution:** Adopt a Component or Composition pattern.
*   `BeanVisuals`: Handles `drawJelly`, icons, and animations.
*   `BeanPhysics`: Handles velocity, collision response, tail simulation.
*   `BeanBrain`: Handles the State Machine and decision making.
*   `BeanStats`: Handles attributes and lifecycle.

### 2.2 Formal State Machine
**Problem:**
The `switch (this.moveState)` block in `Bean.ts` is becoming unmanageable.
**Solution:**
Implement a proper State Pattern class structure:
```typescript
abstract class State {
  enter(bean: Bean): void;
  execute(bean: Bean): void;
  exit(bean: Bean): void;
}
```
This allows each behavior (Guarding, Mating, Hauling) to have its own file and isolated logic.

### 2.3 Dependency Injection / Interface Decoupling
**Problem:**
`Bean` relies heavily on casting `this.scene as unknown as GameScene` to access global managers (`SpatialGrid`, `HoardManager`).
**Solution:**
Pass specific interfaces to the Bean constructor or use a Dependency Injection container.
*   `Bean` should depend on `IWorldQuery` (for `getBeansInRadius`), not the concrete `GameScene`.

## 3. Code Quality & DX

### 3.1 Type Safety
*   Remove `any` casts in collision callbacks (`checkBeanCollision`).
*   Strictly type the Registry data (`simTime`, `beanCount`).

### 3.2 Configuration
*   Continue migrating magic numbers (e.g., `padding`, `separationRadius`, `stuckTimer` thresholds) into `GameConfig.ts`.

## 4. Implementation Priority

1.  **[Critical]** Fix AI running in Physics Sub-steps (`Bean.think` vs `Bean.update`).
2.  **[High]** Add Food to `SpatialGrid` to fix $O(N \times M)$ lag.
3.  **[High]** Throttle `HoardManager` cleanup.
4.  **[Medium]** Refactor `Bean` Rendering (Texture Caching).
5.  **[Long Term]** Full Architecture Rewrite (State Machine / Components).
