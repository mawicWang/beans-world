import Phaser from 'phaser';

export interface HoardData {
  id: string;
  x: number;
  y: number;
  radius: number;
  // We might want to track how many beans use this hoard to remove it if empty?
  // For now, let's keep it simple. The user didn't ask for GC of hoards,
  // but it's good practice. We can add reference counting later if needed.
}

export default class HoardManager {
  // private scene: Phaser.Scene; // Unused
  private hoards: Map<string, HoardData>;
  private graphics: Phaser.GameObjects.Graphics;
  private idCounter: number = 0;

  constructor(scene: Phaser.Scene) {
    // this.scene = scene;
    this.hoards = new Map();
    this.graphics = scene.add.graphics();
    // Ensure graphics is drawn at a low depth so beans appear on top
    this.graphics.setDepth(-1);
  }

  public registerHoard(x: number, y: number, radius: number): string {
    // Generate a simple ID. In a real game, maybe use UUID.
    const id = `hoard_${++this.idCounter}_${Date.now()}`;

    this.hoards.set(id, {
      id,
      x,
      y,
      radius
    });

    return id;
  }

  public getHoard(id: string): HoardData | undefined {
    return this.hoards.get(id);
  }

  public update() {
    this.graphics.clear();

    // Common styles for all hoards
    this.graphics.fillStyle(0x00ff00, 0.2); // Alpha 0.2
    this.graphics.lineStyle(3, 0x006400, 0.5);

    // Draw each hoard once
    for (const hoard of this.hoards.values()) {
        this.graphics.fillCircle(hoard.x, hoard.y, hoard.radius);
        this.graphics.strokeCircle(hoard.x, hoard.y, hoard.radius);
    }
  }

  public destroy() {
      this.graphics.destroy();
      this.hoards.clear();
  }
}
