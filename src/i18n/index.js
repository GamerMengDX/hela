import {createTranslator,LOCALES} from './runtime.js';
import {createLocaleStore,LOCALE_KEY} from './locale-store.js';
import {catalogs} from './catalogs.js';

export {LOCALES,LOCALE_KEY};
export {catalogs,validateCatalogs} from './catalogs.js';

const translate=createTranslator(catalogs);
let store=createLocaleStore({read:async()=>undefined,write:async()=>{}});
let stopStore=()=>{};
const listeners=new Set();
function connect(){stopStore=store.subscribe(locale=>{for(const listener of [...listeners]){try{listener(locale);}catch{/* One view cannot prevent other views from updating. */}}});}
connect();

export function configureLocale(adapter){
  if(!adapter||typeof adapter.read!=='function'||typeof adapter.write!=='function')throw new TypeError('A locale storage adapter requires read and write.');
  stopStore();store=createLocaleStore(adapter);connect();
  return store;
}
export const current=()=>store.current();
export const initialize=()=>store.initialize();
export const setLocale=value=>store.setLocale(value);
export function subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);}
export const t=(key,params={},locale=current())=>translate(key,params,locale);
export const messages=(locale=current())=>catalogs[locale]||catalogs['zh-CN'];
