# T133: Physical printer acceptance

Prepared 2026-09-14 (America/Hermosillo).

**Status: NOT EXECUTED — hardware and client identification required.**
T133 remains unchecked. No physical printer has been connected, no paper has been
inspected, and no printer/browser/OS combination is approved by this document.

The [T132 software evidence](t132-print-dialog.md) records passing simulated BLE and
portable-browser tests. Those results are supporting evidence only, not a substitute
for this physical acceptance gate. The procedure below follows the
[physical acceptance requirements](../quickstart.md#physical-printer-acceptance-matrix).

## Identify the test setup

Before execution, record the actual values for each area. None have been supplied
for this run yet; do not copy the simulated printer profile into a hardware profile.

| Area | Required recorded values |
|---|---|
| Hardware | Manufacturer, exact model, firmware, physical paper width |
| Client | Computer/phone model, OS and version, browser and version |
| App | Tested commit, HTTPS origin, test date/time and operator |
| Transport | Confirmed BLE/GATT support, service UUID, writable characteristic UUID, WITH_RESPONSE or WITHOUT_RESPONSE |
| Protocol | ESC/POS support, encoding, initialization/feed behavior; current formatter sends no cut command |
| Configuration | Approved printer profile ID/version, maximum chunk bytes, inter-chunk delay |

Use the manufacturer's documentation or a device inspection to establish protocol
and UUID values; do not guess them. Bluetooth Classic-only hardware does not satisfy
the current BLE implementation. Record unsupported combinations rather than claiming
compatibility or changing the architecture during this test.

## Safe preparation

1. Use a separate test database and synthetic business records, never production
   transactions. Start the API and web app using the [local guide](../../../README.md).
2. Make the test app available through the approved HTTPS setup. Confirm the target
   browser exposes Bluetooth and permits the app's device access.
3. As Administrator, create a printer profile using the verified device settings.
   In Settings, select that approved profile for each test account.
4. Prepare an Administrator, an assigned Driver and another Driver; a completed sale,
   confirmed route load, closed cash close, report snapshot and a separate DRAFT load.
5. Generate the four authorized canonical PDFs. Save their document/source IDs,
   content versions and hashes. Capture pre-test sale/load/close and output-attempt
   counts for comparison. Keep the saved PDFs for content comparisons.
6. Include synthetic text such as `Café, piñata, azúcar, ¿Sí?`, long product names,
   enough line items to wrap, exact decimal prices/quantities and the configured
   currency code/symbol. Test every paper-width/encoding combination being proposed
   for approval; approval of one combination does not approve another.
7. Use the app's Connect printer button to select the device. Permission selection
   and inspection of physical paper require the operator at the device.

## Execution matrix

Every row below is **NOT RUN**. For each executed row record its timestamp, setup
identifier, source/document IDs, actor role, API status, output-attempt IDs/states,
observed physical result, evidence link and PASS/FAIL result. Do not mark a row passed
solely because the app reports SUCCEEDED: that indicates transfer, not paper output.

| Case | Action | Required result | Status |
|---|---|---|---|
| H01 | Connect and test the approved printer | User chooses device; API accepts STARTED before transport; test paper is readable; accepted terminal attempt is visible to Administrator | NOT RUN |
| H02 | Administrator prints Sale Ticket | Paper matches saved sale snapshot/PDF, exact quantities/prices/totals and Spanish text; one source sale remains | NOT RUN |
| H03 | Assigned Driver prints own Sale Ticket created by Administrator | Source ownership permits output regardless of document creator; paper matches the same snapshot | NOT RUN |
| H04 | Administrator and assigned Driver print confirmed route load | Paper matches confirmed quantities/units and route identity; no new load or inventory movement | NOT RUN |
| H05 | Administrator prints cash close | Paper preserves exact saved totals/share and close identity; no new close | NOT RUN |
| H06 | Check each supported template with long names and many lines | Correct wrapping/feed, readable accents and currency, no missing/duplicated lines or overflow at the approved paper width | NOT RUN |
| H07 | Deny/cancel Bluetooth permission | Visible error/cancellation; no document write or source mutation; retry requires another user gesture | NOT RUN |
| H08 | Disconnect before sending | No silent success or automatic print; explicit reconnect is required; source unchanged | NOT RUN |
| H09 | Disconnect or power off during a long print | Partial/uncertain output is visible as UNKNOWN; no automatic retry; source unchanged | NOT RUN |
| H10 | Reconnect after H09, then explicitly confirm reprint | Reconnect alone sends nothing; a new output attempt sends a copy marked REIMPRESION; original source/document retained | NOT RUN |
| H11 | Reopen the document after an unresolved attempt | Prior history requires explicit reprint confirmation, not an unnoticed fresh print | NOT RUN |
| H12 | Run out of paper, then replenish using manufacturer-safe procedure | Record actual device behavior; transfer success is not claimed as paper success; no source resubmission or silent app retry | NOT RUN |
| H13 | Interrupt API result saving after the physical write | Result-saving error is visible; retry saving uses the same idempotency key and does not print again | NOT RUN |
| H14 | Open unsupported browser or deny Bluetooth policy | No device write; visible unsupported/blocked message; authorized PDF download still works | NOT RUN |
| H15 | Administrator attempts REPORT PRINT and REPRINT | No print UI/device chooser/write; direct API returns 422; no accepted PRINT/REPRINT attempt; report snapshot/document unchanged | NOT RUN |
| H16 | Attempt DRAFT-load output | No print UI/device access; eligible source request rejects unconfirmed state; no document/accepted print attempt; unrelated Driver is denied authorization | NOT RUN |
| H17 | Driver attempts another Driver's ticket/load or any cash close/report | No unauthorized output UI; direct API denies access before snapshot/device output; no accepted attempt or source change | NOT RUN |

For negative HTTP checks, use the existing authenticated test tooling or browser
developer tools in the isolated test environment; preserve CSRF and a fresh
idempotency key. Never include cookies, CSRF/session tokens or credentials in saved
screenshots, logs or evidence. Redact unrelated personal data from paper photos.

## Closure criteria

- Every proposed hardware/browser/OS/profile combination has its own actual results.
- Paper photographs or scans and saved canonical PDFs support all content checks.
- Denied REPORT printing has UI/API and no-device-access/no-write evidence, with
  before/after output-attempt and source comparisons.
- Failure observations cover uncertain delivery, explicit reprint, unsupported
  clients and paper exhaustion without duplicate business records.
- Failures are fixed and retested, or the combination is explicitly not approved.
- A reviewer records the approved combinations and evidence. Only then mark T133
  complete and create its completion commit.

**Current blocker:** the exact printer model/firmware and client device/OS/browser
have not been provided, and physical paper observations require a local operator.
