#!/bin/bash
set -e

echo "Starting setup for Beans World..."

# Install dependencies
# Using npm install instead of ci to allow for incremental updates which is faster
echo "Installing NPM dependencies..."
npm install

# Install Playwright browsers
# This ensures visual verification tests can run
echo "Installing Playwright browsers..."
npx playwright install

# Build the project
# This catches strict TypeScript errors early (TS6133, etc.) as per AGENTS.md
echo "Building project to verify integrity..."
npm run build

echo "Setup complete! You are ready to develop."
