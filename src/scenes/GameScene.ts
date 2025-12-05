import Phaser from 'phaser';
import Bean, { MoveState, SurvivalStrategy } from '../objects/Bean';
import Food from '../objects/Food';
import Cocoon from '../objects/Cocoon';
import HoardManager from '../managers/HoardManager';
import PangolinStatue from '../objects/PangolinStatue';
import { SpatialGrid } from '../managers/SpatialGrid';
import { GameConfig } from '../config/GameConfig';

export default class GameScene extends Phaser.Scene {
  private beans: Bean[] = [];
  public beanGrid!: SpatialGrid<Bean>;
  private cocoons: Cocoon[] = [];
  private beanGroup!: Phaser.Physics.Arcade.Group;
  private foods: Food[] = [];
  private foodGroup!: Phaser.Physics.Arcade.Group;
  private boundsGraphics!: Phaser.GameObjects.Graphics;
  public hoardManager!: HoardManager;

  private isPaused: boolean = false;
  private currentSpeed: number = 1;
  private simTime: number = 0;
  private areStatsVisible: boolean = false;
  private areHoardLinesVisible: boolean = false;

  // Manual Timer for Food Spawning (since we don't rely on Phaser's TimeScale for this anymore)
  private foodTimer: number = 0;
  // private readonly FOOD_SPAWN_INTERVAL = 500; // Moved to config

  // World Bounds
  // private readonly WORLD_WIDTH = 3000; // Moved to config
  // private readonly WORLD_HEIGHT = 3000; // Moved to config

  // Camera Control State
  private prevPinchDistance: number | null = null;
  private lastPointerPosition: Phaser.Math.Vector2 | null = null;

  constructor() {
    super('GameScene');
  }

  create() {
    // Initialize Hoard Manager
    this.hoardManager = new HoardManager(this);

    // Initialize Spatial Grid
    this.beanGrid = new SpatialGrid<Bean>(GameConfig.WORLD_WIDTH, GameConfig.WORLD_HEIGHT, GameConfig.GRID.CELL_SIZE);

    // Create Pangolin Statue in the center
    const statue = new PangolinStatue(this, GameConfig.WORLD_WIDTH / 2, GameConfig.WORLD_HEIGHT / 2);

    // Create physics group for beans
    this.beanGroup = this.physics.add.group();

    // Add collision between beans and statue
    this.physics.add.collider(this.beanGroup, statue);

    // Create physics group for food
    this.foodGroup = this.physics.add.group();

    // Overlap for eating
    this.physics.add.overlap(this.beanGroup, this.foodGroup, (obj1, obj2) => {
        const bean = obj1 as Bean;
        const food = obj2 as Food;
        bean.eat(food);
    });

    // Collider for physical separation (with filter to allow mating pairs to pass through)
    this.physics.add.collider(
        this.beanGroup,
        this.beanGroup,
        undefined,
        this.checkBeanCollision,
        this
    );

    // Overlap for Reproduction Trigger (avoids physics solver interference)
    this.physics.add.overlap(this.beanGroup, this.beanGroup, (obj1, obj2) => {
        this.checkReproductionOverlap(obj1 as Bean, obj2 as Bean);
    });

    // Draw visual bounds
    this.drawBounds(GameConfig.WORLD_WIDTH, GameConfig.WORLD_HEIGHT);

    // Set Physics Boundaries to the larger world
    this.physics.world.setBounds(0, 0, GameConfig.WORLD_WIDTH, GameConfig.WORLD_HEIGHT);

    // Setup Camera
    this.cameras.main.setBounds(0, 0, GameConfig.WORLD_WIDTH, GameConfig.WORLD_HEIGHT);
    this.cameras.main.centerOn(GameConfig.WORLD_WIDTH / 2, GameConfig.WORLD_HEIGHT / 2);

    // Enable multi-touch (add 1 extra pointer for a total of 2)
    this.input.addPointer(1);

    // Launch UI Scene
    this.scene.launch('UIScene');

    // Initial random beans
    for (let i = 0; i < 5; i++) {
      this.spawnBean();
    }

    // Handle window resize
    this.scale.on('resize', this.resize, this);

    // Handle touch/click to interact and unlock audio
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.handleInput(pointer);
    });

    // Listen for spawn requests from UI
    this.game.events.on('SPAWN_BEAN', () => {
      this.spawnBean();
    });

    // Listen for Stats Toggle
    this.game.events.on('TOGGLE_BEAN_STATS', (visible: boolean) => {
        this.areStatsVisible = visible;
        // The individual beans also listen to this event to toggle themselves,
        // so we just need to track the state for new beans.
    });

    // Listen for Hoard Lines Toggle
    this.game.events.on('TOGGLE_HOARD_LINES', (visible: boolean) => {
        this.areHoardLinesVisible = visible;
    });

    // Listen for Pause Toggle
    this.game.events.on('TOGGLE_PAUSE', (isPaused: boolean) => {
        this.isPaused = isPaused;
        if (this.isPaused) {
            this.physics.world.pause();
            this.time.paused = true;
            this.tweens.pauseAll();
        } else {
            this.physics.world.resume();
            this.time.paused = false;
            this.tweens.resumeAll();
        }
    });

    // Listen for Speed Change
    this.game.events.on('SET_GAME_SPEED', (speed: number) => {
        this.currentSpeed = speed;
        // Apply speed settings
        // We do NOT use physics.world.timeScale to speed up physics, because it scales the delta
        // which causes tunneling (objects jumping over each other) at high speeds.
        // Instead, we sub-step the physics simulation manually in update().
        this.physics.world.timeScale = 1.0;

        // Speed up global timers and tweens
        // Note: We intentionally DO NOT set this.time.timeScale, because it affects the 'delta'
        // passed to update(), which makes our manual sub-stepping logic doubly-accelerated
        // (speed * speed). Instead, we handle all timing manually based on currentSpeed.
        this.tweens.timeScale = speed;
    });

    // Listen for Restart
    this.game.events.on('RESTART_SIMULATION', () => {
        this.scene.restart();
    });

    // Cleanup on shutdown
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.game.events.off('SPAWN_BEAN');
        this.game.events.off('TOGGLE_BEAN_STATS');
        this.game.events.off('TOGGLE_PAUSE');
        this.game.events.off('SET_GAME_SPEED');
        this.game.events.off('RESTART_SIMULATION');
    });

    // We removed this.time.addEvent for food because we want to control it manually via update()
  }

  handleInput(_pointer: Phaser.Input.Pointer) {
    // Unlock audio context if it's suspended (common on mobile)
    if (this.sound instanceof Phaser.Sound.WebAudioSoundManager) {
      if (this.sound.context.state === 'suspended') {
        this.sound.context.resume();
      }
    }

    // Note: We removed the spawnBean call here as requested.
    // Beans are now only spawned via the UI button.
  }

  spawnBean(x?: number, y?: number, startSatiety: number = GameConfig.BEAN.START_SATIETY, isAdult: boolean = true, attributes: { strength?: number, speed?: number, constitution?: number } = {}, hoardId: string | null = null, strategy?: SurvivalStrategy) {
    // If no position provided, spawn randomly within the WORLD bounds (not just screen)
    // Avoid edges slightly
    const spawnX = x ?? Phaser.Math.Between(50, GameConfig.WORLD_WIDTH - 50);
    const spawnY = y ?? Phaser.Math.Between(50, GameConfig.WORLD_HEIGHT - 50);

    const bean = new Bean(this, spawnX, spawnY, startSatiety, isAdult, this.areStatsVisible, this.areHoardLinesVisible, attributes, hoardId, strategy);
    this.add.existing(bean);
    this.beans.push(bean);
    this.beanGroup.add(bean);
    bean.setupPhysics();

    // Notify UI of new count via registry
    this.registry.set('beanCount', this.beans.length);
    this.game.events.emit('UPDATE_BEAN_COUNT', this.beans.length);
  }

  resize(gameSize: Phaser.Structs.Size) {
    // Only resize the camera viewport, do NOT change the physics world bounds
    this.cameras.main.setViewport(0, 0, gameSize.width, gameSize.height);
    // Visual bounds are fixed to WORLD size now, so no need to redraw
  }

  update(_time: number, delta: number) {
    // Handle Camera Pan and Zoom
    this.handleCameraInput();

    if (this.isPaused) return;

    // Sub-stepping for high speed physics stability
    // The automatic physics update runs ONCE per frame with `delta`.
    // If currentSpeed > 1, we need to simulate the extra time manually.

    // Total time we want to advance this frame
    const totalSimTime = delta * this.currentSpeed;

    // The automatic step covers 'delta' amount of time (1x speed).
    // We need to cover the rest: (currentSpeed - 1) * delta.
    let pendingTime = totalSimTime - delta;

    // Use a fixed small step for stability to prevent tunneling
    const stepSize = 16.66; // approx 60fps

    // 1. Perform extra sub-steps
    while (pendingTime > 0) {
        // Take a chunk, but don't exceed stepSize
        // (We can use larger chunks if we are confident, but smaller is safer for collision)
        let dt = pendingTime;
        if (dt > stepSize) dt = stepSize;

        pendingTime -= dt;

        // Step physics manually
        // Note: world.step expects seconds, so divide by 1000
        this.physics.world.step(dt / 1000);

        // Update logic (Beans) for this sub-step
        // We pass 'false' to render because we don't want to draw intermediate states
        this.simTime += dt;
        for (let i = this.beans.length - 1; i >= 0; i--) {
            // Check if bean is still valid (it might have died in previous sub-step)
            if (this.beans[i].scene) {
                this.beans[i].update(this.simTime, dt, false);
            }
        }
    }

    // 2. Perform the final update (for the Automatic Physics Step)
    // Phaser will run one physics step after this update method returns, using 'delta'.
    // We update the game logic to match that final step.
    this.simTime += delta;
    this.registry.set('simTime', this.simTime);

    // Update Hoard Manager
    // Cleanup empty hoards before rendering (check both beans and cocoons)
    // Cast cocoons to match expected type interface if needed, but since we use loose typing in pruneEmptyHoards argument
    // it accepts objects with hoardId. However, Cocoon is a class, we need to ensure it has hoardId exposed publicly or mapped.
    // Cocoon has 'inheritedHoardId' property.
    const allHoardUsers = [
        ...this.beans.map(b => ({ hoardId: b.hoardId })),
        ...this.cocoons.map(c => ({ hoardId: c.inheritedHoardId }))
    ];
    this.hoardManager.pruneEmptyHoards(allHoardUsers);
    this.hoardManager.update();

    for (let i = this.beans.length - 1; i >= 0; i--) {
        if (this.beans[i].scene) {
             // Pass true to render the final state
            this.beans[i].update(this.simTime, delta, true);
        }
    }

    // 3. Update Manual Food Timer
    this.foodTimer += totalSimTime; // Use totalSimTime which includes speed factor
    if (this.foodTimer >= GameConfig.FOOD.SPAWN_INTERVAL) {
        this.spawnFood();
        this.foodTimer -= GameConfig.FOOD.SPAWN_INTERVAL;
    }
  }

  private handleCameraInput() {
    // Check for Pinch first (requires 2 pointers)
    if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
        this.lastPointerPosition = null; // Reset pan state

        const dist = Phaser.Math.Distance.Between(
            this.input.pointer1.position.x, this.input.pointer1.position.y,
            this.input.pointer2.position.x, this.input.pointer2.position.y
        );

        if (this.prevPinchDistance) {
            // Calculate scale factor
            const zoomFactor = dist / this.prevPinchDistance;

            let newZoom = this.cameras.main.zoom * zoomFactor;
            // Clamp zoom
            newZoom = Phaser.Math.Clamp(newZoom, 0.25, 2.0);

            this.cameras.main.setZoom(newZoom);
        }
        this.prevPinchDistance = dist;
    }
    // Pan (requires 1 active pointer, and NO pinch)
    else if (this.input.activePointer.isDown) {
        this.prevPinchDistance = null; // Reset pinch state

        const p = this.input.activePointer;

        // UI Check (Screen Space)
        // Buttons are at Right edge (width - 80 center, so width - 120 start),
        // extending down to ~350px.
        // Let's protect the top right corner.
        if (p.position.x > this.scale.width - 150 && p.position.y < 350) {
           this.lastPointerPosition = null; // Ensure we don't resume panning with a jump
           return;
        }

        if (this.lastPointerPosition) {
            // Calculate delta movement
            // We use p.position (screen space)
            const dx = p.position.x - this.lastPointerPosition.x;
            const dy = p.position.y - this.lastPointerPosition.y;

            if (dx !== 0 || dy !== 0) {
                // Adjust camera scroll.
                // We divide by zoom so that the map moves 1:1 with the finger regardless of zoom level.
                this.cameras.main.scrollX -= dx / this.cameras.main.zoom;
                this.cameras.main.scrollY -= dy / this.cameras.main.zoom;
            }
        }

        // Update stored position
        if (!this.lastPointerPosition) {
            this.lastPointerPosition = new Phaser.Math.Vector2(p.position.x, p.position.y);
        } else {
            this.lastPointerPosition.set(p.position.x, p.position.y);
        }
    } else {
        this.prevPinchDistance = null;
        this.lastPointerPosition = null;
    }
  }

  public getBeans(): Bean[] {
    return this.beans;
  }

  public getFoods(): Food[] {
      return this.foods;
  }

  public spawnFood() {
      // Spawn anywhere in the WORLD
      const padding = 50;
      const x = Phaser.Math.Between(padding, GameConfig.WORLD_WIDTH - padding);
      const y = Phaser.Math.Between(padding, GameConfig.WORLD_HEIGHT - padding);

      const typeRoll = Math.random();
      let satiety = 1;
      if (typeRoll > 0.9) satiety = 5;
      else if (typeRoll > 0.6) satiety = 2;

      let bonus: { type: 'strength' | 'speed' | 'constitution', value: number } | undefined;
      // 10% chance for attribute bonus
      if (Math.random() < 0.1) {
          const attrRoll = Math.random();
          let type: 'strength' | 'speed' | 'constitution' = 'strength';
          if (attrRoll > 0.66) type = 'speed';
          else if (attrRoll > 0.33) type = 'constitution';

          bonus = { type, value: 0.5 };
      }

      this.createFood(x, y, satiety, bonus);
  }

  public dropFood(x: number, y: number, satiety: number, bonus?: { type: 'strength' | 'speed' | 'constitution', value: number }) {
      this.createFood(x, y, satiety, bonus);
  }

  private createFood(x: number, y: number, satiety: number, bonus?: { type: 'strength' | 'speed' | 'constitution', value: number }) {
      const food = new Food(this, x, y, satiety, bonus);
      this.add.existing(food);
      this.foods.push(food);
      this.foodGroup.add(food);
      food.setupPhysics();
  }

  public removeFood(food: Food) {
      const index = this.foods.indexOf(food);
      if (index > -1) {
          this.foods.splice(index, 1);
      }
      this.foodGroup.remove(food);
      food.destroy();
  }

  public removeBean(bean: Bean) {
      const index = this.beans.indexOf(bean);
      if (index > -1) {
          this.beans.splice(index, 1);
      }
      this.beanGrid.remove(bean); // Remove from grid
      this.beanGroup.remove(bean);
      bean.destroy();

      this.registry.set('beanCount', this.beans.length);
      this.game.events.emit('UPDATE_BEAN_COUNT', this.beans.length);
  }

  public getBeansInRadius(x: number, y: number, radius: number): Bean[] {
      return this.beanGrid.query(x, y, radius);
  }

  private checkBeanCollision(obj1: any, obj2: any): boolean {
    const b1 = obj1 as Bean;
    const b2 = obj2 as Bean;

    if (!b1.active || !b2.active) return true;

    const b1Ready = b1.isSeekingMate;
    const b2Ready = b2.isSeekingMate;

    // If both are ready to mate
    if (b1Ready && b2Ready) {
        // Check Locking Compatibility
        // If they are locked to specific partners, they must be locked to each other
        if (b1.lockedPartner && b1.lockedPartner !== b2) return true; // Collide with others
        if (b2.lockedPartner && b2.lockedPartner !== b1) return true; // Collide with others

        // They are compatible partners. Return false to DISABLE physics collision (allow overlap).
        return false;
    }

    // Combat Logic
    this.handleCombat(b1, b2);

    return true; // Default physics behavior (collide/bounce)
  }

  private handleCombat(b1: Bean, b2: Bean) {
      // Check if one is a guard and the other is an intruder
      let guard: Bean | null = null;
      let intruder: Bean | null = null;

      // Identify roles
      const isB1Guard = b1.moveState === MoveState.GUARDING || b1.moveState === MoveState.CHASING_ENEMY;
      const isB2Guard = b2.moveState === MoveState.GUARDING || b2.moveState === MoveState.CHASING_ENEMY;

      if (isB1Guard && !isB2Guard) {
          guard = b1;
          intruder = b2;
      } else if (isB2Guard && !isB1Guard) {
          guard = b2;
          intruder = b1;
      } else if (isB1Guard && isB2Guard) {
          // Both are guards (maybe different families/hoards? For now they fight too)
          guard = b1;
          intruder = b2;
      }

      if (guard && intruder) {
          // Check "family" (skip for now as we don't have family ID, assume everyone else is enemy)
          if (guard.lockedPartner === intruder) return;

          // Apply Damage (Satiety loss)
          // Base damage 5, scaled by strength difference?
          // Instructions: "satiety -= 5. Strength higher -> more loss."
          const baseDmg = 5;

          // Guard hits Intruder
          const dmgToIntruder = baseDmg + Math.max(0, guard.strength - intruder.strength);
          intruder.satiety -= dmgToIntruder;

          // Intruder hits Guard (self defense?)
          const dmgToGuard = baseDmg + Math.max(0, intruder.strength - guard.strength);
          guard.satiety -= dmgToGuard;

          // VFX & SFX
          this.createCollisionParticles((b1.x + b2.x) / 2, (b1.y + b2.y) / 2);
          this.playCombatSound();

          // Visuals
          guard.triggerCombat();
          intruder.triggerCombat();

          // Check Fleeing
          if (intruder.satiety < intruder.strategy.fleeThreshold) {
              intruder.fleeFrom(guard);
          }

          if (guard.satiety < guard.strategy.fleeThreshold) {
               guard.fleeFrom(intruder);
               (guard as any).hoardLocation = null;
          }
      }
  }

  private createCollisionParticles(x: number, y: number) {
       // Create a temporary texture for particle if not exists?
       if (!this.textures.exists('particle_dot')) {
           const graphics = this.make.graphics({ x: 0, y: 0 });
           graphics.fillStyle(0xffffff);
           graphics.fillCircle(4, 4, 4);
           graphics.generateTexture('particle_dot', 8, 8);
       }

       const emitter = this.add.particles(x, y, 'particle_dot', {
            speed: { min: 50, max: 150 },
            scale: { start: 0.5, end: 0 },
            lifespan: 300,
            blendMode: 'ADD',
            emitting: false
       });
       emitter.explode(10);

       // Clean up emitter?
       this.time.delayedCall(1000, () => {
           emitter.destroy();
       });
  }

  private playCombatSound() {
      // Procedural sound
      if (this.sound instanceof Phaser.Sound.WebAudioSoundManager) {
          const ctx = this.sound.context;
          if (ctx.state === 'suspended') return;

          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.type = 'square';
          const now = ctx.currentTime;
          osc.frequency.setValueAtTime(150, now);
          osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);

          gain.gain.setValueAtTime(0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

          osc.start();
          osc.stop(now + 0.1);
      }
  }

  private checkReproductionOverlap(bean1: Bean, bean2: Bean) {
      // Check if both are seeking mate
      if (!bean1.active || !bean2.active) return;

      const b1Ready = bean1.isSeekingMate;
      const b2Ready = bean2.isSeekingMate;

      if (b1Ready && b2Ready) {
          // Check Locking Compatibility
          // If a bean has a specific partner locked, it should ONLY reproduce with that partner.
          if (bean1.lockedPartner && bean1.lockedPartner !== bean2) return;
          if (bean2.lockedPartner && bean2.lockedPartner !== bean1) return;

          console.log(`Reproduction triggered between beans at ${bean1.x},${bean1.y}`);
          this.startReproduction(bean1, bean2);
      }
  }

  private startReproduction(parent1: Bean, parent2: Bean) {
      console.log("Starting reproduction logic execution...");
      // Calculate mid point
      const midX = (parent1.x + parent2.x) / 2;
      const midY = (parent1.y + parent2.y) / 2;

      const totalSatiety = parent1.satiety + parent2.satiety;
      const color1 = parent1.getMainColor();
      const color2 = parent2.getMainColor();

      const parentsAttributes = {
          strength: [parent1.strength, parent2.strength],
          speed: [parent1.speed, parent2.speed],
          constitution: [parent1.constitution, parent2.constitution]
      };

      const parentsStrategies = [parent1.strategy, parent2.strategy];

      // Determine Inherited Hoard ID
      let inheritedHoardId: string | null = null;

      const id1 = parent1.hoardId;
      const id2 = parent2.hoardId;

      if (id1 && id2) {
          if (id1 === id2) {
              inheritedHoardId = id1;
          } else {
              // Merge hoards
              const loc1 = parent1.getHoardLocation();
              const loc2 = parent2.getHoardLocation();
              if (loc1 && loc2) {
                  const avgX = (loc1.x + loc2.x) / 2;
                  const avgY = (loc1.y + loc2.y) / 2;
                  const r1 = this.hoardManager.getHoard(id1)?.radius || 40;
                  const r2 = this.hoardManager.getHoard(id2)?.radius || 40;
                  const avgR = (r1 + r2) / 2;

                  inheritedHoardId = this.hoardManager.registerHoard(avgX, avgY, avgR);
              } else {
                  inheritedHoardId = id1;
              }
          }
      } else if (id1) {
          inheritedHoardId = id1;
      } else if (id2) {
          inheritedHoardId = id2;
      } else {
          inheritedHoardId = null;
      }

      // Create Cocoon
      const cocoon = new Cocoon(this, midX, midY, totalSatiety, color1, color2, parentsAttributes, inheritedHoardId, parentsStrategies);
      this.add.existing(cocoon);
      this.cocoons.push(cocoon);

      cocoon.once('destroy', () => {
          const idx = this.cocoons.indexOf(cocoon);
          if (idx > -1) this.cocoons.splice(idx, 1);
      });

      // Remove parents
      this.removeBean(parent1);
      this.removeBean(parent2);
  }

  private drawBounds(width: number, height: number) {
    if (!this.boundsGraphics) {
      this.boundsGraphics = this.add.graphics();
      // Ensure it's drawn below beans but above background
      this.boundsGraphics.setDepth(-1);
    }
    this.boundsGraphics.clear();

    // Draw a border around the screen
    // Inset by half line width (2px) so the 4px stroke is fully within bounds
    this.boundsGraphics.lineStyle(4, 0x666666);
    this.boundsGraphics.strokeRect(2, 2, width - 4, height - 4);
  }
}
