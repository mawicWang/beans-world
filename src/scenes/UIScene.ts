import Phaser from 'phaser';
import { VERSION } from '../version';

export default class UIScene extends Phaser.Scene {
  private beanCountText!: Phaser.GameObjects.Text;
  private versionText!: Phaser.GameObjects.Text;
  private addButtonContainer!: Phaser.GameObjects.Container;
  private toggleStatsButtonContainer!: Phaser.GameObjects.Container;
  private speedControlsContainer!: Phaser.GameObjects.Container;
  private statsVisible: boolean = false;

  private isPaused: boolean = false;
  private speedLevel: number = 0; // 0=1x, 1=5x, 2=20x, 3=50x
  private speedValues: number[] = [1, 5, 20, 50];
  private pauseText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;

  constructor() {
    super('UIScene');
  }

  create() {
    // Bean Count Text
    this.beanCountText = this.add.text(20, 20, 'Beans: 0   Time: 00:00', {
      fontSize: '24px',
      color: '#000000',
      fontStyle: 'bold'
    });

    // Version Text
    this.versionText = this.add.text(10, this.scale.height - 20, `v${VERSION}`, {
      fontSize: '14px',
      color: '#000000',
      fontStyle: 'normal'
    });

    // Add Buttons
    this.createAddButton();
    this.createToggleStatsButton();
    this.createSpeedControls();

    // Listen for updates
    this.game.events.on('UPDATE_BEAN_COUNT', (count: number) => {
      this.updateStatusText(count, this.registry.get('simTime') || 0);
    });

    // Also listen to registry for initial sync or other updates
    this.registry.events.on('changedata-beanCount', (_parent: any, value: number) => {
      this.updateStatusText(value, this.registry.get('simTime') || 0);
    });

    // Initial check
    const currentCount = this.registry.get('beanCount') || 0;
    this.updateStatusText(currentCount, 0);

    // Handle resize
    this.scale.on('resize', this.resize, this);
    this.resize(this.scale.gameSize);
  }

  update() {
    const simTime = this.registry.get('simTime') || 0;
    const beanCount = this.registry.get('beanCount') || 0;
    this.updateStatusText(beanCount, simTime);
  }

  private updateStatusText(count: number, timeMs: number) {
      const totalSeconds = Math.floor(timeMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;

      const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      this.beanCountText.setText(`Beans: ${count}   Time: ${timeStr}`);
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

  private createSpeedControls() {
    this.speedControlsContainer = this.add.container(0, 0);

    // Pause Button (Left)
    // Width 55, Height 50
    const pauseBg = this.add.rectangle(-32.5, 0, 55, 50, 0xF44336); // Red-ish for stop/control

    pauseBg.setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
          this.isPaused = !this.isPaused;
          this.game.events.emit('TOGGLE_PAUSE', this.isPaused);
          this.updatePauseVisuals();
      })
      .on('pointerover', () => pauseBg.setFillStyle(0xE57373))
      .on('pointerout', () => pauseBg.setFillStyle(0xF44336));

    this.pauseText = this.add.text(-32.5, 0, '||', {
        fontSize: '20px',
        color: '#ffffff',
        fontStyle: 'bold'
    }).setOrigin(0.5);

    // Speed Button (Right)
    const speedBg = this.add.rectangle(32.5, 0, 55, 50, 0xFF9800); // Orange for speed
    speedBg.setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
          this.speedLevel = (this.speedLevel + 1) % this.speedValues.length;
          const newSpeed = this.speedValues[this.speedLevel];
          this.game.events.emit('SET_GAME_SPEED', newSpeed);
          this.updateSpeedVisuals();
      })
      .on('pointerover', () => speedBg.setFillStyle(0xFFB74D))
      .on('pointerout', () => speedBg.setFillStyle(0xFF9800));

    this.speedText = this.add.text(32.5, 0, '>', {
        fontSize: '24px',
        color: '#ffffff',
        fontStyle: 'bold'
    }).setOrigin(0.5);

    this.speedControlsContainer.add([pauseBg, this.pauseText, speedBg, this.speedText]);
  }

  private updatePauseVisuals() {
      if (this.isPaused) {
          this.pauseText.setText('▶'); // Play symbol when paused (to resume)
          // Maybe change color to Green to indicate "Resume"?
          // But usually toggle buttons keep their identity.
          // Let's stick to symbol change.
      } else {
          this.pauseText.setText('||'); // Pause symbol when running
      }
  }

  private updateSpeedVisuals() {
      const speed = this.speedValues[this.speedLevel];
      this.speedText.setText(`${speed}x`);
  }

  resize(gameSize: Phaser.Structs.Size) {
    // Position button at top-right with some padding
    if (this.addButtonContainer) {
        this.addButtonContainer.setPosition(gameSize.width - 80, 45);
    }
    if (this.toggleStatsButtonContainer) {
        this.toggleStatsButtonContainer.setPosition(gameSize.width - 80, 105);
    }
    if (this.speedControlsContainer) {
        this.speedControlsContainer.setPosition(gameSize.width - 80, 165);
    }
    if (this.versionText) {
        this.versionText.setPosition(10, gameSize.height - 20);
    }
  }
}
