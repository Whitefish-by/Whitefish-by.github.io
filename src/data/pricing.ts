import en from './pricing/en.json' with { type: 'json' };
import zhHans from './pricing/zh-hans.json' with { type: 'json' };
import zhHant from './pricing/zh-hant.json' with { type: 'json' };
import ja from './pricing/ja.json' with { type: 'json' };
import ko from './pricing/ko.json' with { type: 'json' };
import ru from './pricing/ru.json' with { type: 'json' };
import fr from './pricing/fr.json' with { type: 'json' };
import de from './pricing/de.json' with { type: 'json' };
import type { Locale } from './locales';

export const pricingCopy: Record<Locale, typeof en> = {
  en,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
  ja,
  ko,
  ru,
  fr,
  de,
};
// The same commercial facts feed every language; translations contain placeholders.
export const plans = [
  { name: 'Free', price: '0', credits: 100, storage: 1, rolloverMonths: 0, rolloverCap: 0 },
  { name: 'Lite', price: '4.99', credits: 1200, storage: 10, rolloverMonths: 2, rolloverCap: 2400 },
  {
    name: 'Pro',
    price: '19.99',
    credits: 6000,
    storage: 50,
    rolloverMonths: 3,
    rolloverCap: 18000,
  },
] as const;
export const packs = [
  { name: 'Starter', price: '5', credits: 500 },
  { name: 'Research', price: '10', credits: 1200 },
  { name: 'Scholar', price: '50', credits: 7000 },
] as const;
export const offers = {
  welcomeCredits: 300,
  welcomeDays: 30,
  introDays: 30,
  firstMonthPrice: '2.49',
};
export const usage = ['~50', '~100–200', '~5–20', '~20–50', '~100+'];
export const detailKeys = ['welcome', 'spending', 'renewal', 'downgrade'] as const;

export function formatPricing(
  text: string,
  locale: Locale,
  values: Record<string, string | number> = {},
) {
  const variables: Record<string, string | number> = {
    ...offers,
    firstMonthPrice: `$${offers.firstMonthPrice}`,
    litePrice: `$${plans[1].price}`,
    ...values,
  };
  return text.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = variables[key];
    if (value === undefined) throw new Error(`Unknown pricing placeholder: ${key}`);
    return typeof value === 'number' ? new Intl.NumberFormat(locale).format(value) : value;
  });
}
