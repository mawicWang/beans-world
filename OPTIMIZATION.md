# 项目优化建议 (Optimization Proposal)

基于对当前代码库 (`src/scenes/GameScene.ts`, `src/objects/Bean.ts`, `src/managers/HoardManager.ts` 等) 的审查，以下是针对性能、架构和代码质量的优化建议。

## 1. 性能优化 (Performance)

### 1.1 渲染优化 (Rendering)
**现状**: `Bean.ts` 中的 `drawJelly` 方法在每一帧都会调用 `graphics.clear()` 并完全重绘所有形状（身体、尾巴、状态图标、连线）。当 Bean 数量增加（>100）时，这将导致大量的 CPU/GPU 开销。

**建议**:
*   **LOD (Level of Detail)**: 当摄像机缩放比例较小（看到全图）时，停止绘制昂贵的 "果冻" 物理效果和尾巴，仅绘制简单的圆形。
*   **纹理缓存 (Texture Caching)**: 对于静态或低速移动的 Bean，可以将 Graphics 生成为 Texture，减少实时绘图指令。
*   **Dirty Flag**: 仅在 Bean 的状态（颜色、大小、Satiety 导致的透明度）发生显著变化时才重绘，而不是每一帧。

### 1.2 逻辑计算优化 (Computational Complexity)
**现状**:
*   `findIntruder` (寻找入侵者)、`findClosestMate` (寻找配偶)、`getSeparationVector` (分离力) 都在遍历场景中的所有 Bean (`scene.getBeans()`)。
*   这是一个 $O(N^2)$ 的复杂度问题。如果场上有 200 个 Bean，每帧可能进行 40,000 次距离检查。

**建议**:
*   **空间划分 (Spatial Partitioning)**: 引入 **QuadTree (四叉树)** 或简单的 **Grid (网格)** 系统。Bean 只需查询邻近网格内的对象，将查询复杂度降低到 $O(N \log N)$ 或 $O(N)$。
*   **频率限制 (Throttling)**: AI 决策不需要每帧都做。可以将 `findIntruder` 等逻辑限制为每 10-20 帧执行一次，或分散到不同帧执行 (Time Slicing)。

### 1.3 物理步进 (Physics Sub-stepping)
**现状**: `GameScene` 使用手动 sub-stepping (`while (pendingTime > 0)`)。虽然这解决了高速穿墙问题，但在高倍速下会成倍增加 `Bean.update` 的调用次数，加剧了上述的 $O(N^2)$ 问题。

**建议**:
*   **优化更新循环**: 在 sub-step 中只更新物理位移 (`body` related)，**跳过** AI 决策和视效更新。仅在最后一帧进行 AI 思考和渲染。

## 2. 架构重构 (Architecture)

### 2.1 解耦 Bean 与 GameScene
**现状**: `Bean` 类严重依赖 `GameScene` 的具体实现，大量使用 `this.scene as unknown as GameScene` 类型断言。这导致代码难以测试，且容易因 Scene 修改而崩溃。

**建议**:
*   **接口隔离**: 定义 `IEntityProvider` 或 `IWorldQuery` 接口，包含 `getBeans()`, `getFoods()`, `hoardManager` 等方法。让 `GameScene` 实现该接口，`Bean` 仅依赖接口。
*   **事件驱动**: 对于 Drop Food、Spawn Bean 等操作，使用 Phaser 的事件系统或特定的 Command 模式，而不是直接调用 Scene 方法。

### 2.2 状态机重构 (State Machine)
**现状**: `Bean.ts` 内部使用了一个巨大的 `switch (this.moveState)` 语句。随着状态增加（目前已有 10 个状态），这个类变得难以维护（"God Class"）。

**建议**:
*   **状态模式 (State Pattern)**: 将每个状态拆分为独立的类 (e.g., `IdleState`, `ChasingState`, `MatingState`)。
*   每个状态类实现 `enter()`, `update()`, `exit()` 方法。
*   这样可以更清晰地管理状态转换逻辑（如 `enter` 时设置 timer，`exit` 时清理数据）。

### 2.3 管理器职责
**现状**: `HoardManager` 在 `update` 中每帧都在执行 `pruneEmptyHoards`，遍历所有 Hoard 和 Bean。

**建议**:
*   **被动清理**: 仅在 Bean 死亡或更改 Hoard ID 时触发清理检查，或设置一个低频定时器（如每 1 秒检查一次）。

## 3. 代码质量与开发体验 (DX)

### 3.1 类型安全 (Type Safety)
**现状**:
*   `checkBeanCollision(obj1: any, obj2: any)` 使用了 `any`。
*   `this.scene` 经常被强转。

**建议**:
*   利用 TypeScript 泛型或 Phaser 的泛型支持，减少 `any` 的使用。
*   为 `GameScene` 的 Registry 数据（`simTime`, `beanCount`）定义强类型接口。

### 3.2 配置抽离 (Configuration)
**现状**: 许多魔术数字 (Magic Numbers) 硬编码在 `Bean.ts` 中 (e.g., `SPRING_STIFFNESS = 0.1`, `MATURITY_AGE = 60000`).

**建议**:
*   创建一个 `GameConfig.ts` 或 `BeanConfig.ts`，统一管理所有游戏平衡性参数。这将极大方便后续的数值调整。

## 4. 优先级建议 (Priority)

1.  **High**: 引入空间索引 (Grid/QuadTree) 优化 AI 查询 (解决卡顿最核心手段)。
2.  **High**: `Bean.ts` 的渲染优化 (LOD 或 Dirty Flag)。
3.  **Medium**: 抽离配置参数 (Config)。
4.  **Medium**: 重构状态机 (State Pattern) - 建议在下次添加新行为时进行。
5.  **Low**: 完善单元测试。
