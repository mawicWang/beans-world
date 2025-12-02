import Phaser from 'phaser';
import { SurvivalStrategy } from './Bean';

export default class Cocoon extends Phaser.GameObjects.Container {
  private totalSatiety: number;
  private readonly HATCH_DELAY = 2000; // Time to wait AFTER growth finishes
  private readonly GROWTH_DURATION = 4000;
  private bodyGraphics: Phaser.GameObjects.Graphics;
  private mainColor: number;
  private baseRadius: number = 13; // Slightly smaller than Adult Bean (15)
  private parentsAttributes: { strength: number[], speed: number[], constitution: number[] };
  private parentsStrategies: SurvivalStrategy[];
  public inheritedHoardId: string | null;

  constructor(
      scene: Phaser.Scene,
      x: number,
      y: number,
      totalSatiety: number,
      color1: number,
      color2: number,
      parentsAttributes: { strength: number[], speed: number[], constitution: number[] },
      inheritedHoardId: string | null = null,
      parentsStrategies: SurvivalStrategy[] = []
    ) {
    super(scene, x, y);

    this.totalSatiety = totalSatiety;
    this.parentsAttributes = parentsAttributes;
    this.inheritedHoardId = inheritedHoardId;
    this.parentsStrategies = parentsStrategies;

    // Mix the colors of the parents
    this.mainColor = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(color1),
        Phaser.Display.Color.ValueToColor(color2),
        100,
        50
    ).color;

    this.bodyGraphics = scene.add.graphics();
    this.add(this.bodyGraphics);

    this.drawCocoon();

    // Start Animation Sequence
    this.startAnimations();
  }

  private drawCocoon() {
    this.bodyGraphics.clear();
    // Fill
    this.bodyGraphics.fillStyle(this.mainColor, 1);
    this.bodyGraphics.fillCircle(0, 0, this.baseRadius);

    // Border
    this.bodyGraphics.lineStyle(2, 0xffffff, 0.8);
    this.bodyGraphics.strokeCircle(0, 0, this.baseRadius);
  }

  private startAnimations() {
      // 1. Initial Pop-in (Rapid merge effect)
      this.setScale(0.1);
      this.scene.tweens.add({
          targets: this,
          scaleX: 1,
          scaleY: 1,
          duration: 300,
          ease: 'Back.easeOut',
          onComplete: () => {
              this.startPulseAndGrow();
          }
      });
  }

  private startPulseAndGrow() {
      // 2. Heartbeat Pulse (On the Graphics object, relative to Container)
      // Heartbeat pattern: Pump-pump... Pump-pump...
      // We can use a complex tween or just a simple sine wave
      this.scene.tweens.add({
          targets: this.bodyGraphics,
          scaleX: 1.1,
          scaleY: 1.1,
          duration: 400, // 0.4s expansion
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut' // Smooth throb
      });

      // 3. Growth (On the Container)
      // Target is 1.5x Adult size.
      // Adult is 15. Base is 13.
      // 1.5 * 15 = 22.5.
      // 22.5 / 13 ~= 1.73
      const targetScale = 1.7;

      this.scene.tweens.add({
          targets: this,
          scaleX: targetScale,
          scaleY: targetScale,
          duration: this.GROWTH_DURATION,
          ease: 'Sine.easeInOut',
          onComplete: () => {
              // 4. Wait then Hatch
              this.scene.time.delayedCall(this.HATCH_DELAY, () => {
                  this.hatch();
              });
          }
      });
  }

  private hatch() {
    if (!this.active) return;

    const scene = this.scene as any;

    // "Split into several slightly smaller individuals"
    // Let's randomize between 2 and 4
    const offspringCount = Phaser.Math.Between(2, 4);
    const satietyPerChild = this.totalSatiety / offspringCount;

    for (let i = 0; i < offspringCount; i++) {
        // Spawn with slight offset to avoid immediate overlap issues
        const angle = (Math.PI * 2 * i) / offspringCount;
        const offset = 10 * this.scaleX; // Scale offset by cocoon size
        const spawnX = this.x + Math.cos(angle) * offset;
        const spawnY = this.y + Math.sin(angle) * offset;

        // Calculate Attributes for this child
        const newAttributes = {
            strength: this.mutate(this.average(this.parentsAttributes.strength)),
            speed: this.mutate(this.average(this.parentsAttributes.speed)),
            constitution: this.mutate(this.average(this.parentsAttributes.constitution))
        };

        // Calculate Strategy for this child
        let newStrategy: SurvivalStrategy | undefined;
        if (this.parentsStrategies.length > 0) {
            newStrategy = this.generateStrategy();
        }

        // Spawn child: isAdult = false
        if (scene.spawnBean) {
            scene.spawnBean(spawnX, spawnY, satietyPerChild, false, newAttributes, this.inheritedHoardId, newStrategy);
        }
    }

    this.destroy();
  }

  private generateStrategy(): SurvivalStrategy {
      // 1. Average parents
      const s1 = this.parentsStrategies[0];
      const s2 = this.parentsStrategies[1] || s1; // Fallback if only 1 parent strategy (shouldn't happen)

      const child: any = {};
      const keys = Object.keys(s1) as Array<keyof SurvivalStrategy>;

      // Average values
      for (const key of keys) {
          child[key] = (s1[key] + s2[key]) / 2;
      }

      // 2. Mutate ONE item
      const randomKey = Phaser.Utils.Array.GetRandom(keys) as keyof SurvivalStrategy;

      // Define mutation range based on property
      let mutation = 0;
      if (['wanderLust', 'riskAversion', 'searchRange', 'aggression'].includes(randomKey)) {
          mutation = Phaser.Math.FloatBetween(-0.2, 0.2);
      } else {
          // Thresholds (0-100)
          mutation = Phaser.Math.FloatBetween(-10, 10);
      }

      child[randomKey] += mutation;

      // Clamp values
      if (['wanderLust', 'riskAversion'].includes(randomKey)) {
          child[randomKey] = Phaser.Math.Clamp(child[randomKey], 0, 1);
      } else if (['searchRange', 'aggression'].includes(randomKey)) {
          child[randomKey] = Phaser.Math.Clamp(child[randomKey], 0.2, 3.0);
      } else {
          child[randomKey] = Phaser.Math.Clamp(child[randomKey], 0, 100);
      }

      return child as SurvivalStrategy;
  }

  private average(values: number[]): number {
      const sum = values.reduce((a, b) => a + b, 0);
      return sum / values.length;
  }

  private mutate(value: number): number {
      // Small mutation: +/- 0.5
      const mutation = Phaser.Math.FloatBetween(-0.5, 0.5);
      return value + mutation;
  }
}
