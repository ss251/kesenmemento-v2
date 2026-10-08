// [play:courses] mount(ctx, kit). kit is null until feat/play-kit is merged.
// The kit's play/index.js should call mountCourses(ctx, kit) once that file exists.

import { mount } from './run.js';

export { mount };

export function mountCourses(ctx, kit = null) {
  return mount(ctx, kit);
}
