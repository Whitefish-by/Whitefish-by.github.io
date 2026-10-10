import en from './locales/en.json' with { type: 'json' };
import zhHans from './locales/zh-hans.json' with { type: 'json' };
import zhHant from './locales/zh-hant.json' with { type: 'json' };
import ja from './locales/ja.json' with { type: 'json' };
import ko from './locales/ko.json' with { type: 'json' };
import ru from './locales/ru.json' with { type: 'json' };
import fr from './locales/fr.json' with { type: 'json' };
import de from './locales/de.json' with { type: 'json' };
import type { Locale } from './locales';
export type { Locale } from './locales';
export type HomeCopy = typeof en;
export const copy: Record<Locale, HomeCopy> = {
  en,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
  ja,
  ko,
  ru,
  fr,
  de,
};
