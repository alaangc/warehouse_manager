# Release follow-up — 2026-09-29

Baseline: `880b83f`, plus current Bluetooth discovery change. This run uses the
existing working tree and dependencies; it is not a fresh-clone T144 run.

## Completed checks

- Unit/component regression: 38 files, 353 tests passed (75.30 seconds).
- API contract regression: 12 files, 144 tests passed (101.38 seconds).
- Workspace typecheck: exit 0.
- ESLint: exit 0.
- Workspace build: exit 0.
- Browser bundle and lockfile security check: exit 0.
- OpenAPI/generated types/hash consistency: exit 0 outside the sandbox. The
  initial sandbox attempt failed in tsx with `uv_os_get_passwd` before validation.
- Formatting of the Bluetooth change and two existing untracked source files:
  passed after formatting-only corrections to those two untracked files.
- Integration regression: 27 files, 246 tests passed (176.28 seconds).

Logs: `var/release-*-20260929.log` (local, ignored by Git). The build retains the existing warning about a JavaScript chunk larger than 500 kB. Browser E2E initially failed before test execution because the required Playwright Chromium binary was absent; after installing the required Chromium binary, both document E2E cases passed (58.8 seconds total). These use simulated BLE and real isolated API/database fixtures; physical behavior remains separately observed.

## Physical test fixture

Separate disposable PostgreSQL database, local UI http://127.0.0.1:5176.

- ROUTE_LOAD document `84144cd2-0cab-4a95-96b7-7fcc90419709`:
  confirmed load, 10.000 PZA of the long Spanish product name. Operator confirmed correct physical output in the conversation; no photograph supplied.
- CASH_CLOSE document `ed562328-de96-4763-a462-146f3167c6cd`:
  gross MXN 25.00, partner MXN 12.50, remaining MXN 12.50. Operator confirmed correct physical output in the conversation; no photograph supplied.
- REPORT document `2d0ae10f-8883-4717-9390-3d5a1f0bd63c`:
  PRINT and REPRINT returned 422 DOCUMENT_NOT_PRINTABLE; output-attempt history
  unchanged. Actual Chrome UI displayed PDF download/share and no print button.
  No Bluetooth chooser was invoked during this report inspection. This does not
  claim hardware packet monitoring or the full H15 source-mutation comparison.

The previously confirmed NETUM sale ticket remains recorded in
[the physical test record](netum-nt1809-2026-09-29.md).

## Open acceptance work

T133: failure scenarios, permissions/roles,
reprints, source comparisons, setup metadata, and paper evidence.
T141: finish the accessibility audit and observe the frozen ten-person protocol.
A positive availability response is not a completed participant session.
T144: complete physical/human acceptance and qualify the final clean version.
T145: update final traceability and obtain actual release review/sign-off.

No outstanding release task is marked complete by this record.

## Recorded client metadata

Chrome executable version: 154.0.8037.58. Windows registry build: 26300.9550 (DisplayVersion 26H2). Registry product label reports Windows 10 Home; no marketing-version inference is made from that label. Printer firmware remains unknown.

Document browser regression covers PDF downloads, ownership reuse, three printable types, report rejection, uncertain writes and explicit reprint. Total observed automated cases in this follow-up: 745 (353 unit/component + 144 API + 246 integration + 2 browser).

## Connection retry correction

The operator screenshot showed DISCONNECTED and disabled REPRINT, together with
CANCELLED and a disabled CONNECT button. This supports the visible disconnected
state but does not independently establish whether power-off caused the transition.
The dialog incorrectly used its transient connection error to block a new connect.
It now allows an explicit retry after cancellation, connection failure or denied
permission while retaining successful server preflight and pending-result guards.
Printing remains disabled while disconnected; reconnecting sends no bytes.

Validation: 34 focused dialog/adapter tests passed, including three new retry cases.

## Operator-confirmed reconnect and reprint

The operator confirmed that reconnecting showed CONNECTED and did not automatically
print. The subsequent explicit REPRINT action requested confirmation without printing;
confirming produced exactly one copy marked REIMPRESION. These are operator reports
in the conversation, not independent paper inspection or packet-level evidence.

The test followed an ordinary disconnect/reconnect. It does not establish recovery
from a power interruption during an in-flight write (UNKNOWN), paper exhaustion,
or absence of duplicate business records; those checks remain pending.
