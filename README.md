# CSV Collaboration

A React + TypeScript frontend and Fastify + TypeScript backend for uploading CSV data, browsing/searching it with pagination, and collaborating on it in real time across multiple browser sessions — including detecting and resolving conflicting concurrent uploads.

The original assessment brief is preserved at [ASSESSMENT.md](ASSESSMENT.md).

## Stack

- **Frontend**: React 19 + TypeScript, Vite, TanStack Query (React Query)
- **Backend**: Fastify + TypeScript, running on [Bun](https://bun.sh)
- **Database**: PostgreSQL (via Sequelize + `sequelize-cli` migrations)
- **Real-time channel**: hand-rolled Server-Sent Events (SSE) — see [Why SSE, not WebSocket](#why-sse-not-websocket) below
- **Package manager**: Bun workspaces (`apps/backend`, `apps/frontend`, `packages/shared`)

## Setup & run (Docker Compose)

Requires Docker Desktop (or another Docker Engine) with Compose v2.

```bash
docker compose up --build
```

This builds and starts three services:

| Service    | URL                   | Notes                                                                                                                                |
| ---------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `postgres` | `localhost:5432`      |                                                                                                                                      |
| `backend`  | http://localhost:3001 | non-default host port to avoid clashing with any other local service already bound to 3000; runs DB migrations automatically on boot |
| `frontend` | http://localhost:5173 | static build served via nginx                                                                                                        |

Open **http://localhost:5173** in two separate browser tabs to try the collaboration features. Sample data is at [`data.csv`](data.csv) (500 rows).

If any of these ports are already taken on your machine, change the left-hand side of the corresponding `ports:` mapping in `docker-compose.yml` (and the `VITE_API_BASE_URL` build arg on the `frontend` service, if you change the backend's port) — nothing else needs to change.

To reset the database entirely: `docker compose down -v`.

## Local (non-Docker) development

```bash
bun install                       # installs all three workspaces
cp .env.example apps/backend/.env # point the backend at a local Postgres
docker compose up -d postgres     # or run your own Postgres on the same port
bun run --cwd apps/backend migrate
bun run --cwd apps/backend dev    # http://localhost:3000
bun run --cwd apps/frontend dev   # http://localhost:5173 (VITE_API_BASE_URL defaults to :3000)
```

## Tests

Backend tests run against a real Postgres database (`scientec_test`), which isn't created
automatically — Docker Compose only provisions the `scientec` dev database. Create and
migrate it once before running tests:

```bash
docker compose exec postgres createdb -U postgres scientec_test  # or via your own Postgres
NODE_ENV=test bun run --cwd apps/backend migrate
```

```bash
bun run --cwd apps/backend test    # Vitest, against a real Postgres (scientec_test db)
bun run --cwd apps/frontend test   # Vitest + Testing Library
```

## Conflict resolution: design decisions

1. When there is an update on an existing record, a Conflict record is created to record the old and new data and is subjected to manual approval. Data in the latest upload will superceed the previous upload and previous conflict will be automatically marked as outdated. This mechanism also serves as audit trail.
2. Upload is restricted to 1 ongoing upload at any time. If the data belongs to different organisation, it can further be scoped to 1 ongoing upload per organisation. Since the latest upload superceeds the previous upload, there's no real benefit in allowing concurrent upload since the latest write wins and that can cause more confusion. However, there's a mechanism to warn other user that an update is ongoing and any conflict / update to records will also be updated live via SSE.

## Handling large CSV upload

1. Given the uploaded CSV can be large, existing method can cause backpressure and eventually cause OOM issue. Current implementation already make use of fastify/multipart to handle streaming of data to backend. One alternative is queuing job in Postgres (e.g using pg-boss) to quickly process the incoming request and stored in database and subsequently process each records, without loading a huge chunk of data in the server memory.
2. As the rows are processed in parallel manner (up to 8 transactions), this can consume the database connection pool. If we do open up for multitenacy (multiple organisation), this needs to be converted into a queue based processing to handle the records in sequential manner without bursting the database connection pool.
3. Uploads are capped at 100MB (`MAX_UPLOAD_BYTES` in `packages/shared`, shared by both apps so the limit can't drift between them). The client rejects an oversized file immediately, before spending a round-trip on it; the server independently checks `Content-Length` before ever opening the multipart stream, so an oversized file gets rejected without parsing or writing a single row.

## Browsing & pagination

1. `GET /records` uses keyset pagination (`WHERE id < :cursor ORDER BY id DESC`) rather than `OFFSET`, ordered newest-id-first: it uses the primary key index directly and stays stable if rows are inserted mid-scroll — unlike `OFFSET n`, whose page boundaries shift under concurrent writes — and surfaces the most recently ingested records first. A useful side effect: since new uploads land at the newest-id end (the end already scrolled past), they never disrupt an in-progress scroll further down the list.
2. The frontend caps infinite scroll at 100 records (`MAX_RECORDS` in `RecordsTable.tsx`) to bound DOM size as well as preventing unnecessary data fetching when query key gets invalidated, with a message pointing users to search to narrow further. Combined with the newest-first ordering above, the cap still surfaces the most relevant rows rather than an arbitrary slice.
