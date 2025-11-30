import Phaser from 'phaser';
import Bean from '../objects/Bean';

export default class GameScene extends Phaser.Scene {
  private beans: Bean[] = [];

  constructor() {
    super('GameScene');
  }

  create() {
    // Initial random beans
    for (let i = 0; i < 5; i++) {
      this.spawnBean();
    }

    // Handle window resize
    this.scale.on('resize', this.resize, this);
  }

  spawnBean() {
    const x = Phaser.Math.Between(50, this.scale.width - 50);
    const y = Phaser.Math.Between(50, this.scale.height - 50);
    const bean = new Bean(this, x, y);
    this.add.existing(bean);
    this.beans.push(bean);
  }

  resize(gameSize: Phaser.Structs.Size) {
    this.cameras.main.setViewport(0, 0, gameSize.width, gameSize.height);
  }

  update(time: number, delta: number) {
    this.beans.forEach(bean => bean.update(time, delta));
  }
}
