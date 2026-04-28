export const supportedLocales = ['en', 'zh-cn'] as const;
export type SupportedLocale = typeof supportedLocales[number];
