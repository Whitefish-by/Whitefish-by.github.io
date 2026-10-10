export const locales = {
  en: { name: 'English', prefix: '', og: 'en_US' },
  'zh-Hans': { name: '简体中文', prefix: '/zh-hans', og: 'zh_CN' },
  'zh-Hant': { name: '繁體中文', prefix: '/zh-hant', og: 'zh_TW' },
  ja: { name: '日本語', prefix: '/ja', og: 'ja_JP' },
  ko: { name: '한국어', prefix: '/ko', og: 'ko_KR' },
  ru: { name: 'Русский', prefix: '/ru', og: 'ru_RU' },
  fr: { name: 'Français', prefix: '/fr', og: 'fr_FR' },
  de: { name: 'Deutsch', prefix: '/de', og: 'de_DE' },
} as const;
export type Locale = keyof typeof locales;
export type TranslatedPage = 'home' | 'pricing';
export const localeKeys = Object.keys(locales) as Locale[];
export const translatedLocales = localeKeys.filter((locale) => locale !== 'en');
export function localizedPath(locale: Locale, page: TranslatedPage = 'home') {
  return locales[locale].prefix + (page === 'home' ? '/' : '/pricing');
}
