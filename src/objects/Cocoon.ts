import Phaser from 'phaser';
import GameScene from '../scenes/GameScene';

export default class Cocoon extends Phaser.GameObjects.Container {
  private totalSatiety: number;
  private duration: number;
  private bodyGraphics: Phaser.GameObjects.Graphics;
  private mainColor: number = 0x888888; // Default gray, will override
  private originalRadius: number = 25; // Slightly larger than a bean

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

    // Add pulsing tween
    scene.tweens.add({
        targets: this,
        scaleX: 1.1,
        scaleY: 1.1,
        duration: 500,
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
    this.bodyGraphics.fillStyle(this.mainColor, 1);
    this.bodyGraphics.lineStyle(2, 0xffffff, 0.5);
    this.bodyGraphics.fillCircle(0, 0, this.originalRadius);
    this.bodyGraphics.strokeCircle(0, 0, this.originalRadius);
  }

  private hatch() {
    if (!this.active) return;

    const scene = this.scene as unknown as GameScene;

    // Determine number of offspring (2 to 4)
    const count = Phaser.Math.Between(2, 4);
    const satietyPerBean = this.totalSatiety / count;

    for (let i = 0; i < count; i++) {
        // Random slight offset
        const offsetX = Phaser.Math.Between(-10, 10);
        const offsetY = Phaser.Math.Between(-10, 10);

        // Spawn baby bean
        scene.spawnBean(this.x + offsetX, this.y + offsetY, satietyPerBean, false);
    }

    // Destroy self
    this.destroy();
  }
}
