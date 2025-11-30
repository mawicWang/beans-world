import Phaser from 'phaser';
import Bean from '../objects/Bean';

export default class GameScene extends Phaser.Scene {
  private beans: Bean[] = [];

  constructor() {
    super('GameScene');
  }

  create() {
    // Launch UI Scene
    this.scene.launch('UIScene');

    // Initial random beans
    for (let i = 0; i < 5; i++) {
      this.spawnBean();
    }

    // Handle window resize
    this.scale.on('resize', this.resize, this);

    // Handle touch/click to interact and unlock audio
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.handleInput(pointer);
    });

    // Listen for spawn requests from UI
    this.game.events.on('SPAWN_BEAN', () => {
      this.spawnBean();
    });
  }

  handleInput(pointer: Phaser.Input.Pointer) {
    // Unlock audio context if it's suspended (common on mobile)
    if (this.sound instanceof Phaser.Sound.WebAudioSoundManager) {
      if (this.sound.context.state === 'suspended') {
        this.sound.context.resume();
      }
    }

    // Spawn a bean at touch location
    this.spawnBean(pointer.x, pointer.y);
  }

  spawnBean(x?: number, y?: number) {
    const spawnX = x ?? Phaser.Math.Between(50, this.scale.width - 50);
    const spawnY = y ?? Phaser.Math.Between(50, this.scale.height - 50);
    const bean = new Bean(this, spawnX, spawnY);
    this.add.existing(bean);
    this.beans.push(bean);

    // Notify UI of new count via registry
    this.registry.set('beanCount', this.beans.length);
    this.game.events.emit('UPDATE_BEAN_COUNT', this.beans.length);
  }

  resize(gameSize: Phaser.Structs.Size) {
    this.cameras.main.setViewport(0, 0, gameSize.width, gameSize.height);
  }

  update(time: number, delta: number) {
    this.beans.forEach(bean => bean.update(time, delta));
  }
}
