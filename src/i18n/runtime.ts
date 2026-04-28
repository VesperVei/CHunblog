import { supportedLocales } from './config';
import type { SupportedLocale } from './config';

export const allLanguages = supportedLocales;

export function isRTL(_lang: string): boolean {
  return false;
}

export function getLanguageFromUrl(url: URL): SupportedLocale {
  const [, lang] = url.pathname.split('/');
  if (allLanguages.includes(lang as SupportedLocale)) {
    return lang as SupportedLocale;
  }
  return 'en';
}
