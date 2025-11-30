# Beans World

A 2D sandbox game built with Phaser, Vite, and TypeScript.


## Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start development server:
   ```bash
   npm run dev
   ```

## Deployment to GitHub Pages

This project is configured to automatically deploy to GitHub Pages using GitHub Actions.

**Important: To ensure the deployed site works correctly, you must configure GitHub Pages to serve from the `gh-pages` branch.**

1. Go to your repository **Settings**.
2. Navigate to **Pages** (under "Code and automation").
3. Under **Build and deployment** > **Source**, select **Deploy from a branch**.
4. Under **Branch**, select **`gh-pages`** and ensure the folder is **`/(root)`**.
5. Click **Save**.

The `gh-pages` branch is automatically updated by the workflow defined in `.github/workflows/deploy.yml` whenever you push to `main`. If you do not see the `gh-pages` branch yet, make a push to `main` to trigger the first deployment.

### Why is my site blank?

If you see a blank page or 404 errors for assets:
- Verify that you are serving from the `gh-pages` branch, NOT the `main` branch.
- The `main` branch contains the source code (TypeScript), which browsers cannot execute directly. The `gh-pages` branch contains the built artifacts (bundled JavaScript).

-
