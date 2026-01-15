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
  echo "[E2E] Starting Anvil instances in the background..."
  echo ""

  # Start Anvil 1 (chain 31337) on port 8545
  anvil --load-state ./anvil-safe-state.json --block-time 1 --chain-id 31337 --port 8545 > /dev/null 2>&1 &
  ANVIL_PID_1=$!

  # Start Anvil 2 (chain 31338) on port 8546 for multi-chain E2E testing
  anvil --load-state ./anvil-safe-state.json --block-time 1 --chain-id 31338 --port 8546 > /dev/null 2>&1 &
  ANVIL_PID_2=$!

  # Cleanup function to kill both instances
  trap "kill $ANVIL_PID_1 $ANVIL_PID_2 2>/dev/null || true" EXIT

  # Wait for both to be ready
  sleep 2

  # Run Playwright tests (walletless connector auto-signs transactions)
  # On Linux, xvfb-run provides a virtual display for headless browser testing.
  # macOS doesn't need xvfb as it handles headless browsers natively.
  if [ "$(uname)" = "Linux" ] && command -v xvfb-run &> /dev/null; then
    xvfb-run --auto-servernum pnpm exec playwright test "${ARGS[@]}"
  else
    pnpm exec playwright test "${ARGS[@]}"
  fi
else
  # You need to run anvil manually in other terminals if using --ui
  # useful if you need to restart anvil without restarting tests
  echo "[E2E] Running in UI mode (--ui)"
  echo "[E2E] Ensure both Anvil instances are running in separate terminals:"
  echo "      Terminal 1: pnpm run anvil"
  echo "      Terminal 2: pnpm run anvil:two"
  echo ""
  pnpm exec playwright test "${ARGS[@]}"
fi
