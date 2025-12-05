import Phaser from 'phaser';

export interface IStructure {
  id: string;
  health: number;
  maxHealth: number;
  takeDamage(amount: number): void;
}

export abstract class Structure extends Phaser.GameObjects.Container implements IStructure {
  public id: string;
  public health: number;
  public maxHealth: number;
  protected graphics: Phaser.GameObjects.Graphics;
  protected bodySize: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    id: string,
    maxHealth: number = 100,
    bodySize: number = 40
  ) {
    super(scene, x, y);
    this.id = id;
    this.maxHealth = maxHealth;
    this.health = maxHealth;
    this.bodySize = bodySize;

    // Create visuals container
    this.graphics = scene.make.graphics({ x: 0, y: 0 });
    this.add(this.graphics);

    // Physics
    scene.physics.add.existing(this, true); // true = static body
    const body = this.body as Phaser.Physics.Arcade.StaticBody;

    // Set circle or rect based on preference. Let's use Circle for now as it's easier to navigate around,
    // but the doc said "Geometric shapes". We can change the visuals but keep the collider simple.
    // Actually, let's use a box collider for structures to distinguish them from beans.
    body.setSize(bodySize, bodySize);
    body.setOffset(-bodySize / 2, -bodySize / 2); // Center the body

    this.draw();
  }

  takeDamage(amount: number) {
    this.health -= amount;
    if (this.health <= 0) {
      this.destroy();
    } else {
        this.draw(); // Redraw health bar if we had one
    }
  }

  protected abstract draw(): void;
}
