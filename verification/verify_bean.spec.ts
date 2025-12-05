import { test, expect } from '@playwright/test';

test('verify bean rendering', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  // Wait for canvas to be present
  await page.waitForSelector('canvas');
  // Wait a bit for game to start and beans to spawn
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'verification/bean_verification.png' });
});
