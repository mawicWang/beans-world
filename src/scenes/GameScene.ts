import Phaser from 'phaser';
import Bean from '../objects/Bean';
import Food from '../objects/Food';

export default class GameScene extends Phaser.Scene {
  private beans: Bean[] = [];
  private beanGroup!: Phaser.Physics.Arcade.Group;
  private foods: Food[] = [];
  private foodGroup!: Phaser.Physics.Arcade.Group;
  private boundsGraphics!: Phaser.GameObjects.Graphics;

  constructor() {
    super('GameScene');
  }

  create() {
    // Create physics group for beans
    this.beanGroup = this.physics.add.group();
    this.physics.add.collider(this.beanGroup, this.beanGroup);

    // Create physics group for food
    this.foodGroup = this.physics.add.group();

    // Overlap for eating
    this.physics.add.overlap(this.beanGroup, this.foodGroup, (obj1, obj2) => {
        const bean = obj1 as Bean;
        const food = obj2 as Food;
        bean.eat(food);
    });

    // Draw visual bounds
    this.drawBounds(this.scale.width, this.scale.height);
    this.physics.world.setBounds(0, 0, this.scale.width, this.scale.height);

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

    // Food Spawning Timer
    this.time.addEvent({
        delay: 3000,
        callback: this.spawnFood,
        callbackScope: this,
        loop: true
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
    this.beanGroup.add(bean);
    bean.setupPhysics();

    // Notify UI of new count via registry
    this.registry.set('beanCount', this.beans.length);
    this.game.events.emit('UPDATE_BEAN_COUNT', this.beans.length);
  }

  resize(gameSize: Phaser.Structs.Size) {
    this.cameras.main.setViewport(0, 0, gameSize.width, gameSize.height);
    this.physics.world.setBounds(0, 0, gameSize.width, gameSize.height);
    this.drawBounds(gameSize.width, gameSize.height);
  }

  update(time: number, delta: number) {
    // Iterate backwards to safely handle removals during update
    for (let i = this.beans.length - 1; i >= 0; i--) {
        this.beans[i].update(time, delta);
    }
  }

  public getBeans(): Bean[] {
    return this.beans;
  }

  public getFoods(): Food[] {
      return this.foods;
  }

  public spawnFood() {
      const padding = 50;
      const x = Phaser.Math.Between(padding, this.scale.width - padding);
      const y = Phaser.Math.Between(padding, this.scale.height - padding);

      const typeRoll = Math.random();
      let satiety = 1;
      if (typeRoll > 0.9) satiety = 5;
      else if (typeRoll > 0.6) satiety = 2;

      const food = new Food(this, x, y, satiety);
      this.add.existing(food);
      this.foods.push(food);
      this.foodGroup.add(food);
      food.setupPhysics();
  }

  public removeFood(food: Food) {
      const index = this.foods.indexOf(food);
      if (index > -1) {
          this.foods.splice(index, 1);
      }
      this.foodGroup.remove(food);
      food.destroy();
  }

  public removeBean(bean: Bean) {
      const index = this.beans.indexOf(bean);
      if (index > -1) {
          this.beans.splice(index, 1);
      }
      this.beanGroup.remove(bean);
      bean.destroy();

      this.registry.set('beanCount', this.beans.length);
      this.game.events.emit('UPDATE_BEAN_COUNT', this.beans.length);
  }

  private drawBounds(width: number, height: number) {
    if (!this.boundsGraphics) {
      this.boundsGraphics = this.add.graphics();
      // Ensure it's drawn below beans but above background
      this.boundsGraphics.setDepth(-1);
    }
    this.boundsGraphics.clear();

    // Draw a border around the screen
    // Inset by half line width (2px) so the 4px stroke is fully within bounds
    this.boundsGraphics.lineStyle(4, 0x666666);
    this.boundsGraphics.strokeRect(2, 2, width - 4, height - 4);
  }
}
