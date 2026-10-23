/* global __HELA_LEGAL__ */
// Licence texts shown by the help dialog.
//
// Both browser builds inject the real `LICENSE` (GNU AGPL v3) and
// `LICENSES/MAJIANG-CORE-MIT.txt` bytes at build time through
// `baseOptions()` → `__HELA_LEGAL__`. When the sources are executed without a
// bundler there is no room for the full texts, so a short notice is shown and
// the offline file / archive remains the authoritative copy.
import {APP_VERSION} from './version.js';

const FALLBACK = Object.freeze({
  agpl: 'GNU Affero General Public License v3.0 (AGPL-3.0-only). The full licence text ships inside the built page and in LICENSE of the source archive.',
  mit: '@kobalab/majiang-core is distributed under the MIT License. The full text ships inside the built page and in LICENSES/MAJIANG-CORE-MIT.txt of the source archive.'
});

const injected = typeof __HELA_LEGAL__ === 'object' && __HELA_LEGAL__ !== null ? __HELA_LEGAL__ : null;

export const LEGAL = Object.freeze({
  agpl: typeof injected?.agpl === 'string' ? injected.agpl : FALLBACK.agpl,
  mit: typeof injected?.mit === 'string' ? injected.mit : FALLBACK.mit,
  // True only when the full texts were embedded by the build.
  embedded: Boolean(injected)
});

/** Same-version source archive offered next to the built artifacts. */
export const sourceArchiveName = version => 'hela-' + version + '-source.zip';

export const sourceArchive = sourceArchiveName(APP_VERSION);
