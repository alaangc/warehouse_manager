import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchCompletion } from '../../../tests/e2e/support/search-completion.js';

const expected = {
  kind: 'products' as const,
  query: '00001',
  suffix: '00001',
  productId: 'id',
  matches: true,
};
function render({ busy = false, price = '10.0000', disabled = false, empty = false } = {}) {
  document.body.innerHTML = `<table aria-label="Products" aria-busy="${busy}"><tbody>${empty ? '<tr><td>No records found.</td></tr>' : `<tr><td>PERF-P-00001</td><td>Perf product 00001</td><td>${price}</td><td>Active</td><td><button ${disabled ? 'disabled' : ''}>Edit</button></td></tr>`}</tbody></table>`;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 100,
    height: 30,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 100,
    bottom: 30,
    toJSON: () => ({}),
  });
  document.body.insertAdjacentHTML(
    'afterbegin',
    '<input aria-label="Search products" value="00001">',
  );
}
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});
describe('visible search completion gate', () => {
  it('requires all four conditions at once', () => {
    render();
    expect(searchCompletion(expected)).toMatchObject({
      checks: {
        loadingEnded: true,
        visibleResult: true,
        identifyingValues: true,
        enabledActions: true,
      },
    });
  });
  it.each([{ busy: true }, { price: '' }, { disabled: true }])(
    'does not count incomplete UI: %j',
    (options) => {
      render(options);
      expect(searchCompletion(expected)).toBe(false);
    },
  );
  it('requires an explicit empty state and rejects stale matching rows', () => {
    render();
    expect(searchCompletion({ ...expected, matches: false })).toBe(false);
    render({ empty: true });
    expect(searchCompletion({ ...expected, matches: false })).toMatchObject({
      checks: { visibleResult: true, identifyingValues: true, enabledActions: true },
    });
  });
  it('does not mistake errors or hidden data for a usable result', () => {
    render();
    document.body.insertAdjacentHTML('beforeend', '<div role="alert">Failed</div>');
    expect(searchCompletion(expected)).toBe(false);
    document.querySelector('[role="alert"]')!.remove();
    document.querySelector('tr')!.style.visibility = 'hidden';
    expect(searchCompletion(expected)).toBe(false);
  });
  it('rejects hidden values and stale input even when the row itself is visible', () => {
    render({ price: '<span hidden>10.0000</span>' });
    expect(searchCompletion(expected)).toBe(false);
    render();
    document.querySelector('input')!.value = 'a different search';
    expect(searchCompletion(expected)).toBe(false);
  });
});
