#!/usr/bin/env bash
set -o errexit  # Exit on any error

# Your normal install and build steps
pnpm install --frozen-lockfile
pnpm run build  # prisma generate && nest build

# Ensure the cache directory exists (PUPPETEER_CACHE_DIR is set to /opt/render/.cache/puppeteer)
mkdir -p "$PUPPETEER_CACHE_DIR"

# Always run the install command — it will download only if needed, or use existing if cached properly
echo "Installing/downloading Chrome via puppeteer browsers..."
npx puppeteer browsers install chrome

# Optional: Verify the Chrome executable exists
CHROME_PATH=$(find "$PUPPETEER_CACHE_DIR" -name chrome -type f | head -n 1)
if [[ -n "$CHROME_PATH" && -x "$CHROME_PATH" ]]; then
    echo "Chrome successfully available at: $CHROME_PATH"
else
    echo "Warning: Chrome executable not found after install!"
fi

echo "Chrome install complete. Listing cache contents:"
echo "Chrome install complete. Listing actual cache contents:"
ls -la "$PUPPETEER_CACHE_DIR" || echo "Cache dir exists but listing failed (non-critical)"
ls -la "$PUPPETEER_CACHE_DIR/chrome" || true
ls -la "$PUPPETEER_CACHE_DIR/chrome/linux-"*"/chrome-linux64/" || true