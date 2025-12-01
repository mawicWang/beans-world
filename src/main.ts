import Phaser from 'phaser';
import GameScene from './scenes/GameScene';
import UIScene from './scenes/UIScene';
import DevScene from './scenes/DevScene';
// import CollisionTestScene from './scenes/CollisionTestScene';

// Use a simple flag or URL param to switch modes
const useDevScene = false; // Hardcode for this task, or use urlParams.has('dev');

const sceneList = useDevScene ? [DevScene] : [GameScene, UIScene];

// const sceneList = [CollisionTestScene]; // For debugging collision

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  parent: 'app',
  backgroundColor: '#D3D3D3', // Light gray background
  scene: sceneList,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0, x: 0 }, // Top down game, no gravity
      debug: false
    }
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  // Prevent default context menu on right click/long press
  disableContextMenu: true,
  render: {
    pixelArt: false,
    antialias: true,
  }
};

new Phaser.Game(config);
