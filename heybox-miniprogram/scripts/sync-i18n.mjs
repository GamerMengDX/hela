// Verify that the shared core this mini-program builds against is the one the
// manifest records.
//
// In the public package there is exactly one copy of the shared modules: ../src
// (this project's parent directory). Earlier internal layouts kept a second
// mirror inside the mini-program directory and copied between the two; that copy
// step is gone, so this script now *checks* the recorded hashes instead of
// rewriting them. `--write` re-records the manifest after an intentional change
// to the shared core.
//
// Usage:  node scripts/sync-i18n.mjs [--check|--write]
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.resolve(project, '..');
const source = path.join(packageRoot, 'src');
const manifestFile = path.join(project, 'i18n-source-manifest.json');
const write = process.argv.includes('--write');

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

// The explicit list is deliberate: a stray file in src/ must not silently join
// the shared surface, and a renamed core module must not silently drop out.
const SHARED = [
  'data.js',
  'engine.js',
  'examples.js',
  'hand-input.js',
  'practice.js',
  'teaching.js',
  'teaching-examples.js',
  'teaching-exercise.js',
  'teaching-model.js'
];

async function enumerateI18n(directory, prefix = '') {
  const files = [];
  for (const entry of await fs.readdir(directory, {withFileTypes: true})) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await enumerateI18n(path.join(directory, entry.name), relative));
    else if (entry.name.endsWith('.js')) files.push('i18n/' + relative);
  }
  return files;
}

if (path.relative(packageRoot, source).startsWith('..')) {
  throw new Error('Shared source root escapes the package: ' + source);
}

const files = [...SHARED, ...await enumerateI18n(path.join(source, 'i18n'))].sort();
const manifest = {version: 1, source: 'package src (explicit shared modules and i18n only)', files: {}};
for (const name of files) manifest.files[name] = digest(await fs.readFile(path.join(source, name)));

let recorded;
try {
  recorded = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
} catch {
  recorded = null;
}

if (write) {
  await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  console.log('Recorded ' + files.length + ' shared source hashes.');
} else {
  if (!recorded) throw new Error('Missing i18n-source-manifest.json; run with --write.');
  const drift = [];
  for (const [name, hash] of Object.entries(manifest.files)) {
    if (recorded.files?.[name] !== hash) drift.push('changed: ' + name);
  }
  for (const name of Object.keys(recorded.files || {})) {
    if (!(name in manifest.files)) drift.push('no longer shared: ' + name);
  }
  if (drift.length) {
    throw new Error('Shared source does not match the recorded manifest:\n  ' + drift.join('\n  ') +
      '\nRun `npm run prepare:i18n:write` if the change is intended.');
  }
  console.log('Verified ' + files.length + ' shared source files against i18n-source-manifest.json.');
}
