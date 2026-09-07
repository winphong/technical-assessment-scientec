# Build context is the repo root (see docker-compose.yml) so bun can resolve the
# workspace (apps/frontend depends on packages/shared via "workspace:*").
FROM oven/bun:1 AS build

WORKDIR /repo

COPY package.json bun.lock* ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/frontend/package.json apps/frontend/package.json

RUN bun install

COPY packages/shared packages/shared
COPY apps/frontend apps/frontend

# Vite inlines VITE_* env vars into the bundle at build time, hence an ARG->ENV here
# rather than a runtime environment variable (see the comment in docker-compose.yml).
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

WORKDIR /repo/apps/frontend
RUN bun run build

FROM nginx:1.27-alpine
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/frontend/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
