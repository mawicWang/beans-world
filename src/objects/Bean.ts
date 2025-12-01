import Phaser from 'phaser';
import type GameScene from '../scenes/GameScene';
import Food from './Food';

export enum MoveState {
  IDLE,
  CHARGING,
  BURSTING,
  DECELERATING,
  SEEKING_MATE
}

export default class Bean extends Phaser.GameObjects.Container {
  private bodyGraphics: Phaser.GameObjects.Graphics;
  private statusPanel: Phaser.GameObjects.Container;
  private statusText: Phaser.GameObjects.Text;

  // Physics (Head)
  public moveState: MoveState = MoveState.IDLE;
  private stateTimer: number = 0;
  private moveTarget: Phaser.Math.Vector2 | null = null;
  private facingAngle: number = 0;
  private isSeekingMate: boolean = false;

  // Physics (Tail Spring)
  private tailPos: Phaser.Math.Vector2;
  private tailVelocity: Phaser.Math.Vector2;

  // Stats
  public satiety: number = 80;
  public isAdult: boolean = true;
  private age: number = 0;
  private reproCooldown: number = 0;
  private readonly MATURITY_AGE = 60000; // 1 minute to grow up
  private readonly VISION_RADIUS = 200;
  private isFull: boolean = false;

  // Constants
  private readonly SPRING_STIFFNESS = 0.1;
  private readonly SPRING_DAMPING = 0.6;
  private readonly ROPE_LENGTH = 0; // Slack length for "rope" feel
  private readonly BURST_SPEED = 200; // Decreased for smoother movement
  private readonly CHARGE_DURATION = 300; // ms
  private readonly IDLE_DURATION_MIN = 500;
  private readonly IDLE_DURATION_MAX = 2000;

  // Visuals
  private readonly ADULT_RADIUS = 15;
  private readonly CHILD_RADIUS = 9; // 0.6 * 15
  private currentRadius = 15;
  private mainColor: number;

  constructor(scene: Phaser.Scene, x: number, y: number, startSatiety: number = 80, startAdult: boolean = true) {
    super(scene, x, y);

    this.satiety = startSatiety;
    this.isAdult = startAdult;
    this.currentRadius = this.isAdult ? this.ADULT_RADIUS : this.CHILD_RADIUS;

    // Pick a jelly-like color (variations of blue/cyan/purple)
    const colors = [0x4aa3df, 0x50c8e0, 0x6e8cd4, 0x4dd0e1];
    this.mainColor = Phaser.Utils.Array.GetRandom(colors);

    this.bodyGraphics = scene.add.graphics();
    this.add(this.bodyGraphics);

    // Status Panel
    this.statusPanel = scene.add.container(25, -25);
    const panelBg = scene.add.rectangle(0, 0, 50, 20, 0x000000, 0.5);
    this.statusText = scene.add.text(0, 0, '80', { fontSize: '12px', color: '#fff' }).setOrigin(0.5);
    this.statusPanel.add([panelBg, this.statusText]);
    this.statusPanel.setVisible(false);
    this.add(this.statusPanel);

    // Listen for toggle event
    const toggleHandler = (visible: boolean) => {
        this.statusPanel.setVisible(visible);
    };
    scene.game.events.on('TOGGLE_BEAN_STATS', toggleHandler);

    // Clean up listener when destroyed
    this.once('destroy', () => {
        scene.game.events.off('TOGGLE_BEAN_STATS', toggleHandler);
    });

    // Initialize tail at head position
    this.tailPos = new Phaser.Math.Vector2(x, y);
    this.tailVelocity = new Phaser.Math.Vector2(0, 0);

    // Initial state
    this.setIdle();
  }

  public getMainColor(): number {
    return this.mainColor;
  }

  public setupPhysics() {
    // Enable physics body for movement if not already enabled
    if (!this.body) {
      this.scene.physics.world.enable(this);
    }

    const body = this.body as Phaser.Physics.Arcade.Body;
    this.updatePhysicsBodySize();
    body.setCollideWorldBounds(true);
    // Add drag for the "Decelerate" phase
    body.setDrag(400);
    body.setBounce(0.5);
  }

  private updatePhysicsBodySize() {
      const body = this.body as Phaser.Physics.Arcade.Body;
      if (body) {
          body.setCircle(this.currentRadius);
          body.setOffset(-this.currentRadius, -this.currentRadius);
      }
  }

  private setIdle() {
    this.moveState = MoveState.IDLE;
    this.isSeekingMate = false;
    this.stateTimer = Phaser.Math.Between(this.IDLE_DURATION_MIN, this.IDLE_DURATION_MAX);
    this.moveTarget = null;
  }

  private pickRandomTarget() {
    const scene = this.scene as unknown as GameScene;
    const padding = 50;
    const tx = Phaser.Math.Between(padding, scene.scale.width - padding);
    const ty = Phaser.Math.Between(padding, scene.scale.height - padding);
    this.moveTarget = new Phaser.Math.Vector2(tx, ty);
  }

  private growUp() {
      this.isAdult = true;
      // Start from current size (Child)

      // Animate the growth
      // Store initial radius for interpolation
      const startRadius = this.currentRadius;
      const targetRadius = this.ADULT_RADIUS;

      this.scene.tweens.add({
          targets: this,
          duration: 1000,
          ease: 'Sine.easeOut',
          // We use a custom tween value
          onUpdate: (tween) => {
              const progress = tween.progress;
              this.currentRadius = Phaser.Math.Interpolation.Linear([startRadius, targetRadius], progress);
              // Note: We don't update physics body size every frame to avoid expensive re-calculations/stuck issues,
              // but we update the visual radius.
          },
          onComplete: () => {
             this.currentRadius = targetRadius;
             this.updatePhysicsBodySize();
          }
      });
  }

  update(_time: number, delta: number, render: boolean = true) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!body) return; // Safety check in case update is called before physics setup

    // 0. Growth & Lifecycle
    if (!this.isAdult) {
        this.age += delta;
        if (this.age >= this.MATURITY_AGE) {
            this.growUp();
        }
    }

    if (this.reproCooldown > 0) {
        this.reproCooldown -= delta;
    }

    // 0.5. Satiety Decay
    const decayRate = body.speed > 5 ? 0.5 : 0.1;
    this.satiety -= decayRate * (delta / 1000);
    this.statusText.setText(Math.floor(this.satiety).toString());

    if (this.satiety <= 0) {
        // Die
        const scene = this.scene as unknown as GameScene;
        scene.removeBean(this);
        return;
    } else if (this.satiety >= 100) {
        this.satiety = 100;
        this.isFull = true;
    } else if (this.satiety < 90) {
        this.isFull = false;
    }

    // Reproduction Trigger Check (Only if Adult, Idle, and High Satiety)
    if (this.isAdult && this.satiety > 60 && this.reproCooldown <= 0 && this.moveState === MoveState.IDLE) {
         // Probability check based on satiety
         // "The higher the satiety, the more likely to enter the state"
         // Let's use a quadratic curve for probability per second.
         // (satiety - 60) ranges from 0 to 40.
         // (40^2) = 1600.
         // Max chance at 100 satiety? Let's say 10% per second?
         // 0.1 / 60fps = 0.0016 per frame.
         // k * 1600 = 0.0016 => k = 0.000001

         // Probability check based on satiety
         // "The higher the satiety, the more likely to enter the state"
         // Base chance calculated per SECOND.
         // (satiety - 60) ranges from 0 to 40.
         // (40^2) = 1600.
         // We want reasonable probability.
         // At 100 satiety (1600 score), let's say 20% chance per second.
         // 1600 * k = 0.20 -> k = 0.000125

         const baseChance = Math.pow((this.satiety - 60), 2); // 0 to 1600
         const k = 0.000125;
         const probabilityPerSecond = baseChance * k;

         // Convert to per-frame probability based on delta (ms)
         // prob = 1 - (1 - probPerSec)^(delta/1000) ~ probPerSec * (delta/1000) for small probs
         const frameProbability = probabilityPerSecond * (delta / 1000);

         if (Math.random() < frameProbability) {
             this.moveState = MoveState.SEEKING_MATE;
             this.isSeekingMate = true;
         }
    }

    // If we dropped below 60, stop seeking
    if (this.isSeekingMate && this.satiety < 60) {
        this.isSeekingMate = false;
        this.setIdle();
    }

    // 1. State Machine
    if (this.stateTimer > 0) {
      this.stateTimer -= delta;
    }

    switch (this.moveState) {
      case MoveState.IDLE:
        if (this.stateTimer <= 0) {
          this.pickTarget();
          this.moveState = MoveState.CHARGING;
          this.stateTimer = this.CHARGE_DURATION;
        }
        break;

      case MoveState.SEEKING_MATE:
        // Continuously update target to nearest mate
        const mate = this.findClosestMate();

        if (mate) {
             this.moveTarget = new Phaser.Math.Vector2(mate.x, mate.y);
             const targetAngle = Phaser.Math.Angle.Between(this.x, this.y, this.moveTarget.x, this.moveTarget.y);
             this.facingAngle = targetAngle;
             // IMPORTANT: When seeking mate, we DO NOT apply separation force in the same way
             // because we WANT to collide/merge.
        } else {
             // No mate found, look around randomly
             if (!this.moveTarget || (this.moveTarget && this.hasReachedTarget())) {
                 this.pickRandomTarget();
             }

             if (this.moveTarget) {
                 const targetAngle = Phaser.Math.Angle.Between(this.x, this.y, this.moveTarget.x, this.moveTarget.y);
                 this.facingAngle = targetAngle;
             }
        }

        // Burst movement
        if (this.stateTimer <= 0) {
          this.burst();
          // If seeking mate, burst more frequently?
          this.stateTimer = this.CHARGE_DURATION;
        }
        break;

      case MoveState.CHARGING:
        // Orient towards target while charging, with separation from other beans
        if (this.moveTarget) {
          const targetAngle = Phaser.Math.Angle.Between(this.x, this.y, this.moveTarget.x, this.moveTarget.y);

          // Calculate separation vector
          const separationVector = this.getSeparationVector();

          if (separationVector.length() > 0) {
            // Combine target direction and separation direction
            const targetVec = new Phaser.Math.Vector2(Math.cos(targetAngle), Math.sin(targetAngle));
            const separationWeight = 2.5; // Strong repulsion to ensure they don't stick

            const combinedVec = targetVec.add(separationVector.scale(separationWeight));
            this.facingAngle = combinedVec.angle();
          } else {
            this.facingAngle = targetAngle;
          }
        }

        if (this.stateTimer <= 0) {
          this.burst();
        }
        break;

      case MoveState.BURSTING:
        // Transition immediately to Decelerating after frame 1 (velocity applied)
        this.moveState = MoveState.DECELERATING;
        break;

      case MoveState.DECELERATING:
        const dist = this.moveTarget ? Phaser.Math.Distance.Between(this.x, this.y, this.moveTarget.x, this.moveTarget.y) : 0;

        // If we are far from the target, start the next hop before stopping completely
        // to create a smoother, continuous movement.
        if (this.moveTarget && dist > 100 && body.speed < 150) {
          this.moveState = this.isSeekingMate ? MoveState.SEEKING_MATE : MoveState.CHARGING;
          this.stateTimer = this.CHARGE_DURATION;
        } else if (body.speed < 10) {
           body.setVelocity(0,0);

           if (this.isSeekingMate) {
               this.moveState = MoveState.SEEKING_MATE;
               this.stateTimer = 0; // Ready to burst/seek again immediately or soon
           } else {
               this.setIdle();
           }
        }
        break;
    }

    // 2. Tail Physics (Elastic Rope System)
    // We need to use delta for time-correction.
    // Assuming the original stiffness/damping were tuned for 60fps (16.6ms),
    // we normalize delta to "frames".
    const dt = delta / 16.66; // 1.0 at 60fps

    // Head position (World)
    const headX = this.x;
    const headY = this.y;

    // Vector from Tail to Head
    const dx = headX - this.tailPos.x;
    const dy = headY - this.tailPos.y;
    const currentDist = Math.sqrt(dx * dx + dy * dy);

    let ax = 0;
    let ay = 0;

    // Apply force only if distance exceeds rope length (slack)
    if (currentDist > this.ROPE_LENGTH) {
        // Force proportional to extension beyond rope length
        const force = (currentDist - this.ROPE_LENGTH) * this.SPRING_STIFFNESS;
        // Normalize direction (dx/dist, dy/dist) and scale by force
        ax = (dx / currentDist) * force;
        ay = (dy / currentDist) * force;
    } else {
        // Force back to center if inside slack (though slack is now 0)
        // This ensures it centers perfectly
         const force = currentDist * this.SPRING_STIFFNESS;
         if (currentDist > 0) {
             ax = (dx / currentDist) * force;
             ay = (dy / currentDist) * force;
         }
    }

    // Update velocity (Acceleration * dt)
    this.tailVelocity.x += ax * dt;
    this.tailVelocity.y += ay * dt;

    // Damping (applied per frame, so we power it by dt)
    // v *= damping^dt
    this.tailVelocity.x *= Math.pow(this.SPRING_DAMPING, dt);
    this.tailVelocity.y *= Math.pow(this.SPRING_DAMPING, dt);

    // Update position (Velocity * dt)
    this.tailPos.x += this.tailVelocity.x * dt;
    this.tailPos.y += this.tailVelocity.y * dt;

    // 3. Render
    if (render) {
        // Convert World Tail to Local Tail relative to Container
        // This allows us to draw using local coordinates where (0,0) is always the Head
        // Since the container is NOT rotated, this is just a translation.
        const localTail = new Phaser.Math.Vector2();
        this.getLocalPoint(this.tailPos.x, this.tailPos.y, localTail);

        this.drawJelly(localTail);
    }
  }

  private getSeparationVector(): Phaser.Math.Vector2 {
    const separationRadius = 60; // How close is "too close"
    const separationForce = new Phaser.Math.Vector2(0, 0);

    // Cast scene to GameScene to access getBeans
    // We can assume scene is GameScene based on usage
    const scene = this.scene as unknown as GameScene;
    if (typeof scene.getBeans !== 'function') return separationForce; // Safety check

    const beans = scene.getBeans();
    let count = 0;

    for (const other of beans) {
      if (other === this) continue;

      const dist = Phaser.Math.Distance.Between(this.x, this.y, other.x, other.y);

      if (dist < separationRadius && dist > 0) {
        // Vector away from other
        const diff = new Phaser.Math.Vector2(this.x - other.x, this.y - other.y);
        diff.normalize();

        // Weight by distance (closer = stronger)
        diff.scale(1.0 / dist);

        separationForce.add(diff);
        count++;
      }
    }

    if (count > 0) {
      // Average
      separationForce.scale(1.0 / count);
      separationForce.normalize();
    }

    return separationForce;
  }

  private findClosestMate(): Bean | null {
      const scene = this.scene as unknown as GameScene;
      const beans = scene.getBeans();
      let closestDist = Infinity;
      let target: Bean | null = null;

      for (const other of beans) {
          if (other === this) continue;
          if (other.moveState !== MoveState.SEEKING_MATE) continue;

          const dist = Phaser.Math.Distance.Between(this.x, this.y, other.x, other.y);
          if (dist < closestDist) {
              closestDist = dist;
              target = other;
          }
      }
      return target;
  }

  private hasReachedTarget(): boolean {
      if (!this.moveTarget) return true;
      const dist = Phaser.Math.Distance.Between(this.x, this.y, this.moveTarget.x, this.moveTarget.y);
      return dist < 20; // Tolerance for reaching target
  }

  private pickTarget() {
    const scene = this.scene as unknown as GameScene;

    // Check for food if not full
    let foodTarget: Phaser.GameObjects.GameObject | null = null;
    if (!this.isFull) {
        const foods = scene.getFoods();
        let closestDist = this.VISION_RADIUS;

        for (const food of foods) {
            // Check if food is still valid/active
            if (!food || !food.scene) continue;

            const dist = Phaser.Math.Distance.Between(this.x, this.y, food.x, food.y);
            if (dist < closestDist) {
                closestDist = dist;
                foodTarget = food;
            }
        }
    }

    if (foodTarget) {
        const food = foodTarget as Food;
        this.moveTarget = new Phaser.Math.Vector2(food.x, food.y);
    } else {
        this.pickRandomTarget();
    }
  }

  public eat(food: Food) {
      // Only eat if not full
      if (this.isFull) return;

      this.satiety += food.satiety;
      // Remove food
      const scene = this.scene as unknown as GameScene;
      scene.removeFood(food);
  }

  private burst() {
    if (!this.moveTarget) return;
    const body = this.body as Phaser.Physics.Arcade.Body;

    // Calculate vector
    const angle = this.facingAngle;
    this.scene.physics.velocityFromRotation(angle, this.BURST_SPEED, body.velocity);

    this.playMoveSound();
    this.moveState = MoveState.BURSTING;
  }

  private drawJelly(tailOffset: Phaser.Math.Vector2) {
    this.bodyGraphics.clear();

    // Calculate geometry
    let dist = tailOffset.length();

    // Snap to 0 if very small to ensure perfect circle
    if (dist < 0.5) dist = 0;

    // Deformation: As distance increases, Head grows slightly, Tail shrinks
    // Limit dist to avoid breaking geometry
    const stretchFactor = Math.min(dist, 100) / 100; // 0 to 1

    const headRadius = this.currentRadius * (1 + stretchFactor * 0.2);
    const tailRadius = this.currentRadius * (1 - stretchFactor * 0.7); // Tail gets smaller

    // Head is always at (0,0)
    const hx = 0;
    const hy = 0;

    // Tail is at (tailOffset.x, tailOffset.y)
    const tx = tailOffset.x;
    const ty = tailOffset.y;

    // Colors
    this.bodyGraphics.fillStyle(this.mainColor, 0.9);
    this.bodyGraphics.lineStyle(2, 0x1a5f8a, 1.0); // Darker border

    // Draw connected shape
    // Get angle from Tail to Head for hull calculation
    const angle = Phaser.Math.Angle.Between(tx, ty, hx, hy);

    // Calculate tangent points
    // We want a convex hull around two circles.
    // For unequal radii, the offset angle is acos((r1 - r2) / d).

    let offsetAngle = Math.PI / 2;
    const rDiff = headRadius - tailRadius;
    if (dist > Math.abs(rDiff)) {
        offsetAngle = Math.acos(rDiff / dist);
    }

    const h2x = hx + Math.cos(angle - offsetAngle) * headRadius;
    const h2y = hy + Math.sin(angle - offsetAngle) * headRadius;

    const t1x = tx + Math.cos(angle + offsetAngle) * tailRadius;
    const t1y = ty + Math.sin(angle + offsetAngle) * tailRadius;

    // Draw Head
    this.bodyGraphics.beginPath();
    this.bodyGraphics.arc(hx, hy, headRadius, angle - offsetAngle, angle + offsetAngle, false);
    // Line to Tail 1
    this.bodyGraphics.lineTo(t1x, t1y);
    // Tail Arc
    this.bodyGraphics.arc(tx, ty, tailRadius, angle + offsetAngle, angle - offsetAngle, false);
    // Line back to Head 2
    this.bodyGraphics.lineTo(h2x, h2y);
    this.bodyGraphics.closePath();

    this.bodyGraphics.fillPath();
    this.bodyGraphics.strokePath();

    // Direction Indicator (Black Dot)
    // Position it based on facingAngle
    const indicatorSize = 3;
    const indicatorOffset = headRadius * 0.6; // Position it forward relative to head center

    const ix = Math.cos(this.facingAngle) * indicatorOffset;
    const iy = Math.sin(this.facingAngle) * indicatorOffset;

    this.bodyGraphics.fillStyle(0x000000, 0.8);
    this.bodyGraphics.fillCircle(ix, iy, indicatorSize);

    // Highlight (Shiny jelly)
    // Keep highlight static (top-left) to simulate fixed light source
    this.bodyGraphics.fillStyle(0xffffff, 0.4);
    this.bodyGraphics.fillCircle(-headRadius*0.3, -headRadius*0.3, headRadius*0.25);
  }

  private playMoveSound() {
    // Simple synthesized "pop" sound using Web Audio API
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;

    const soundManager = this.scene.sound as Phaser.Sound.WebAudioSoundManager;
    if (!soundManager.context) return;
    const ctx = soundManager.context;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    // Frequency sweep for a cute "bloop" sound
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    osc.start();
    osc.stop(now + 0.15);
  }
}
