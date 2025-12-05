import Phaser from 'phaser';
import { IBean, MoveState, BeanRole } from './BeanTypes';
import { GameConfig } from '../../config/GameConfig';
import type GameScene from '../../scenes/GameScene';
import Food from '../Food';

export class BeanBrain {
    private bean: IBean;
    private scene: GameScene;

    constructor(bean: IBean, scene: Phaser.Scene) {
        this.bean = bean;
        this.scene = scene as unknown as GameScene;
    }

    public think(_time: number, delta: number) {
        if (!this.bean.active) return;
        const body = this.bean.body as Phaser.Physics.Arcade.Body;
        if (!body) return;

        if (this.bean.combatTimer > 0) {
          this.bean.combatTimer -= delta;
        }

        // 0. Growth & Lifecycle
        if (!this.bean.isAdult) {
            this.bean.age += delta;
            if (this.bean.age >= GameConfig.BEAN.MATURITY_AGE) {
                this.bean.growUp();
            }
        }

        // Update Spatial Grid
        if (this.scene.beanGrid) {
            this.scene.beanGrid.update(this.bean as unknown as any); // Cast to any or ISpatialObject if interface matches
        }

        if (this.bean.reproCooldown > 0) {
            this.bean.reproCooldown -= delta;
        }

        // 0.5. Satiety Decay
        const decayRate = body.speed > 5 ? 0.5 : 0.1;
        this.bean.satiety -= decayRate * (delta / 1000);

        if (this.bean.satiety <= 0) {
            // Die
            this.scene.removeBean(this.bean as unknown as any);
            return;
        } else if (this.bean.satiety >= this.bean.maxSatiety) {
            this.bean.satiety = this.bean.maxSatiety;
            this.bean.isFull = true;
        } else if (this.bean.satiety < this.bean.maxSatiety * 0.9) {
            this.bean.isFull = false;
        }

        // Reproduction Trigger Check (Strategy 6: Mating Threshold)
        if (this.bean.isAdult && this.bean.satiety > this.bean.strategy.matingThreshold && this.bean.reproCooldown <= 0 &&
           (this.bean.moveState === MoveState.IDLE || this.bean.moveState === MoveState.GUARDING)) {
             const surplus = Math.max(0, this.bean.satiety - this.bean.strategy.matingThreshold);
             const baseChance = Math.pow(surplus, 2);
             const k = 0.000125;
             const probabilityPerSecond = baseChance * k;
             const frameProbability = probabilityPerSecond * (delta / 1000);

             if (Math.random() < frameProbability) {
                 this.bean.moveState = MoveState.SEEKING_MATE;
                 this.bean.isSeekingMate = true;
                 this.bean.isGuarding = false;
             }
        }

        // Stop seeking if satiety drops too low
        if (this.bean.isSeekingMate && this.bean.satiety < this.bean.strategy.matingThreshold) {
            if (this.bean.lockedPartner) {
                 this.bean.lockedPartner = null;
            }
            this.bean.isSeekingMate = false;
            this.setIdle();
        }

        // 1. State Machine
        if (this.bean.stateTimer > 0) {
          this.bean.stateTimer -= delta;
        }

        switch (this.bean.moveState) {
          case MoveState.IDLE:
            const hoardLocation = this.bean.getHoardLocation();

            // Guards prioritize guarding if near hoard
            if (this.bean.role === BeanRole.GUARD && hoardLocation) {
                 const distToHoard = Phaser.Math.Distance.Between(this.bean.x, this.bean.y, hoardLocation.x, hoardLocation.y);
                 if (distToHoard < this.bean.currentRadius * GameConfig.BEAN.HOARD_RADIUS_MULTIPLIER * 1.5) {
                     this.bean.moveState = MoveState.GUARDING;
                     this.bean.isGuarding = true;
                     this.bean.stateTimer = Phaser.Math.Between(3000, 6000); // Guard longer
                     break;
                 }
            } else if (hoardLocation) {
                // Non-guards also guard briefly if very close
                const distToHoard = Phaser.Math.Distance.Between(this.bean.x, this.bean.y, hoardLocation.x, hoardLocation.y);
                if (distToHoard < this.bean.currentRadius * GameConfig.BEAN.HOARD_RADIUS_MULTIPLIER) {
                    this.bean.moveState = MoveState.GUARDING;
                    this.bean.isGuarding = true;
                    this.bean.stateTimer = Phaser.Math.Between(2000, 4000);
                    break;
                }
            }

            if (this.bean.stateTimer <= 0) {
              let wanderChance = this.bean.strategy.wanderLust;
              // Workers are more active
              if (this.bean.role === BeanRole.WORKER) wanderChance += 0.2;

              if (Math.random() < wanderChance) {
                  this.pickTarget();
                  this.bean.moveState = MoveState.CHARGING;
                  this.bean.stateTimer = GameConfig.BEAN.CHARGE_DURATION;
              } else {
                  this.bean.stateTimer = Phaser.Math.Between(GameConfig.BEAN.IDLE_DURATION_MIN, GameConfig.BEAN.IDLE_DURATION_MAX);
              }
            }
            break;

          case MoveState.GUARDING:
              // Only Guards and some brave others scan aggressively
              let scanRange = 1.0;
              if (this.bean.role === BeanRole.GUARD) scanRange = 1.5;
              if (this.bean.role === BeanRole.WORKER) scanRange = 0.5; // Workers barely look

              const intruder = this.findIntruder(scanRange);

              if (intruder && (this.bean.role === BeanRole.GUARD || this.bean.role === BeanRole.EXPLORER || Math.random() < 0.3)) {
                  this.bean.moveState = MoveState.CHASING_ENEMY;
                  this.bean.moveTarget = new Phaser.Math.Vector2(intruder.x, intruder.y);
                  break;
              }

              if (this.bean.stateTimer <= 0) {
                  // If worker is guarding, they get bored faster
                  if (this.bean.role === BeanRole.WORKER && Math.random() < 0.7) {
                      this.setIdle();
                      break;
                  }

                  const hLoc = this.bean.getHoardLocation();
                  if (hLoc) {
                      const angle = Math.random() * Math.PI * 2;
                      const dist = Math.random() * (this.bean.currentRadius * GameConfig.BEAN.HOARD_RADIUS_MULTIPLIER);
                      this.bean.moveTarget = new Phaser.Math.Vector2(
                          hLoc.x + Math.cos(angle) * dist,
                          hLoc.y + Math.sin(angle) * dist
                      );
                      this.bean.moveState = MoveState.CHARGING;
                      this.bean.stateTimer = GameConfig.BEAN.CHARGE_DURATION;
                  } else {
                      this.setIdle();
                  }
              }
              break;

          case MoveState.CHASING_ENEMY:
               const enemy = this.findIntruder();
               const hLocChase = this.bean.getHoardLocation();
               if (hLocChase) {
                   const distToHoard = Phaser.Math.Distance.Between(this.bean.x, this.bean.y, hLocChase.x, hLocChase.y);
                   const maxChase = GameConfig.BEAN.MAX_CHASE_DIST * this.bean.strategy.aggression;
                   if (distToHoard > maxChase) {
                       this.bean.moveTarget = null;
                       this.setIdle();
                       break;
                   }
               }

               if (enemy) {
                   this.bean.moveTarget = new Phaser.Math.Vector2(enemy.x, enemy.y);
                   const angle = Phaser.Math.Angle.Between(this.bean.x, this.bean.y, this.bean.moveTarget.x, this.bean.moveTarget.y);
                   this.bean.facingAngle = angle;

                   if (this.bean.stateTimer <= 0) {
                       this.bean.burst();
                       this.bean.stateTimer = GameConfig.BEAN.CHARGE_DURATION;
                   }
               } else {
                   this.setIdle();
               }
               break;

          case MoveState.FLEEING:
               if (this.bean.stateTimer <= 0) {
                   this.setIdle();
               } else {
                   if (this.bean.moveTarget) {
                        const angle = Phaser.Math.Angle.Between(this.bean.x, this.bean.y, this.bean.moveTarget.x, this.bean.moveTarget.y);
                        this.bean.facingAngle = angle;
                   }
               }
               break;

          case MoveState.SEEKING_MATE:
            const matingIntruder = this.findIntruder();
            if (matingIntruder) {
                 this.bean.moveState = MoveState.CHASING_ENEMY;
                 this.bean.moveTarget = new Phaser.Math.Vector2(matingIntruder.x, matingIntruder.y);
                 break;
            }

            const mate = this.findClosestMate();

            if (mate) {
                 const vision = GameConfig.BEAN.VISION_RADIUS * this.bean.strategy.searchRange;
                 const dist = Phaser.Math.Distance.Between(this.bean.x, this.bean.y, mate.x, mate.y);
                 if (dist < vision) {
                     this.bean.lockPartner(mate);
                     mate.lockPartner(this.bean);
                 } else {
                     this.bean.moveTarget = new Phaser.Math.Vector2(mate.x, mate.y);
                     const targetAngle = Phaser.Math.Angle.Between(this.bean.x, this.bean.y, this.bean.moveTarget.x, this.bean.moveTarget.y);
                     this.bean.facingAngle = targetAngle;

                     if (this.bean.stateTimer <= 0) {
                        this.bean.burst();
                        this.bean.stateTimer = GameConfig.BEAN.CHARGE_DURATION;
                     }
                 }
            } else {
                 if (this.bean.isGuarding) {
                     const hLocMating = this.bean.getHoardLocation();
                     if (hLocMating) {
                          if (!this.bean.moveTarget || this.hasReachedTarget()) {
                              const angle = Math.random() * Math.PI * 2;
                              const dist = Math.random() * (this.bean.currentRadius * GameConfig.BEAN.HOARD_RADIUS_MULTIPLIER * 0.5);
                              this.bean.moveTarget = new Phaser.Math.Vector2(
                                  hLocMating.x + Math.cos(angle) * dist,
                                  hLocMating.y + Math.sin(angle) * dist
                              );
                          }

                          const targetAngle = Phaser.Math.Angle.Between(this.bean.x, this.bean.y, this.bean.moveTarget.x, this.bean.moveTarget.y);
                          this.bean.facingAngle = targetAngle;

                          if (this.bean.stateTimer <= 0) {
                              this.bean.burst();
                              this.bean.stateTimer = GameConfig.BEAN.CHARGE_DURATION * 2;
                          }
                     } else {
                         this.setIdle();
                     }
                 } else {
                     if (!this.bean.moveTarget || (this.bean.moveTarget && this.hasReachedTarget())) {
                         this.pickRandomTarget();
                     }

                     if (this.bean.moveTarget) {
                         const targetAngle = Phaser.Math.Angle.Between(this.bean.x, this.bean.y, this.bean.moveTarget.x, this.bean.moveTarget.y);
                         this.bean.facingAngle = targetAngle;
                     }

                     if (this.bean.stateTimer <= 0) {
                        this.bean.burst();
                        this.bean.stateTimer = GameConfig.BEAN.CHARGE_DURATION;
                     }
                 }
            }
            break;

          case MoveState.HAULING_FOOD:
          case MoveState.BUILDING:
              // Destination Logic
              let targetPos: Phaser.Math.Vector2 | null = null;
              let isBuilding = (this.bean.moveState === MoveState.BUILDING);

              if (isBuilding && this.bean.moveTarget) {
                  targetPos = this.bean.moveTarget;
              } else {
                  // Default Haul to Hoard
                  const hLoc = this.bean.getHoardLocation();
                  if (hLoc) targetPos = new Phaser.Math.Vector2(hLoc.x, hLoc.y);
              }

              if (!targetPos) {
                  this.setIdle();
                  break;
              }

              const distToTarget = Phaser.Math.Distance.Between(this.bean.x, this.bean.y, targetPos.x, targetPos.y);

              if (distToTarget < 40) {
                  if (isBuilding) {
                      // Contribute to construction
                      this.contributeToBuilding();
                  } else {
                      // Check if we should switch to building instead of dropping at hoard?
                      // Only if Worker
                      if (this.bean.role === BeanRole.WORKER && this.bean.hoardId) {
                          const sites = this.scene.hoardManager.getConstructionSites(this.bean.hoardId);
                          if (sites.length > 0) {
                              // Find closest unfinished site
                              const site = sites[0]; // Simplification
                              if (site.progress < site.resourcesNeeded) {
                                  this.bean.moveState = MoveState.BUILDING;
                                  this.bean.moveTarget = new Phaser.Math.Vector2(site.x, site.y);
                                  break; // Next frame we move to site
                              }
                          }
                      }

                      this.bean.dropFood();
                  }
              } else {
                 // Movement
                 this.bean.moveTarget = targetPos; // Ensure target is set
                 const angle = Phaser.Math.Angle.Between(this.bean.x, this.bean.y, targetPos.x, targetPos.y);
                 this.bean.facingAngle = angle;
                 if (this.bean.stateTimer <= 0) {
                     this.bean.burst();
                     this.bean.stateTimer = GameConfig.BEAN.CHARGE_DURATION;
                 }
              }
              break;

          case MoveState.MOVING_TO_PARTNER:
              if (!this.bean.lockedPartner || !this.bean.lockedPartner.scene || this.bean.lockedPartner.satiety <= 0 || !this.bean.lockedPartner.isSeekingMate) {
                  this.bean.lockedPartner = null;
                  this.bean.moveState = MoveState.SEEKING_MATE;
                  break;
              }

              if (this.bean.lockedPartner.lockedPartner !== this.bean) {
                   this.bean.lockedPartner = null;
                   this.bean.moveState = MoveState.SEEKING_MATE;
                   break;
              }

              this.bean.moveTarget = new Phaser.Math.Vector2(this.bean.lockedPartner.x, this.bean.lockedPartner.y);
              const targetAngle = Phaser.Math.Angle.Between(this.bean.x, this.bean.y, this.bean.moveTarget.x, this.bean.moveTarget.y);
              this.bean.facingAngle = targetAngle;

              if (this.bean.stateTimer <= 0) {
                this.bean.burst();
                this.bean.stateTimer = GameConfig.BEAN.CHARGE_DURATION;
              }
              break;

          case MoveState.CHARGING:
            if (this.bean.moveTarget) {
              const targetAngle = Phaser.Math.Angle.Between(this.bean.x, this.bean.y, this.bean.moveTarget.x, this.bean.moveTarget.y);
              const separationVector = this.getSeparationVector();

              if (separationVector.length() > 0) {
                const targetVec = new Phaser.Math.Vector2(Math.cos(targetAngle), Math.sin(targetAngle));
                const separationWeight = 2.5;
                const combinedVec = targetVec.add(separationVector.scale(separationWeight));
                this.bean.facingAngle = combinedVec.angle();
              } else {
                this.bean.facingAngle = targetAngle;
              }
            }

            if (this.bean.stateTimer <= 0) {
              this.bean.burst();
            }
            break;

          case MoveState.DECELERATING:
            if (this.bean.stateTimer > 0) break;

            const dist = this.bean.moveTarget ? Phaser.Math.Distance.Between(this.bean.x, this.bean.y, this.bean.moveTarget.x, this.bean.moveTarget.y) : 0;

            if (this.bean.moveTarget && dist > 100 && body.speed < 150) {
                if (this.bean.lockedPartner) {
                     this.bean.moveState = MoveState.MOVING_TO_PARTNER;
                } else if (this.bean.isSeekingMate) {
                     this.bean.moveState = MoveState.SEEKING_MATE;
                } else if (this.bean.previousState === MoveState.HAULING_FOOD) {
                     this.bean.moveState = MoveState.HAULING_FOOD;
                     this.bean.stateTimer = GameConfig.BEAN.CHARGE_DURATION;
                } else if (this.bean.previousState === MoveState.CHASING_ENEMY) {
                     this.bean.moveState = MoveState.CHASING_ENEMY;
                     this.bean.stateTimer = GameConfig.BEAN.CHARGE_DURATION;
                } else if (this.bean.previousState === MoveState.GUARDING) {
                     this.bean.moveState = MoveState.GUARDING;
                     this.bean.stateTimer = 2000;
                } else {
                     this.bean.moveState = MoveState.CHARGING;
                }
                this.bean.stateTimer = GameConfig.BEAN.CHARGE_DURATION;
            } else if (body.speed < 10) {
               body.setVelocity(0,0);

               if (this.bean.lockedPartner) {
                   this.bean.moveState = MoveState.MOVING_TO_PARTNER;
                   this.bean.stateTimer = 0;
               } else if (this.bean.isSeekingMate) {
                   this.bean.moveState = MoveState.SEEKING_MATE;
                   this.bean.stateTimer = 0;
               } else if (this.bean.previousState === MoveState.HAULING_FOOD) {
                   this.bean.moveState = MoveState.HAULING_FOOD;
                   const hLocDecel = this.bean.getHoardLocation();
                   const d = hLocDecel ? Phaser.Math.Distance.Between(this.bean.x, this.bean.y, hLocDecel.x, hLocDecel.y) : 999;
                   if (d < 30) this.bean.dropFood();
                   else this.bean.stateTimer = 0;
               } else if (this.bean.previousState === MoveState.CHASING_ENEMY) {
                   this.bean.moveState = MoveState.CHASING_ENEMY;
                   this.bean.stateTimer = 0;
               } else if (this.bean.previousState === MoveState.GUARDING) {
                    this.bean.moveState = MoveState.GUARDING;
                    this.bean.stateTimer = 2000;
               } else {
                   this.setIdle();
               }
            }
            break;
        }

        // Stuck Detection
        const isMovingState = this.bean.moveState === MoveState.CHARGING ||
                              this.bean.moveState === MoveState.MOVING_TO_PARTNER ||
                              this.bean.moveState === MoveState.HAULING_FOOD ||
                              this.bean.moveState === MoveState.BUILDING;

        if (isMovingState && !body.touching.none && body.speed < 20) {
            this.bean.stuckTimer += delta;
            if (this.bean.stuckTimer > 500) {
                this.bean.handleStuck();
                this.bean.stuckTimer = 0;
            }
        } else {
            this.bean.stuckTimer = 0;
        }
    }

    private contributeToBuilding() {
        if (!this.bean.carriedFoodData || !this.bean.hoardId) {
            this.setIdle();
            return;
        }

        const sites = this.scene.hoardManager.getConstructionSites(this.bean.hoardId);
        // Find site near us
        const site = sites.find(s => Phaser.Math.Distance.Between(this.bean.x, this.bean.y, s.x, s.y) < 60);

        if (site) {
            const amount = this.bean.carriedFoodData.satiety;
            site.addProgress(amount);
            this.bean.carriedFoodData = null; // Used up
            this.bean.isFull = false; // Reset full status so we can eat again
            this.setIdle();
        } else {
            // Site gone or too far? drop at hoard
             this.bean.moveState = MoveState.HAULING_FOOD;
        }
    }

    private setIdle() {
        this.bean.moveState = MoveState.IDLE;
        this.bean.previousState = MoveState.IDLE;
        this.bean.isSeekingMate = false;
        this.bean.isGuarding = false;
        this.bean.lockedPartner = null;
        this.bean.stateTimer = Phaser.Math.Between(GameConfig.BEAN.IDLE_DURATION_MIN, GameConfig.BEAN.IDLE_DURATION_MAX);
        this.bean.moveTarget = null;
    }

    private pickTarget() {
        let foodTarget: Phaser.GameObjects.GameObject | null = null;
        const hoardLocation = this.bean.getHoardLocation();

        // Workers focus on food more efficiently
        // const isWorker = this.bean.role === BeanRole.WORKER;

        if (!this.bean.isFull) {
            const foods = this.scene.getFoods();
            let baseRange = GameConfig.BEAN.VISION_RADIUS * this.bean.strategy.searchRange;

            // Explorer bonus
            if (this.bean.role === BeanRole.EXPLORER) baseRange *= 1.5;

            let searchRadius = this.bean.satiety < 20 ? baseRange * 5 : baseRange;
            let closestDist = searchRadius;

            if (this.bean.isGuarding && hoardLocation && this.bean.satiety > this.bean.strategy.hungerTolerance) {
                const hoardRadius = this.bean.currentRadius * GameConfig.BEAN.HOARD_RADIUS_MULTIPLIER;
                searchRadius = hoardRadius * 1.5;
                closestDist = searchRadius;
            }

            for (const food of foods) {
                if (!food || !food.scene) continue;
                if (this.bean.isGuarding && hoardLocation && this.bean.satiety > this.bean.strategy.hungerTolerance) {
                     const distToHoard = Phaser.Math.Distance.Between(hoardLocation.x, hoardLocation.y, food.x, food.y);
                     if (distToHoard > searchRadius) continue;
                }
                const dist = Phaser.Math.Distance.Between(this.bean.x, this.bean.y, food.x, food.y);
                if (dist < closestDist) {
                    closestDist = dist;
                    foodTarget = food;
                }
            }
        }

        if (foodTarget) {
            const food = foodTarget as Food;
            this.bean.moveTarget = new Phaser.Math.Vector2(food.x, food.y);
        } else {
            this.pickRandomTarget();
        }
    }

    private pickRandomTarget() {
        const hoardLocation = this.bean.getHoardLocation();
        const padding = 50;

        if (hoardLocation) {
            const hoardRadius = this.bean.currentRadius * GameConfig.BEAN.HOARD_RADIUS_MULTIPLIER;
            let maxRadius = hoardRadius * (1 + (1 - this.bean.strategy.riskAversion) * 4);

            // Explorer Bonus: roam much further
            if (this.bean.role === BeanRole.EXPLORER) {
                maxRadius *= 2.0;
            }

            if (this.bean.satiety < this.bean.strategy.hungerTolerance) {
                maxRadius = 10000;
            }

            const dist = Phaser.Math.Distance.Between(this.bean.x, this.bean.y, hoardLocation.x, hoardLocation.y);
            if (dist > maxRadius) {
                 this.bean.moveTarget = new Phaser.Math.Vector2(hoardLocation.x, hoardLocation.y);
                 return;
            }

            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * maxRadius;
            const tx = hoardLocation.x + Math.cos(angle) * r;
            const ty = hoardLocation.y + Math.sin(angle) * r;
            const clampedX = Phaser.Math.Clamp(tx, padding, this.scene.scale.width - padding);
            const clampedY = Phaser.Math.Clamp(ty, padding, this.scene.scale.height - padding);
            this.bean.moveTarget = new Phaser.Math.Vector2(clampedX, clampedY);
            return;
        }

        const tx = Phaser.Math.Between(padding, this.scene.scale.width - padding);
        const ty = Phaser.Math.Between(padding, this.scene.scale.height - padding);
        this.bean.moveTarget = new Phaser.Math.Vector2(tx, ty);
    }

    private findIntruder(scanMultiplier: number = 1.0): IBean | null {
        const hoardLocation = this.bean.getHoardLocation();
        if (!hoardLocation) return null;

        const vision = GameConfig.BEAN.GUARD_VISION_RADIUS * this.bean.strategy.searchRange * scanMultiplier;
        const beans = this.scene.getBeansInRadius(this.bean.x, this.bean.y, vision);

        let closestDist = vision;
        let target: IBean | null = null;
        const hoardRadius = this.bean.currentRadius * GameConfig.BEAN.HOARD_RADIUS_MULTIPLIER;

        for (const other of beans) {
            if (other === this.bean) continue;
            if (other === this.bean.lockedPartner) continue;
            if (this.bean.hoardId && other.hoardId === this.bean.hoardId) {
               continue;
            }

            const distToHoard = Phaser.Math.Distance.Between(hoardLocation.x, hoardLocation.y, other.x, other.y);
            if (distToHoard > hoardRadius) continue;

            const dist = Phaser.Math.Distance.Between(this.bean.x, this.bean.y, other.x, other.y);
            if (dist < closestDist) {
                closestDist = dist;
                target = other as unknown as IBean;
            }
        }
        return target;
    }

    private findClosestMate(): IBean | null {
        const range = GameConfig.BEAN.VISION_RADIUS * this.bean.strategy.searchRange * 2;
        const beans = this.scene.getBeansInRadius(this.bean.x, this.bean.y, range);
        let closestDist = range;
        let target: IBean | null = null;

        for (const other of beans) {
            if (other === this.bean) continue;
            if (other.moveState !== MoveState.SEEKING_MATE && other.moveState !== MoveState.MOVING_TO_PARTNER) continue;
            if (other.lockedPartner && other.lockedPartner !== this.bean) continue;

            const dist = Phaser.Math.Distance.Between(this.bean.x, this.bean.y, other.x, other.y);
            if (dist < closestDist) {
                closestDist = dist;
                target = other as unknown as IBean;
            }
        }
        return target;
    }

    private hasReachedTarget(): boolean {
        if (!this.bean.moveTarget) return true;
        const dist = Phaser.Math.Distance.Between(this.bean.x, this.bean.y, this.bean.moveTarget.x, this.bean.moveTarget.y);
        return dist < 20;
    }

    private getSeparationVector(): Phaser.Math.Vector2 {
        const separationRadius = 60;
        const separationForce = new Phaser.Math.Vector2(0, 0);

        const beans = this.scene.getBeansInRadius(this.bean.x, this.bean.y, separationRadius);
        let count = 0;

        for (const other of beans) {
          if (other === this.bean) continue;
          if (other === this.bean.lockedPartner) continue;

          const dist = Phaser.Math.Distance.Between(this.bean.x, this.bean.y, other.x, other.y);

          if (dist < separationRadius && dist > 0) {
            const diff = new Phaser.Math.Vector2(this.bean.x - other.x, this.bean.y - other.y);
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
}
