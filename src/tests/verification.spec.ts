import { test, expect } from '@playwright/test';

test('Verify reproduction animation', async ({ page }) => {
  // Go to the app
  await page.goto('http://localhost:5173');

  // Wait for canvas
  await page.waitForSelector('canvas');

  // Wait for them to find each other and mate.
  // This might take a few seconds.
  // We can poll the console logs or just wait.

  console.log('Waiting for mating...');
  await page.waitForTimeout(3000); // 3 seconds should be enough for them to meet from 300,300 to 600,500 at speed 200

  // Take screenshot of Cocoon (hopefully they merged)
  await page.screenshot({ path: 'verification_cocoon.png' });

  // Wait for growth (4s) + hatch delay (2s)
  console.log('Waiting for hatching...');
  await page.waitForTimeout(7000);

  // Take screenshot of offspring
  await page.screenshot({ path: 'verification_offspring.png' });
});
