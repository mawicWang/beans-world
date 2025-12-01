import Phaser from 'phaser';
import Bean, { MoveState } from '../objects/Bean';
import Cocoon from '../objects/Cocoon';

export default class DevScene extends Phaser.Scene {
  private beans: Bean[] = [];
  private beanGroup!: Phaser.Physics.Arcade.Group;
  private simTime: number = 0;

  constructor() {
    super('DevScene');
  }

  create() {
    // Setup Physics
    this.beanGroup = this.physics.add.group();
    this.physics.add.collider(this.beanGroup, this.beanGroup);

    // Overlap for Reproduction Trigger
    this.physics.add.overlap(this.beanGroup, this.beanGroup, (obj1, obj2) => {
        this.checkReproductionOverlap(obj1 as Bean, obj2 as Bean);
    });

    this.physics.world.setBounds(0, 0, this.scale.width, this.scale.height);

    // Spawn two beans for testing
    // Place them somewhat apart so we can see the seeking behavior
    this.spawnBean(300, 300);
    this.spawnBean(600, 500);

    // Helper text
    this.add.text(10, 10, 'Dev Mode: Reproduction Test', { color: '#000', fontSize: '16px' });
  }

  update(_time: number, delta: number) {
    this.simTime += delta;

    // Update beans
    for (let i = this.beans.length - 1; i >= 0; i--) {
        if (this.beans[i].scene) {
            this.beans[i].update(this.simTime, delta, true);
        }
    }
  }

  spawnBean(x: number, y: number, satiety: number = 100, isAdult: boolean = true) {
    const bean = new Bean(this, x, y, satiety, isAdult);
    this.add.existing(bean);
    this.beans.push(bean);
    this.beanGroup.add(bean);
    bean.setupPhysics();
  }

  public getBeans(): Bean[] {
    return this.beans;
  }

  public getFoods(): any[] {
      return [];
  }

  public removeBean(bean: Bean) {
      const index = this.beans.indexOf(bean);
      if (index > -1) {
          this.beans.splice(index, 1);
      }
      this.beanGroup.remove(bean);
      bean.destroy();
  }

  private checkReproductionOverlap(bean1: Bean, bean2: Bean) {
      if (!bean1.active || !bean2.active) return;

      const readyStates = [MoveState.SEEKING_MATE, MoveState.MOVING_TO_PARTNER];

      const b1Ready = readyStates.includes(bean1.moveState);
      const b2Ready = readyStates.includes(bean2.moveState);

      if (b1Ready && b2Ready) {
          // Check Locking Compatibility
          if (bean1.lockedPartner && bean1.lockedPartner !== bean2) return;
          if (bean2.lockedPartner && bean2.lockedPartner !== bean1) return;

          console.log(`Reproduction triggered between beans at ${bean1.x},${bean1.y}`);
          this.startReproduction(bean1, bean2);
      }
  }

  private startReproduction(parent1: Bean, parent2: Bean) {
      const midX = (parent1.x + parent2.x) / 2;
      const midY = (parent1.y + parent2.y) / 2;
      const totalSatiety = parent1.satiety + parent2.satiety;
      const color1 = parent1.getMainColor();
      const color2 = parent2.getMainColor();

      const parentsAttributes = {
          strength: [parent1.strength, parent2.strength],
          speed: [parent1.speed, parent2.speed],
          constitution: [parent1.constitution, parent2.constitution]
      };

      console.log('Spawning Cocoon at', midX, midY);
      const cocoon = new Cocoon(this, midX, midY, totalSatiety, color1, color2, parentsAttributes);
      this.add.existing(cocoon);

      this.removeBean(parent1);
      this.removeBean(parent2);
  }
}
