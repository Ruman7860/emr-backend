#!/usr/bin/env bash
set -o errexit

pnpm install --frozen-lockfile
pnpm run build  # prisma generate && nest build

# Create project-local cache directory (persists to runtime)
mkdir -p .cache/puppeteer

echo "Installing Chrome into project-local cache..."
npx puppeteer browsers install chrome --path .cache/puppeteer

# Verify
CHROME_PATH=$(find .cache/puppeteer -name chrome -type f | head -n 1)
if [[ -n "$CHROME_PATH" && -x "$CHROME_PATH" ]]; then
    echo "Chrome successfully installed at: $CHROME_PATH"
else
    echo "Error: Chrome not found after install!"
    exit 1
fi