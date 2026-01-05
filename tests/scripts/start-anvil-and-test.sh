#!/bin/bash
echo "[E2E] Running E2E tests with Anvil"
set -e

# Run E2E tests with Playwright and @wonderland/walletless
UI_MODE=0
ARGS=()
for arg in "$@"; do
  if [ "$arg" == "--ui" ]; then
    UI_MODE=1
  fi
  ARGS+=("$arg")
done

if [ "$UI_MODE" -eq 0 ]; then
  echo "[E2E] Running in headless mode"
  echo "[E2E] Starting Anvil in the background..."
  echo ""
  # Start Anvil in the background
  anvil --load-state ./anvil-safe-state.json --block-time 1 > /dev/null 2>&1 &
  ANVIL_PID=$!

  trap "kill $ANVIL_PID 2>/dev/null || true" EXIT

  # Run Playwright tests (walletless connector auto-signs transactions)
  # On Linux, xvfb-run provides a virtual display for headless browser testing.
  # macOS doesn't need xvfb as it handles headless browsers natively.
  if [ "$(uname)" = "Linux" ] && command -v xvfb-run &> /dev/null; then
    xvfb-run --auto-servernum pnpm exec playwright test "${ARGS[@]}"
  else
    pnpm exec playwright test "${ARGS[@]}"
  fi
else
  # You need to run anvil manually in another terminal if using --ui
  # useful if you need to restart anvil without restarting tests
  echo "[E2E] Running in UI mode (--ui)"
  echo "[E2E] Ensure Anvil is running in another terminal:"
  echo "      pnpm run anvil"
  echo ""
  pnpm exec playwright test "${ARGS[@]}"
fi
