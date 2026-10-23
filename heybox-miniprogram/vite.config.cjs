// Vite config for the 0.3.12 candidate.
//
// Deliberately CommonJS (`.cjs`, so it does not inherit the package's "type": "module"): with an ESM
// config Vite's default `configLoader: 'bundle'` writes the bundled config into
// `<nearest node_modules>/.vite-temp/*.mjs` and then imports it. In this isolated candidate
// `node_modules` is a read-only symlink into the shared checkout, so that write is refused (EPERM) and
// `hb-sdk build` fails before touching the project. Vite's CommonJS config path needs no temp file, so
// the same options load without writing outside this project; nothing else about the build changes.
const {miniappManifest} = require('@heybox/hb-sdk/vite');

module.exports = {
  base: './',
  cacheDir: '.vite-cache',
  plugins: [miniappManifest()],
  // Stable native debugging: code changes are picked up on a fresh entry,
  // without Vite trying to reload a sandbox document or open a HMR WebSocket.
  server: {hmr: false, ws: false},
  build: {modulePreload: false, chunkSizeWarningLimit: 550},
};
