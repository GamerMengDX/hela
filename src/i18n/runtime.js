// Locale runtime: the single source of truth for supported locales, tolerant
// normalization, and a text-only translator.
//
// Catalogs are plain nested objects keyed by semantic key (never by a Chinese
// sentence): `{locale: {semanticKey: 'template with {named} placeholders'}}`.
// The translator only ever returns a string and never touches HTML or the DOM.

export const LOCALES = Object.freeze(['zh-CN', 'ja', 'en']);
export const DEFAULT_LOCALE = 'zh-CN';
export const MISSING_KEY = 'I18N_MISSING_KEY';
export const MISSING_PARAM = 'I18N_MISSING_PARAM';

const CANONICAL = new Map(LOCALES.map(locale => [locale.toLowerCase(), locale]));
const EMPTY = Object.freeze(Object.create(null));

/** True when `value` names a supported locale (surrounding space and case are tolerated). */
export function isLocale(value) {
  return typeof value === 'string' && CANONICAL.has(value.trim().toLowerCase());
}

/** Canonical locale for `value`; anything missing, unknown or non-string falls back to Chinese. */
export function normalizeLocale(value) {
  return isLocale(value) ? CANONICAL.get(value.trim().toLowerCase()) : DEFAULT_LOCALE;
}

function i18nError(code, message, details) {
  const error = new Error(message);
  error.name = 'I18nError';
  error.code = code;
  Object.assign(error, details);
  return error;
}

function readParam(values, name) {
  return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : undefined;
}

// Only string/number/boolean are renderable; everything else (null, undefined,
// objects, NaN, Infinity) is treated as an absent parameter.
function toText(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  return null;
}

/**
 * Create a translator over `catalogs`.
 *
 * The returned `translate(key, params?, locale?)` resolves the requested locale,
 * falls back to Chinese, then to the semantic key itself. Placeholders of the
 * form `{name}` are replaced by value, so `$`/`` ` ``/`$&` inside a parameter are
 * never interpreted as replacement patterns.
 *
 * With `{strict: true}` a missing key throws `I18N_MISSING_KEY` and a missing or
 * non-string/number/boolean parameter throws `I18N_MISSING_PARAM`.
 */
export function createTranslator(catalogs, options = {}) {
  const strict = Boolean(options && options.strict);
  const table = catalogs && typeof catalogs === 'object' ? catalogs : EMPTY;

  function catalogFor(locale) {
    const entry = Object.prototype.hasOwnProperty.call(table, locale) ? table[locale] : undefined;
    return entry && typeof entry === 'object' ? entry : EMPTY;
  }

  function lookup(locale, key) {
    const entry = catalogFor(locale);
    const value = Object.prototype.hasOwnProperty.call(entry, key) ? entry[key] : undefined;
    // An empty or non-string entry is unusable, so it counts as missing and
    // falls through to the next layer instead of blanking the interface.
    return typeof value === 'string' && value !== '' ? value : null;
  }

  function substitute(template, params, key, locale) {
    const values = params && typeof params === 'object' && !Array.isArray(params) ? params : EMPTY;
    return template.replace(/\{([A-Za-z0-9_]+)\}/g, (placeholder, name) => {
      const text = toText(readParam(values, name));
      if (text === null) {
        if (strict) {
          throw i18nError(
            MISSING_PARAM,
            `Missing i18n parameter "${name}" for key "${key}" in locale "${locale}"`,
            {key, locale, param: name},
          );
        }
        return placeholder;
      }
      return text;
    });
  }

  return function translate(key, params = {}, locale = DEFAULT_LOCALE) {
    const resolved = normalizeLocale(locale);
    const name = typeof key === 'string' ? key : '';

    const template = name === '' ? null : lookup(resolved, name) || lookup(DEFAULT_LOCALE, name);
    if (template === null) {
      if (strict) {
        throw i18nError(MISSING_KEY, `Missing i18n key "${name}" for locale "${resolved}"`, {
          key: name,
          locale: resolved,
        });
      }
      return name;
    }
    return substitute(template, params, name, resolved);
  };
}
