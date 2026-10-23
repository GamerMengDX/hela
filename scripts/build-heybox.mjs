#!/usr/bin/env node
// Build the Heybox mini-program from the package root.
//
// The Heybox端 is a separate npm project (`heybox-miniprogram/`), so it keeps its
// own lockfile and its own install. This wrapper exists so that
// `npm run build:heybox` works from the root without remembering the two steps,
// and so the shared/vision gates always run before the platform build.
//
//   node scripts/build-heybox.mjs              # install (if needed) + build
//   node scripts/build-heybox.mjs --skip-install
//   node scripts/build-heybox.mjs --install-only
//
// Installing needs network access (the SDK and Vite are not vendored). Set
// HELA_NPM_CACHE to redirect the npm cache if your default cache is read-only.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = path.join(packageRoot, 'heybox-miniprogram');
const skipInstall = process.argv.includes('--skip-install');
const installOnly = process.argv.includes('--install-only');

function run(args) {
  const env = {...process.env};
  if (env.HELA_NPM_CACHE) {
    env.npm_config_cache = env.HELA_NPM_CACHE;
    env.npm_config_logs_dir = path.join(env.HELA_NPM_CACHE, '_logs');
  }
  const result = spawnSync('npm', args, {cwd: project, stdio: 'inherit', env});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('npm ' + args.join(' ') + ' failed with exit code ' + result.status);
}

const installed = async () => {
  try {
    await fs.access(path.join(project, 'node_modules/@heybox/hb-sdk/package.json'));
    return true;
  } catch {
    return false;
  }
};

if (!skipInstall) {
  const lock = path.join(project, 'package-lock.json');
  const haveLock = await fs.access(lock).then(() => true, () => false);
  if (!await installed()) {
    console.log('Installing the Heybox mini-program dependencies (' + (haveLock ? 'npm ci' : 'npm install') + ')…');
    run(haveLock ? ['ci', '--no-audit', '--no-fund'] : ['install', '--no-audit', '--no-fund']);
  } else {
    console.log('Heybox dependencies already installed.');
  }
}

if (!installOnly) run(['run', 'build']);
