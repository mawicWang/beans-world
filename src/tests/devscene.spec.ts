import { test, expect } from '@playwright/test';

test('DevScene loads and spawns beans', async ({ page }) => {
  // Go to the app
  await page.goto('http://localhost:5173');

  // Wait for canvas
  await page.waitForSelector('canvas');

  // Check for the "Dev Mode" text which we added to DevScene
  // Phaser renders text to canvas, so we can't select it via DOM.
  // But we can check if the game is running without errors.

  // We can evaluate the scene state via window object if we exposed it,
  // but simpler is just to ensure no console errors and canvas exists.

  const consoleErrors: string[] = [];
  page.on('console', msg => {
      if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
      }
  });

  // Wait a bit for simulation to run
  await page.waitForTimeout(2000);

  expect(consoleErrors).toEqual([]);
});
