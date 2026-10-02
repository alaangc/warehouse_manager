# T129 ESC/POS formatter validation

Date: 2026-09-13

## Scope

- Added snapshot-validated Sale Ticket, confirmed route-load, and closed cash-close templates.
- Wrapped text at 32 columns for 58mm paper and 48 columns for 80mm paper, including oversized words.
- Preserved stored decimal strings without recalculating quantities, line amounts, or totals.
- Added explicit REPRINT confirmation and a visible REIMPRESION banner.
- Shared printable-document state validation with the Bluetooth adapter.
- Encoded Spanish text using pinned `@point-of-sale/codepage-encoder` 3.0.2 for CP437/CP850, or native UTF-8.
- Sanitized input controls and blocked OEM glyph mappings into printer control bytes. Unsupported codepage characters become `?`; line feeds are emitted only by the formatter.
- Reset formatting, selected the encoding, and added tear-off feeds without assuming cutter support.

## Verification

- Baseline: all 11 existing formatter tests failed because the module did not exist.
- `pnpm exec vitest run --config vitest.workspace.ts --project web apps/web/tests/printers/printer-adapter.test.ts`: 41 passed.
- `pnpm exec vitest run --config vitest.workspace.ts --project web apps/web/tests/printers/web-bluetooth-adapter.test.ts apps/web/tests/printers/printer-preference.test.tsx apps/web/tests/printers/printer-profile-ui.test.tsx`: 33 passed.
- Focused ESLint on changed TypeScript files: passed with zero warnings.
- `pnpm build`: passed for contracts, API, and web. Existing web bundle-size warning remains.

Coverage includes all three document types, both widths, accented text, encoding selection, long tokens, command injection, exact large decimals, optional cash-close fields, invalid states, reprint confirmation, and formatter-to-Bluetooth byte preservation.

## Hardware and integration limits

No physical printer was available. Approved profiles must validate their font width, codepage selection, and accented output on actual hardware. UTF-8 profiles require Epson FS ( C function 48 support. The 32/48-column layout targets single-column Spanish receipt text, not full-width CJK layout. Durable output-attempt acceptance and reload reconciliation remain in T132; this formatter does not record a successful physical print.

## References

- [CodepageEncoder API](https://github.com/NielsLeenheer/CodepageEncoder)
- [Epson ESC t character-code selection](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_lt.html): CP437 page 0 and CP850 page 2.
- [Epson FS ( C function 48](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/fs_lparen_cc_fn48.html): UTF-8 selection.
