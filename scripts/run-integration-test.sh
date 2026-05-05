#!/bin/bash
set -euo pipefail

# =============================================================================
# Integration Test Runner for openclaw-plugin-plan-subagent
# =============================================================================
# Usage:
#   ./scripts/run-integration-test.sh [version]
#
# Arguments:
#   version   OpenClaw version to test against (default: latest)
#             Examples: latest, nightly, 2026.5.3
#
# Environment:
#   MOONSHOT_API_KEY    API key for model provider (required for gateway tests)
#
# Examples:
#   MOONSHOT_API_KEY=sk-xxx ./scripts/run-integration-test.sh
#   MOONSHOT_API_KEY=sk-xxx ./scripts/run-integration-test.sh 2026.5.3
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_ROOT}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
OPENCLAW_VERSION="${1:-latest}"

# Check for API key
if [[ -z "${MOONSHOT_API_KEY:-}" ]]; then
  echo -e "${YELLOW}WARNING: MOONSHOT_API_KEY not set. Gateway tests may fail.${NC}"
fi

# Fetch latest version info if using "latest"
if [[ "${OPENCLAW_VERSION}" == "latest" ]]; then
  echo -e "${BLUE}Fetching latest OpenClaw release info...${NC}"
  LATEST_TAG=$(curl -s https://api.github.com/repos/openclaw/openclaw/releases/latest | grep '"tag_name"' | cut -d'"' -f4 || echo "latest")
  echo -e "${GREEN}Latest OpenClaw release: ${LATEST_TAG}${NC}"
fi

# Step 1: Build plugin package
echo ""
echo -e "${BLUE}Step 1: Building plugin package...${NC}"
npm run build
npm pack

if [[ ! -f "openclaw-plugin-plan-subagent-0.1.0.tgz" ]]; then
  echo -e "${RED}ERROR: Plugin tarball not found after npm pack${NC}"
  exit 1
fi
echo -e "${GREEN}Plugin package built ✓${NC}"

# Step 2: Run integration tests via docker-compose
echo ""
echo -e "${BLUE}Step 2: Running integration tests with OpenClaw ${OPENCLAW_VERSION}...${NC}"
echo ""

# Export for docker-compose
export OPENCLAW_VERSION
export MOONSHOT_API_KEY

# Run tests
docker compose -f docker-compose.integration.yml up --build --abort-on-container-exit

# Capture exit code
EXIT_CODE=$?

# Step 3: Cleanup
echo ""
echo -e "${BLUE}Step 3: Cleaning up...${NC}"
docker compose -f docker-compose.integration.yml down -v &>/dev/null || true

# Step 4: Report results
echo ""
echo "========================================"
if [[ ${EXIT_CODE} -eq 0 ]]; then
  echo -e "${GREEN}Integration tests PASSED ✓${NC}"
else
  echo -e "${RED}Integration tests FAILED ✗ (exit code: ${EXIT_CODE})${NC}"
fi
echo "========================================"

exit ${EXIT_CODE}
