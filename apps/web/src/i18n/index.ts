import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './locales/en.js';
import { es } from './locales/es.js';

export const LANGUAGE_STORAGE_KEY = 'warehouse-manager-language';
export type AppLanguage = 'en' | 'es';

function storedLanguage(): AppLanguage {
  if (typeof window === 'undefined') return 'es';
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return stored === 'en' || stored === 'es' ? stored : 'es';
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es } },
  lng: storedLanguage(),
  fallbackLng: 'en',
  supportedLngs: ['en', 'es'],
  interpolation: { escapeValue: false },
  initAsync: false,
});

i18n.on('languageChanged', (language) => {
  const normalized: AppLanguage = language.startsWith('es') ? 'es' : 'en';
  if (typeof document !== 'undefined') document.documentElement.lang = normalized;
  if (typeof window !== 'undefined') window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
});

if (typeof document !== 'undefined') document.documentElement.lang = storedLanguage();

export async function changeAppLanguage(language: AppLanguage) {
  await i18n.changeLanguage(language);
}

export function currentLocale(): string {
  return i18n.resolvedLanguage?.startsWith('es') ? 'es-MX' : 'en-US';
}

export default i18n;
