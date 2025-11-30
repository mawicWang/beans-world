import Phaser from 'phaser';

export default class UIScene extends Phaser.Scene {
  private beanCountText!: Phaser.GameObjects.Text;
  private addButtonContainer!: Phaser.GameObjects.Container;
  private toggleStatsButtonContainer!: Phaser.GameObjects.Container;
  private statsVisible: boolean = false;

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

    // Add Buttons
    this.createAddButton();
    this.createToggleStatsButton();

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

  private createToggleStatsButton() {
    this.toggleStatsButtonContainer = this.add.container(0, 0);

    const width = 120;
    const height = 50;
    const bg = this.add.rectangle(0, 0, width, height, 0x2196F3); // Blue button
    bg.setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
          this.statsVisible = !this.statsVisible;
          this.game.events.emit('TOGGLE_BEAN_STATS', this.statsVisible);
          bg.setFillStyle(this.statsVisible ? 0x1976D2 : 0x2196F3);
      })
      .on('pointerover', () => bg.setFillStyle(this.statsVisible ? 0x1565C0 : 0x42A5F5))
      .on('pointerout', () => bg.setFillStyle(this.statsVisible ? 0x1976D2 : 0x2196F3));

    const text = this.add.text(0, 0, 'Stats', {
        fontSize: '18px',
        color: '#ffffff',
        fontStyle: 'bold'
    });
    text.setOrigin(0.5);

    this.toggleStatsButtonContainer.add([bg, text]);
  }

  resize(gameSize: Phaser.Structs.Size) {
    // Position button at top-right with some padding
    if (this.addButtonContainer) {
        this.addButtonContainer.setPosition(gameSize.width - 80, 45);
    }
    if (this.toggleStatsButtonContainer) {
        this.toggleStatsButtonContainer.setPosition(gameSize.width - 80, 105);
    }
  }
}
