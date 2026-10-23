import {t} from '../../src/i18n/index.js';
import {errorMessage as sharedErrorMessage} from '../../src/i18n/presenters.js';
// The browser build has no Heybox preview mode: the only storage adapter is the
// browser platform adapter, so the preview helpers of the mini-program copy are
// intentionally absent here.
export function createLocaleAdapter(adapter){return {read:key=>adapter.read(key),write:(key,value)=>adapter.write(key,value)};}
export function setDocumentLanguage(locale,doc=globalThis.document){if(doc?.documentElement)doc.documentElement.lang=locale;}

export function uiError(key,params={}){return Object.assign(new Error(t(key,params)),{messageRef:{key,params}});}
export function errorText(error,locale){const ref=error?.messageRef;if(ref?.key?.startsWith('heybox.'))return t(ref.key,ref.params||{},locale);return sharedErrorMessage(error,locale);}
