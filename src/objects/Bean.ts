import Phaser from 'phaser';
import type GameScene from '../scenes/GameScene';
import Food from './Food';

export enum MoveState {
  IDLE,
  CHARGING,
  BURSTING,
  DECELERATING,
  SEEKING_MATE,
  MOVING_TO_PARTNER,
  HAULING_FOOD,
  GUARDING,
  CHASING_ENEMY,
  FLEEING
}

export default class Bean extends Phaser.GameObjects.Container {
  private bodyGraphics: Phaser.GameObjects.Graphics;
  private hoardGraphics: Phaser.GameObjects.Graphics;
  private statusPanel: Phaser.GameObjects.Container;
  private statusText: Phaser.GameObjects.Text;
  private showHoardLines: boolean = false;

  // Hoarding & Resources
  private hoardLocation: Phaser.Math.Vector2 | null = null;
  private carriedFoodData: { satiety: number, attributeBonus?: { type: 'strength' | 'speed' | 'constitution', value: number } } | null = null;

  public getHoardLocation(): Phaser.Math.Vector2 | null {
      return this.hoardLocation;
  }

  // Physics (Head)
  public moveState: MoveState = MoveState.IDLE;
  private previousState: MoveState = MoveState.IDLE; // To restore state after deceleration
  private stateTimer: number = 0;
  private moveTarget: Phaser.Math.Vector2 | null = null;
  private facingAngle: number = 0;
  public isSeekingMate: boolean = false;
  public isGuarding: boolean = false;
  private stuckTimer: number = 0;
  private combatTimer: number = 0;

  // Reproduction Locking
  public lockedPartner: Bean | null = null;

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
  private readonly GUARD_VISION_RADIUS = 300;
  private isFull: boolean = false;

  // Attributes
  public strength: number = 5;
  public speed: number = 5;
  public constitution: number = 5;
  private maxSatiety: number = 100;

  // Attribute Constraints
  public static readonly MIN_ATTR = 1;
  public static readonly MAX_ATTR = 20;

  // Constants
  private readonly SPRING_STIFFNESS = 0.1;
  private readonly SPRING_DAMPING = 0.6;
  private readonly ROPE_LENGTH = 0; // Slack length for "rope" feel
  private readonly CHARGE_DURATION = 300; // ms
  private readonly IDLE_DURATION_MIN = 500;
  private readonly IDLE_DURATION_MAX = 2000;
  private readonly MAX_CHASE_DIST = 500;

  // Visuals
  private adultRadius = 15;
  private currentRadius = 15;
  private mainColor: number = 0xffffff;

  private get hoardRadius(): number {
      return this.adultRadius * 2.5;
  }

  constructor(
      scene: Phaser.Scene,
      x: number,
      y: number,
      startSatiety: number = 80,
      startAdult: boolean = true,
      showStats: boolean = false,
      attributes: { strength?: number, speed?: number, constitution?: number } = {},
      hoardLocation: Phaser.Math.Vector2 | null = null
  ) {
    super(scene, x, y);

    if (hoardLocation) {
        this.hoardLocation = new Phaser.Math.Vector2(hoardLocation.x, hoardLocation.y);
    }

    this.satiety = startSatiety;
    this.isAdult = startAdult;

    // Initialize Attributes
    this.strength = Phaser.Math.Clamp(attributes.strength ?? 5, Bean.MIN_ATTR, Bean.MAX_ATTR);
    this.speed = Phaser.Math.Clamp(attributes.speed ?? 5, Bean.MIN_ATTR, Bean.MAX_ATTR);
    this.constitution = Phaser.Math.Clamp(attributes.constitution ?? 5, Bean.MIN_ATTR, Bean.MAX_ATTR);

    // Calculate derived stats
    this.maxSatiety = 80 + (this.constitution * 2); // Range 82 - 120
    this.adultRadius = 10 + (this.constitution * 0.5); // Range 10.5 - 20
    this.currentRadius = this.isAdult ? this.adultRadius : this.adultRadius * 0.6;

    this.updateVisuals();

    this.bodyGraphics = scene.add.graphics();
    this.add(this.bodyGraphics);

    // Hoard Graphics (Separate from container to avoid jitter)
    this.hoardGraphics = scene.add.graphics();
    this.hoardGraphics.setDepth(-1); // Draw below beans

    // Status Panel
    this.statusPanel = scene.add.container(25, -25);
    // Background size will be dynamic based on text
    const panelBg = scene.add.rectangle(0, 0, 80, 50, 0x000000, 0.6);
    this.statusText = scene.add.text(0, 0, this.getStatsText(), {
        fontSize: '10px',
        color: '#fff',
        align: 'left'
    }).setOrigin(0.5);

    this.statusPanel.add([panelBg, this.statusText]);
    this.statusPanel.setVisible(showStats);
    this.add(this.statusPanel);

    // Listen for toggle event
    const toggleHandler = (visible: boolean) => {
        this.statusPanel.setVisible(visible);
    };
    scene.game.events.on('TOGGLE_BEAN_STATS', toggleHandler);

    const toggleLinesHandler = (visible: boolean) => {
        this.showHoardLines = visible;
    };
    scene.game.events.on('TOGGLE_HOARD_LINES', toggleLinesHandler);

    // Clean up listener when destroyed
    this.once('destroy', () => {
        scene.game.events.off('TOGGLE_BEAN_STATS', toggleHandler);
        scene.game.events.off('TOGGLE_HOARD_LINES', toggleLinesHandler);
        this.hoardGraphics.destroy();
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
    this.previousState = MoveState.IDLE;
    this.isSeekingMate = false;
    this.isGuarding = false;
    this.lockedPartner = null;
    this.stateTimer = Phaser.Math.Between(this.IDLE_DURATION_MIN, this.IDLE_DURATION_MAX);
    this.moveTarget = null;
  }

  public fleeFrom(source: Phaser.Math.Vector2 | Phaser.GameObjects.GameObject) {
    this.moveState = MoveState.FLEEING;
    this.isGuarding = false;
    this.stateTimer = 2000; // Flee for 2 seconds

    // Vector away from source
    // Use type assertion or check if it has x/y component
    const sx = (source as any).x;
    const sy = (source as any).y;

    const angle = Phaser.Math.Angle.Between(sx, sy, this.x, this.y);
    const dist = 300;

    // Set target away from danger
    const tx = this.x + Math.cos(angle) * dist;
    const ty = this.y + Math.sin(angle) * dist;

    // Clamp to bounds
    const scene = this.scene as unknown as GameScene;
    const padding = 50;
    const clampedX = Phaser.Math.Clamp(tx, padding, scene.scale.width - padding);
    const clampedY = Phaser.Math.Clamp(ty, padding, scene.scale.height - padding);

    this.moveTarget = new Phaser.Math.Vector2(clampedX, clampedY);
  }

  private pickRandomTarget() {
    // If we have a hoard and are far from it, return to it
    if (this.hoardLocation) {
        const dist = Phaser.Math.Distance.Between(this.x, this.y, this.hoardLocation.x, this.hoardLocation.y);
        if (dist > 150) {
             this.moveTarget = new Phaser.Math.Vector2(this.hoardLocation.x, this.hoardLocation.y);
             return;
        }
    }

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
      const targetRadius = this.adultRadius;

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

  public lockPartner(other: Bean) {
      this.lockedPartner = other;
      this.moveState = MoveState.MOVING_TO_PARTNER;
      this.isSeekingMate = true; // Technically still seeking, but specifically targeting
  }

  public triggerCombat() {
    this.combatTimer = 500; // Show combat icon for 0.5s
  }

  update(_time: number, delta: number, render: boolean = true) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!body) return; // Safety check in case update is called before physics setup

    if (this.combatTimer > 0) {
      this.combatTimer -= delta;
    }

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

    // Update stats text (can be expensive to do every frame, maybe throttle?)
    // For now, doing it every frame as per previous pattern
    this.statusText.setText(this.getStatsText());

    if (this.satiety <= 0) {
        // Die
        const scene = this.scene as unknown as GameScene;
        scene.removeBean(this);
        return;
    } else if (this.satiety >= this.maxSatiety) {
        this.satiety = this.maxSatiety;
        this.isFull = true;
    } else if (this.satiety < this.maxSatiety * 0.9) {
        this.isFull = false;
    }

    // Reproduction Trigger Check (Only if Adult, Idle, and High Satiety)
    if (this.isAdult && this.satiety > 60 && this.reproCooldown <= 0 && this.moveState === MoveState.IDLE) {
         // Probability check based on satiety
         const baseChance = Math.pow((this.satiety - 60), 2); // 0 to 1600
         const k = 0.000125;
         const probabilityPerSecond = baseChance * k;

         // Convert to per-frame probability based on delta (ms)
         const frameProbability = probabilityPerSecond * (delta / 1000);

         if (Math.random() < frameProbability) {
             this.moveState = MoveState.SEEKING_MATE;
             this.isSeekingMate = true;
         }
    }

    // If we dropped below 60, stop seeking/courting
    // However, if we are MOVING_TO_PARTNER, maybe we should be more committed?
    // Let's stick to the rule: if hungry, abandon love.
    if (this.isSeekingMate && this.satiety < 60) {
        // If we had a partner, they need to know we broke up
        if (this.lockedPartner) {
             // We can't easily notify them here without circular dependency mess or event bus,
             // but the partner will notice in their update loop that we are no longer available/seeking.
             this.lockedPartner = null;
        }

        this.isSeekingMate = false;
        this.setIdle();
    }

    // 1. State Machine
    if (this.stateTimer > 0) {
      this.stateTimer -= delta;
    }

    switch (this.moveState) {
      case MoveState.IDLE:
        // Transition to Guarding if near hoard
        if (this.hoardLocation) {
            const distToHoard = Phaser.Math.Distance.Between(this.x, this.y, this.hoardLocation.x, this.hoardLocation.y);
            if (distToHoard < this.hoardRadius) {
                this.moveState = MoveState.GUARDING;
                this.isGuarding = true;
                this.stateTimer = Phaser.Math.Between(2000, 4000); // Guard duty duration before checking again or moving slightly
                break;
            }
        }

        if (this.stateTimer <= 0) {
          this.pickTarget();
          this.moveState = MoveState.CHARGING;
          this.stateTimer = this.CHARGE_DURATION;
        }
        break;

      case MoveState.GUARDING:
          // Scan for intruders
          const intruder = this.findIntruder();
          if (intruder) {
              this.moveState = MoveState.CHASING_ENEMY;
              this.moveTarget = new Phaser.Math.Vector2(intruder.x, intruder.y);
              break;
          }

          // Patrol behavior (small movements around hoard)
          if (this.stateTimer <= 0) {
              // Pick a point near hoard
              if (this.hoardLocation) {
                  const angle = Math.random() * Math.PI * 2;
                  const dist = Math.random() * this.hoardRadius;
                  this.moveTarget = new Phaser.Math.Vector2(
                      this.hoardLocation.x + Math.cos(angle) * dist,
                      this.hoardLocation.y + Math.sin(angle) * dist
                  );
                  // We switch to charging to move there, but we need to remember we are guarding.
                  // For simplicity, let's just use CHARGING and rely on the IDLE -> GUARDING transition when we stop.
                  this.moveState = MoveState.CHARGING;
                  this.stateTimer = this.CHARGE_DURATION;
              } else {
                  this.setIdle();
              }
          }
          break;

      case MoveState.CHASING_ENEMY:
          // Chase logic
           const enemy = this.findIntruder();

           // Check distance to hoard if we have one
           if (this.hoardLocation) {
               // If we are strictly guarding, we should check distance from hoard, not just current position
               // The logic here is correct: checks distance from SELF to HOARD.
               // However, we want to ensure we don't chase too far.
               const distToHoard = Phaser.Math.Distance.Between(this.x, this.y, this.hoardLocation.x, this.hoardLocation.y);
               if (distToHoard > this.MAX_CHASE_DIST) {
                   // Abandon chase
                   this.moveTarget = null;
                   // Return to hoard
                   this.setIdle();
                   // Or force move to hoard? setIdle will eventually trigger pickRandomTarget which sends to hoard.
                   break;
               }
           }

           if (enemy) {
               this.moveTarget = new Phaser.Math.Vector2(enemy.x, enemy.y);
               const angle = Phaser.Math.Angle.Between(this.x, this.y, this.moveTarget.x, this.moveTarget.y);
               this.facingAngle = angle;

               if (this.stateTimer <= 0) {
                   this.burst();
                   this.stateTimer = this.CHARGE_DURATION;
               }
           } else {
               // Enemy lost or gone
               this.setIdle();
           }
           break;

      case MoveState.FLEEING:
           if (this.stateTimer <= 0) {
               this.setIdle();
           } else {
               // Continue fleeing
               if (this.moveTarget) {
                    const angle = Phaser.Math.Angle.Between(this.x, this.y, this.moveTarget.x, this.moveTarget.y);
                    this.facingAngle = angle;

                    // Simple movement towards safety
                    const body = this.body as Phaser.Physics.Arcade.Body;
                    const fleeSpeed = 200 + (this.speed * 10);
                    this.scene.physics.velocityFromRotation(angle, fleeSpeed, body.velocity);
               }
           }
           break;

      case MoveState.SEEKING_MATE:
        // 0. Priority: Defend against intruders even while seeking mate
        const matingIntruder = this.findIntruder();
        if (matingIntruder) {
             this.moveState = MoveState.CHASING_ENEMY;
             this.moveTarget = new Phaser.Math.Vector2(matingIntruder.x, matingIntruder.y);
             break;
        }

        // Try to find a mate who is also seeking and not locked
        const mate = this.findClosestMate();

        if (mate) {
             // Check if we should lock
             // Distance threshold to commit? Let's say if within vision
             const dist = Phaser.Math.Distance.Between(this.x, this.y, mate.x, mate.y);
             if (dist < this.VISION_RADIUS) {
                 // Lock!
                 this.lockPartner(mate);
                 mate.lockPartner(this);
             } else {
                 // Just move towards them
                 this.moveTarget = new Phaser.Math.Vector2(mate.x, mate.y);
                 const targetAngle = Phaser.Math.Angle.Between(this.x, this.y, this.moveTarget.x, this.moveTarget.y);
                 this.facingAngle = targetAngle;

                 // Burst movement (only if we have a target)
                 if (this.stateTimer <= 0) {
                    this.burst();
                    this.stateTimer = this.CHARGE_DURATION;
                 }
             }
        } else {
             // No mate found.
             if (this.isGuarding) {
                 // If guarding, DO NOT roam map. Wait/Patrol near hoard.
                 if (this.hoardLocation) {
                     // Stay near hoard (Patrol logic)
                      if (!this.moveTarget || this.hasReachedTarget()) {
                          const angle = Math.random() * Math.PI * 2;
                          const dist = Math.random() * (this.hoardRadius * 0.5); // Tight patrol
                          this.moveTarget = new Phaser.Math.Vector2(
                              this.hoardLocation.x + Math.cos(angle) * dist,
                              this.hoardLocation.y + Math.sin(angle) * dist
                          );
                      }

                      const targetAngle = Phaser.Math.Angle.Between(this.x, this.y, this.moveTarget.x, this.moveTarget.y);
                      this.facingAngle = targetAngle;

                      if (this.stateTimer <= 0) {
                          this.burst();
                          this.stateTimer = this.CHARGE_DURATION * 2; // Move slower/less often
                      }
                 } else {
                     // Fallback if guard has no hoard (shouldn't happen often)
                     this.setIdle();
                 }
             } else {
                 // Normal roaming for non-guards
                 if (!this.moveTarget || (this.moveTarget && this.hasReachedTarget())) {
                     this.pickRandomTarget();
                 }

                 if (this.moveTarget) {
                     const targetAngle = Phaser.Math.Angle.Between(this.x, this.y, this.moveTarget.x, this.moveTarget.y);
                     this.facingAngle = targetAngle;
                 }

                 // Burst movement
                 if (this.stateTimer <= 0) {
                    this.burst();
                    this.stateTimer = this.CHARGE_DURATION;
                 }
             }
        }
        break;

      case MoveState.HAULING_FOOD:
          if (!this.hoardLocation) {
              this.setIdle();
              break;
          }
          // Move to hoard
          this.moveTarget = new Phaser.Math.Vector2(this.hoardLocation.x, this.hoardLocation.y);
          const distToHoard = Phaser.Math.Distance.Between(this.x, this.y, this.hoardLocation.x, this.hoardLocation.y);

          if (distToHoard < 30) {
              this.dropFood();
          } else {
             const angle = Phaser.Math.Angle.Between(this.x, this.y, this.moveTarget.x, this.moveTarget.y);
             this.facingAngle = angle;
             if (this.stateTimer <= 0) {
                 this.burst();
                 this.stateTimer = this.CHARGE_DURATION;
             }
          }
          break;

      case MoveState.MOVING_TO_PARTNER:
          // Check if partner is still valid
          if (!this.lockedPartner || !this.lockedPartner.scene || this.lockedPartner.satiety <= 0 || !this.lockedPartner.isSeekingMate) {
              // Partner died or lost interest
              this.lockedPartner = null;
              this.moveState = MoveState.SEEKING_MATE;
              break;
          }

          // Verify partner is still locked to us (handle race conditions where they might have unlocked)
          if (this.lockedPartner.lockedPartner !== this) {
               // They cheated on us or reset
               this.lockedPartner = null;
               this.moveState = MoveState.SEEKING_MATE;
               break;
          }

          // Move directly to partner
          this.moveTarget = new Phaser.Math.Vector2(this.lockedPartner.x, this.lockedPartner.y);
          const targetAngle = Phaser.Math.Angle.Between(this.x, this.y, this.moveTarget.x, this.moveTarget.y);
          this.facingAngle = targetAngle;

          // Burst movement
          if (this.stateTimer <= 0) {
            this.burst();
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
        // Store current state as previous (wait, current is BURSTING, previous was CHARGING etc)
        // We need to have stored 'previousState' BEFORE switching to bursting or charging.
        // Actually, let's just store the intended state when we start charging/bursting.
        this.moveState = MoveState.DECELERATING;
        break;

      case MoveState.DECELERATING:
        // If we are recovering from being stuck, wait for the timer
        if (this.stateTimer > 0) break;

        const dist = this.moveTarget ? Phaser.Math.Distance.Between(this.x, this.y, this.moveTarget.x, this.moveTarget.y) : 0;

        // If we are far from the target, start the next hop before stopping completely
        if (this.moveTarget && dist > 100 && body.speed < 150) {
            if (this.lockedPartner) {
                 this.moveState = MoveState.MOVING_TO_PARTNER;
            } else if (this.isSeekingMate) {
                 this.moveState = MoveState.SEEKING_MATE;
            } else if (this.previousState === MoveState.HAULING_FOOD) {
                 this.moveState = MoveState.HAULING_FOOD;
                 this.stateTimer = this.CHARGE_DURATION;
            } else if (this.previousState === MoveState.CHASING_ENEMY) {
                 this.moveState = MoveState.CHASING_ENEMY;
                 this.stateTimer = this.CHARGE_DURATION;
            } else if (this.previousState === MoveState.GUARDING) {
                 this.moveState = MoveState.GUARDING;
                 this.stateTimer = 2000;
            } else {
                 this.moveState = MoveState.CHARGING;
            }
            this.stateTimer = this.CHARGE_DURATION;
        } else if (body.speed < 10) {
           body.setVelocity(0,0);

           if (this.lockedPartner) {
               this.moveState = MoveState.MOVING_TO_PARTNER;
               this.stateTimer = 0;
           } else if (this.isSeekingMate) {
               this.moveState = MoveState.SEEKING_MATE;
               this.stateTimer = 0;
           } else if (this.previousState === MoveState.HAULING_FOOD) {
               this.moveState = MoveState.HAULING_FOOD;
               // Check if arrived
               const d = this.hoardLocation ? Phaser.Math.Distance.Between(this.x, this.y, this.hoardLocation.x, this.hoardLocation.y) : 999;
               if (d < 30) this.dropFood();
               else this.stateTimer = 0;
           } else if (this.previousState === MoveState.CHASING_ENEMY) {
               this.moveState = MoveState.CHASING_ENEMY;
               this.stateTimer = 0;
           } else if (this.previousState === MoveState.GUARDING) {
                this.moveState = MoveState.GUARDING;
                this.stateTimer = 2000;
           } else {
               this.setIdle();
           }
        }
        break;
    }

    // 1.5 Stuck Detection
    // If we are trying to move but barely moving and touching something, we are likely stuck
    const isMovingState = this.moveState === MoveState.CHARGING || this.moveState === MoveState.MOVING_TO_PARTNER;
    if (isMovingState && !body.touching.none && body.speed < 20) {
        this.stuckTimer += delta;
        if (this.stuckTimer > 500) { // 0.5s stuck threshold
            this.handleStuck();
            this.stuckTimer = 0;
        }
    } else {
        this.stuckTimer = 0;
    }

    // 2. Tail Physics (Elastic Rope System)
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
    this.tailVelocity.x *= Math.pow(this.SPRING_DAMPING, dt);
    this.tailVelocity.y *= Math.pow(this.SPRING_DAMPING, dt);

    // Update position (Velocity * dt)
    this.tailPos.x += this.tailVelocity.x * dt;
    this.tailPos.y += this.tailVelocity.y * dt;

    // 3. Render
    if (render) {
        const localTail = new Phaser.Math.Vector2();
        this.getLocalPoint(this.tailPos.x, this.tailPos.y, localTail);
        this.drawJelly(localTail);
    }
  }

  private getSeparationVector(): Phaser.Math.Vector2 {
    const separationRadius = 60; // How close is "too close"
    const separationForce = new Phaser.Math.Vector2(0, 0);

    const scene = this.scene as unknown as GameScene;
    if (typeof scene.getBeans !== 'function') return separationForce;

    const beans = scene.getBeans();
    let count = 0;

    for (const other of beans) {
      if (other === this) continue;
      // Do not separate from locked partner
      if (other === this.lockedPartner) continue;

      const dist = Phaser.Math.Distance.Between(this.x, this.y, other.x, other.y);

      if (dist < separationRadius && dist > 0) {
        const diff = new Phaser.Math.Vector2(this.x - other.x, this.y - other.y);
        diff.normalize();
        diff.scale(1.0 / dist);

        separationForce.add(diff);
        count++;
      }
    }

    if (count > 0) {
      separationForce.scale(1.0 / count);
      separationForce.normalize();
    }

    return separationForce;
  }

  private findIntruder(): Bean | null {
      if (!this.hoardLocation) return null;

      const scene = this.scene as unknown as GameScene;
      const beans = scene.getBeans();

      // Look for nearest bean that is NOT self
      // Ideally should check for family, but for now just "other"
      let closestDist = this.GUARD_VISION_RADIUS;
      let target: Bean | null = null;

      for (const other of beans) {
          if (other === this) continue;

          // Don't attack partner
          if (other === this.lockedPartner) continue;

          // Don't attack friends (shared hoard)
          const otherHoard = other.getHoardLocation();
          if (otherHoard) {
             const distHoards = Phaser.Math.Distance.Between(this.hoardLocation.x, this.hoardLocation.y, otherHoard.x, otherHoard.y);
             if (distHoards < 10) continue;
          }

          const dist = Phaser.Math.Distance.Between(this.x, this.y, other.x, other.y);
          if (dist < closestDist) {
              closestDist = dist;
              target = other;
          }
      }
      return target;
  }

  private findClosestMate(): Bean | null {
      const scene = this.scene as unknown as GameScene;
      const beans = scene.getBeans();
      let closestDist = Infinity;
      let target: Bean | null = null;

      for (const other of beans) {
          if (other === this) continue;
          if (other.moveState !== MoveState.SEEKING_MATE && other.moveState !== MoveState.MOVING_TO_PARTNER) continue;

          // If other is already locked to someone else, ignore them
          if (other.lockedPartner && other.lockedPartner !== this) continue;

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
      return dist < 20;
  }

  private pickTarget() {
    const scene = this.scene as unknown as GameScene;

    // Check for food if not full
    let foodTarget: Phaser.GameObjects.GameObject | null = null;
    if (!this.isFull) {
        const foods = scene.getFoods();
        // If starving, look further
        let searchRadius = this.satiety < 20 ? 1000 : this.VISION_RADIUS;
        let closestDist = searchRadius;

        // Constraint for guards: if guarding and not starving, only look near hoard
        // let searchOrigin = new Phaser.Math.Vector2(this.x, this.y);

        if (this.isGuarding && this.hoardLocation && this.satiety > 20) {
            // searchOrigin = this.hoardLocation;
            // Patrol radius + bit more
            searchRadius = this.hoardRadius * 1.5;
            closestDist = searchRadius;
        }

        for (const food of foods) {
            if (!food || !food.scene) continue;

            // If limited to hoard area, check that first
            if (this.isGuarding && this.hoardLocation && this.satiety > 20) {
                 const distToHoard = Phaser.Math.Distance.Between(this.hoardLocation.x, this.hoardLocation.y, food.x, food.y);
                 if (distToHoard > searchRadius) continue;
            }

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
        // Only pick random target if we are NOT guarding (guards should patrol/return to hoard in IDLE/GUARDING state, not roam randomly)
        // However, if we are here, it means we are likely in IDLE state trying to decide what to do.
        // If Guarding, pickRandomTarget actually checks "if (this.hoardLocation)..." internally, let's verify.
        // Yes, pickRandomTarget handles returning to hoard if far.
        this.pickRandomTarget();
    }
  }

  public eat(food: Food) {
      const scene = this.scene as unknown as GameScene;

      // Hoarding Logic: If satiety > 90%, store food instead of eating
      if (this.satiety > 90) {
          this.carriedFoodData = {
              satiety: food.satiety,
              attributeBonus: food.attributeBonus
          };

          // Destroy the food object from the world
          scene.removeFood(food);

          // Transition to Hauling
          this.moveState = MoveState.HAULING_FOOD;
          this.isGuarding = false;

          // Establish Hoard Location if not set
          if (!this.hoardLocation) {
              // Hoard at current location or food location?
              // Prompt says: "If hoardLocation is null, set it to current position or food position."
              // Let's set it to where we found the first extra food.
              this.hoardLocation = new Phaser.Math.Vector2(this.x, this.y);
          }

          this.moveTarget = new Phaser.Math.Vector2(this.hoardLocation.x, this.hoardLocation.y);
          const targetAngle = Phaser.Math.Angle.Between(this.x, this.y, this.moveTarget.x, this.moveTarget.y);
          this.facingAngle = targetAngle;

          return;
      }

      if (this.isFull) return;
      this.satiety += food.satiety;

      // Apply Attribute Bonus
      if (food.attributeBonus) {
          const { type, value } = food.attributeBonus;
          if (type === 'strength') this.strength = Phaser.Math.Clamp(this.strength + value, Bean.MIN_ATTR, Bean.MAX_ATTR);
          if (type === 'speed') this.speed = Phaser.Math.Clamp(this.speed + value, Bean.MIN_ATTR, Bean.MAX_ATTR);
          if (type === 'constitution') {
              this.constitution = Phaser.Math.Clamp(this.constitution + value, Bean.MIN_ATTR, Bean.MAX_ATTR);
              // Update derived stats from constitution
              this.maxSatiety = 80 + (this.constitution * 2);
              this.adultRadius = 10 + (this.constitution * 0.5);
              if (this.isAdult) {
                  this.currentRadius = this.adultRadius;
                  this.updatePhysicsBodySize();
              }
          }
      }

      scene.removeFood(food);
  }

  private dropFood() {
      if (!this.hoardLocation || !this.carriedFoodData) return;

      const scene = this.scene as unknown as GameScene;
      // We need a method to spawn specific food in GameScene.
      // Assuming createFood(x, y, satiety, bonus) exists or similar.
      // Since spawnFood creates random food, we will rely on a new method later.
      // For now, let's use a cast to any or assume we will implement 'dropFoodItem'.
      // Wait, I haven't implemented dropFoodItem in Scene yet.
      // I will assume the method name `dropFood` exists on GameScene.
      if (typeof (scene as any).dropFood === 'function') {
          (scene as any).dropFood(
              this.hoardLocation.x,
              this.hoardLocation.y,
              this.carriedFoodData.satiety,
              this.carriedFoodData.attributeBonus
          );
      }

      this.carriedFoodData = null;
      this.setIdle();
  }

  private burst() {
    if (!this.moveTarget) return;
    const body = this.body as Phaser.Physics.Arcade.Body;
    const angle = this.facingAngle;

    // Calculate Speed based on attribute
    // Base 150 + (Speed * 10). Min 160, Max 350.
    const burstSpeed = 150 + (this.speed * 10);

    this.scene.physics.velocityFromRotation(angle, burstSpeed, body.velocity);
    this.playMoveSound();
    // Record previous state before switching to Bursting -> Decelerating
    this.previousState = this.moveState;
    this.moveState = MoveState.BURSTING;
  }

  private handleStuck() {
      // We are stuck. Apply a strong impulse in a random sideways direction to dislodge.
      const body = this.body as Phaser.Physics.Arcade.Body;

      // Pick left or right relative to current facing
      const direction = Math.random() > 0.5 ? 1 : -1;
      const escapeAngle = this.facingAngle + (direction * Math.PI / 2);

      // Apply burst
      const burstSpeed = 150 + (this.speed * 10);
      this.scene.physics.velocityFromRotation(escapeAngle, burstSpeed, body.velocity);
      this.playMoveSound();

      // Transition to DECELERATING with a cooldown to let the physics separation happen
      // before we try to resume our original path.
      this.moveState = MoveState.DECELERATING;
      this.stateTimer = 500; // Wait 0.5s before resuming standard logic
  }

  private updateVisuals() {
      // Map attributes to visuals
      // Strength -> Red (0-255)
      const red = Phaser.Math.Clamp(Phaser.Math.Linear(50, 255, (this.strength - Bean.MIN_ATTR) / (Bean.MAX_ATTR - Bean.MIN_ATTR)), 0, 255);

      // Speed -> Blue (0-255)
      const blue = Phaser.Math.Clamp(Phaser.Math.Linear(50, 255, (this.speed - Bean.MIN_ATTR) / (Bean.MAX_ATTR - Bean.MIN_ATTR)), 0, 255);

      // Green -> Fixed base
      const green = 100;

      this.mainColor = Phaser.Display.Color.GetColor(red, green, blue);
  }

  public getStatsText(): string {
      return `Sat: ${Math.floor(this.satiety)}/${this.maxSatiety}\n` +
             `Str: ${this.strength.toFixed(1)}\n` +
             `Spd: ${this.speed.toFixed(1)}\n` +
             `Con: ${this.constitution.toFixed(1)}`;
  }

  private drawJelly(tailOffset: Phaser.Math.Vector2) {
    this.updateVisuals();
    this.bodyGraphics.clear();
    this.hoardGraphics.clear();

    // Map satiety (0-100) to Alpha (0.4 - 1.0)
    const alpha = Phaser.Math.Clamp(0.4 + (this.satiety / this.maxSatiety) * 0.6, 0.4, 1.0);

    let dist = tailOffset.length();
    if (dist < 0.5) dist = 0;

    const stretchFactor = Math.min(dist, 100) / 100;

    const headRadius = this.currentRadius * (1 + stretchFactor * 0.2);
    const tailRadius = this.currentRadius * (1 - stretchFactor * 0.7);

    const hx = 0;
    const hy = 0;
    const tx = tailOffset.x;
    const ty = tailOffset.y;

    this.bodyGraphics.fillStyle(this.mainColor, alpha);
    this.bodyGraphics.lineStyle(2, 0x1a5f8a, alpha);

    const angle = Phaser.Math.Angle.Between(tx, ty, hx, hy);

    let offsetAngle = Math.PI / 2;
    const rDiff = headRadius - tailRadius;
    if (dist > Math.abs(rDiff)) {
        offsetAngle = Math.acos(rDiff / dist);
    }

    const h2x = hx + Math.cos(angle - offsetAngle) * headRadius;
    const h2y = hy + Math.sin(angle - offsetAngle) * headRadius;

    const t1x = tx + Math.cos(angle + offsetAngle) * tailRadius;
    const t1y = ty + Math.sin(angle + offsetAngle) * tailRadius;

    this.bodyGraphics.beginPath();
    this.bodyGraphics.arc(hx, hy, headRadius, angle - offsetAngle, angle + offsetAngle, false);
    this.bodyGraphics.lineTo(t1x, t1y);
    this.bodyGraphics.arc(tx, ty, tailRadius, angle + offsetAngle, angle - offsetAngle, false);
    this.bodyGraphics.lineTo(h2x, h2y);
    this.bodyGraphics.closePath();

    this.bodyGraphics.fillPath();
    this.bodyGraphics.strokePath();

    // Draw Hoard Radius (Independent from Bean container)
    if (this.hoardLocation) {
        // Draw in world space using the separate graphics object
        this.hoardGraphics.fillStyle(0x00ff00, 0.1);
        this.hoardGraphics.fillCircle(this.hoardLocation.x, this.hoardLocation.y, this.hoardRadius);

        this.hoardGraphics.lineStyle(3, 0x006400, 0.5);
        this.hoardGraphics.strokeCircle(this.hoardLocation.x, this.hoardLocation.y, this.hoardRadius);

        if (this.showHoardLines) {
            this.hoardGraphics.lineStyle(2, 0xffffff, 0.5);
            // Manual dashed line
            const start = new Phaser.Math.Vector2(this.x, this.y);
            const end = this.hoardLocation;
            const dist = start.distance(end);
            const dashLen = 10;
            const gapLen = 5;
            const steps = dist / (dashLen + gapLen);
            const dir = end.clone().subtract(start).normalize();

            this.hoardGraphics.beginPath();
            for (let i = 0; i < steps; i++) {
                const s = start.clone().add(dir.clone().scale(i * (dashLen + gapLen)));
                const e = s.clone().add(dir.clone().scale(dashLen));
                const currentDist = s.distance(start);

                if (currentDist >= dist) break;

                this.hoardGraphics.moveTo(s.x, s.y);

                if (e.distance(start) > dist) {
                     this.hoardGraphics.lineTo(end.x, end.y);
                } else {
                     this.hoardGraphics.lineTo(e.x, e.y);
                }
            }
            this.hoardGraphics.strokePath();
        }
    }

    // Draw Icons (Combat > Guard > Love)
    const iconY = -headRadius - 15;

    if (this.combatTimer > 0) {
        // Draw Anger Mark (Red jagged lines)
        this.bodyGraphics.lineStyle(2, 0xff0000, 1);
        this.bodyGraphics.beginPath();
        // A simple "vein" mark or cross
        const s = 6; // size
        // Left curve
        this.bodyGraphics.moveTo(-s, iconY - s);
        this.bodyGraphics.lineTo(-s/2, iconY);
        this.bodyGraphics.lineTo(-s, iconY + s);
        // Right curve
        this.bodyGraphics.moveTo(s, iconY - s);
        this.bodyGraphics.lineTo(s/2, iconY);
        this.bodyGraphics.lineTo(s, iconY + s);
        // Center curve
        this.bodyGraphics.moveTo(0, iconY - s);
        this.bodyGraphics.lineTo(0, iconY + s);

        this.bodyGraphics.strokePath();

    } else if (this.isGuarding) {
        // Draw Shield (Blue/Silver)
        this.bodyGraphics.fillStyle(0x4a90e2, 1); // Blue
        this.bodyGraphics.lineStyle(1, 0xffffff, 1);

        const s = 8;
        this.bodyGraphics.beginPath();
        // Shield shape: Simple polygon to avoid curve complexity
        this.bodyGraphics.moveTo(-s, iconY - s);
        this.bodyGraphics.lineTo(s, iconY - s);
        this.bodyGraphics.lineTo(s, iconY);
        this.bodyGraphics.lineTo(0, iconY + s*1.5); // Pointy bottom
        this.bodyGraphics.lineTo(-s, iconY);
        this.bodyGraphics.closePath();

        this.bodyGraphics.fillPath();
        this.bodyGraphics.strokePath();

        // Cross on shield
        this.bodyGraphics.beginPath();
        this.bodyGraphics.moveTo(-s/2, iconY - s/2);
        this.bodyGraphics.lineTo(s/2, iconY + s/4); // diagonal? No just a cross
        this.bodyGraphics.strokePath();

    } else if (this.lockedPartner || this.isSeekingMate) {
         // Draw Heart (Pink)
         this.bodyGraphics.fillStyle(0xff69b4, 1); // Hot pink
         this.bodyGraphics.lineStyle(1, 0xffffff, 1);

         const s = 4; // radius of circles
         // Heart shape using two circles and a triangle
         // Left circle
         this.bodyGraphics.fillCircle(-s, iconY - s/2, s);
         this.bodyGraphics.strokeCircle(-s, iconY - s/2, s);

         // Right circle
         this.bodyGraphics.fillCircle(s, iconY - s/2, s);
         this.bodyGraphics.strokeCircle(s, iconY - s/2, s);

         // Bottom Triangle (to make it look like a heart)
         this.bodyGraphics.beginPath();
         this.bodyGraphics.moveTo(-s * 2, iconY - s/2);
         this.bodyGraphics.lineTo(0, iconY + s * 2.5);
         this.bodyGraphics.lineTo(s * 2, iconY - s/2);
         this.bodyGraphics.fillPath();

         // Clean up outline (re-stroke the V shape)
         this.bodyGraphics.beginPath();
         // Determine intersection points for nicer look or just simple V
         this.bodyGraphics.moveTo(-s * 1.8, iconY);
         this.bodyGraphics.lineTo(0, iconY + s * 2.5);
         this.bodyGraphics.lineTo(s * 1.8, iconY);
         this.bodyGraphics.strokePath();
    }

    // Draw carried food lump
    if (this.carriedFoodData) {
        // Draw a small lump on the back (opposite to facing angle?)
        // Actually just draw it on the body somewhere.
        // Let's draw it as a colored circle on top.
        let color = 0xffffff;
        if (this.carriedFoodData.satiety === 1) color = 0x81C784;
        else if (this.carriedFoodData.satiety === 2) color = 0xFFD54F;
        else if (this.carriedFoodData.satiety === 5) color = 0xE57373;

        this.bodyGraphics.fillStyle(color, 1);
        this.bodyGraphics.fillCircle(headRadius * 0.5, -headRadius * 0.5, headRadius * 0.4);
    }

    const indicatorSize = 3;
    const indicatorOffset = headRadius * 0.6;

    const ix = Math.cos(this.facingAngle) * indicatorOffset;
    const iy = Math.sin(this.facingAngle) * indicatorOffset;

    this.bodyGraphics.fillStyle(0x000000, 0.8);
    this.bodyGraphics.fillCircle(ix, iy, indicatorSize);

    this.bodyGraphics.fillStyle(0xffffff, 0.4);
    this.bodyGraphics.fillCircle(-headRadius*0.3, -headRadius*0.3, headRadius*0.25);
  }

  private playMoveSound() {
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
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    osc.start();
    osc.stop(now + 0.15);
  }
}
