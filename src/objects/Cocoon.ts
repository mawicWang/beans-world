import Phaser from 'phaser';
import GameScene from '../scenes/GameScene';

export default class Cocoon extends Phaser.GameObjects.Container {
  private totalSatiety: number;
  private readonly HATCH_DURATION = 3000; // 3 seconds
  private bodyGraphics: Phaser.GameObjects.Graphics;
  private mainColor: number;
  private cocoonRadius: number = 25; // "Slightly larger" (Bean is 15)

  constructor(scene: Phaser.Scene, x: number, y: number, totalSatiety: number, color1: number, color2: number) {
    super(scene, x, y);

    this.totalSatiety = totalSatiety;

    // Mix the colors of the parents
    this.mainColor = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(color1),
        Phaser.Display.Color.ValueToColor(color2),
        100,
        50
    ).color;

    this.bodyGraphics = scene.add.graphics();
    this.add(this.bodyGraphics);

    this.drawCocoon();

    // Add a gentle breathing animation
    scene.tweens.add({
        targets: this,
        scaleX: 1.05,
        scaleY: 1.05,
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
    });

    // Schedule hatch using scene time (respects time scale)
    scene.time.delayedCall(this.HATCH_DURATION, () => {
        this.hatch();
    });
  }

  private drawCocoon() {
    this.bodyGraphics.clear();
    // Fill
    this.bodyGraphics.fillStyle(this.mainColor, 1);
    this.bodyGraphics.fillCircle(0, 0, this.cocoonRadius);

    // Border
    this.bodyGraphics.lineStyle(3, 0xffffff, 0.8);
    this.bodyGraphics.strokeCircle(0, 0, this.cocoonRadius);

    // "No eyes" - explicitly just the circle shape.
  }

  private hatch() {
    // Safety check to prevent double hatching
    if (!this.active) return;

    const scene = this.scene as unknown as GameScene;

    // "Split into several slightly smaller individuals"
    // Let's randomize between 2 and 4
    const offspringCount = Phaser.Math.Between(2, 4);

    // "Both parties' satiety is evenly distributed"
    const satietyPerChild = this.totalSatiety / offspringCount;

    for (let i = 0; i < offspringCount; i++) {
        // Spawn with slight offset to avoid immediate overlap issues
        const angle = (Math.PI * 2 * i) / offspringCount;
        const offset = 10;
        const spawnX = this.x + Math.cos(angle) * offset;
        const spawnY = this.y + Math.sin(angle) * offset;

        // Spawn child: isAdult = false
        scene.spawnBean(spawnX, spawnY, satietyPerChild, false);
    }

    this.destroy();
  }
}
