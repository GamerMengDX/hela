import {entries as native} from './catalogs/native.js';
import {entries as heybox} from './catalogs/heybox.js';
import {entries as shared} from './catalogs/shared.js';

export const CATALOG_LOCALES = ['zh-CN','ja','en'];
export const entries = Object.freeze({...native,...heybox,...shared});

const parameters = value => [...new Set([...value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map(match=>match[1]))].sort();
export function validateCatalogs() {
  const errors = [];
  const seen = new Set();
  for (const module of [native,heybox,shared]) {
    for (const [key,values] of Object.entries(module)) {
      if (seen.has(key)) errors.push('Duplicate key: '+key);
      seen.add(key);
      if (!/^[a-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)+$/.test(key)) errors.push('Non-semantic key: '+key);
      if (!Array.isArray(values)||values.length!==3||values.some(value=>typeof value!=='string'||!value.trim())) {
        errors.push('Incomplete translation: '+key); continue;
      }
      const expected=JSON.stringify(parameters(values[0]));
      for (let index=1;index<3;index++) if (JSON.stringify(parameters(values[index]))!==expected) errors.push('Placeholder mismatch: '+key+' / '+CATALOG_LOCALES[index]);
    }
  }
  return {ok:errors.length===0,errors,count:seen.size};
}

export const catalogs = Object.freeze(Object.fromEntries(CATALOG_LOCALES.map((locale,index)=>[
  locale,Object.freeze(Object.fromEntries(Object.entries(entries).map(([key,values])=>[key,values[index]])))
])));
