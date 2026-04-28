import { supportedLocales } from '../i18n/config';
import { getDefaultLocale, isMultiLangMode } from './site-config';

export function detectLocale(path: string): string {
  if (!isMultiLangMode()) {
    return getDefaultLocale();
  }

  for (const lang of supportedLocales) {
    if (path === `/${lang}` || path.startsWith(`/${lang}/`)) {
      return lang;
    }
  }
  return 'en';
}

export function buildLocaleUrl(lang: string, path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  if (!isMultiLangMode()) {
    return cleanPath === '/' ? '/' : cleanPath;
  }

  return cleanPath === '/' ? `/${lang}/` : `/${lang}${cleanPath}`;
}

export function getLocaleFromPath(path: string): string {
  return detectLocale(path);
}

export function shouldShowLanguageSwitcher(): boolean {
  return isMultiLangMode();
}

export function getCurrentUrlWithoutLocale(pathname: string): string {
  if (!isMultiLangMode()) {
    return pathname;
  }
  
  const lang = detectLocale(pathname);
  if (pathname === `/${lang}` || pathname === `/${lang}/`) {
    return '/';
  }
  if (pathname.startsWith(`/${lang}/`)) {
    return pathname.slice(lang.length + 1);
  }
  return pathname;
}
