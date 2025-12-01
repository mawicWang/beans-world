import Phaser from 'phaser';
import Bean, { MoveState } from '../objects/Bean';

export default class CollisionTestScene extends Phaser.Scene {
  private beans: Bean[] = [];
  private beanGroup!: Phaser.Physics.Arcade.Group;

  constructor() {
    super('CollisionTestScene');
  }

  create() {
    this.beanGroup = this.physics.add.group();
    this.physics.add.collider(this.beanGroup, this.beanGroup);

    // Add boundaries so they don't fly off
    this.physics.world.setBounds(0, 0, this.scale.width, this.scale.height);

    // Create Bean 1 on the left, moving right
    const bean1 = new Bean(this, 100, 300, 100, true);
    this.add.existing(bean1);
    this.beans.push(bean1);
    this.beanGroup.add(bean1);
    bean1.setupPhysics();

    // Create Bean 2 on the right, moving left
    const bean2 = new Bean(this, 700, 300, 100, true);
    this.add.existing(bean2);
    this.beans.push(bean2);
    this.beanGroup.add(bean2);
    bean2.setupPhysics();

    // Force them to target each other's start positions immediately
    // We need a way to override the random target selection logic temporarily,
    // or we just set the target manually every frame or inject it.
    // For now, let's wait a frame for them to initialize, then force targets.

    this.time.delayedCall(100, () => {
        // We access private property moveTarget via 'any' cast for testing
        (bean1 as any).moveTarget = new Phaser.Math.Vector2(700, 300);
        (bean1 as any).moveState = MoveState.CHARGING;
        (bean1 as any).stateTimer = 5000; // Long charge duration
        (bean1 as any).facingAngle = 0; // Face right

        (bean2 as any).moveTarget = new Phaser.Math.Vector2(100, 300);
        (bean2 as any).moveState = MoveState.CHARGING;
        (bean2 as any).stateTimer = 5000;
        (bean2 as any).facingAngle = Math.PI; // Face left
    });

    // Add visual marker for collision point
    this.add.circle(400, 300, 5, 0xff0000);
  }

  update(time: number, delta: number) {
      // Force update logic for beans
      for (const bean of this.beans) {
          bean.update(time, delta, true);

          // Constantly re-enforce the head-on collision path to simulate the 'stubborn' behavior
          // if they drift.
          if (bean.x < 350) { // Bean 1
               const target = new Phaser.Math.Vector2(700, 300);
               (bean as any).moveTarget = target;
               // We only set angle if we are not handling avoidance yet,
               // but the bug is that they blindly follow the angle.
               // So let's NOT force angle every frame, but force target.
               // The Bean.update logic calculates angle based on target + separation.
          } else if (bean.x > 450) { // Bean 2
               const target = new Phaser.Math.Vector2(100, 300);
               (bean as any).moveTarget = target;
          }
      }
  }

  // Mock methods required by Bean
  public getBeans(): Bean[] {
      return this.beans;
  }
  public getFoods(): any[] {
      return [];
  }
  public removeBean(_bean: Bean) {}
  public removeFood(_food: any) {}
}
