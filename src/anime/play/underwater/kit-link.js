// [play:underwater] The kit. main.js now imports play/index.js statically, so the kit is evaluated before the early
// mount runs; a static import here avoids a module that is both imported and import()ed (Bun 1.3.14's splitter then
// fails to resolve it).
import * as KIT from '../kit/index.js';

export async function loadKit() {
  try {
    const kit = KIT;
    if (typeof kit?.sfx?.play !== 'function' || typeof kit?.ui?.notebook?.register !== 'function') return null;
    return kit;
  } catch (e) {
    return null;
  }
}
