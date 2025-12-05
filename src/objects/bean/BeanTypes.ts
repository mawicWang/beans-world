import Phaser from 'phaser';

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
  FLEEING,
  BUILDING
}

export enum BeanRole {
  WORKER = 'worker',
  GUARD = 'guard',
  EXPLORER = 'explorer'
}

export interface SurvivalStrategy {
  wanderLust: number;       // 0-1: Chance to roam vs idle
  hoardingThreshold: number;// 0-100: Satiety needed to haul
  riskAversion: number;     // 0-1: How strongly they cling to the hoard
  hungerTolerance: number;  // 0-100: How low satiety gets before ignoring safety
  matingThreshold: number;  // 0-100: Satiety needed to mate
  searchRange: number;      // Scalar: Multiplier for view distance
  fleeThreshold: number;    // 0-100: Satiety threshold to flee
  aggression: number;       // Scalar: Multiplier for chase distance
}

export interface BeanAttributes {
    strength: number;
    speed: number;
    constitution: number;
}

export interface IBean extends Phaser.GameObjects.Container {
  // Stats
  satiety: number;
  maxSatiety: number;
  strength: number;
  speed: number;
  constitution: number;
  currentRadius: number;
  age: number;
  isAdult: boolean;
  isFull: boolean;
  reproCooldown: number;
  role: BeanRole | null;

  // State
  moveState: MoveState;
  previousState: MoveState;
  strategy: SurvivalStrategy;
  stateTimer: number;
  combatTimer: number;
  stuckTimer: number;

  // Flags
  isGuarding: boolean;
  isSeekingMate: boolean;
  showHoardLines: boolean;

  // References
  hoardId: string | null;
  lockedPartner: IBean | null;
  moveTarget: Phaser.Math.Vector2 | null;
  facingAngle: number;
  carriedFoodData: { satiety: number, attributeBonus?: { type: 'strength' | 'speed' | 'constitution', value: number } } | null;

  // Methods
  getHoardLocation(): Phaser.Math.Vector2 | null;
  getMainColor(): number;
  getStatsText(): string;

  // Actions
  playMoveSound(): void;
  burst(): void;
  lockPartner(other: IBean): void;
  triggerCombat(): void;
  eat(food: any): void;
  dropFood(): void;
  fleeFrom(source: Phaser.Math.Vector2 | Phaser.GameObjects.GameObject): void;
  growUp(): void;
  handleStuck(): void;
}
