# Build context is the repo root (see docker-compose.yml) so bun can resolve the
# workspace (apps/backend depends on packages/shared via "workspace:*").
FROM oven/bun:1

WORKDIR /repo

COPY package.json bun.lock* ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/backend/package.json apps/backend/package.json

RUN bun install

COPY packages/shared packages/shared
COPY apps/backend apps/backend

WORKDIR /repo/apps/backend
RUN chmod +x entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
