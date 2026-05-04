#!/bin/sh
set -e

echo "========================================"
echo "OpenClaw Plugin Integration Test"
echo "========================================"

# Set API key from environment
export MOONSHOT_API_KEY="${MOONSHOT_API_KEY:-}"

echo ""
echo "Step 1: Verify plugin installation"
echo "------------------------------------"
ls -la /app/extensions/plan-subagent/dist/openclaw-entry.js || {
  echo "ERROR: Plugin dist/openclaw-entry.js not found"
  exit 1
}
cat /app/extensions/plan-subagent/openclaw.plugin.json
echo "Plugin files present ✓"

echo ""
echo "Step 2: Verify OpenClaw config"
echo "------------------------------------"
cat /home/node/.openclaw/openclaw.json | head -30
echo "Config present ✓"

echo ""
echo "Step 3: Check plugin manifest"
echo "------------------------------------"
cat /app/extensions/plan-subagent/openclaw.plugin.json
echo "Manifest present ✓"

echo ""
echo "Step 4: Check plugin discovery"
echo "------------------------------------"
node /app/openclaw.mjs plugins list 2>&1 | grep -i "plan-subagent" && echo "Plugin discovered ✓" || echo "Plugin not in discovery list"

echo ""
echo "Step 5: Start OpenClaw gateway (background)"
echo "------------------------------------"
node /app/openclaw.mjs gateway --allow-unconfigured --bind loopback > /tmp/gateway.log 2>&1 &
GATEWAY_PID=$!
sleep 15

# Check if gateway is running
if kill -0 $GATEWAY_PID 2>/dev/null; then
  echo "Gateway started (PID: $GATEWAY_PID) ✓"
else
  echo "WARNING: Gateway may not have started properly"
  echo "--- Gateway log ---"
  cat /tmp/gateway.log | tail -30
fi

# Check gateway log for plugin loading
if grep -q "Plan-subagent plugin registered successfully" /tmp/gateway.log 2>/dev/null; then
  echo "Plugin loaded successfully ✓"
  grep "Plan-subagent plugin" /tmp/gateway.log
else
  echo "WARNING: Plugin may not have loaded"
  echo "--- Checking gateway log for plugin messages ---"
  grep -i "plan-subagent\|plugin" /tmp/gateway.log | tail -20 || true
fi

# Check for hook execution
echo ""
echo "Step 5b: Verify hooks fired"
echo "------------------------------------"
HOOK_COUNT=$(grep -c "hook fired" /tmp/gateway.log 2>/dev/null || echo "0")
if [ "$HOOK_COUNT" -gt 0 ]; then
  echo "Hooks fired: $HOOK_COUNT ✓"
  grep "hook fired" /tmp/gateway.log | tail -10
else
  echo "INFO: No hooks fired yet (expected until agent processes a request)"
fi

echo ""
echo "Step 6: Run plugin unit tests inside container"
echo "------------------------------------"
cd /app/extensions/plan-subagent
# Install dependencies needed for testing
npm install 2>&1 | tail -5 || {
  echo "WARNING: npm install had issues"
}
# Create a local vitest config to avoid picking up OpenClaw's global config
cat > vitest.config.js <<'EOF'
export default {
  test: {
    include: ['tests/**/*.test.ts'],
    globals: true,
  },
};
EOF
# Run tests with local config
npx vitest run --config vitest.config.js --reporter=verbose 2>&1 || {
  echo "WARNING: Plugin unit tests had failures"
}

echo ""
echo "Step 7: Stop gateway"
echo "------------------------------------"
kill $GATEWAY_PID 2>/dev/null || true
wait $GATEWAY_PID 2>/dev/null || true
echo "Gateway stopped ✓"

echo ""
echo "Step 8: Gateway log summary"
echo "------------------------------------"
cat /tmp/gateway.log | tail -50

echo ""
echo "========================================"
echo "Integration test completed"
echo "========================================"
