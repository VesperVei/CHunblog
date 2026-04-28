import { getDefaultLocale } from "../utils/site-config";
import type I18nKey from "./i18nKey";
import { en } from "./languages/en.ts";
import { zh_cn } from "./languages/zh-cn.ts";;

export type PluralTranslation = {
  zero?: string;
  one?: string;
  other: string;
};

export type ListTranslation = [string, string, string];

export type Translation = {
  [K in I18nKey]: string | PluralTranslation | ListTranslation;
};

export type I18nParams = Record<string, string | number> | string[];

function replaceParams(text: string, params: Record<string, string | number>): string {
  return text.replace(/{(\w+)}/g, (_, key) => {
    return params[key] !== undefined ? String(params[key]) : `{${key}}`;
  });
}

function formatList(items: string[], parts: ListTranslation): string {
  const [prefix, separator, conjunction] = parts;
  
  if (!items || items.length === 0) return "";
  if (items.length === 1) return prefix + items[0];
  if (items.length === 2) return prefix + items[0] + conjunction + items[1];

  const allButLast = items.slice(0, -1).join(separator);
  const last = items[items.length - 1];
  return prefix + allButLast + conjunction + last;
}

export const languages = {
  "en": en,
  "zh-cn": zh_cn,
};

export function getTranslation(lang: string): Translation {
  return languages[lang.toLowerCase()] || languages[getDefaultLocale()];
}

export function translate(key: I18nKey, params?: I18nParams, lang = getDefaultLocale()): string {
  const dict = getTranslation(lang);
  let template = dict[key];

  if (!template) return String(key);

  if (Array.isArray(template)) {
    const listParams = Array.isArray(params) ? params : [];
    return formatList(listParams, template as ListTranslation);
  }
  if (typeof template === 'object' && !Array.isArray(template)) {
    const count = (params && !Array.isArray(params)) ? Number(params.count) : NaN;
    if (count === 0)      template = template.zero ?? template.other;
    else if (count === 1) template = template.one  ?? template.other;
    else                  template = template.other;
  }

  const finalTemplate = String(template);

  if (!params || Array.isArray(params)) {
    return finalTemplate;
  }

  return replaceParams(finalTemplate, params);
}

export function useTranslations(lang?: string) {
  return function t(key: I18nKey, params?: I18nParams): string {
    return translate(key, params, lang);
  }
}
