import Phaser from 'phaser';
import { IBean, MoveState } from './BeanTypes';
import { GameConfig } from '../../config/GameConfig';

export class BeanPhysics {
    private bean: IBean;
    private scene: Phaser.Scene;

    // Tail Physics
    private tailPos: Phaser.Math.Vector2;
    private tailVelocity: Phaser.Math.Vector2;

    constructor(bean: IBean, scene: Phaser.Scene, x: number, y: number) {
        this.bean = bean;
        this.scene = scene;
        this.tailPos = new Phaser.Math.Vector2(x, y);
        this.tailVelocity = new Phaser.Math.Vector2(0, 0);
    }

    public setupPhysics() {
        if (!this.bean.body) {
            this.scene.physics.world.enable(this.bean);
        }
        const body = this.bean.body as Phaser.Physics.Arcade.Body;
        this.updateBodySize();
        body.setCollideWorldBounds(true);
        body.setDrag(400);
        body.setBounce(0.5);
    }

    public updateBodySize() {
        const body = this.bean.body as Phaser.Physics.Arcade.Body;
        if (body) {
            body.setCircle(this.bean.currentRadius);
            body.setOffset(-this.bean.currentRadius, -this.bean.currentRadius);
        }
    }

    public update(delta: number) {
        const body = this.bean.body as Phaser.Physics.Arcade.Body;
        if (!body) return;

        // Continuous Forces
        if (this.bean.moveState === MoveState.FLEEING) {
             if (this.bean.moveTarget) {
                 const fleeSpeed = 200 + (this.bean.speed * 10);
                 this.scene.physics.velocityFromRotation(this.bean.facingAngle, fleeSpeed, body.velocity);
             }
        } else if (this.bean.moveState === MoveState.BURSTING) {
             this.bean.moveState = MoveState.DECELERATING;
        }

        // Tail Physics
        const dt = delta / 16.66; // Normalize to 60fps

        const headX = this.bean.x;
        const headY = this.bean.y;

        const dx = headX - this.tailPos.x;
        const dy = headY - this.tailPos.y;
        const currentDist = Math.sqrt(dx * dx + dy * dy);

        let ax = 0;
        let ay = 0;

        if (currentDist > GameConfig.BEAN.ROPE_LENGTH) {
            const force = (currentDist - GameConfig.BEAN.ROPE_LENGTH) * GameConfig.BEAN.SPRING_STIFFNESS;
            ax = (dx / currentDist) * force;
            ay = (dy / currentDist) * force;
        } else {
             const force = currentDist * GameConfig.BEAN.SPRING_STIFFNESS;
             if (currentDist > 0) {
                 ax = (dx / currentDist) * force;
                 ay = (dy / currentDist) * force;
             }
        }

        this.tailVelocity.x += ax * dt;
        this.tailVelocity.y += ay * dt;

        this.tailVelocity.x *= Math.pow(GameConfig.BEAN.SPRING_DAMPING, dt);
        this.tailVelocity.y *= Math.pow(GameConfig.BEAN.SPRING_DAMPING, dt);

        this.tailPos.x += this.tailVelocity.x * dt;
        this.tailPos.y += this.tailVelocity.y * dt;
    }

    public getTailPos(): Phaser.Math.Vector2 {
        return this.tailPos;
    }

    public burst() {
        const body = this.bean.body as Phaser.Physics.Arcade.Body;
        if (!body) return;

        const angle = this.bean.facingAngle;
        const burstSpeed = 150 + (this.bean.speed * 10);

        this.scene.physics.velocityFromRotation(angle, burstSpeed, body.velocity);
        this.bean.playMoveSound();
        this.bean.previousState = this.bean.moveState;
        this.bean.moveState = MoveState.BURSTING;
    }
}
