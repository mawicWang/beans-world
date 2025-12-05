import Phaser from 'phaser';
import type GameScene from '../scenes/GameScene';
import Food from './Food';
import { ISpatialObject } from '../managers/SpatialGrid';
import { GameConfig } from '../config/GameConfig';
import { IBean, MoveState, SurvivalStrategy, BeanRole } from './bean/BeanTypes';
import { BeanRenderer } from './bean/BeanRenderer';
import { BeanPhysics } from './bean/BeanPhysics';
import { BeanBrain } from './bean/BeanBrain';

export { MoveState, BeanRole };
export type { SurvivalStrategy };

export default class Bean extends Phaser.GameObjects.Container implements ISpatialObject, IBean {
  // Components
  public renderer: BeanRenderer;
  public physicsComponent: BeanPhysics;
  public brain: BeanBrain;

  // IBean State
  public satiety: number = GameConfig.BEAN.START_SATIETY;
  public maxSatiety: number = 100;
  public strength: number = 5;
  public speed: number = 5;
  public constitution: number = 5;
  public age: number = 0;
  public isAdult: boolean = true;
  public isFull: boolean = false;
  public reproCooldown: number = 0;
  public role: BeanRole | null = null;

  public moveState: MoveState = MoveState.IDLE;
  public previousState: MoveState = MoveState.IDLE;
  public strategy: SurvivalStrategy;
  public stateTimer: number = 0;
  public combatTimer: number = 0;
  public stuckTimer: number = 0;

  public isGuarding: boolean = false;
  public isSeekingMate: boolean = false;
  public showHoardLines: boolean = false;

  public hoardId: string | null = null;
  public lockedPartner: IBean | null = null;
  public moveTarget: Phaser.Math.Vector2 | null = null;
  public facingAngle: number = 0;
  public carriedFoodData: { satiety: number, attributeBonus?: { type: 'strength' | 'speed' | 'constitution', value: number } } | null = null;

  public currentRadius: number = 15;
  private adultRadius: number = 15;

  // Static constraints
  public static readonly MIN_ATTR = GameConfig.BEAN.MIN_ATTR;
  public static readonly MAX_ATTR = GameConfig.BEAN.MAX_ATTR;

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

    // Attributes
    this.strength = Phaser.Math.Clamp(attributes.strength ?? 5, Bean.MIN_ATTR, Bean.MAX_ATTR);
    this.speed = Phaser.Math.Clamp(attributes.speed ?? 5, Bean.MIN_ATTR, Bean.MAX_ATTR);
    this.constitution = Phaser.Math.Clamp(attributes.constitution ?? 5, Bean.MIN_ATTR, Bean.MAX_ATTR);

    // Derived Stats
    this.maxSatiety = GameConfig.BEAN.MAX_SATIETY_BASE + (this.constitution * GameConfig.BEAN.MAX_SATIETY_CON_MULT);
    this.adultRadius = 10 + (this.constitution * 0.5);
    this.currentRadius = this.isAdult ? this.adultRadius : this.adultRadius * 0.6;

    // Strategy
    if (strategy) {
        this.strategy = strategy;
    } else {
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

    // Assign Role if Adult
    if (this.isAdult && !this.role) {
      this.assignRole();
    }

    // Initialize Components
    this.renderer = new BeanRenderer(this, scene, showStats);
    this.physicsComponent = new BeanPhysics(this, scene, x, y);
    this.brain = new BeanBrain(this, scene);

    this.setIdle();
  }

  setupPhysics() {
      this.physicsComponent.setupPhysics();
  }

  // IBean Methods
  getHoardLocation(): Phaser.Math.Vector2 | null {
      if (!this.hoardId) return null;
      const scene = this.scene as unknown as GameScene;
      const data = scene.hoardManager.getHoard(this.hoardId);
      if (!data) return null;
      return new Phaser.Math.Vector2(data.x, data.y);
  }

  getMainColor(): number {
      return this.renderer.getMainColor();
  }

  getStatsText(): string {
       return `Sat: ${Math.floor(this.satiety)}/${this.maxSatiety}\n` +
             `Str: ${this.strength.toFixed(1)}\n` +
             `Spd: ${this.speed.toFixed(1)}\n` +
             `Con: ${this.constitution.toFixed(1)}`;
  }

  playMoveSound() {
      this.renderer.playMoveSound();
  }

  burst() {
      this.physicsComponent.burst();
  }

  lockPartner(other: IBean) {
      this.lockedPartner = other;
      this.moveState = MoveState.MOVING_TO_PARTNER;
      this.isSeekingMate = true;
  }

  triggerCombat() {
      this.combatTimer = 500;
  }

  eat(food: Food) {
      if (this.satiety > this.strategy.hoardingThreshold) {
          this.carriedFoodData = {
              satiety: food.satiety,
              attributeBonus: food.attributeBonus
          };

          const scene = this.scene as unknown as GameScene;
          scene.removeFood(food);

          this.moveState = MoveState.HAULING_FOOD;
          this.isGuarding = false;

          if (!this.hoardId) {
              this.hoardId = scene.hoardManager.registerHoard(this.x, this.y, this.currentRadius * GameConfig.BEAN.HOARD_RADIUS_MULTIPLIER);
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

      if (food.attributeBonus) {
          const { type, value } = food.attributeBonus;
          if (type === 'strength') this.strength = Phaser.Math.Clamp(this.strength + value, Bean.MIN_ATTR, Bean.MAX_ATTR);
          if (type === 'speed') this.speed = Phaser.Math.Clamp(this.speed + value, Bean.MIN_ATTR, Bean.MAX_ATTR);
          if (type === 'constitution') {
              this.constitution = Phaser.Math.Clamp(this.constitution + value, Bean.MIN_ATTR, Bean.MAX_ATTR);
              this.maxSatiety = GameConfig.BEAN.MAX_SATIETY_BASE + (this.constitution * GameConfig.BEAN.MAX_SATIETY_CON_MULT);
              this.adultRadius = 10 + (this.constitution * 0.5);
              if (this.isAdult) {
                  this.currentRadius = this.adultRadius;
                  this.physicsComponent.updateBodySize();
              }
          }
      }

      (this.scene as unknown as GameScene).removeFood(food);
  }

  dropFood() {
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

  fleeFrom(source: Phaser.Math.Vector2 | Phaser.GameObjects.GameObject) {
      this.moveState = MoveState.FLEEING;
      this.isGuarding = false;
      this.stateTimer = 2000;

      const sx = (source as any).x;
      const sy = (source as any).y;
      const angle = Phaser.Math.Angle.Between(sx, sy, this.x, this.y);
      const dist = 300;

      const tx = this.x + Math.cos(angle) * dist;
      const ty = this.y + Math.sin(angle) * dist;

      const padding = 50;
      const clampedX = Phaser.Math.Clamp(tx, padding, this.scene.scale.width - padding);
      const clampedY = Phaser.Math.Clamp(ty, padding, this.scene.scale.height - padding);

      this.moveTarget = new Phaser.Math.Vector2(clampedX, clampedY);
  }

  growUp() {
      this.isAdult = true;
      this.assignRole();
      const startRadius = this.currentRadius;
      const targetRadius = this.adultRadius;

      this.scene.tweens.add({
          targets: this,
          duration: 1000,
          ease: 'Sine.easeOut',
          onUpdate: (tween) => {
              const progress = tween.progress;
              this.currentRadius = Phaser.Math.Interpolation.Linear([startRadius, targetRadius], progress);
          },
          onComplete: () => {
             this.currentRadius = targetRadius;
             this.physicsComponent.updateBodySize();
          }
      });
  }

  assignRole() {
      if (this.strength >= this.speed && this.strength >= this.constitution) {
          this.role = BeanRole.GUARD;
      } else if (this.speed >= this.strength && this.speed >= this.constitution) {
          this.role = BeanRole.EXPLORER;
      } else {
          this.role = BeanRole.WORKER;
      }

      // Slightly bias strategy based on role
      if (this.role === BeanRole.GUARD) {
          this.strategy.aggression = Math.max(this.strategy.aggression, 1.2);
          this.strategy.riskAversion = Math.min(this.strategy.riskAversion, 0.3); // Braver
          this.strategy.searchRange = Math.max(this.strategy.searchRange, 1.0);
      } else if (this.role === BeanRole.EXPLORER) {
          this.strategy.wanderLust = Math.max(this.strategy.wanderLust, 0.8);
          this.strategy.searchRange = Math.max(this.strategy.searchRange, 1.5);
      } else { // WORKER
          this.strategy.hoardingThreshold = Math.min(this.strategy.hoardingThreshold, 80); // Haul sooner
          this.strategy.riskAversion = Math.max(this.strategy.riskAversion, 0.7); // More timid
      }
  }

  handleStuck() {
      const body = this.body as Phaser.Physics.Arcade.Body;
      const direction = Math.random() > 0.5 ? 1 : -1;
      const escapeAngle = this.facingAngle + (direction * Math.PI / 2);
      const burstSpeed = 150 + (this.speed * 10);
      this.scene.physics.velocityFromRotation(escapeAngle, burstSpeed, body.velocity);
      this.playMoveSound();

      this.moveState = MoveState.DECELERATING;
      this.stateTimer = 500;
  }

  // Update Loops
  think(_time: number, delta: number) {
      this.brain.think(_time, delta);
      this.renderer.update();
  }

  update(_time: number, delta: number, render: boolean = true) {
      this.physicsComponent.update(delta);
      if (render) {
          this.renderer.draw(this.physicsComponent.getTailPos());
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
}
