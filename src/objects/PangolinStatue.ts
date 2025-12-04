import Phaser from 'phaser';

export default class PangolinStatue extends Phaser.Physics.Arcade.Image {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    const key = 'pangolin_statue_texture';
    if (!scene.textures.exists(key)) {
      PangolinStatue.generateTexture(scene, key);
    }
    super(scene, x, y, key);
    scene.add.existing(this);
    scene.physics.add.existing(this, true); // true = static body

    // Set a circular physics body for smoother collisions, or stick to box
    // Box is fine for a statue, maybe adjust size slightly smaller than visual
    this.setBodySize(80, 60);
    this.setOffset(24, 34); // Center the body

    // Add Label
    const label = scene.add.text(x, y + 60, 'Pangolin Statue', {
        fontSize: '16px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
        align: 'center'
    }).setOrigin(0.5);
    label.setDepth(this.depth + 1);
  }

  static generateTexture(scene: Phaser.Scene, key: string) {
      const graphics = scene.make.graphics({ x: 0, y: 0 });

      // Draw Pangolin Visuals
      // Center roughly at 64, 64 (texture size 128x128)

      // 1. Tail (Curved)
      graphics.fillStyle(0x8D6E63); // Brownish
      graphics.lineStyle(2, 0x5D4037);

      const path = new Phaser.Curves.Path(30, 80);
      path.quadraticBezierTo(50, 100, 90, 90);
      // We can't easily fill a path in simple Graphics without fillPoints,
      // but let's use simple shapes for robustness.

      // Tail
      graphics.fillCircle(40, 90, 15);
      graphics.strokeCircle(40, 90, 15);

      // Body (Main Hump) - Ellipse
      graphics.fillStyle(0xA1887F);
      graphics.fillEllipse(64, 64, 80, 50);
      graphics.strokeEllipse(64, 64, 80, 50);

      // Scales Texture (Cross-hatching on body)
      graphics.lineStyle(2, 0x6D4C41, 0.6);
      for(let i = 30; i < 100; i += 8) {
          // Diagonal lines
          graphics.lineBetween(i, 45, i + 10, 85);
          graphics.lineBetween(i + 10, 45, i, 85);
      }

      // Head
      graphics.fillStyle(0x8D6E63);
      graphics.lineStyle(2, 0x5D4037);
      // Draw head as a rounded triangle pointing right
      graphics.beginPath();
      graphics.moveTo(95, 50);
      graphics.lineTo(120, 64); // Nose
      graphics.lineTo(95, 78);
      graphics.closePath();
      graphics.fillPath();
      graphics.strokePath();

      // Eye
      graphics.fillStyle(0x000000);
      graphics.fillCircle(105, 58, 3);

      // Legs (Stumpy)
      graphics.fillStyle(0x5D4037);
      graphics.fillCircle(45, 85, 8); // Back leg
      graphics.fillCircle(85, 85, 8); // Front leg

      graphics.generateTexture(key, 128, 128);
      graphics.destroy();
  }
}
