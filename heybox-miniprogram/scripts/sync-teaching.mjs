// Teaching modules check.
//
// The teaching examples, their exercise model and the scorer they feed live in
// the package's single shared core (../src). Nothing is copied or mirrored any
// more, so this step verifies that the shared files are present, loadable and
// still describe exactly 30 lessons before a build is allowed to continue.
//
// Usage:  node scripts/sync-teaching.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shared = path.resolve(project, '..', 'src');
const REQUIRED = ['examples.js', 'teaching.js', 'teaching-examples.js', 'teaching-model.js', 'teaching-exercise.js'];

if (path.relative(path.resolve(project, '..'), shared).startsWith('..')) {
  throw new Error('Shared source root escapes the package: ' + shared);
}

for (const name of REQUIRED) {
  await fs.access(path.join(shared, name)).catch(() => {
    throw new Error('Missing shared teaching module: src/' + name);
  });
}

const module = await import(pathToFileURL(path.join(shared, 'teaching-examples.js')).href);
const examples = module.TEACHING_EXAMPLES || module.examples || module.default;
if (!Array.isArray(examples)) throw new Error('teaching-examples.js does not export an example list.');
if (examples.length !== 30) throw new Error('Expected 30 teaching lessons, found ' + examples.length + '.');
const ids = new Set();
for (const example of examples) {
  if (!example.id) throw new Error('A teaching lesson is missing its id.');
  if (ids.has(example.id)) throw new Error('Duplicate teaching lesson id: ' + example.id);
  ids.add(example.id);
}

console.log('Verified the shared teaching set: ' + examples.length + ' lessons from src/.');
