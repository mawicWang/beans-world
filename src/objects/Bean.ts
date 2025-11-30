import Phaser from 'phaser';

export default class Bean extends Phaser.GameObjects.Container {
  private bodyGraphics: Phaser.GameObjects.Graphics;
  private eyeGraphics: Phaser.GameObjects.Graphics;
  private moveTarget: Phaser.Math.Vector2 | null = null;
  private moveSpeed: number = 100;
  private isMoving: boolean = false;
  private nextMoveTime: number = 0;

  // Visual properties
  private radius: number = 20;
  private color: number = 0xffffff;
  private borderColor: number = 0x000000;
  private borderThickness: number = 3;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    this.bodyGraphics = scene.add.graphics();
    this.eyeGraphics = scene.add.graphics();

    this.add(this.bodyGraphics);
    this.add(this.eyeGraphics);

    this.drawBean();

    // Enable physics body for movement
    scene.physics.world.enable(this);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(this.radius);
    body.setOffset(-this.radius, -this.radius);
    body.setCollideWorldBounds(true);
  }

  private drawBean(scaleX: number = 1, scaleY: number = 1) {
    this.bodyGraphics.clear();

    // Draw body (circle with border)
    this.bodyGraphics.lineStyle(this.borderThickness, this.borderColor);
    this.bodyGraphics.fillStyle(this.color);
    // Draw ellipse for deformation support
    this.bodyGraphics.fillEllipse(0, 0, this.radius * 2 * scaleX, this.radius * 2 * scaleY);
    this.bodyGraphics.strokeEllipse(0, 0, this.radius * 2 * scaleX, this.radius * 2 * scaleY);

    this.eyeGraphics.clear();
    // Draw orientation dot (eye)
    // Placed slightly forward based on rotation (which is 0 relative to the container, but we draw it at an offset)
    // Actually, we'll rotate the whole container, so we just draw the eye at a fixed offset "forward" (e.g. to the right if 0 deg is right)
    this.eyeGraphics.fillStyle(0x000000);
    // Assuming 0 degrees is RIGHT. Let's put the eye at (radius * 0.6, 0)
    // If we want it to look like it's on the surface, we might move it closer to edge.
    this.eyeGraphics.fillCircle(this.radius * 0.6 * scaleX, 0, 3);
  }

  update(time: number, _delta: number) {
    if (this.isMoving && this.moveTarget) {
      const body = this.body as Phaser.Physics.Arcade.Body;

      const distance = Phaser.Math.Distance.Between(this.x, this.y, this.moveTarget.x, this.moveTarget.y);

      if (distance < 5) {
        this.stopMoving();
      } else {
        // Rotate towards target
        const angle = Phaser.Math.Angle.Between(this.x, this.y, this.moveTarget.x, this.moveTarget.y);
        this.rotation = angle;

        // Move
        this.scene.physics.velocityFromRotation(angle, this.moveSpeed, body.velocity);

        // Squash and stretch animation based on speed/movement
        // Simple oscillation for "jelly" effect
        const wobble = Math.sin(time * 0.02) * 0.1;
        // stretch along x (forward), squash along y
        this.drawBean(1 + wobble + 0.1, 1 - wobble - 0.1);
      }
    } else {
      if (time > this.nextMoveTime) {
        this.pickRandomTarget();
        this.nextMoveTime = time + Phaser.Math.Between(1000, 3000);
      }
      // Idle animation (breathing)
      const breath = Math.sin(time * 0.005) * 0.02;
      this.drawBean(1 + breath, 1 - breath);
    }
  }

  private pickRandomTarget() {
    const scene = this.scene;
    const padding = 50;
    const tx = Phaser.Math.Between(padding, scene.scale.width - padding);
    const ty = Phaser.Math.Between(padding, scene.scale.height - padding);

    this.moveTarget = new Phaser.Math.Vector2(tx, ty);
    this.isMoving = true;

    // Play sound
    this.playMoveSound();
  }

  private playMoveSound() {
    // Simple synthesized "pop" sound using Web Audio API
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;

    // We reuse the context from Phaser if available, or create new one (but better to use Phaser's context if possible)
    // Phaser sound manager has a context.
    const soundManager = this.scene.sound as Phaser.Sound.WebAudioSoundManager;
    if (!soundManager.context) return;
    const ctx = soundManager.context;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    // Frequency sweep for a cute "bloop" sound
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  }

  private stopMoving() {
    this.isMoving = false;
    this.moveTarget = null;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    this.drawBean(1, 1); // Reset shape
  }
}
