# T141 accessibility and human usability

Status: preparation complete; human acceptance NOT RUN. The owner confirmed on
2026-09-16 that participants are pending. T141 remains unchecked. No automated
timing is a participant result, and neither SC-003 nor SC-009 is accepted yet.

## Frozen protocol: U-SCRIPT-1 / U-FIXTURE-1

Use the same application commit, Spanish language, browser/device and introduction
for a cohort. Record exact build SHA, browser version, viewport, input method,
facilitator and date before starting. Use anonymous participant IDs D01–D05 and
A01–A05, five actual Drivers and five actual Administrators. Do not reuse a
participant or replace a failed result with a successful retry.

Provision an isolated test environment with ordinary application workflows; never
use live stock or customers. Each participant gets a fresh independent copy of
the following fixture. Store its route/customer/product IDs and a start-screen
screenshot with the participant record. This is a frozen setup recipe, not an
automatic database seed. Verify every precondition before handoff; setup time is
outside the timed run. Do not reset a fixture during the run.

| Fixture | Start state and task card |
| --- | --- |
| U-FIXTURE-1-D | Authenticated assigned Driver; Spanish New Sale screen at customer step; one EN_ROUTE route named U-D-{participant}; route selected automatically; no customer selected, no draft quote/sale. One active customer `Tienda Usabilidad`, no special prices. Ten distinct products `Producto 01` through `Producto 10`, unit EA, standard price MXN 10.00, available quantity 5.000 each, no other route products. Task: sell quantity 1.000 of every product to this customer, cash, total MXN 100.00; finish with the Sale Ticket visibly available. |
| U-FIXTURE-1-A | Authenticated Administrator at `/routes?routeId={id}`, selected RETURNED route U-A-{participant}, reconciliation section visible, no approved reconciliation. Confirmed load: Producto 01 and Producto 02, 5.000 each; no sales; expected balances 5.000 each. Physical returns initially display those expected values; reasons empty. Task card: Producto 01 physically returned 4.000, one unit damaged (`Una unidad dañada`); Producto 02 returned 5.000. Reconcile the single difference with its mandatory reason and close the route. |

Before each run, confirm no modal, loading spinner, previous error, browser autofill
or unsaved participant input. Keep the fixture order and text fixed. Any changed
task card, introduction or setup requires a new version and a new cohort; retain
the old evidence. Training examples must use different records from timed tasks.

## Standardized 15-minute introduction (U-SCRIPT-1, Spanish)

The facilitator follows this schedule, using a separate training route. Do not
add task-specific shortcuts for individual participants. Record introduction start
and end timestamps; never shorten training for experienced users.

| Minutes | Facilitator script and demonstration |
| --- | --- |
| 00:00–03:00 | “Esta aplicación registra inventario, rutas y ventas. Tu cuenta muestra las acciones de tu rol. Revisaremos los controles antes de una tarea individual.” Demonstrate navigation, visible labels, Tab/Shift+Tab, Enter, scrolling and focus. |
| 03:00–07:00 | “Para vender, elige ruta y cliente, agrega productos y cantidades, revisa la cotización y confirma el pago. La venta termina con el comprobante disponible.” Demonstrate a two-product practice sale, editing a quantity before confirmation and locating the Sale Ticket. |
| 07:00–11:00 | “Al regresar una ruta, compara la devolución física con la esperada. Una diferencia necesita motivo. Aprueba la conciliación y después cierra la ruta.” Demonstrate a different practice route, an invalid input, its correction, approval and CLOSED with zero route stock. |
| 11:00–14:00 | Allow practice and questions using training records. Demonstrate reviewing an error and correcting an input. Do not expose the timed fixture or allow a rehearsal of the measured task. |
| 14:00–15:00 | “Recibirás una tarjeta y una pantalla preparada. Puedes corregir datos antes de enviar. El tiempo no se detiene. No puedo ayudarte durante el intento. Avísame cuando veas el resultado solicitado.” Explain that assistance, a restart or rejected final submission fails the first attempt. Finish at 15:00. |

## Timing and scoring

1. Start an uninterrupted monotonic timer at the exact handoff of the task card
   and prepared screen. Also record ISO 8601 wall-clock start time with timezone.
2. Do not coach, point, supply identifiers or interpret errors after handoff.
   Record all assistance, including another participant's or facilitator's help.
3. Ordinary corrections before final submission are permitted without stopping
   the clock. A rejected final submission (including local validation of that
   final submission), restart, reload to restart, or any assistance makes the
   first-attempt result FAIL. Preserve the event and time even if the participant
   later finishes. A quotation is a review step, not final sale submission.
4. Driver end: exactly ten distinct committed sale lines, one unit each, correct
   customer/payment, and the Sale Ticket visibly available on screen. A quote,
   loading state or bare sale success message is insufficient. Capture the screen
   and sale/document IDs; no physical printer is required for this criterion.
5. Administrator end: approved reconciliation has exactly one difference of
   -1.000 with its reason, route visibly CLOSED/read-only, and all route balances
   zero. Capture the screen and route/reconciliation IDs, and retain read-only API
   evidence of the balances. Stop timing on the participant-visible end state;
   the facilitator may inspect API evidence afterward without extending time.
6. Record end timestamp, monotonic elapsed milliseconds, first-attempt outcome,
   assistance, rejected submission, restart and failure reason. Never infer a
   missing timestamp or turn an incomplete attempt into a pass. Retain incomplete
   and failed sessions; any later practice attempt is separate and unscored.

SC-003 passes only when **all five Drivers** satisfy their end condition without
assistance in strictly less than 120,000 ms each (120,000 fails the time limit).
SC-009 passes only with **at least nine of all ten** first-attempt successes.
Report the two criteria independently; there is no Administrator time threshold.
No averages, exclusions of failed users, or rounded two-minute timings qualify.

## Participant record (pending)

For every row attach: application SHA; fixture/script version; fixture IDs;
device/browser/viewport/input method; introduction start/end; start screenshot;
task start/end ISO timestamps; elapsed milliseconds; endpoint screenshot and
business IDs; first-attempt PASS/FAIL; assistance details; rejected submission;
restart; failure reason; observer ID. Use `not observed` rather than false for
unknown events. Store evidence without names, customer PII or credentials.

| ID | Role | Fixture / script | Start / end | Elapsed ms | First attempt | Assistance / rejection / restart | Failure reason | Driver <120000 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D01 | Driver | U-FIXTURE-1-D / U-SCRIPT-1 | pending | pending | pending | not observed | pending | pending |
| D02 | Driver | U-FIXTURE-1-D / U-SCRIPT-1 | pending | pending | pending | not observed | pending | pending |
| D03 | Driver | U-FIXTURE-1-D / U-SCRIPT-1 | pending | pending | pending | not observed | pending | pending |
| D04 | Driver | U-FIXTURE-1-D / U-SCRIPT-1 | pending | pending | pending | not observed | pending | pending |
| D05 | Driver | U-FIXTURE-1-D / U-SCRIPT-1 | pending | pending | pending | not observed | pending | pending |
| A01 | Administrator | U-FIXTURE-1-A / U-SCRIPT-1 | pending | pending | pending | not observed | pending | n/a |
| A02 | Administrator | U-FIXTURE-1-A / U-SCRIPT-1 | pending | pending | pending | not observed | pending | n/a |
| A03 | Administrator | U-FIXTURE-1-A / U-SCRIPT-1 | pending | pending | pending | not observed | pending | n/a |
| A04 | Administrator | U-FIXTURE-1-A / U-SCRIPT-1 | pending | pending | pending | not observed | pending | n/a |
| A05 | Administrator | U-FIXTURE-1-A / U-SCRIPT-1 | pending | pending | pending | not observed | pending | n/a |

Observed participants: 0/10. Driver timing evidence: 0/5. First-attempt results:
0 recorded, not a measured 0% success rate. Both acceptance criteria are pending.

## Automated accessibility audit, 2026-09-16

Seven new component regressions initially failed, then passed after correction:
product-name fieldset grouping; decimal input hint; missing/whitespace reason
blocking; equivalent decimal quantities; negative, overprecision, nonnumeric and
empty return values. Reconciliation now uses a named native form, actual submit
buttons and browser constraint validation, which focuses the first invalid field.
It keeps API validation and conflict handling as the final authority.

Command: `pnpm exec vitest run --config vitest.workspace.ts apps/web/tests/accessibility/workflow-accessibility.test.tsx apps/web/tests/routes/route-workflow.test.tsx apps/web/tests/sales/sale-form.test.tsx --testTimeout=15000`.
Result: 3 files, 16 tests passed. These tests mock HTTP and do not prove human
usability, whole-application accessibility, screen-reader behavior or visual fit.

The real route lifecycle E2E additionally checks required-reason focus, Tab from
return quantity to reason, Enter submission, and reconciliation container fit at
390x844 before restoring 1280x800. It still verifies final CLOSED and zero stock.
Its two-difference regression fixture is intentionally separate from the frozen
one-difference human task. Browser execution results are recorded below.

`playwright test tests/e2e/us3-routes.spec.ts --retries=0 --reporter=list` on the
isolated local PostgreSQL stack: Chromium 9.9 s, Firefox 13.3 s, WebKit 20.7 s;
3 passed, no retries, 52.2 s total. These are machine test durations only.
Pre-existing MUI out-of-range route-select warnings remain; this was not a
clean-console run. Browser versions and environment are in cross-browser-e2e.md.

Remaining audit scope before final T141 acceptance: complete sale keyboard-only
walkthrough and focus/error review, application-wide navigation, zoom/contrast,
screen-reader review, and human responsive-layout observations. Existing T140
cross-browser results provide functional coverage but are not a WCAG certificate.

## Sale input follow-up, 2026-09-17

The multiline sale regression now checks the actual quantity input's decimal
keyboard hint and rejects a negative quantity without sending a quote request.
It also verifies that validation moves focus to that input. The test first failed
because `inputMode` was attached to the MUI wrapper. The fix passes `inputMode`
through `slotProps.htmlInput` and React Hook Form's reference through `inputRef`.
The existing valid multiline confirmation continues to pass after correction.

Validation: the same three component suites above passed, 16 tests total, using
`--testTimeout=15000`. These DOM tests do not replace the remaining browser,
screen-reader, visual, or participant audit. T141 remains unchecked; no new human
observations or acceptance scores were recorded. Work continued to independent
parallel task T142 while those observations remain pending.
