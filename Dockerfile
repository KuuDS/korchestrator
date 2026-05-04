# Dockerfile for korchestrator validation
FROM node:20-alpine

WORKDIR /app

# Copy package files first (for better layer caching)
COPY package.json package-lock.json ./
COPY tsconfig.json ./

# Install dependencies using lockfile
RUN npm ci

# Copy source files
COPY src/ ./src/
COPY tests/ ./tests/
COPY scripts/ ./scripts/
COPY plugin.json ./
COPY openspec/ ./openspec/
COPY README.md ./
COPY AGENTS.md ./

# Run TypeScript compilation check
RUN npx tsc --noEmit

# Run tests
RUN npx vitest run

# Run type validation
RUN npm run validate-types

# Run traceability validation (informational, does not fail build)
RUN npm run validate:traceability || true

CMD ["echo", "All validations passed!"]
