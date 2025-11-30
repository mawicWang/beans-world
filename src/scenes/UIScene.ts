import Phaser from 'phaser';

export default class UIScene extends Phaser.Scene {
  private beanCountText!: Phaser.GameObjects.Text;
  private addButtonContainer!: Phaser.GameObjects.Container;

  constructor() {
    super('UIScene');
  }

  create() {
    // Bean Count Text
    this.beanCountText = this.add.text(20, 20, 'Beans: 0', {
      fontSize: '24px',
      color: '#000000',
      fontStyle: 'bold'
    });

    // Add Bean Button
    this.createAddButton();

    // Listen for updates
    this.game.events.on('UPDATE_BEAN_COUNT', (count: number) => {
      this.beanCountText.setText(`Beans: ${count}`);
    });

    // Also listen to registry for initial sync or other updates
    this.registry.events.on('changedata-beanCount', (_parent: any, value: number) => {
      this.beanCountText.setText(`Beans: ${value}`);
    });

    // Initial check
    const currentCount = this.registry.get('beanCount');
    if (currentCount !== undefined) {
        this.beanCountText.setText(`Beans: ${currentCount}`);
    }

    // Handle resize
    this.scale.on('resize', this.resize, this);
    this.resize(this.scale.gameSize);
  }

  private createAddButton() {
    this.addButtonContainer = this.add.container(0, 0);

    const width = 120;
    const height = 50;
    const bg = this.add.rectangle(0, 0, width, height, 0x4caf50); // Green button
    bg.setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        // Prevent click from propagating to GameScene if they overlap (though separate scenes usually handle input separately)
        // But to be safe, we might want to stop propagation if that was an issue.
        // For now, just emit.
        this.game.events.emit('SPAWN_BEAN');
      })
      .on('pointerover', () => bg.setFillStyle(0x66bb6a))
      .on('pointerout', () => bg.setFillStyle(0x4caf50));

    const text = this.add.text(0, 0, 'Add Bean', {
        fontSize: '18px',
        color: '#ffffff',
        fontStyle: 'bold'
    });
    text.setOrigin(0.5);

    this.addButtonContainer.add([bg, text]);
  }

  resize(gameSize: Phaser.Structs.Size) {
    // Position button at top-right with some padding
    if (this.addButtonContainer) {
        this.addButtonContainer.setPosition(gameSize.width - 80, 45);
    }
  }
}
