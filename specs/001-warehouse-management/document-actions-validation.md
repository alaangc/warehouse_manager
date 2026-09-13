# T131 document actions validation

Date: 2026-09-13

## Implemented

- Shared DocumentActions for READY authorized document resources, with actor/role/document/version-scoped component lifetime.
- Feature detection with `navigator.canShare({ files })`, both for a PDF probe and the actual prepared file. Missing, false, or throwing capability checks leave download available.
- Authorized PDF bytes are prepared in memory only when file sharing is supported. The native `navigator.share` call runs directly from the click handler, before any await or network request.
- No automatic native share or download. Cancellation produces a neutral status; rejection leaves explicit download available. In-flight operations prevent duplicate clicks.
- Downloads re-fetch authorized canonical content, check MIME and the PDF header, retain exact bytes, sanitize filenames, and remove temporary links/revoke object URLs.
- Pending requests abort on unmount. Late responses cannot trigger download after the view is gone. Prepared files are not stored in browser storage or shared query caches.
- Forbidden content removes output actions; status/source checks remain authoritative on the API. No business commands are submitted by these actions.

## Verification

- Initial existing share test failed because the share control did not exist.
- 18 focused action tests cover gesture timing, capability checks, cancellation/rejection, duplicate clicks, denied content, unmount cleanup, non-READY states, exact bytes, filenames, and object URLs.
- Entire web suite with `vitest run --config vitest.workspace.ts --project web --maxWorkers=2 -t '^(?!.*print acceptance)'`: 191 passed; 7 T132 print cases intentionally filtered out.
- The first unconstrained full-suite run exceeded several test timeouts under worker/build contention; the bounded-worker rerun passed without relaxing assertions or timeouts.
- Focused ESLint: zero warnings. Workspace build: passed, with the existing web bundle-size warning.
- Chromium HTTP-fixture checks: 2 passed at 1440x900 and 390x900. The mobile test instruments the native share boundary and verifies `navigator.userActivation.isActive === true`, the canonical PDF filename, and byte count.
- Stable desktop/mobile screenshots inspected. Browser evidence uses HTTP fixtures and an instrumented native share method, not an actual operating-system share target or live database.

## Reference and remaining scope

The [W3C Web Share specification](https://www.w3.org/TR/web-share/) requires transient activation for `share()` and permits `canShare()` checks without activation. Preparing the file first preserves that activation for the user's click. Native target availability and successful handoff vary by operating system; a resolved share promise does not establish recipient delivery.

Actual OS share-sheet/device acceptance remains a release check. Output-attempt acceptance and print uncertainty UI remain in T132; no successful physical output or durable SHARE/DOWNLOAD attempt is claimed by this task.
