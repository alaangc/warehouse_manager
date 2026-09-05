# Warehouse Manager

Warehouse Manager is a React/Vite frontend backed by a Node.js/Express API and
PostgreSQL 18. The application runs on your computer; Docker Compose provides the
local database.

## Prerequisites

- Docker Desktop (running)
- Node.js 24 LTS (`nvm use` uses the repository's `.nvmrc`)
- Corepack/pnpm 10.28.1

## First-time setup

Run these commands from the repository root:

```bash
nvm use
corepack enable
corepack prepare pnpm@10.28.1 --activate
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed
```

The example environment is configured for the PostgreSQL container in
`compose.yaml`. It contains development-only credentials; do not reuse them in a
deployed environment.

## Run the API and web app

Start both development servers from the repository root:

```bash
pnpm dev
```

Then open:

- Web app: <http://localhost:5173>
- API health check: <http://localhost:3000/api/v1/health>

Vite proxies browser requests under `/api` to the Express API on port 3000, so no
additional frontend configuration is needed.

Development seed accounts:

| Role          | Username | Password                         |
| ------------- | -------- | -------------------------------- |
| Administrator | `admin`  | `development-password-change-me` |
| Driver        | `driver` | `development-password-change-me` |

You can also run the servers in separate terminals:

```bash
pnpm --filter @warehouse/api dev
```

```bash
pnpm --filter @warehouse/web dev
```

## Start and stop the database

Start the existing development database:

```bash
docker compose up -d postgres
```

Stop it while preserving its data:

```bash
docker compose down
```

To discard all development data and start from an empty database, run the following
commands, then migrate and seed again. This removes the Docker volume and cannot be
undone.

```bash
docker compose down -v
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed
```

## Run automated checks

Docker Desktop must be running for the integration and API contract suites; those
suites create isolated PostgreSQL containers and do not use your development data.

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:api
pnpm test:integration
pnpm build
```

Run all configured Vitest projects together with:

```bash
pnpm test
```

Browser end-to-end tests use Playwright:

```bash
pnpm exec playwright install
pnpm test:e2e
```

To run the reporting/cash-close walkthrough against a fresh, disposable database:

```bash
pnpm --filter @warehouse/contracts build
E2E_ISOLATED_STACK=1 E2E_BASE_URL=http://127.0.0.1:5173 pnpm exec playwright test tests/e2e/us5-reporting.spec.ts
```

Docker Desktop must be running, and ports 3000 and 5173 must be free. This command
starts the API, web app, and a temporary PostgreSQL container, seeds boundary-date
sales, and runs Chromium, Firefox, and WebKit. It does not read or modify your
development database. Playwright stops the temporary stack when it finishes.

For manual reporting tests on your development app, first run `pnpm db:migrate`,
then `pnpm dev`, sign in as Administrator, and open **Reports** or **Cash closes**.
Cash-close corrections create new versions; the earlier versions stay in history.

## Troubleshooting

- If `docker compose` cannot connect, start Docker Desktop and wait until its engine
  reports that it is running.
- If port 5432 is already occupied, stop the other PostgreSQL service before starting
  this Compose stack.
- If the API reports invalid configuration, recreate `apps/api/.env` from
  `apps/api/.env.example` and ensure `SESSION_SECRET` is at least 32 characters.
- If dependencies use the wrong Node or pnpm version, repeat the Node/Corepack commands
  from **First-time setup**.
