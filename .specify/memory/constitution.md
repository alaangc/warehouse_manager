<!--
Sync Impact Report
- Version change: 2.0.0 -> 3.0.0
- Modified principles:
  - I. Inventory Is the Source of Truth -> I. Web Architecture and Separation of Concerns
  - II. Least-Privilege Role Boundaries -> II. API Authority and Security
  - III. Atomic Sales and Delivery Workflows -> III. Transactional Business Operations
  - IV. Traceable and Deterministic Business Records -> IV. Exact Financial Arithmetic
  - V. Reliable Web and Document Operations -> V. Auditability and Historical Integrity
- Added principles:
  - VI. API Contracts and Compatibility
  - VII. Testing and Review Gates
  - VIII. Database Evolution and Operational Reliability
- Added sections:
  - Engineering Constraints
- Removed sections:
  - Technology, Product, and Data Constraints (feature-specific content moved to specifications)
- Modified sections:
  - Development Workflow and Quality Gates
  - Governance
- Follow-up TODOs: none
-->

# Warehouse Manager Constitution

## Core Principles

### I. Web Architecture and Separation of Concerns

The frontend MUST use React with Vite, and the backend MUST use Node.js with Express.
The frontend MUST communicate with the backend only through documented HTTP API
contracts and MUST NOT connect directly to the database. UI components MUST NOT be
the sole implementation of authorization, validation, financial calculations,
inventory rules, or other business logic. Frontend and backend code MUST be
independently buildable and testable. These boundaries keep presentation concerns
separate from trusted business behavior.

### II. API Authority and Security

The Express API MUST be the authoritative boundary for authentication,
authorization, validation, business rules, and persistence. Every protected operation
MUST enforce role-based authorization in the API; hiding an action in the frontend
MUST NOT be treated as authorization. All external input MUST be validated at the API
boundary. Secrets and credentials MUST come from secure environment configuration
and MUST NOT be committed to source control. Error responses MUST NOT expose secrets,
credentials, stack traces, or sensitive implementation details.

### III. Transactional Business Operations

Every workflow that changes inventory or coordinates multiple business records MUST
execute transactionally. A failed operation MUST NOT leave partial records or an
unexplained inventory change. Every inventory mutation MUST create a traceable
movement record in the same transaction as the mutation. Retriable operations MUST
be idempotent or protected by a persisted uniqueness mechanism that prevents duplicate
processing. The backend MUST enforce cross-record business invariants, and the
database MUST enforce invariants expressible as constraints.

### IV. Exact Financial Arithmetic

Monetary values MUST use exact decimal representations or integer minor units. Binary
floating-point arithmetic MUST NOT determine stored monetary values, totals, prices,
discounts, profits, or cash calculations. Rounding rules MUST be explicit,
centralized, deterministic, and covered by automated tests. Historical transactions
MUST preserve the exact monetary inputs and results applied when they were created so
later configuration changes cannot rewrite financial history.

### V. Auditability and Historical Integrity

Security-sensitive and business-critical changes MUST record the responsible actor,
timestamp, action, affected record, and relevant before-and-after values. Historical
transactions, inventory movements, pricing decisions, and cash records MUST remain
reproducible from persisted data. Corrections MUST use traceable adjustments or
reversals instead of silently rewriting history. Records referenced by business
history MUST be archived rather than destructively deleted.

### VI. API Contracts and Compatibility

API request and response formats MUST be documented and validated. Every contract
change MUST be reviewed for frontend compatibility, and a breaking API change MUST
include an explicit migration or versioning strategy. The frontend MUST handle
validation, authorization, conflict, and server failures explicitly. Document
generation and printing integrations MUST NOT duplicate or roll back a committed
business transaction when output fails.

### VII. Testing and Review Gates

Business rules MUST have automated unit tests. Database-backed and transactional
workflows MUST have integration tests. Authorization rules MUST include tests proving
both permitted and denied access. Frontend and API assumptions for critical workflows
MUST be covered by contract or end-to-end tests. Financial calculations, inventory
mutations, retry behavior, and rollback behavior MUST receive explicit test coverage.
A change MUST NOT be considered complete until all applicable tests pass and a
reviewer confirms compliance with this constitution.

### VIII. Database Evolution and Operational Reliability

Schema changes MUST use version-controlled migrations. A migration affecting
production data MUST include a tested recovery or rollback strategy. Errors MUST be
logged with sufficient context for diagnosis without exposing credentials or sensitive
data. Critical workflows MUST expose observable failure states and MUST NOT fail
silently. Application configuration MUST be environment-specific and validated when
the application starts.

## Engineering Constraints

- Trusted domain behavior MUST reside behind the Express API boundary and MUST be
  reusable independently of HTTP routing and React components.
- The database MUST be reachable only through backend-controlled infrastructure;
  browser-delivered code MUST NOT contain database credentials or server secrets.
- HTTP contracts, migration files, and automated tests MUST be version-controlled with
  the code they govern.
- Feature specifications MUST contain mutable product scope, workflows, roles,
  locations, categories, calculations, outputs, and interface details. Such details
  MUST NOT be promoted into this constitution unless they become durable governance.

## Development Workflow and Quality Gates

- Every specification MUST identify affected authorization, validation, persistence,
  financial, failure-handling, compatibility, and audit requirements.
- Every implementation plan MUST include a Constitution Check before design begins and
  repeat it after design decisions are complete.
- Every task list MUST include the tests, migrations, contract updates, observability,
  and recovery work required by the affected principles.
- Code review MUST reject changes that move trusted rules into the frontend, bypass
  API authorization, weaken transactional guarantees, use inexact monetary arithmetic,
  destroy required history, or omit required verification.
- Release evidence MUST show that applicable tests and migrations passed in a clean
  environment and that known exceptions were approved under Governance.

## Governance

This constitution takes precedence over specifications, plans, tasks, implementation
choices, and review practices. A conflicting artifact MUST be corrected before work
depending on it proceeds.

Every amendment MUST document its rationale, affected principles or sections,
migration impact, and approval date. Versioning follows semantic versioning: MAJOR for
incompatible principle removals or redefinitions, MINOR for new principles or
materially expanded governance, and PATCH for non-semantic clarification. Every
merged amendment MUST update the Sync Impact Report, version, and last-amended date.

Every implementation plan and code review MUST include an explicit constitution
compliance check. An exception MUST document its scope, owner, rationale, risk
controls, and expiration date; undocumented or open-ended exceptions are invalid.
Compliance MUST be re-evaluated whenever architecture boundaries, security policy,
data guarantees, API compatibility, testing gates, or operational requirements change.

**Version**: 3.0.0 | **Ratified**: 2026-08-13 | **Last Amended**: 2026-08-14
