import { test, expect } from '@playwright/test';

test('verify hoard circle', async ({ page }) => {
  await page.goto('http://localhost:5173/beans-world/');

  // Wait for canvas
  await page.waitForSelector('canvas');

  // Increase game speed to make things happen faster
  // We can click the '50x' button.
  // Assuming buttons are in the top right.
  // Let's use get_by_text if possible, or assume location.
  // The UIScene creates text buttons.

  // Try to find the '50x' text and click it.
  try {
      await page.getByText('50x').click({ timeout: 2000 });
  } catch (e) {
      console.log('Could not find 50x button, proceeding at normal speed');
  }

  // Wait for some simulation time (e.g., 10 seconds at 50x = 500s game time)
  // This should be enough for beans to find food, get full, form a hoard, and maybe guard.
  await page.waitForTimeout(10000);

  // Take screenshot
  await page.screenshot({ path: 'verification/hoard_circle.png' });
});
