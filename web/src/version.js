/* global __HELA_VERSION__ */
// Injected at build time from the published package version; the fallback keeps
// this module importable by tests that run the sources without a bundler.
export const APP_VERSION = typeof __HELA_VERSION__ === 'undefined' ? '0.6.2-dev' : __HELA_VERSION__;
