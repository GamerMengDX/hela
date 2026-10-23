// Compile-time boundary for the local photo recognition page.
//
// The full directory build resolves this module as written: the real browser
// recognition page is loaded on demand, so its code, the ONNX runtime and the
// model data live in their own chunks and never in the entry bundle.
//
// The single file build rewrites this module to a disabled factory, so the
// identification code cannot be bundled at all: the entry is hidden and direct
// navigation is refused before this function is ever called.
import './vision/photo.css';

export const PHOTO_ENABLED = true;

export async function loadPhotoPage() {
  const {PhotoPage} = await import('./vision/photo-page.js');
  return PhotoPage;
}
