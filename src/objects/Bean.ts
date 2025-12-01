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
  private targetMate: Bean | null = null; // Specific mate target
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
  private readonly VISION_RADIUS = 300; // Increased vision for mating
  private isFull: boolean = false;

  // Constants
  private readonly SPRING_STIFFNESS = 0.1;
  private readonly SPRING_DAMPING = 0.6;
  private readonly ROPE_LENGTH = 0;
  private readonly BURST_SPEED = 200;
  private readonly CHARGE_DURATION = 300;
  private readonly IDLE_DURATION_MIN = 500;
  private readonly IDLE_DURATION_MAX = 2000;

  // Visuals
  private baseRadius = 15;
  private currentRadius = 15;
  private mainColor: number;

  constructor(scene: Phaser.Scene, x: number, y: number, startSatiety: number = 80, startAdult: boolean = true) {
    super(scene, x, y);

    this.satiety = startSatiety;
    this.isAdult = startAdult;
    this.currentRadius = this.isAdult ? this.baseRadius : this.baseRadius * 0.6;

    const colors = [0x4aa3df, 0x50c8e0, 0x6e8cd4, 0x4dd0e1];
    this.mainColor = Phaser.Utils.Array.GetRandom(colors);

    this.bodyGraphics = scene.add.graphics();
    this.add(this.bodyGraphics);

    this.statusPanel = scene.add.container(25, -25);
    const panelBg = scene.add.rectangle(0, 0, 50, 20, 0x000000, 0.5);
    this.statusText = scene.add.text(0, 0, '80', { fontSize: '12px', color: '#fff' }).setOrigin(0.5);
    this.statusPanel.add([panelBg, this.statusText]);
    this.statusPanel.setVisible(false);
    this.add(this.statusPanel);

    const toggleHandler = (visible: boolean) => {
        this.statusPanel.setVisible(visible);
    };
    scene.game.events.on('TOGGLE_BEAN_STATS', toggleHandler);

    this.once('destroy', () => {
        scene.game.events.off('TOGGLE_BEAN_STATS', toggleHandler);
    });

    this.tailPos = new Phaser.Math.Vector2(x, y);
    this.tailVelocity = new Phaser.Math.Vector2(0, 0);

    this.setIdle();
  }

  public getMainColor(): number {
    return this.mainColor;
  }

  public setupPhysics() {
    if (!this.body) {
      this.scene.physics.world.enable(this);
    }

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(this.currentRadius);
    body.setOffset(-this.currentRadius, -this.currentRadius);
    body.setCollideWorldBounds(true);
    body.setDrag(400);
    body.setBounce(0.5);
  }

  private setIdle() {
    this.moveState = MoveState.IDLE;
    // Don't reset isSeekingMate here immediately, handled by logic
    this.stateTimer = this.scene.time.now + Phaser.Math.Between(this.IDLE_DURATION_MIN, this.IDLE_DURATION_MAX);
    this.moveTarget = null;
    this.targetMate = null;
  }

  private pickRandomTarget() {
    const scene = this.scene as unknown as GameScene;
    const padding = 50;
    const tx = Phaser.Math.Between(padding, scene.scale.width - padding);
    const ty = Phaser.Math.Between(padding, scene.scale.height - padding);
    this.moveTarget = new Phaser.Math.Vector2(tx, ty);
  }

  update(time: number, delta: number) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!body) return;

    // 0. Growth
    if (!this.isAdult) {
        this.age += delta;
        if (this.age >= this.MATURITY_AGE) {
            this.isAdult = true;
            this.currentRadius = this.baseRadius;
            body.setCircle(this.currentRadius);
            body.setOffset(-this.currentRadius, -this.currentRadius);
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
        const scene = this.scene as unknown as GameScene;
        scene.removeBean(this);
        return;
    } else if (this.satiety >= 100) {
        this.satiety = 100;
        this.isFull = true;
    } else if (this.satiety < 90) {
        this.isFull = false;
    }

    // Reproduction Trigger Check
    if (this.isAdult && this.satiety > 60 && this.reproCooldown <= 0 && !this.isSeekingMate) {
         // Probability check based on satiety
         // Higher satiety = higher chance
         const probability = (this.satiety - 60) * 0.001;
         if (Math.random() < probability) {
             this.moveState = MoveState.SEEKING_MATE;
             this.isSeekingMate = true;
             this.moveTarget = null;
             this.targetMate = null;
         }
    }

    // Stop seeking if satiety drops
    if (this.isSeekingMate && this.satiety < 60) {
        this.isSeekingMate = false;
        this.setIdle();
    }

    // 1. State Machine
    switch (this.moveState) {
      case MoveState.IDLE:
        if (time > this.stateTimer) {
          this.pickTarget();
          this.moveState = MoveState.CHARGING;
          this.stateTimer = time + this.CHARGE_DURATION;
        }
        break;

      case MoveState.SEEKING_MATE:
        // Continually look for closest mate
        const mate = this.findClosestMate();
        this.targetMate = mate;

        if (mate) {
             this.moveTarget = new Phaser.Math.Vector2(mate.x, mate.y);
             const targetAngle = Phaser.Math.Angle.Between(this.x, this.y, this.moveTarget.x, this.moveTarget.y);
             this.facingAngle = targetAngle;
        } else {
             // No mate found, roam
             if (!this.moveTarget || (this.moveTarget && this.hasReachedTarget())) {
                 this.pickRandomTarget();
             }
             if (this.moveTarget) {
                 this.facingAngle = Phaser.Math.Angle.Between(this.x, this.y, this.moveTarget.x, this.moveTarget.y);
             }
        }

        if (time > this.stateTimer) {
            this.burst();
            // Burst faster when seeking
            this.stateTimer = time + this.CHARGE_DURATION * 1.5;
        }
        break;

      case MoveState.CHARGING:
        if (this.moveTarget) {
          const targetAngle = Phaser.Math.Angle.Between(this.x, this.y, this.moveTarget.x, this.moveTarget.y);

          // Calculate separation vector, IGNORING our target mate if we have one
          const separationVector = this.getSeparationVector(this.targetMate);

          if (separationVector.length() > 0) {
            const targetVec = new Phaser.Math.Vector2(Math.cos(targetAngle), Math.sin(targetAngle));

            // Less separation when seeking mate to allow merging
            const separationWeight = this.isSeekingMate ? 0.5 : 2.5;

            const combinedVec = targetVec.add(separationVector.scale(separationWeight));
            this.facingAngle = combinedVec.angle();
          } else {
            this.facingAngle = targetAngle;
          }
        }

        if (time > this.stateTimer) {
          this.burst();
        }
        break;

      case MoveState.BURSTING:
        this.moveState = MoveState.DECELERATING;
        break;

      case MoveState.DECELERATING:
        const dist = this.moveTarget ? Phaser.Math.Distance.Between(this.x, this.y, this.moveTarget.x, this.moveTarget.y) : 0;

        // Hop logic
        if (this.moveTarget && dist > 100 && body.speed < 150) {
          this.moveState = MoveState.CHARGING;
          this.stateTimer = time + this.CHARGE_DURATION;
        } else if (body.speed < 10) {
           body.setVelocity(0,0);

           if (this.isSeekingMate) {
               // Stay in seeking mode
               this.moveState = MoveState.SEEKING_MATE;
               this.stateTimer = time;
           } else {
               this.setIdle();
           }
        }
        break;
    }

    // 2. Tail Physics
    const headX = this.x;
    const headY = this.y;
    const dx = headX - this.tailPos.x;
    const dy = headY - this.tailPos.y;
    const currentDist = Math.sqrt(dx * dx + dy * dy);

    let ax = 0;
    let ay = 0;

    if (currentDist > this.ROPE_LENGTH) {
        const force = (currentDist - this.ROPE_LENGTH) * this.SPRING_STIFFNESS;
        ax = (dx / currentDist) * force;
        ay = (dy / currentDist) * force;
    } else {
         const force = currentDist * this.SPRING_STIFFNESS;
         if (currentDist > 0) {
             ax = (dx / currentDist) * force;
             ay = (dy / currentDist) * force;
         }
    }

    this.tailVelocity.x += ax;
    this.tailVelocity.y += ay;
    this.tailVelocity.x *= this.SPRING_DAMPING;
    this.tailVelocity.y *= this.SPRING_DAMPING;
    this.tailPos.x += this.tailVelocity.x;
    this.tailPos.y += this.tailVelocity.y;

    // 3. Render
    const localTail = new Phaser.Math.Vector2();
    this.getLocalPoint(this.tailPos.x, this.tailPos.y, localTail);
    this.drawJelly(localTail);
  }

  private getSeparationVector(ignoreTarget: Bean | null = null): Phaser.Math.Vector2 {
    const separationRadius = 60;
    const separationForce = new Phaser.Math.Vector2(0, 0);

    const scene = this.scene as unknown as GameScene;
    if (typeof scene.getBeans !== 'function') return separationForce;

    const beans = scene.getBeans();
    let count = 0;

    for (const other of beans) {
      if (other === this) continue;
      if (ignoreTarget && other === ignoreTarget) continue;

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
      return dist < 20;
  }

  private pickTarget() {
    const scene = this.scene as unknown as GameScene;

    let foodTarget: Phaser.GameObjects.GameObject | null = null;
    if (!this.isFull) {
        const foods = scene.getFoods();
        let closestDist = this.VISION_RADIUS;

        for (const food of foods) {
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
      if (this.isFull) return;
      this.satiety += food.satiety;
      const scene = this.scene as unknown as GameScene;
      scene.removeFood(food);
  }

  private burst() {
    if (!this.moveTarget) return;
    const body = this.body as Phaser.Physics.Arcade.Body;
    const angle = this.facingAngle;
    this.scene.physics.velocityFromRotation(angle, this.BURST_SPEED, body.velocity);
    this.playMoveSound();
    this.moveState = MoveState.BURSTING;
  }

  private drawJelly(tailOffset: Phaser.Math.Vector2) {
    this.bodyGraphics.clear();
    let dist = tailOffset.length();
    if (dist < 0.5) dist = 0;

    const stretchFactor = Math.min(dist, 100) / 100;
    const headRadius = this.currentRadius * (1 + stretchFactor * 0.2);
    const tailRadius = this.currentRadius * (1 - stretchFactor * 0.7);

    const hx = 0;
    const hy = 0;
    const tx = tailOffset.x;
    const ty = tailOffset.y;

    this.bodyGraphics.fillStyle(this.mainColor, 0.9);
    this.bodyGraphics.lineStyle(2, 0x1a5f8a, 1.0);

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

    // Eyes (only if Adult or simplified for baby)
    // Actually user said Cocoon has no eyes. Beans implicitly have eyes.
    // Let's add simple eyes to the Bean to distinguish from Cocoon.
    const eyeOffset = headRadius * 0.4;
    const eyeSize = headRadius * 0.15;
    const leftEyeX = Math.cos(this.facingAngle - 0.5) * eyeOffset;
    const leftEyeY = Math.sin(this.facingAngle - 0.5) * eyeOffset;
    const rightEyeX = Math.cos(this.facingAngle + 0.5) * eyeOffset;
    const rightEyeY = Math.sin(this.facingAngle + 0.5) * eyeOffset;

    this.bodyGraphics.fillStyle(0x000000, 0.8);
    this.bodyGraphics.fillCircle(leftEyeX, leftEyeY, eyeSize);
    this.bodyGraphics.fillCircle(rightEyeX, rightEyeY, eyeSize);

    // Shine
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
    gain.gain.setValueAtTime(0.05, now); // Quieter
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc.start();
    osc.stop(now + 0.15);
  }
}
