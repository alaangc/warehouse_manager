# Quickstart and Validation Guide

These are the intended clean-environment commands once implementation tasks scaffold the workspace.

## Prerequisites

- Node.js 24 LTS and npm
- Docker with Compose
- Chromium; HTTPS and compatible BLE hardware for Bluetooth acceptance

## Local setup

```bash
cp .env.example .env
docker compose up -d postgres
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

Expected: web at `http://localhost:5173`, API health at `http://localhost:3000/health`. Seeds include both branches, required categories, and a local administrator whose credentials come from environment configuration.

## Quality gate

```bash
npm run lint
npm run typecheck
npm run test
npm run test:integration
npm run test:contract
npm run build
npm run test:e2e
```

Run against a newly migrated real PostgreSQL database.

## Critical validation stories

1. Submit two consumers for the last unit; only one succeeds, balance stays nonnegative, and history matches.
2. Repeat a sale with one key; obtain one sale/ticket/deduction. Changed input with that key returns `409`.
3. Include one insufficient line; no sale, ticket, balance change, or movement commits.
4. Complete admin creation, driver load/start/return, and admin reconciliation/close; route stock ends at zero.
5. Exercise privileged operations as driver, unrelated driver, inactive user, and admin; denials mutate nothing.
6. Test odd-cent totals and special prices; snapshots reproduce results and `partner + remaining = gross`.
7. Cancel twice as admin; preserve the original and restore stock only once to the correct holder.
8. Fail then retry PDF/printer output; the source business record remains committed exactly once.
9. Test records around local midnight; reports honor the configured timezone.
10. From Inicio, select Inventario; verify summary counts, filter Magdalena and Tucson,
    clear the filter, and confirm only the intended locations appear in each state.
11. Select each low-stock product; verify the URL contains its stable product identifier
    and the detail identity, quantities, locations, supplier, pricing, and movements all
    belong to the selected product. An unknown identifier returns safely to Inventario.

## Migration recovery

Before production migration: back up, restore to a rehearsal database, apply migrations, run smoke/invariant tests, and verify the documented rollback or forward-fix. Preserve the evidence with the release.
