import { test, expect } from '@playwright/test';

test('verify pangolin statue', async ({ page }) => {
  // 1. Go to the game
  await page.goto('http://localhost:5173/beans-world/');

  // 2. Wait for canvas
  await page.waitForSelector('canvas');

  // 3. Wait a bit for game to initialize
  await page.waitForTimeout(2000);

  // 4. We need to move the camera to the center (1500, 1500)
  // The camera starts at 1500, 1500 by default in GameScene.create():
  // this.cameras.main.centerOn(this.WORLD_WIDTH / 2, this.WORLD_HEIGHT / 2);
  // So the statue should be visible immediately in the center.

  // 5. Take a screenshot
  await page.screenshot({ path: 'verification/pangolin_statue.png' });
});
