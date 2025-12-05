import Phaser from 'phaser';
import { IBean, BeanRole } from './BeanTypes';
import { GameConfig } from '../../config/GameConfig';

export class BeanRenderer {
    private bean: IBean;
    private scene: Phaser.Scene;
    private bodyGraphics: Phaser.GameObjects.Graphics;
    private statusPanel: Phaser.GameObjects.Container;
    private statusText: Phaser.GameObjects.Text;
    private mainColor: number = 0xffffff;

    constructor(bean: IBean, scene: Phaser.Scene, showStats: boolean) {
        this.bean = bean;
        this.scene = scene;

        this.bodyGraphics = scene.add.graphics();
        this.bean.add(this.bodyGraphics);

        // Status Panel
        this.statusPanel = scene.add.container(25, -25);
        const panelBg = scene.add.rectangle(0, 0, 80, 50, 0x000000, 0.6);
        this.statusText = scene.add.text(0, 0, '', {
            fontSize: '10px',
            color: '#fff',
            align: 'left'
        }).setOrigin(0.5);

        this.statusPanel.add([panelBg, this.statusText]);
        this.statusPanel.setVisible(showStats);
        this.bean.add(this.statusPanel);

        // Listeners
        const toggleHandler = (visible: boolean) => {
            this.statusPanel.setVisible(visible);
        };
        scene.game.events.on('TOGGLE_BEAN_STATS', toggleHandler);

        // Clean up
        this.bean.once('destroy', () => {
             scene.game.events.off('TOGGLE_BEAN_STATS', toggleHandler);
        });
    }

    public update() {
        this.statusText.setText(this.getStatsText());
    }

    public draw(tailPos: Phaser.Math.Vector2) {
        // Calculate local tail
        const localTail = new Phaser.Math.Vector2();
        this.bean.getLocalPoint(tailPos.x, tailPos.y, localTail);
        this.drawJelly(localTail);
    }

    private updateVisuals() {
        const min = GameConfig.BEAN.MIN_ATTR;
        const max = GameConfig.BEAN.MAX_ATTR;

        const red = Phaser.Math.Clamp(Phaser.Math.Linear(50, 255, (this.bean.strength - min) / (max - min)), 0, 255);
        const blue = Phaser.Math.Clamp(Phaser.Math.Linear(50, 255, (this.bean.speed - min) / (max - min)), 0, 255);
        const green = 100;

        this.mainColor = Phaser.Display.Color.GetColor(red, green, blue);
    }

    public getMainColor(): number {
        return this.mainColor;
    }

    private getStatsText(): string {
        return `Sat: ${Math.floor(this.bean.satiety)}/${this.bean.maxSatiety}\n` +
               `Str: ${this.bean.strength.toFixed(1)}\n` +
               `Spd: ${this.bean.speed.toFixed(1)}\n` +
               `Con: ${this.bean.constitution.toFixed(1)}`;
    }

    private drawJelly(tailOffset: Phaser.Math.Vector2) {
        this.updateVisuals();
        this.bodyGraphics.clear();

        const alpha = Phaser.Math.Clamp(0.4 + (this.bean.satiety / this.bean.maxSatiety) * 0.6, 0.4, 1.0);
        const zoom = this.scene.cameras.main.zoom;
        const isZoomedOut = zoom < 0.5;

        this.bodyGraphics.fillStyle(this.mainColor, alpha);
        this.bodyGraphics.lineStyle(2, 0x1a5f8a, alpha);

        let headRadius = this.bean.currentRadius;

        if (isZoomedOut) {
            this.bodyGraphics.fillCircle(0, 0, this.bean.currentRadius);
            this.bodyGraphics.strokeCircle(0, 0, this.bean.currentRadius);
        } else {
            // Detailed draw
            let dist = tailOffset.length();
            if (dist < 0.5) dist = 0;
            const stretchFactor = Math.min(dist, 100) / 100;
            headRadius = this.bean.currentRadius * (1 + stretchFactor * 0.2);
            const tailRadius = this.bean.currentRadius * (1 - stretchFactor * 0.7);

            const hx = 0; const hy = 0;
            const tx = tailOffset.x; const ty = tailOffset.y;
            const angle = Phaser.Math.Angle.Between(tx, ty, hx, hy);
            let offsetAngle = Math.PI / 2;
            const rDiff = headRadius - tailRadius;
            if (dist > Math.abs(rDiff)) {
                offsetAngle = Math.acos(rDiff / dist);
            }

            const h2x = hx + Math.cos(angle - offsetAngle) * headRadius;
            const h2y = hy + Math.sin(angle - offsetAngle) * headRadius;
            const t1x = tx + Math.cos(angle + offsetAngle) * tailRadius;
            const t1y = ty + Math.sin(angle + offsetAngle) * tailRadius;

            this.bodyGraphics.beginPath();
            this.bodyGraphics.arc(hx, hy, headRadius, angle - offsetAngle, angle + offsetAngle, false);
            this.bodyGraphics.lineTo(t1x, t1y);
            this.bodyGraphics.arc(tx, ty, tailRadius, angle + offsetAngle, angle - offsetAngle, false);
            this.bodyGraphics.lineTo(h2x, h2y);
            this.bodyGraphics.closePath();
            this.bodyGraphics.fillPath();
            this.bodyGraphics.strokePath();
        }

        // Hoard Lines
        if (this.bean.hoardId && this.bean.showHoardLines && !isZoomedOut) {
             const hoardLocation = this.bean.getHoardLocation();
             if (hoardLocation) {
                this.bodyGraphics.lineStyle(2, 0xffffff, 0.5);
                const start = new Phaser.Math.Vector2(hoardLocation.x - this.bean.x, hoardLocation.y - this.bean.y);
                const end = new Phaser.Math.Vector2(0, 0);
                const dist = start.distance(end);
                const dashLen = 10;
                const gapLen = 5;
                const steps = dist / (dashLen + gapLen);
                const dir = end.clone().subtract(start).normalize();

                this.bodyGraphics.beginPath();
                for (let i = 0; i < steps; i++) {
                    const s = start.clone().add(dir.clone().scale(i * (dashLen + gapLen)));
                    const e = s.clone().add(dir.clone().scale(dashLen));
                    if (s.distance(start) >= dist) break;
                    this.bodyGraphics.moveTo(s.x, s.y);
                    if (e.distance(start) > dist) this.bodyGraphics.lineTo(end.x, end.y);
                    else this.bodyGraphics.lineTo(e.x, e.y);
                }
                this.bodyGraphics.strokePath();
             }
        }

        // Role Icons / Hats
        this.drawRoleIndicator(headRadius);

        // Icons
        const iconY = -headRadius - 15;
        if (this.bean.combatTimer > 0) {
            this.bodyGraphics.lineStyle(2, 0xff0000, 1);
            this.bodyGraphics.beginPath();
            const s = 6;
            this.bodyGraphics.moveTo(-s, iconY - s);
            this.bodyGraphics.lineTo(-s/2, iconY);
            this.bodyGraphics.lineTo(-s, iconY + s);
            this.bodyGraphics.moveTo(s, iconY - s);
            this.bodyGraphics.lineTo(s/2, iconY);
            this.bodyGraphics.lineTo(s, iconY + s);
            this.bodyGraphics.moveTo(0, iconY - s);
            this.bodyGraphics.lineTo(0, iconY + s);
            this.bodyGraphics.strokePath();
        } else if (this.bean.isGuarding) {
            this.bodyGraphics.fillStyle(0x4a90e2, 1);
            this.bodyGraphics.lineStyle(1, 0xffffff, 1);
            const s = 8;
            this.bodyGraphics.beginPath();
            this.bodyGraphics.moveTo(-s, iconY - s);
            this.bodyGraphics.lineTo(s, iconY - s);
            this.bodyGraphics.lineTo(s, iconY);
            this.bodyGraphics.lineTo(0, iconY + s*1.5);
            this.bodyGraphics.lineTo(-s, iconY);
            this.bodyGraphics.closePath();
            this.bodyGraphics.fillPath();
            this.bodyGraphics.strokePath();
            this.bodyGraphics.beginPath();
            this.bodyGraphics.moveTo(-s/2, iconY - s/2);
            this.bodyGraphics.lineTo(s/2, iconY + s/4);
            this.bodyGraphics.strokePath();
        } else if (this.bean.lockedPartner || this.bean.isSeekingMate) {
             this.bodyGraphics.fillStyle(0xff69b4, 1);
             this.bodyGraphics.lineStyle(1, 0xffffff, 1);
             const s = 4;
             this.bodyGraphics.fillCircle(-s, iconY - s/2, s);
             this.bodyGraphics.strokeCircle(-s, iconY - s/2, s);
             this.bodyGraphics.fillCircle(s, iconY - s/2, s);
             this.bodyGraphics.strokeCircle(s, iconY - s/2, s);
             this.bodyGraphics.beginPath();
             this.bodyGraphics.moveTo(-s * 2, iconY - s/2);
             this.bodyGraphics.lineTo(0, iconY + s * 2.5);
             this.bodyGraphics.lineTo(s * 2, iconY - s/2);
             this.bodyGraphics.fillPath();
             this.bodyGraphics.beginPath();
             this.bodyGraphics.moveTo(-s * 1.8, iconY);
             this.bodyGraphics.lineTo(0, iconY + s * 2.5);
             this.bodyGraphics.lineTo(s * 1.8, iconY);
             this.bodyGraphics.strokePath();
        }

        // Carried Food
        if (this.bean.carriedFoodData) {
            let color = 0xffffff;
            if (this.bean.carriedFoodData.satiety === 1) color = 0x81C784;
            else if (this.bean.carriedFoodData.satiety === 2) color = 0xFFD54F;
            else if (this.bean.carriedFoodData.satiety === 5) color = 0xE57373;

            this.bodyGraphics.fillStyle(color, 1);
            this.bodyGraphics.fillCircle(headRadius * 0.5, -headRadius * 0.5, headRadius * 0.4);
        }

        const indicatorSize = 3;
        const indicatorOffset = headRadius * 0.6;
        const ix = Math.cos(this.bean.facingAngle) * indicatorOffset;
        const iy = Math.sin(this.bean.facingAngle) * indicatorOffset;
        this.bodyGraphics.fillStyle(0x000000, 0.8);
        this.bodyGraphics.fillCircle(ix, iy, indicatorSize);
        this.bodyGraphics.fillStyle(0xffffff, 0.4);
        this.bodyGraphics.fillCircle(-headRadius*0.3, -headRadius*0.3, headRadius*0.25);
    }

    public playMoveSound() {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const soundManager = this.scene.sound as Phaser.Sound.WebAudioSoundManager;
        if (!soundManager.context) return;
        const ctx = soundManager.context;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        const now = ctx.currentTime;
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start();
        osc.stop(now + 0.15);
    }

    private drawRoleIndicator(headRadius: number) {
        if (!this.bean.role) return;

        const yOffset = -headRadius * 0.8;

        if (this.bean.role === BeanRole.GUARD) {
            // Helmet (Silver/Grey)
            this.bodyGraphics.fillStyle(0x95a5a6, 1);
            this.bodyGraphics.lineStyle(1, 0x7f8c8d, 1);
            this.bodyGraphics.beginPath();
            this.bodyGraphics.arc(0, yOffset, headRadius * 0.7, Math.PI, 0, false);
            this.bodyGraphics.lineTo(headRadius * 0.7, yOffset + 5);
            this.bodyGraphics.lineTo(-headRadius * 0.7, yOffset + 5);
            this.bodyGraphics.closePath();
            this.bodyGraphics.fillPath();
            this.bodyGraphics.strokePath();
        } else if (this.bean.role === BeanRole.WORKER) {
            // Hard Hat (Yellow/Orange)
            this.bodyGraphics.fillStyle(0xf39c12, 1);
            this.bodyGraphics.lineStyle(1, 0xe67e22, 1);
            this.bodyGraphics.beginPath();
            this.bodyGraphics.arc(0, yOffset, headRadius * 0.6, Math.PI, 0, false);
            this.bodyGraphics.lineTo(headRadius * 0.8, yOffset + 3);
            this.bodyGraphics.lineTo(-headRadius * 0.8, yOffset + 3);
            this.bodyGraphics.closePath();
            this.bodyGraphics.fillPath();
            this.bodyGraphics.strokePath();
        } else if (this.bean.role === BeanRole.EXPLORER) {
            // Bandana/Cap (Green/Brown)
            this.bodyGraphics.fillStyle(0x27ae60, 1);
            this.bodyGraphics.lineStyle(1, 0x2ecc71, 1);
            this.bodyGraphics.beginPath();
            this.bodyGraphics.moveTo(-headRadius * 0.6, yOffset - 2);
            this.bodyGraphics.lineTo(headRadius * 0.6, yOffset - 2);
            this.bodyGraphics.lineTo(0, yOffset - headRadius * 0.8);
            this.bodyGraphics.closePath();
            this.bodyGraphics.fillPath();
            this.bodyGraphics.strokePath();
        }
    }
}
