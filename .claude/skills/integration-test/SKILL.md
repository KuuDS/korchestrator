---
name: integration-test
description: Run integration tests for the openclaw-plugin-plan-subagent using Docker. Fetches the latest OpenClaw release, builds the integration test image, and executes tests in a containerized environment. Use when the user wants to run integration tests, validate the plugin against a real OpenClaw instance, or check compatibility with the latest OpenClaw version.
license: MIT
compatibility: Requires Docker and Docker Compose.
metadata:
  author: korchestrator
  version: "1.0"
  requires:
    - docker
    - docker-compose
---

Run integration tests for `openclaw-plugin-plan-subagent` against a real OpenClaw instance running in Docker.

**Prerequisites**
- Docker Engine 24.0+
- Docker Compose v2.20+
- `MOONSHOT_API_KEY` or other model provider API key (for gateway tests)

**Steps**

### 1. Determine OpenClaw Version

Check if a specific version is requested. Default to the latest stable release.

```bash
# Fetch latest release tag from GitHub API
LATEST_TAG=$(curl -s https://api.github.com/repos/openclaw/openclaw/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
echo "Latest OpenClaw release: ${LATEST_TAG}"
```

**Image sources** (in order of preference):
1. `ghcr.io/openclaw/openclaw:${TAG}` — GitHub Container Registry (official)
2. `alpine/openclaw:${TAG}` — Docker Hub mirror
3. `openclaw/openclaw:${TAG}` — Docker Hub (legacy)

Common tags:
- `latest` — most recent stable release
- `nightly` — latest development build
- `v2026.5.3` or `2026.5.3` — specific version (without leading `v` for GHCR)

### 2. Build Plugin Package

Ensure the plugin tarball exists:

```bash
cd /path/to/korchestrator
npm run build
npm pack
# Produces: openclaw-plugin-plan-subagent-0.1.0.tgz
```

### 3. Build Integration Test Image

**Option A: Using docker-compose (recommended)**

Create or use `docker-compose.integration.yml`:

```yaml
services:
  openclaw-integration:
    build:
      context: .
      dockerfile: Dockerfile.integration
      args:
        # Override with specific version: OPENCLAW_VERSION=2026.5.3
        OPENCLAW_VERSION: latest
    image: korchestrator/openclaw-integration:latest
    container_name: korchestrator-integration
    environment:
      - MOONSHOT_API_KEY=${MOONSHOT_API_KEY:-}
      - OPENCLAW_STATE_DIR=/home/node/.openclaw
      - OPENCLAW_HOME=/home/node
    volumes:
      - ./tests:/app/extensions/plan-subagent/tests:ro
      - openclaw-data:/app/data
    healthcheck:
      test: ["CMD", "openclaw", "status"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  openclaw-data:
```

Run with docker-compose:

```bash
# Using latest OpenClaw version
OPENCLAW_VERSION=latest docker compose -f docker-compose.integration.yml up --build

# Using specific version
OPENCLAW_VERSION=2026.5.3 docker compose -f docker-compose.integration.yml up --build

# Run tests and remove container afterward
OPENCLAW_VERSION=latest docker compose -f docker-compose.integration.yml up --build --abort-on-container-exit
```

**Option B: Using docker build/run directly**

```bash
# Build
docker build \
  --build-arg OPENCLAW_VERSION=latest \
  -f Dockerfile.integration \
  -t korchestrator/openclaw-integration:latest \
  .

# Run
docker run --rm \
  -e MOONSHOT_API_KEY="${MOONSHOT_API_KEY}" \
  -v "$(pwd)/tests:/app/extensions/plan-subagent/tests:ro" \
  korchestrator/openclaw-integration:latest
```

### 4. Dockerfile.integration

The integration Dockerfile should accept a build arg for the OpenClaw version:

```dockerfile
# Build arg for OpenClaw version (default: latest)
ARG OPENCLAW_VERSION=latest

# Use official OpenClaw image from GHCR
FROM ghcr.io/openclaw/openclaw:${OPENCLAW_VERSION}

USER root

# Install plugin into OpenClaw extensions directory
RUN mkdir -p /app/extensions/plan-subagent
COPY openclaw-plugin-plan-subagent-0.1.0.tgz /tmp/
RUN cd /app/extensions/plan-subagent && \
    tar xzf /tmp/openclaw-plugin-plan-subagent-0.1.0.tgz --strip-components=1 && \
    rm /tmp/openclaw-plugin-plan-subagent-0.1.0.tgz

# Configure plugin manifest
RUN cd /app/extensions/plan-subagent && \
    printf '{"id":"openclaw-plugin-plan-subagent","name":"Plan-Task-Build Subagent Orchestrator","version":"0.1.0","configSchema":{}}\n' > openclaw.plugin.json

# Configure OpenClaw to load the plugin
RUN mkdir -p /home/node/.openclaw && \
    cat > /home/node/.openclaw/openclaw.json <<'EOF'
{
  "gateway": {
    "mode": "local",
    "bind": "loopback"
  },
  "agents": {
    "defaults": {
      "model": "moonshot/kimi-k2.5"
    }
  },
  "plugins": {
    "enabled": true,
    "entries": {
      "openclaw-plugin-plan-subagent": { "enabled": true }
    }
  }
}
EOF

# Set ownership
RUN chown -R node:node /home/node/.openclaw /app/extensions/plan-subagent

# Copy and setup test script
COPY integration-test.sh /app/integration-test.sh
RUN chmod +x /app/integration-test.sh

USER node
WORKDIR /app

ENV MOONSHOT_API_KEY=""
ENV OPENCLAW_STATE_DIR="/home/node/.openclaw"
ENV OPENCLAW_HOME="/home/node"

CMD ["/app/integration-test.sh"]
```

### 5. Test Execution Flow

The `integration-test.sh` script performs:

1. **Plugin verification** — checks `dist/openclaw-entry.js` and `openclaw.plugin.json`
2. **Config verification** — validates OpenClaw configuration
3. **Plugin discovery** — runs `openclaw plugins list` and confirms plugin is found
4. **Gateway startup** — starts OpenClaw gateway in background
5. **Hook verification** — checks gateway logs for plugin hook execution
6. **Unit test execution** — runs plugin unit tests inside the container
7. **Cleanup** — stops gateway and outputs summary

### 6. Verification Steps

After running, verify:

```bash
# Check container exit code
docker inspect korchestrator-integration --format='{{.State.ExitCode}}'

# View full logs
docker logs korchestrator-integration

# Check for specific success indicators
docker logs korchestrator-integration 2>&1 | grep -E "(Plugin loaded|Hooks fired|test passed|completed)"
```

### 7. Cleanup

```bash
# Remove container and volumes
docker compose -f docker-compose.integration.yml down -v

# Or if using docker run directly
docker rm -f korchestrator-integration 2>/dev/null || true
```

**Input**: Optionally specify an OpenClaw version (e.g., `2026.5.3`, `latest`, `nightly`). If omitted, use the latest stable release.

**Output**: The integration test results including plugin discovery status, gateway startup confirmation, hook execution count, and unit test results.

**Error Handling**
- If the OpenClaw image pull fails, retry with `alpine/openclaw:${VERSION}` as fallback
- If gateway fails to start, output the last 50 lines of `/tmp/gateway.log`
- If plugin is not discovered, verify `openclaw.plugin.json` exists and is valid JSON
- If unit tests fail, the container should still exit with the test exit code

**Best Practices**
- Pin to a specific OpenClaw version in CI/CD for reproducibility
- Use `latest` only for development/testing
- Mount `tests/` as read-only to prevent accidental modifications
- Set `MOONSHOT_API_KEY` via environment, never commit it
