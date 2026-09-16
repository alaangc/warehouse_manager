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

## Verify migrations and recovery safely

With Docker Desktop running, these commands create temporary databases, run the
checks, then remove only their own containers. They do not reset your development data.

```bash
pnpm --filter @warehouse/contracts build
pnpm db:verify
pnpm db:recovery:test
```

The first checks migrations and existing business history. The second verifies backup
restoration and recovery to a specific point using PostgreSQL's write-ahead log.
See the [migration and recovery runbook](docs/operations/migrations.md) for details.

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
pnpm --filter @warehouse/contracts build
E2E_ISOLATED_STACK=1 E2E_BASE_URL=http://127.0.0.1:5173 pnpm test:e2e
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

## Search performance test (T138)

With Docker Desktop running and the dependencies installed, run from the project root:

```bash
pnpm exec playwright install chromium
pnpm test:performance:search
```

This builds the web app and starts its own local API, 25 authenticated Chromium
sessions, and a disposable PostgreSQL container. You do not need `pnpm dev` or the
Compose application stack running. It never uses your development `DATABASE_URL`;
unset `TEST_POSTGRES_ADMIN_URL` if you have configured it for other tests.

The fixture contains exactly 10,000 products, 10,000 customers, and 100,000 completed
sales. After 150 warm-up searches, it measures 450 searches and requires at least
95% to finish within two seconds, with all result fields and actions ready. Allow
several minutes and avoid other heavy workloads while measuring. Temporary data
and servers are removed automatically when the test finishes.

Raw timings are written under `test-results/performance/`. To deliberately replace
the checked-in evidence with a fresh run:

```bash
RECORD_PERFORMANCE_EVIDENCE=1 pnpm test:performance:search
```

Also update the accompanying [performance report](specs/001-warehouse-management/evidence/search-performance.md)
to match that JSON. This dedicated local profile is separate from routine browser
tests and CI; it does not measure PDF generation or production network latency.

## Continuous integration

Pull requests and pushes to `main` run [.github/workflows/ci.yml](.github/workflows/ci.yml).
Each job checks out a fresh workspace and installs the lockfile with the Node version
in `.nvmrc` and pnpm version in `package.json`. Jobs check formatting, lint, types,
independent API/web builds, unit/component tests, contracts, PostgreSQL integration,
migration/recovery drills, and Chromium/Firefox/WebKit workflows. Database and browser
jobs use disposable databases, not application secrets or development data.

The repository owner should require **CI required** in branch protection. It fails
if any dependency fails, is cancelled, or is skipped. This workflow does not deploy
or provide physical-printer, usability-participant, or release-review sign-off.
Browser reports and failure traces are retained for seven days in the Actions run;
they contain synthetic test data. A successful retry is visible in those reports.
Stricter API compatibility gates and security scanning are tracked separately in
T136 and T143.

## Troubleshooting

### Windows local setup

If pnpm is available under `.tools/bin`, use `pnpm.cmd` in PowerShell to avoid
the script execution policy error. Add the local tools to the current terminal:

```powershell
$env:Path = "$PWD\.tools\bin;$env:Path"
pnpm.cmd dev
```

Start Docker Desktop before running migrations. Per-user Docker installations can
be located under `$env:LOCALAPPDATA\Programs\DockerDesktop`; its CLI is in
`resources\bin`. Preserve the existing database volume when restarting.

- If `docker compose` cannot connect, start Docker Desktop and wait until its engine
  reports that it is running.
- If port 5432 is already occupied, stop the other PostgreSQL service before starting
  this Compose stack.
- If the API reports invalid configuration, recreate `apps/api/.env` from
  `apps/api/.env.example` and ensure `SESSION_SECRET` is at least 32 characters.
- If dependencies use the wrong Node or pnpm version, repeat the Node/Corepack commands
  from **First-time setup**.
