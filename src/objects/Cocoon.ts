import Phaser from 'phaser';
import GameScene from '../scenes/GameScene';

export default class Cocoon extends Phaser.GameObjects.Container {
  private totalSatiety: number;
  private duration: number;
  private bodyGraphics: Phaser.GameObjects.Graphics;
  private mainColor: number;
  private originalRadius: number = 30; // Larger than bean (15)

  constructor(scene: Phaser.Scene, x: number, y: number, totalSatiety: number, color1: number, color2: number) {
    super(scene, x, y);

    this.totalSatiety = totalSatiety;
    this.duration = 3000; // 3 seconds to hatch

    // Mix colors for the cocoon
    this.mainColor = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(color1),
        Phaser.Display.Color.ValueToColor(color2),
        100,
        50
    ).color;

    this.bodyGraphics = scene.add.graphics();
    this.add(this.bodyGraphics);

    this.drawCocoon();

    // Add pulsing tween (heartbeat)
    scene.tweens.add({
        targets: this,
        scaleX: 1.05,
        scaleY: 1.05,
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
    });

    // Schedule hatch
    scene.time.delayedCall(this.duration, () => {
        this.hatch();
    });
  }

  private drawCocoon() {
    this.bodyGraphics.clear();

    // Simple circle, no eyes
    this.bodyGraphics.fillStyle(this.mainColor, 1);
    this.bodyGraphics.lineStyle(3, 0xffffff, 0.6);
    this.bodyGraphics.fillCircle(0, 0, this.originalRadius);
    this.bodyGraphics.strokeCircle(0, 0, this.originalRadius);

    // Add some spots or texture to look organic?
    this.bodyGraphics.fillStyle(0x000000, 0.1);
    this.bodyGraphics.fillCircle(-5, -5, 4);
    this.bodyGraphics.fillCircle(8, 6, 3);
    this.bodyGraphics.fillCircle(-6, 10, 2);
  }

  private hatch() {
    if (!this.active) return;

    const scene = this.scene as unknown as GameScene;

    // Determine number of offspring (Several: 2 to 5)
    const count = Phaser.Math.Between(2, 5);
    const satietyPerBean = this.totalSatiety / count;

    for (let i = 0; i < count; i++) {
        // Random slight offset so they don't stack perfectly
        const r = 20;
        const theta = Math.random() * Math.PI * 2;
        const offsetX = Math.cos(theta) * r;
        const offsetY = Math.sin(theta) * r;

        // Spawn baby bean (isAdult = false)
        // Ensure satiety is passed correctly
        scene.spawnBean(this.x + offsetX, this.y + offsetY, satietyPerBean, false);
    }

    // Destroy self
    this.destroy();
  }
}
