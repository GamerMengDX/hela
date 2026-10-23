import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {entries as nativeMessages} from '../../src/i18n/catalogs/native.js';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
// This package is self-contained: the canonical WeChat feature implementation and
// the mirrored copy are the same file, so there is no parent workspace to read.
const canonical=path.resolve(project,'..','wechat-miniprogram'),vendored=canonical;
try{await fs.access(path.join(canonical,'utils/majsoul-recognition.js'));}
catch{console.log('Using the bundled shared Mahjong Soul implementation.');process.exit(0);}
for(const name of ['majsoul-features.js','majsoul-recognition.js','majsoul-templates.js','tile-tap.js'])await fs.copyFile(path.join(canonical,'utils',name),path.join(vendored,'utils',name));
// The shared detector must not import the native wx storage/UI adapter.
// Retain its canonical progress protocol; the Heybox photo UI translates it.
const detector=await fs.readFile(path.join(vendored,'utils/majsoul-recognition.js'),'utf8');
const keys=[...new Set([...detector.matchAll(/\b(?:t|nativeError)\(\s*['"]([^'"]+)['"]/g)].map(match=>match[1]))];
const messages={};
for(const key of keys){if(!nativeMessages[key])throw new Error('Missing shared detector display key: '+key);messages[key]=nativeMessages[key][0];}
await build({stdin:{contents:
  "import {createTranslator} from './src/i18n/runtime.js';\n"+
  'const translate=createTranslator('+JSON.stringify({'zh-CN':messages})+');\n'+
  "export const t=(key,params={})=>translate(key,params,'zh-CN');\n"+
  'export const nativeError=(key,params={})=>Object.assign(new Error(t(key,params)),{messageRef:{key,params}});\n',
  resolveDir:path.dirname(project),sourcefile:'shared-detector-display.js'},
  outfile:path.join(vendored,'utils/locale.js'),bundle:true,format:'cjs',platform:'neutral',target:'es2020',minify:true,
  banner:{js:'// Generated portable display bridge; no wx, storage, UI or SDK dependency.'}});
for(const name of ['MAJSOUL-TEMPLATES-LICENSE.txt','MAJSOUL-TEMPLATES-NOTICE.md']){
  await fs.copyFile(path.join(canonical,name),path.join(vendored,name));
  await fs.mkdir(path.join(project,'public/vision'),{recursive:true});await fs.copyFile(path.join(canonical,name),path.join(project,'public/vision',name));
}
console.log('Synced the shared WeChat/Heybox screenshot recognizer.');
