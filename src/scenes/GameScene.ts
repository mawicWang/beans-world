import Phaser from 'phaser';
import Bean, { MoveState } from '../objects/Bean';
import Food from '../objects/Food';
import Cocoon from '../objects/Cocoon';

export default class GameScene extends Phaser.Scene {
  private beans: Bean[] = [];
  private beanGroup!: Phaser.Physics.Arcade.Group;
  private foods: Food[] = [];
  private foodGroup!: Phaser.Physics.Arcade.Group;
  private boundsGraphics!: Phaser.GameObjects.Graphics;

  private isPaused: boolean = false;
  private currentSpeed: number = 1;

  constructor() {
    super('GameScene');
  }

  create() {
    // Create physics group for beans
    this.beanGroup = this.physics.add.group();

    // Create physics group for food
    this.foodGroup = this.physics.add.group();

    // Overlap for eating
    this.physics.add.overlap(this.beanGroup, this.foodGroup, (obj1, obj2) => {
        const bean = obj1 as Bean;
        const food = obj2 as Food;
        bean.eat(food);
    });

    // Collider for physical separation AND reproduction trigger
    // Using processCallback to handle merge logic.
    // If they merge, we return false to skip physical collision response.
    this.physics.add.collider(this.beanGroup, this.beanGroup, undefined, (obj1, obj2) => {
         return this.checkReproductionOverlap(obj1 as Bean, obj2 as Bean);
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

    // Listen for Pause Toggle
    this.game.events.on('TOGGLE_PAUSE', (isPaused: boolean) => {
        this.isPaused = isPaused;
        if (this.isPaused) {
            this.physics.world.pause();
            this.time.paused = true;
            this.tweens.pauseAll();
        } else {
            this.physics.world.resume();
            this.time.paused = false;
            this.tweens.resumeAll();
        }
    });

    // Listen for Speed Change
    this.game.events.on('SET_GAME_SPEED', (speed: number) => {
        this.currentSpeed = speed;
        // Apply speed settings
        this.physics.world.timeScale = 1.0 / speed;
        this.time.timeScale = speed;
        this.tweens.timeScale = speed;
    });

    // Food Spawning Timer
    this.time.addEvent({
        delay: 500,
        callback: this.spawnFood,
        callbackScope: this,
        loop: true
    });
  }

  handleInput(pointer: Phaser.Input.Pointer) {
    if (this.sound instanceof Phaser.Sound.WebAudioSoundManager) {
      if (this.sound.context.state === 'suspended') {
        this.sound.context.resume();
      }
    }

    if (pointer.x > this.scale.width - 150 && pointer.y < 200) {
        return;
    }

    this.spawnBean(pointer.x, pointer.y);
  }

  spawnBean(x?: number, y?: number, startSatiety: number = 80, isAdult: boolean = true) {
    const spawnX = x ?? Phaser.Math.Between(50, this.scale.width - 50);
    const spawnY = y ?? Phaser.Math.Between(50, this.scale.height - 50);
    const bean = new Bean(this, spawnX, spawnY, startSatiety, isAdult);
    this.add.existing(bean);
    this.beans.push(bean);
    this.beanGroup.add(bean);
    bean.setupPhysics();

    this.registry.set('beanCount', this.beans.length);
    this.game.events.emit('UPDATE_BEAN_COUNT', this.beans.length);
  }

  resize(gameSize: Phaser.Structs.Size) {
    this.cameras.main.setViewport(0, 0, gameSize.width, gameSize.height);
    this.physics.world.setBounds(0, 0, gameSize.width, gameSize.height);
    this.drawBounds(gameSize.width, gameSize.height);
  }

  update(_time: number, delta: number) {
    if (this.isPaused) return;

    const scaledDelta = delta * this.currentSpeed;
    const scaledTime = this.time.now;

    this.registry.set('simTime', scaledTime);

    for (let i = this.beans.length - 1; i >= 0; i--) {
        this.beans[i].update(scaledTime, scaledDelta);
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

  private checkReproductionOverlap(bean1: Bean, bean2: Bean): boolean {
      // Check if both are seeking mate
      if (bean1.active && bean2.active &&
          bean1.moveState === MoveState.SEEKING_MATE &&
          bean2.moveState === MoveState.SEEKING_MATE) {

          this.startReproduction(bean1, bean2);
          return false; // Stop physics separation
      }
      return true; // Continue physics separation
  }

  private startReproduction(parent1: Bean, parent2: Bean) {
      // Calculate mid point
      const midX = (parent1.x + parent2.x) / 2;
      const midY = (parent1.y + parent2.y) / 2;

      const totalSatiety = parent1.satiety + parent2.satiety;
      const color1 = parent1.getMainColor();
      const color2 = parent2.getMainColor();

      // Create Cocoon
      const cocoon = new Cocoon(this, midX, midY, totalSatiety, color1, color2);
      this.add.existing(cocoon);

      // Remove parents
      this.removeBean(parent1);
      this.removeBean(parent2);
  }

  private drawBounds(width: number, height: number) {
    if (!this.boundsGraphics) {
      this.boundsGraphics = this.add.graphics();
      this.boundsGraphics.setDepth(-1);
    }
    this.boundsGraphics.clear();

    this.boundsGraphics.lineStyle(4, 0x666666);
    this.boundsGraphics.strokeRect(2, 2, width - 4, height - 4);
  }
}
