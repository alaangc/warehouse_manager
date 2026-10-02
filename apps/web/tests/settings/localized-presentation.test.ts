import { afterEach, describe, expect, it } from 'vitest';
import { changeAppLanguage } from '../../src/i18n/index.js';
import { formatDecimal } from '../../src/i18n/format.js';
import { localizedErrorMessage } from '../../src/lib/api/localized-error.js';
import { ApiProblem } from '../../src/lib/api/problem.js';
import i18n from '../../src/i18n/index.js';

afterEach(() => changeAppLanguage('en'));

describe('exact localized presentation', () => {
  it.each(['en', 'es'] as const)('explains route assignment errors in %s', async (language) => {
    await changeAppLanguage(language);
    for (const code of ['DRIVER_ASSIGNED', 'VEHICLE_ASSIGNED', 'ROUTE_ASSIGNMENT_INVALID']) {
      const error = new ApiProblem({ type: 'about:blank', title: 'Conflict', status: 409, code });
      const message = localizedErrorMessage(error, i18n.t.bind(i18n));
      expect(i18n.exists(`errors.${code}`)).toBe(true);
      expect(message).toBe(i18n.t(`errors.${code}`));
      expect(message).not.toBe(i18n.t('errors.generic'));
    }
  });
  it.each(['en', 'es'] as const)('retains all API digits and scale in %s', async (language) => {
    await changeAppLanguage(language);
    expect(formatDecimal('9007199254740993.2100')).toBe('9,007,199,254,740,993.2100');
    expect(formatDecimal('-0.0050')).toBe('-0.0050');
    expect(formatDecimal('-1234.000')).toBe('-1,234.000');
    expect(formatDecimal('0.123456789012345678901')).toBe('0.123456789012345678901');
    expect(formatDecimal('not a decimal')).toBe('not a decimal');
  });

  it('uses stable problem codes in both languages and never renders unknown server details', async () => {
    const known = new ApiProblem({
      type: 'about:blank',
      title: 'Server title',
      status: 409,
      code: 'OPTIMISTIC_CONFLICT',
      detail: 'Untranslated detail',
    });
    const unknown = new ApiProblem({
      type: 'about:blank',
      title: 'Server title',
      status: 500,
      code: 'FUTURE_CODE',
      detail: 'Untranslated detail',
    });
    for (const language of ['es', 'en'] as const) {
      await changeAppLanguage(language);
      expect(localizedErrorMessage(known, i18n.t.bind(i18n))).toBe(
        language === 'es'
          ? 'Este registro cambió. Actualízalo e inténtalo de nuevo.'
          : 'This record changed. Refresh it and try again.',
      );
      expect(localizedErrorMessage(unknown, i18n.t.bind(i18n))).toBe(i18n.t('errors.generic'));
    }
  });
});
