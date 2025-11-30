import Phaser from 'phaser';

enum MoveState {
  IDLE,
  CHARGING,
  BURSTING,
  DECELERATING
}

export default class Bean extends Phaser.GameObjects.Container {
  private bodyGraphics: Phaser.GameObjects.Graphics;

  // Physics (Head)
  private moveState: MoveState = MoveState.IDLE;
  private stateTimer: number = 0;
  private moveTarget: Phaser.Math.Vector2 | null = null;
  private facingAngle: number = 0;

  // Physics (Tail Spring)
  private tailPos: Phaser.Math.Vector2;
  private tailVelocity: Phaser.Math.Vector2;

  // Constants
  private readonly SPRING_STIFFNESS = 0.05;
  private readonly SPRING_DAMPING = 0.75;
  private readonly ROPE_LENGTH = 10; // Slack length for "rope" feel
  private readonly BURST_SPEED = 200; // Decreased for smoother movement
  private readonly CHARGE_DURATION = 300; // ms
  private readonly IDLE_DURATION_MIN = 500;
  private readonly IDLE_DURATION_MAX = 2000;

  // Visuals
  private baseRadius = 15; // Slightly smaller to allow growth
  private mainColor: number;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    // Pick a jelly-like color (variations of blue/cyan/purple)
    const colors = [0x4aa3df, 0x50c8e0, 0x6e8cd4, 0x4dd0e1];
    this.mainColor = Phaser.Utils.Array.GetRandom(colors);

    this.bodyGraphics = scene.add.graphics();
    this.add(this.bodyGraphics);

    // Enable physics body for movement
    scene.physics.world.enable(this);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(this.baseRadius);
    body.setOffset(-this.baseRadius, -this.baseRadius);
    body.setCollideWorldBounds(true);
    // Add drag for the "Decelerate" phase
    body.setDrag(400);
    body.setBounce(0.5);

    // Initialize tail at head position
    this.tailPos = new Phaser.Math.Vector2(x, y);
    this.tailVelocity = new Phaser.Math.Vector2(0, 0);

    // Initial state
    this.setIdle();
  }

  private setIdle() {
    this.moveState = MoveState.IDLE;
    this.stateTimer = this.scene.time.now + Phaser.Math.Between(this.IDLE_DURATION_MIN, this.IDLE_DURATION_MAX);
    this.moveTarget = null;
  }

  update(time: number, _delta: number) {
    const body = this.body as Phaser.Physics.Arcade.Body;

    // 1. State Machine
    switch (this.moveState) {
      case MoveState.IDLE:
        if (time > this.stateTimer) {
          this.pickRandomTarget();
          this.moveState = MoveState.CHARGING;
          this.stateTimer = time + this.CHARGE_DURATION;
        }
        break;

      case MoveState.CHARGING:
        // Orient towards target while charging
        if (this.moveTarget) {
             const angle = Phaser.Math.Angle.Between(this.x, this.y, this.moveTarget.x, this.moveTarget.y);
             this.facingAngle = angle;
        }

        if (time > this.stateTimer) {
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
          this.moveState = MoveState.CHARGING;
          this.stateTimer = time + this.CHARGE_DURATION;
        } else if (body.speed < 10) {
           body.setVelocity(0,0);
           this.setIdle();
        }
        break;
    }

    // 2. Tail Physics (Elastic Rope System)
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
    }

    // Update velocity
    this.tailVelocity.x += ax;
    this.tailVelocity.y += ay;

    // Damping
    this.tailVelocity.x *= this.SPRING_DAMPING;
    this.tailVelocity.y *= this.SPRING_DAMPING;

    // Update position
    this.tailPos.x += this.tailVelocity.x;
    this.tailPos.y += this.tailVelocity.y;

    // 3. Render
    // Convert World Tail to Local Tail relative to Container
    // This allows us to draw using local coordinates where (0,0) is always the Head
    // Since the container is NOT rotated, this is just a translation.
    const localTail = new Phaser.Math.Vector2();
    this.getLocalPoint(this.tailPos.x, this.tailPos.y, localTail);

    this.drawJelly(localTail);
  }

  private pickRandomTarget() {
    const scene = this.scene;
    const padding = 50;
    const tx = Phaser.Math.Between(padding, scene.scale.width - padding);
    const ty = Phaser.Math.Between(padding, scene.scale.height - padding);
    this.moveTarget = new Phaser.Math.Vector2(tx, ty);
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
    const dist = tailOffset.length();

    // Deformation: As distance increases, Head grows slightly, Tail shrinks
    // Limit dist to avoid breaking geometry
    const stretchFactor = Math.min(dist, 100) / 100; // 0 to 1

    const headRadius = this.baseRadius * (1 + stretchFactor * 0.2);
    const tailRadius = this.baseRadius * (1 - stretchFactor * 0.7); // Tail gets smaller

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
