import Phaser from 'phaser';
import type GameScene from '../scenes/GameScene';
import Food from './Food';
import { ISpatialObject } from '../managers/SpatialGrid';
import { GameConfig } from '../config/GameConfig';

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

export interface SurvivalStrategy {
  wanderLust: number;       // 0-1: Chance to roam vs idle
  hoardingThreshold: number;// 0-100: Satiety needed to haul (Strategy 2)
  riskAversion: number;     // 0-1: How strongly they cling to the hoard (Strategy 3)
  hungerTolerance: number;  // 0-100: How low satiety gets before ignoring safety (Strategy 4)
  matingThreshold: number;  // 0-100: Satiety needed to mate (Strategy 6)
  searchRange: number;      // Scalar: Multiplier for view distance (Strategy 7)
  fleeThreshold: number;    // 0-100: Satiety threshold to flee (Strategy 8 - "Bravery")
  aggression: number;       // Scalar: Multiplier for chase distance (Strategy 9)
}

export default class Bean extends Phaser.GameObjects.Container implements ISpatialObject {
  private bodyGraphics: Phaser.GameObjects.Graphics;
  private statusPanel: Phaser.GameObjects.Container;
  private statusText: Phaser.GameObjects.Text;
  private showHoardLines: boolean = false;

  // Hoarding & Resources
  public hoardId: string | null = null;
  private carriedFoodData: { satiety: number, attributeBonus?: { type: 'strength' | 'speed' | 'constitution', value: number } } | null = null;

  // Strategy / Personality
  public strategy: SurvivalStrategy;

  public getHoardLocation(): Phaser.Math.Vector2 | null {
      if (!this.hoardId) return null;
      const scene = this.scene as unknown as GameScene;
      const data = scene.hoardManager.getHoard(this.hoardId);
      if (!data) return null;
      return new Phaser.Math.Vector2(data.x, data.y);
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
  public satiety: number = GameConfig.BEAN.START_SATIETY;
  public isAdult: boolean = true;
  private age: number = 0;
  private reproCooldown: number = 0;
  // private readonly MATURITY_AGE = 60000; // Moved to config
  // private readonly VISION_RADIUS = 200; // Moved to config
  // private readonly GUARD_VISION_RADIUS = 300; // Moved to config
  private isFull: boolean = false;

  // Attributes
  public strength: number = 5;
  public speed: number = 5;
  public constitution: number = 5;
  private maxSatiety: number = 100;

  // Attribute Constraints
  public static readonly MIN_ATTR = GameConfig.BEAN.MIN_ATTR;
  public static readonly MAX_ATTR = GameConfig.BEAN.MAX_ATTR;

  // Constants
  // private readonly SPRING_STIFFNESS = 0.1; // Moved to config
  // private readonly SPRING_DAMPING = 0.6; // Moved to config
  // private readonly ROPE_LENGTH = 0; // Moved to config
  // private readonly CHARGE_DURATION = 300; // Moved to config
  // private readonly IDLE_DURATION_MIN = 500; // Moved to config
  // private readonly IDLE_DURATION_MAX = 2000; // Moved to config
  // private readonly MAX_CHASE_DIST = 500; // Moved to config

  // Visuals
  private adultRadius = 15;
  private currentRadius = 15;
  private mainColor: number = 0xffffff;

  private get hoardRadius(): number {
      return this.adultRadius * GameConfig.BEAN.HOARD_RADIUS_MULTIPLIER;
  }

  constructor(
      scene: Phaser.Scene,
      x: number,
      y: number,
      startSatiety: number = GameConfig.BEAN.START_SATIETY,
      startAdult: boolean = true,
      showStats: boolean = false,
      showHoardLines: boolean = false,
      attributes: { strength?: number, speed?: number, constitution?: number } = {},
      hoardId: string | null = null,
      strategy?: SurvivalStrategy
  ) {
    super(scene, x, y);

    this.hoardId = hoardId;
    this.showHoardLines = showHoardLines;

    this.satiety = startSatiety;
    this.isAdult = startAdult;

    // Initialize Attributes
    this.strength = Phaser.Math.Clamp(attributes.strength ?? 5, Bean.MIN_ATTR, Bean.MAX_ATTR);
    this.speed = Phaser.Math.Clamp(attributes.speed ?? 5, Bean.MIN_ATTR, Bean.MAX_ATTR);
    this.constitution = Phaser.Math.Clamp(attributes.constitution ?? 5, Bean.MIN_ATTR, Bean.MAX_ATTR);

    // Initialize Strategy
    if (strategy) {
        this.strategy = strategy;
    } else {
        // Randomize initial strategy
        this.strategy = {
            wanderLust: Phaser.Math.FloatBetween(0.05, 0.95),
            hoardingThreshold: Phaser.Math.FloatBetween(50, 95),
            riskAversion: Phaser.Math.FloatBetween(0.0, 1.0),
            hungerTolerance: Phaser.Math.FloatBetween(10, 70),
            matingThreshold: Phaser.Math.FloatBetween(30, 95),
            searchRange: Phaser.Math.FloatBetween(0.5, 2.0),
            fleeThreshold: Phaser.Math.FloatBetween(10, 60),
            aggression: Phaser.Math.FloatBetween(0.5, 2.0)
        };
    }

    // Calculate derived stats
    this.maxSatiety = GameConfig.BEAN.MAX_SATIETY_BASE + (this.constitution * GameConfig.BEAN.MAX_SATIETY_CON_MULT);
    this.adultRadius = 10 + (this.constitution * 0.5); // Range 10.5 - 20
    this.currentRadius = this.isAdult ? this.adultRadius : this.adultRadius * 0.6;

    this.updateVisuals();

    this.bodyGraphics = scene.add.graphics();
    this.add(this.bodyGraphics);

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
    this.stateTimer = Phaser.Math.Between(GameConfig.BEAN.IDLE_DURATION_MIN, GameConfig.BEAN.IDLE_DURATION_MAX);
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
    const hoardLocation = this.getHoardLocation();
    const scene = this.scene as unknown as GameScene;
    const padding = 50;

    if (hoardLocation) {
        // Strategy 3 & 4: Safety & Territory
        // Calculate allowed radius based on Risk Aversion
        // If RiskAversion is 1.0, stay very close (HoardRadius).
        // If RiskAversion is 0.0, roam freely (or wide radius).

        let maxRadius = this.hoardRadius * (1 + (1 - this.strategy.riskAversion) * 4); // 1x to 5x hoard radius

        // If very hungry, ignore safety (Strategy 4)
        if (this.satiety < this.strategy.hungerTolerance) {
            maxRadius = 10000; // Effectively global
        }

        const dist = Phaser.Math.Distance.Between(this.x, this.y, hoardLocation.x, hoardLocation.y);

        // If currently outside acceptable radius, return to hoard
        if (dist > maxRadius) {
             this.moveTarget = new Phaser.Math.Vector2(hoardLocation.x, hoardLocation.y);
             return;
        }

        // Pick a point within maxRadius
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * maxRadius;
        const tx = hoardLocation.x + Math.cos(angle) * r;
        const ty = hoardLocation.y + Math.sin(angle) * r;

        // Clamp to screen
        const clampedX = Phaser.Math.Clamp(tx, padding, scene.scale.width - padding);
        const clampedY = Phaser.Math.Clamp(ty, padding, scene.scale.height - padding);
        this.moveTarget = new Phaser.Math.Vector2(clampedX, clampedY);
        return;
    }

    // No hoard: Roam freely
    // Strategy 1: Idle vs Random Walk
    // This function is called when we decide to move.
    // The probability check happens in update() or state transition.
    // Here we just pick the target.

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

  think(_time: number, delta: number) {
      if (!this.active) return;
      const body = this.body as Phaser.Physics.Arcade.Body;
      if (!body) return;

      if (this.combatTimer > 0) {
        this.combatTimer -= delta;
      }

      // 0. Growth & Lifecycle
      if (!this.isAdult) {
          this.age += delta;
          if (this.age >= GameConfig.BEAN.MATURITY_AGE) {
              this.growUp();
          }
      }

      // Update Spatial Grid
      const scene = this.scene as unknown as GameScene;
      if (scene.beanGrid) {
          scene.beanGrid.update(this);
      }

      if (this.reproCooldown > 0) {
          this.reproCooldown -= delta;
      }

      // 0.5. Satiety Decay
      const decayRate = body.speed > 5 ? 0.5 : 0.1;
      this.satiety -= decayRate * (delta / 1000);

      // Update stats text
      this.statusText.setText(this.getStatsText());

      if (this.satiety <= 0) {
          // Die
          scene.removeBean(this);
          return;
      } else if (this.satiety >= this.maxSatiety) {
          this.satiety = this.maxSatiety;
          this.isFull = true;
      } else if (this.satiety < this.maxSatiety * 0.9) {
          this.isFull = false;
      }

      // Reproduction Trigger Check (Strategy 6: Mating Threshold)
      if (this.isAdult && this.satiety > this.strategy.matingThreshold && this.reproCooldown <= 0 &&
         (this.moveState === MoveState.IDLE || this.moveState === MoveState.GUARDING)) {
           // Probability check based on satiety surplus above threshold
           const surplus = Math.max(0, this.satiety - this.strategy.matingThreshold);
           const baseChance = Math.pow(surplus, 2);
           const k = 0.000125;
           const probabilityPerSecond = baseChance * k;

           // Convert to per-frame probability based on delta (ms)
           const frameProbability = probabilityPerSecond * (delta / 1000);

           if (Math.random() < frameProbability) {
               this.moveState = MoveState.SEEKING_MATE;
               this.isSeekingMate = true;
               // Stop guarding behavior so they can leave territory to find a mate
               this.isGuarding = false;
           }
      }

      // Stop seeking if satiety drops too low (Strategy 6)
      if (this.isSeekingMate && this.satiety < this.strategy.matingThreshold) {
          // If we had a partner, they need to know we broke up
          if (this.lockedPartner) {
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
          const hoardLocation = this.getHoardLocation();
          if (hoardLocation) {
              const distToHoard = Phaser.Math.Distance.Between(this.x, this.y, hoardLocation.x, hoardLocation.y);
              if (distToHoard < this.hoardRadius) {
                  this.moveState = MoveState.GUARDING;
                  this.isGuarding = true;
                  this.stateTimer = Phaser.Math.Between(2000, 4000); // Guard duty duration before checking again or moving slightly
                  break;
              }
          }

          if (this.stateTimer <= 0) {
            // Strategy 1: Idle vs Random Walk
            if (Math.random() < this.strategy.wanderLust) {
                this.pickTarget();
                this.moveState = MoveState.CHARGING;
                this.stateTimer = GameConfig.BEAN.CHARGE_DURATION;
            } else {
                // Stay idle again
                this.stateTimer = Phaser.Math.Between(GameConfig.BEAN.IDLE_DURATION_MIN, GameConfig.BEAN.IDLE_DURATION_MAX);
            }
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
                const hLoc = this.getHoardLocation();
                if (hLoc) {
                    const angle = Math.random() * Math.PI * 2;
                    const dist = Math.random() * this.hoardRadius;
                    this.moveTarget = new Phaser.Math.Vector2(
                        hLoc.x + Math.cos(angle) * dist,
                        hLoc.y + Math.sin(angle) * dist
                    );
                    this.moveState = MoveState.CHARGING;
                    this.stateTimer = GameConfig.BEAN.CHARGE_DURATION;
                } else {
                    this.setIdle();
                }
            }
            break;

        case MoveState.CHASING_ENEMY:
             // Chase logic
             const enemy = this.findIntruder();

             // Check distance to hoard if we have one
             const hLocChase = this.getHoardLocation();
             if (hLocChase) {
                 const distToHoard = Phaser.Math.Distance.Between(this.x, this.y, hLocChase.x, hLocChase.y);
                 // Strategy 9: Chase Distance = Base * Aggression
                 const maxChase = GameConfig.BEAN.MAX_CHASE_DIST * this.strategy.aggression;
                 if (distToHoard > maxChase) {
                     // Abandon chase
                     this.moveTarget = null;
                     this.setIdle();
                     break;
                 }
             }

             if (enemy) {
                 this.moveTarget = new Phaser.Math.Vector2(enemy.x, enemy.y);
                 const angle = Phaser.Math.Angle.Between(this.x, this.y, this.moveTarget.x, this.moveTarget.y);
                 this.facingAngle = angle;

                 if (this.stateTimer <= 0) {
                     this.burst();
                     this.stateTimer = GameConfig.BEAN.CHARGE_DURATION;
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
                      // Actual velocity application happens in update() for physics smoothness
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
               const vision = GameConfig.BEAN.VISION_RADIUS * this.strategy.searchRange;
               const dist = Phaser.Math.Distance.Between(this.x, this.y, mate.x, mate.y);
               if (dist < vision) {
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
                      this.stateTimer = GameConfig.BEAN.CHARGE_DURATION;
                   }
               }
          } else {
               // No mate found.
               if (this.isGuarding) {
                   const hLocMating = this.getHoardLocation();
                   if (hLocMating) {
                        if (!this.moveTarget || this.hasReachedTarget()) {
                            const angle = Math.random() * Math.PI * 2;
                            const dist = Math.random() * (this.hoardRadius * 0.5); // Tight patrol
                            this.moveTarget = new Phaser.Math.Vector2(
                                hLocMating.x + Math.cos(angle) * dist,
                                hLocMating.y + Math.sin(angle) * dist
                            );
                        }

                        const targetAngle = Phaser.Math.Angle.Between(this.x, this.y, this.moveTarget.x, this.moveTarget.y);
                        this.facingAngle = targetAngle;

                        if (this.stateTimer <= 0) {
                            this.burst();
                            this.stateTimer = GameConfig.BEAN.CHARGE_DURATION * 2; // Move slower/less often
                        }
                   } else {
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
                      this.stateTimer = GameConfig.BEAN.CHARGE_DURATION;
                   }
               }
          }
          break;

        case MoveState.HAULING_FOOD:
            const hLocHaul = this.getHoardLocation();
            if (!hLocHaul) {
                this.setIdle();
                break;
            }
            // Move to hoard
            this.moveTarget = new Phaser.Math.Vector2(hLocHaul.x, hLocHaul.y);
            const distToHoard = Phaser.Math.Distance.Between(this.x, this.y, hLocHaul.x, hLocHaul.y);

            if (distToHoard < 30) {
                this.dropFood();
            } else {
               const angle = Phaser.Math.Angle.Between(this.x, this.y, this.moveTarget.x, this.moveTarget.y);
               this.facingAngle = angle;
               if (this.stateTimer <= 0) {
                   this.burst();
                   this.stateTimer = GameConfig.BEAN.CHARGE_DURATION;
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

            // Verify partner is still locked to us
            if (this.lockedPartner.lockedPartner !== this) {
                 this.lockedPartner = null;
                 this.moveState = MoveState.SEEKING_MATE;
                 break;
            }

            // Move directly to partner
            this.moveTarget = new Phaser.Math.Vector2(this.lockedPartner.x, this.lockedPartner.y);
            const targetAngle = Phaser.Math.Angle.Between(this.x, this.y, this.moveTarget.x, this.moveTarget.y);
            this.facingAngle = targetAngle;

            if (this.stateTimer <= 0) {
              this.burst();
              this.stateTimer = GameConfig.BEAN.CHARGE_DURATION;
            }
            break;

        case MoveState.CHARGING:
          if (this.moveTarget) {
            const targetAngle = Phaser.Math.Angle.Between(this.x, this.y, this.moveTarget.x, this.moveTarget.y);

            // Calculate separation vector
            const separationVector = this.getSeparationVector();

            if (separationVector.length() > 0) {
              const targetVec = new Phaser.Math.Vector2(Math.cos(targetAngle), Math.sin(targetAngle));
              const separationWeight = 2.5;

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

        case MoveState.DECELERATING:
          // If we are recovering from being stuck, wait for the timer
          if (this.stateTimer > 0) break;

          // Check Speed to transition out of Decelerating
          // Note: body.speed is a physics property, we check it here (simulating sensing)
          const dist = this.moveTarget ? Phaser.Math.Distance.Between(this.x, this.y, this.moveTarget.x, this.moveTarget.y) : 0;

          if (this.moveTarget && dist > 100 && body.speed < 150) {
              // Transition logic
              if (this.lockedPartner) {
                   this.moveState = MoveState.MOVING_TO_PARTNER;
              } else if (this.isSeekingMate) {
                   this.moveState = MoveState.SEEKING_MATE;
              } else if (this.previousState === MoveState.HAULING_FOOD) {
                   this.moveState = MoveState.HAULING_FOOD;
                   this.stateTimer = GameConfig.BEAN.CHARGE_DURATION;
              } else if (this.previousState === MoveState.CHASING_ENEMY) {
                   this.moveState = MoveState.CHASING_ENEMY;
                   this.stateTimer = GameConfig.BEAN.CHARGE_DURATION;
              } else if (this.previousState === MoveState.GUARDING) {
                   this.moveState = MoveState.GUARDING;
                   this.stateTimer = 2000;
              } else {
                   this.moveState = MoveState.CHARGING;
              }
              this.stateTimer = GameConfig.BEAN.CHARGE_DURATION;
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
                 const hLocDecel = this.getHoardLocation();
                 const d = hLocDecel ? Phaser.Math.Distance.Between(this.x, this.y, hLocDecel.x, hLocDecel.y) : 999;
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

      // Stuck Detection (Sensing)
      const isMovingState = this.moveState === MoveState.CHARGING || this.moveState === MoveState.MOVING_TO_PARTNER;
      if (isMovingState && !body.touching.none && body.speed < 20) {
          this.stuckTimer += delta;
          if (this.stuckTimer > 500) {
              this.handleStuck();
              this.stuckTimer = 0;
          }
      } else {
          this.stuckTimer = 0;
      }
  }

  update(_time: number, delta: number, render: boolean = true) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!body) return; // Safety check in case update is called before physics setup

    // PHYSICS UPDATE LOOP
    // This runs in sub-steps

    // Handle Physics-based state effects (Continuous Forces)
    if (this.moveState === MoveState.FLEEING) {
        if (this.moveTarget) {
            const fleeSpeed = 200 + (this.speed * 10);
            this.scene.physics.velocityFromRotation(this.facingAngle, fleeSpeed, body.velocity);
        }
    } else if (this.moveState === MoveState.BURSTING) {
         // Immediate transition to Decelerating after one physics frame
         this.moveState = MoveState.DECELERATING;
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
    if (currentDist > GameConfig.BEAN.ROPE_LENGTH) {
        const force = (currentDist - GameConfig.BEAN.ROPE_LENGTH) * GameConfig.BEAN.SPRING_STIFFNESS;
        ax = (dx / currentDist) * force;
        ay = (dy / currentDist) * force;
    } else {
         const force = currentDist * GameConfig.BEAN.SPRING_STIFFNESS;
         if (currentDist > 0) {
             ax = (dx / currentDist) * force;
             ay = (dy / currentDist) * force;
         }
    }

    // Update velocity (Acceleration * dt)
    this.tailVelocity.x += ax * dt;
    this.tailVelocity.y += ay * dt;

    // Damping
    this.tailVelocity.x *= Math.pow(GameConfig.BEAN.SPRING_DAMPING, dt);
    this.tailVelocity.y *= Math.pow(GameConfig.BEAN.SPRING_DAMPING, dt);

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
    // Use Grid: check nearby beans within separationRadius
    // Grid query uses box, so it's a bit approximate but fine
    const beans = scene.getBeansInRadius(this.x, this.y, separationRadius);
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
      const hoardLocation = this.getHoardLocation();
      if (!hoardLocation) return null;

      const scene = this.scene as unknown as GameScene;
      // Strategy 7: Search Range (Visual)
      const vision = GameConfig.BEAN.GUARD_VISION_RADIUS * this.strategy.searchRange;

      // Use Grid: Get potential intruders within vision range
      const beans = scene.getBeansInRadius(this.x, this.y, vision);

      let closestDist = vision;
      let target: Bean | null = null;

      for (const other of beans) {
          if (other === this) continue;

          // Don't attack partner
          if (other === this.lockedPartner) continue;

          // Don't attack friends (shared hoard)
          if (this.hoardId && other.hoardId === this.hoardId) {
             continue;
          }

          // Check if intruder is within hoard territory (Strict defense)
          const distToHoard = Phaser.Math.Distance.Between(hoardLocation.x, hoardLocation.y, other.x, other.y);
          if (distToHoard > this.hoardRadius) continue;

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
      // Optimize: Search only within reasonable range (e.g., screen width or larger vision)
      // If none found nearby, maybe random roaming handles the rest.
      // Let's search in a fairly large radius to mimic "hearing" or "smelling" mates?
      // Or just stick to visual range * searchRange for now to keep it consistent.
      const range = GameConfig.BEAN.VISION_RADIUS * this.strategy.searchRange * 2; // Look a bit further for mates

      const beans = scene.getBeansInRadius(this.x, this.y, range);
      let closestDist = range;
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
    const hoardLocation = this.getHoardLocation();
    if (!this.isFull) {
        const foods = scene.getFoods();
        // Strategy 7: Search Range
        // If starving (satiety < 20), multiply range by 5
        let baseRange = GameConfig.BEAN.VISION_RADIUS * this.strategy.searchRange;
        let searchRadius = this.satiety < 20 ? baseRange * 5 : baseRange;
        let closestDist = searchRadius;

        // Constraint for guards
        // Strategy 3 & 4: Risk Aversion / Hunger Tolerance
        // If guarding and NOT desperate (satiety > hungerTolerance), stick close to hoard
        if (this.isGuarding && hoardLocation && this.satiety > this.strategy.hungerTolerance) {
            // Patrol radius modified by RiskAversion?
            // The user said "safety index".
            // Let's stick to simple: if guarding and not desperate, use restricted search
            // Default 1.5x hoard radius
            searchRadius = this.hoardRadius * 1.5;
            closestDist = searchRadius;
        }

        for (const food of foods) {
            if (!food || !food.scene) continue;

            // If limited to hoard area
            if (this.isGuarding && hoardLocation && this.satiety > this.strategy.hungerTolerance) {
                 const distToHoard = Phaser.Math.Distance.Between(hoardLocation.x, hoardLocation.y, food.x, food.y);
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
        this.pickRandomTarget();
    }
  }

  public eat(food: Food) {
      const scene = this.scene as unknown as GameScene;

      // Strategy 2: Hoarding Threshold
      if (this.satiety > this.strategy.hoardingThreshold) {
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
          if (!this.hoardId) {
              // Register new hoard
              this.hoardId = scene.hoardManager.registerHoard(this.x, this.y, this.hoardRadius);
          }

          const hoardLocation = this.getHoardLocation();
          if (hoardLocation) {
              this.moveTarget = new Phaser.Math.Vector2(hoardLocation.x, hoardLocation.y);
              const targetAngle = Phaser.Math.Angle.Between(this.x, this.y, this.moveTarget.x, this.moveTarget.y);
              this.facingAngle = targetAngle;
          }

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
              this.maxSatiety = GameConfig.BEAN.MAX_SATIETY_BASE + (this.constitution * GameConfig.BEAN.MAX_SATIETY_CON_MULT);
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
      const hoardLocation = this.getHoardLocation();
      if (!hoardLocation || !this.carriedFoodData) return;

      const scene = this.scene as unknown as GameScene;
      if (typeof (scene as any).dropFood === 'function') {
          (scene as any).dropFood(
              hoardLocation.x,
              hoardLocation.y,
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
    const burstSpeed = 150 + (this.speed * 10);

    this.scene.physics.velocityFromRotation(angle, burstSpeed, body.velocity);
    this.playMoveSound();
    this.previousState = this.moveState;
    this.moveState = MoveState.BURSTING;
  }

  private handleStuck() {
      const body = this.body as Phaser.Physics.Arcade.Body;
      const direction = Math.random() > 0.5 ? 1 : -1;
      const escapeAngle = this.facingAngle + (direction * Math.PI / 2);
      const burstSpeed = 150 + (this.speed * 10);
      this.scene.physics.velocityFromRotation(escapeAngle, burstSpeed, body.velocity);
      this.playMoveSound();

      this.moveState = MoveState.DECELERATING;
      this.stateTimer = 500;
  }

  private updateVisuals() {
      // Map attributes to visuals
      // Strength -> Red (0-255)
      const red = Phaser.Math.Clamp(Phaser.Math.Linear(50, 255, (this.strength - Bean.MIN_ATTR) / (Bean.MAX_ATTR - Bean.MIN_ATTR)), 0, 255);
      // Speed -> Blue (0-255)
      const blue = Phaser.Math.Clamp(Phaser.Math.Linear(50, 255, (this.speed - Bean.MIN_ATTR) / (Bean.MAX_ATTR - Bean.MIN_ATTR)), 0, 255);
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

    const alpha = Phaser.Math.Clamp(0.4 + (this.satiety / this.maxSatiety) * 0.6, 0.4, 1.0);

    // LOD: Check zoom level
    const zoom = this.scene.cameras.main.zoom;
    const isZoomedOut = zoom < 0.5;

    this.bodyGraphics.fillStyle(this.mainColor, alpha);
    this.bodyGraphics.lineStyle(2, 0x1a5f8a, alpha);

    // Detailed Jelly Shape (computed even if not drawn fully if needed for other visuals, but we can optimize)
    let headRadius = this.currentRadius; // Default for low LOD

    if (isZoomedOut) {
        // Simple Circle for LOD
        this.bodyGraphics.fillCircle(0, 0, this.currentRadius);
        this.bodyGraphics.strokeCircle(0, 0, this.currentRadius);
    } else {
        let dist = tailOffset.length();
        if (dist < 0.5) dist = 0;

        const stretchFactor = Math.min(dist, 100) / 100;

        headRadius = this.currentRadius * (1 + stretchFactor * 0.2);
        const tailRadius = this.currentRadius * (1 - stretchFactor * 0.7);

        const hx = 0;
        const hy = 0;
        const tx = tailOffset.x;
        const ty = tailOffset.y;

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
    }

    if (this.hoardId && this.showHoardLines && !isZoomedOut) { // Hide lines in low LOD too?
        const hoardLocation = this.getHoardLocation();
        if (hoardLocation) {
            this.bodyGraphics.lineStyle(2, 0xffffff, 0.5);
            // Draw from Hoard (static) to Bean (dynamic) to prevent dash jitter
            // Local coordinates relative to Bean:
            // Hoard is at (hoardLocation.x - this.x, hoardLocation.y - this.y)
            // Bean is at (0, 0)

            const start = new Phaser.Math.Vector2(hoardLocation.x - this.x, hoardLocation.y - this.y);
            const end = new Phaser.Math.Vector2(0, 0);

            const dist = start.distance(end);
            const dashLen = 10;
            const gapLen = 5;
            const steps = dist / (dashLen + gapLen);
            const dir = end.clone().subtract(start).normalize();

            this.bodyGraphics.beginPath();
            for (let i = 0; i < steps; i++) {
                const s = start.clone().add(dir.clone().scale(i * (dashLen + gapLen)));
                const e = s.clone().add(dir.clone().scale(dashLen));

                // Check if we passed the destination (Bean center)
                // Since we start far away and move towards 0,0 (local), check distance to start
                const distFromStart = s.distance(start);
                if (distFromStart >= dist) break;

                this.bodyGraphics.moveTo(s.x, s.y);

                if (e.distance(start) > dist) {
                     this.bodyGraphics.lineTo(end.x, end.y);
                } else {
                     this.bodyGraphics.lineTo(e.x, e.y);
                }
            }
            this.bodyGraphics.strokePath();
        }
    }

    // Draw Icons (Combat > Guard > Love)
    const iconY = -headRadius - 15;

    if (this.combatTimer > 0) {
        // Draw Anger Mark (Red jagged lines)
        this.bodyGraphics.lineStyle(2, 0xff0000, 1);
        this.bodyGraphics.beginPath();
        const s = 6;
        this.bodyGraphics.moveTo(-s, iconY - s);
        this.bodyGraphics.lineTo(-s/2, iconY);
        this.bodyGraphics.lineTo(-s, iconY + s);
        this.bodyGraphics.moveTo(s, iconY - s);
        this.bodyGraphics.lineTo(s/2, iconY);
        this.bodyGraphics.lineTo(s, iconY + s);
        this.bodyGraphics.moveTo(0, iconY - s);
        this.bodyGraphics.lineTo(0, iconY + s);
        this.bodyGraphics.strokePath();

    } else if (this.isGuarding) {
        // Draw Shield
        this.bodyGraphics.fillStyle(0x4a90e2, 1);
        this.bodyGraphics.lineStyle(1, 0xffffff, 1);
        const s = 8;
        this.bodyGraphics.beginPath();
        this.bodyGraphics.moveTo(-s, iconY - s);
        this.bodyGraphics.lineTo(s, iconY - s);
        this.bodyGraphics.lineTo(s, iconY);
        this.bodyGraphics.lineTo(0, iconY + s*1.5);
        this.bodyGraphics.lineTo(-s, iconY);
        this.bodyGraphics.closePath();
        this.bodyGraphics.fillPath();
        this.bodyGraphics.strokePath();
        this.bodyGraphics.beginPath();
        this.bodyGraphics.moveTo(-s/2, iconY - s/2);
        this.bodyGraphics.lineTo(s/2, iconY + s/4);
        this.bodyGraphics.strokePath();

    } else if (this.lockedPartner || this.isSeekingMate) {
         // Draw Heart
         this.bodyGraphics.fillStyle(0xff69b4, 1);
         this.bodyGraphics.lineStyle(1, 0xffffff, 1);
         const s = 4;
         this.bodyGraphics.fillCircle(-s, iconY - s/2, s);
         this.bodyGraphics.strokeCircle(-s, iconY - s/2, s);
         this.bodyGraphics.fillCircle(s, iconY - s/2, s);
         this.bodyGraphics.strokeCircle(s, iconY - s/2, s);
         this.bodyGraphics.beginPath();
         this.bodyGraphics.moveTo(-s * 2, iconY - s/2);
         this.bodyGraphics.lineTo(0, iconY + s * 2.5);
         this.bodyGraphics.lineTo(s * 2, iconY - s/2);
         this.bodyGraphics.fillPath();
         this.bodyGraphics.beginPath();
         this.bodyGraphics.moveTo(-s * 1.8, iconY);
         this.bodyGraphics.lineTo(0, iconY + s * 2.5);
         this.bodyGraphics.lineTo(s * 1.8, iconY);
         this.bodyGraphics.strokePath();
    }

    // Draw carried food lump
    if (this.carriedFoodData) {
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
