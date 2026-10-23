// Every user-visible image URL is produced here.
//
// The full directory build keeps relative paths, so it works from any GitHub
// Pages sub-directory (`./assets/...` resolves next to index.html). The single
// file build replaces this module with an inlined data-URI map, which is why no
// other module may hard-code an image path.
export const TILE_BASE = './assets/tiles/';
export const tileSrc = tile => TILE_BASE + tile + '.svg';
export const appIconSrc = () => './assets/app-icon-buddies.webp';
