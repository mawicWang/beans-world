import Phaser from 'phaser';
import { Structure } from './Structure';

export class ConstructionSite extends Structure {
  public progress: number = 0;
  public resourcesNeeded: number;
  public buildingType: string;
  private onComplete: () => void;

  constructor(
      scene: Phaser.Scene,
      x: number,
      y: number,
      id: string,
      buildingType: string,
      resourcesNeeded: number,
      onComplete: () => void
  ) {
    super(scene, x, y, id, 100, 50); // Less HP while building
    this.buildingType = buildingType;
    this.resourcesNeeded = resourcesNeeded;
    this.onComplete = onComplete;
  }

  addProgress(amount: number) {
      this.progress += amount;
      if (this.progress >= this.resourcesNeeded) {
          this.progress = this.resourcesNeeded;
          this.completeConstruction();
      }
      this.draw();
  }

  private completeConstruction() {
      // Logic to replace this site with the actual building
      this.onComplete();
      this.destroy(); // Remove self
  }

  protected draw() {
    this.graphics.clear();

    // Calculate alpha/visuals based on progress
    const alpha = 0.3 + (this.progress / this.resourcesNeeded) * 0.7;

    // Blueprint / Scaffolding look
    this.graphics.lineStyle(2, 0x3498db, 1.0); // Blueprint Blue
    this.graphics.strokeRect(-25, -25, 50, 50);

    // Fill based on progress
    this.graphics.fillStyle(0x3498db, alpha);
    const fillHeight = 50 * (this.progress / this.resourcesNeeded);
    this.graphics.fillRect(-25, 25 - fillHeight, 50, fillHeight);

    // Text (Optional, might be too small)
    // const percent = Math.floor((this.progress / this.resourcesNeeded) * 100);
  }
}
