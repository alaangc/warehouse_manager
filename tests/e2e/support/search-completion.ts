import type { SearchKind } from './performance-profile.js';

export interface SearchExpectation {
  kind: SearchKind;
  query: string;
  suffix: string;
  productId: string;
  matches: boolean;
}
// Runs inside the real browser. All four conditions must hold simultaneously;
// neither an HTTP response nor stale rows alone can stop the clock.
export function searchCompletion(expected: SearchExpectation) {
  const labels = {
    products: ['Search products', 'Products'],
    customers: ['Search customers', 'Customer directory'],
    inventory: ['Search product or location', 'Inventory balances'],
  };
  const region = document.querySelector(`[aria-label="${labels[expected.kind][1]}"]`);
  if (!region) return false;
  const input = [...document.querySelectorAll('input')].find(
    (input) =>
      input.getAttribute('aria-label') === labels[expected.kind][0] ||
      [...(input.labels ?? [])].some(
        (label) => label.textContent?.trim() === labels[expected.kind][0],
      ),
  );
  if (input?.value !== expected.query) return false;
  const visible = (element: Element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      style.opacity !== '0'
    );
  };
  const visibleText = (element: Element): string =>
    visible(element)
      ? [...element.childNodes]
          .map((child) =>
            child.nodeType === Node.TEXT_NODE
              ? (child.textContent ?? '')
              : child instanceof Element
                ? visibleText(child)
                : '',
          )
          .join(' ')
      : '';
  const loadingEnded =
    region.getAttribute('aria-busy') === 'false' && !document.querySelector('[role="alert"]');
  const rows =
    expected.kind === 'customers'
      ? [...region.querySelectorAll('button')]
      : [...region.querySelectorAll('tbody tr')].filter(
          (row) => row.querySelectorAll('td').length > 1,
        );
  const noResult = {
    products: 'No records found.',
    customers: 'No customers match these filters.',
    inventory: 'No inventory balances match these filters.',
  }[expected.kind];
  const expectedRows = expected.matches ? (expected.kind === 'inventory' ? 2 : 1) : 0;
  const visibleResult =
    visible(region) &&
    rows.length === expectedRows &&
    (expected.matches ? rows.every(visible) : visibleText(region).includes(noResult));
  const identifyingValues = expected.matches
    ? rows.every((row) => {
        const value = visibleText(row);
        if (expected.kind === 'products')
          return [
            `PERF-P-${expected.suffix}`,
            `Perf product ${expected.suffix}`,
            '10.0000',
            'Active',
          ].every((text) => value.includes(text));
        if (expected.kind === 'customers')
          return [
            `PERF-C-${expected.suffix}`,
            `Perf customer ${expected.suffix}`,
            'Magdalena',
            'Active',
          ].every((text) => value.includes(text));
        return (
          value.includes(expected.productId) &&
          value.includes(`Perf product ${expected.suffix}`) &&
          value.includes('2026') &&
          !value.includes('Invalid') &&
          (value.includes('Magdalena')
            ? value.includes('100.000') && value.includes('Available')
            : value.includes('PERF-R') && value.includes('0.000') && value.includes('Out of stock'))
        );
      })
    : rows.length === 0 && visibleText(region).includes(noResult);
  const actions =
    expected.kind === 'customers'
      ? rows
      : [...region.querySelectorAll('tbody button, tbody a[href]')];
  const enabledActions =
    actions.length === expectedRows &&
    actions.every(
      (action) =>
        visible(action) &&
        !action.matches(':disabled') &&
        action.getAttribute('aria-disabled') !== 'true' &&
        (action.tagName !== 'A' || Boolean(action.getAttribute('href'))),
    );
  const checks = { loadingEnded, visibleResult, identifyingValues, enabledActions };
  return Object.values(checks).every(Boolean) ? { checks, finishedAt: performance.now() } : false;
}
