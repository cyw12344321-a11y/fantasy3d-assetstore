export const nativeLanguages = Object.freeze([
  { code: 'en', label: 'English', direction: 'ltr' },
  { code: 'zh', label: '简体中文', direction: 'ltr' },
  { code: 'es', label: 'Español', direction: 'ltr' },
  { code: 'fr', label: 'Français', direction: 'ltr' },
  { code: 'de', label: 'Deutsch', direction: 'ltr' },
  { code: 'ja', label: '日本語', direction: 'ltr' }
]);

export function normalizeLanguage(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 64) return null;
  try { return Intl.getCanonicalLocales(value.trim().replaceAll('_', '-'))[0] || null; }
  catch { return null; }
}

export function languageDirection(value) {
  const canonical = normalizeLanguage(value);
  if (!canonical) return 'ltr';
  const locale = new Intl.Locale(canonical).maximize();
  return ['Arab', 'Hebr', 'Thaa', 'Nkoo', 'Adlm', 'Rohg', 'Syrc'].includes(locale.script) ? 'rtl' : 'ltr';
}

export function resolveLanguage({ requested, saved, browser = [], available = nativeLanguages.map(v => v.code) } = {}) {
  const supported = available.map(normalizeLanguage).filter(Boolean);
  const candidates = [requested, saved, ...browser].map(normalizeLanguage).filter(Boolean);
  const wanted = candidates[0] || 'en';
  for (const candidate of candidates) {
    if (supported.includes(candidate)) return { requested: wanted, locale: candidate, fallback: candidate !== wanted, direction: languageDirection(candidate) };
    const parsed = new Intl.Locale(candidate);
    // Do not present Simplified Chinese as a Traditional Chinese translation.
    const traditional = parsed.language === 'zh' && (parsed.script === 'Hant' || (!parsed.script && ['TW', 'HK', 'MO'].includes(parsed.region)));
    if (!traditional && supported.includes(parsed.language)) return { requested: wanted, locale: parsed.language, fallback: candidate !== wanted, direction: languageDirection(parsed.language) };
    // An explicit URL or saved preference wins; unsupported locales get an honest English fallback.
    if (candidate === normalizeLanguage(requested) || candidate === normalizeLanguage(saved)) break;
  }
  const locale = supported.includes('en') ? 'en' : supported[0] || 'en';
  return { requested: wanted, locale, fallback: wanted !== locale, direction: languageDirection(locale) };
}
