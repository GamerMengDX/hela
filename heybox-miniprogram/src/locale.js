import {t} from '../../src/i18n/index.js';
import {errorMessage as sharedErrorMessage} from '../../src/i18n/presenters.js';
// Keep the historic preview business key while isolating every other storage key.
export const PREVIEW_BUSINESS_KEY='hela-heybox-ui-polish-preview-v1';
export const BUSINESS_KEY='hela_ui_polish_test_v1';
export function previewStorageKey(key){return key===BUSINESS_KEY?PREVIEW_BUSINESS_KEY:'hela-heybox-preview:'+key;}
export function createPreviewAdapter(storage){
  return {read:async key=>{const raw=storage.getItem(previewStorageKey(key));return raw?JSON.parse(raw):undefined;},write:async(key,value)=>{storage.setItem(previewStorageKey(key),JSON.stringify(value));}};
}
export function createLocaleAdapter(adapter){return {read:key=>adapter.read(key),write:(key,value)=>adapter.write(key,value)};}
export function setDocumentLanguage(locale,doc=globalThis.document){if(doc?.documentElement)doc.documentElement.lang=locale;}

export function uiError(key,params={}){return Object.assign(new Error(t(key,params)),{messageRef:{key,params}});}
export function errorText(error,locale){const ref=error?.messageRef;if(ref?.key?.startsWith('heybox.'))return t(ref.key,ref.params||{},locale);return sharedErrorMessage(error,locale);}
