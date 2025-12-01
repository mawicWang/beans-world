import Phaser from 'phaser';

export default class Food extends Phaser.GameObjects.Arc {
    public satiety: number;
    public attributeBonus?: { type: 'strength' | 'speed' | 'constitution', value: number };

    constructor(scene: Phaser.Scene, x: number, y: number, satiety: number, attributeBonus?: { type: 'strength' | 'speed' | 'constitution', value: number }) {
        let radius = 5;
        let color = 0xffffff;

        // Visuals based on satiety value
        switch (satiety) {
            case 1:
                radius = 5;
                color = 0x81C784; // Green
                break;
            case 2:
                radius = 8;
                color = 0xFFD54F; // Amber
                break;
            case 5:
                radius = 12;
                color = 0xE57373; // Red
                break;
            default:
                radius = 5;
                color = 0xffffff;
        }

        super(scene, x, y, radius, 0, 360, false, color, 1);
        this.setStrokeStyle(1, 0x000000, 0.5);

        this.satiety = satiety;
        this.attributeBonus = attributeBonus;

        if (this.attributeBonus) {
            // Visual indicator for special food
            this.setStrokeStyle(2, 0xffffff, 1.0);
        }
    }

    setupPhysics() {
        if (!this.body) {
             this.scene.physics.add.existing(this);
        }
        const body = this.body as Phaser.Physics.Arcade.Body;
        body.setCircle(this.radius);
        body.setOffset(0, 0); // Arcs are centered? No, Arc origin is 0.5, 0.5 usually?
        // Phaser Shapes origin is (0,0) by default?
        // Arc: x, y is the center.
        // Body: top-left.
        // Let's verify arc body placement. Usually requires setOffset(-radius, -radius) if origin is center.

        // Actually for Arc, the display origin is usually the center.
        // The body is created at x - width/2, y - height/2.
        // Let's rely on visual debugging or standard behavior.
        // If x,y is center, body needs to be centered.

        body.setCircle(this.radius);
        // Default body is square of width/height.
        // setCircle(r) sets radius, but offset needs to center it.
        // Usually: body.setCircle(radius); is enough if the sprite size matches.
        // But Arc size is radius.

        // Let's wait to see.
    }
}
