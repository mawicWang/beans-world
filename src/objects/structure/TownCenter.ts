import Phaser from 'phaser';
import { Structure } from './Structure';

export class TownCenter extends Structure {
  private resources: Map<string, number>;
  public radius: number; // Keep track of territory radius

  constructor(scene: Phaser.Scene, x: number, y: number, id: string, radius: number) {
    // Town Center is robust (500 HP), Size 60x60
    super(scene, x, y, id, 500, 60);
    this.radius = radius;
    this.resources = new Map();
    this.resources.set('biomass', 0);
  }

  addResource(type: string, amount: number) {
    const current = this.resources.get(type) || 0;
    this.resources.set(type, current + amount);
  }

  getResource(type: string): number {
    return this.resources.get(type) || 0;
  }

  protected draw() {
    this.graphics.clear();

    // Draw Territory (Faint)
    // Note: If we render this here, we might have Z-index issues if we want it below everything.
    // HoardManager previously drew this at depth -1.
    // We can handle the territory rendering in the Manager or here if we set depth correctly.
    // For now, let's just draw the Building.

    // Building Base (Wood/Stone color)
    this.graphics.fillStyle(0x8B4513, 1); // SaddleBrown
    this.graphics.fillRect(-30, -30, 60, 60);

    // Border
    this.graphics.lineStyle(4, 0x000000);
    this.graphics.strokeRect(-30, -30, 60, 60);

    // Center Marker (The "Totem")
    this.graphics.fillStyle(0xFFD700, 1); // Gold
    this.graphics.fillCircle(0, 0, 10);
  }
}
