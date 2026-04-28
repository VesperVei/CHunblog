import { siteConfig } from '../config';
import { supportedLocales } from '../i18n/config';
import type { SupportedLocale } from '../i18n/config';

export function isMultiLangMode(): boolean {
  return siteConfig.defaultLocale === undefined;
}

export function getDefaultLocale(): SupportedLocale {
  return siteConfig.defaultLocale ?? 'en';
}

export function getAstroI18nConfig() {
  return {
    defaultLocale: getDefaultLocale(),
    locales: [...supportedLocales],
    routing: {
      prefixDefaultLocale: isMultiLangMode(),
    },
  };
}
