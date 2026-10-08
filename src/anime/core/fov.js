// [ui-c2] The vertical field of view of a frame, as ONE function. The screen (main.js resize()) and photo mode (ui/photo.js) both call it, so a photo shows what the screen shows.
//
// Landscape keeps 55 degrees vertical. A portrait frame keeps about 64 degrees HORIZONTAL (a fixed 55 vertical left a phone only ~28 degrees across: the town a thin strip over
// empty bay), capped at 88 degrees vertical: a 390x844 phone (aspect 0.462) sees 88 vertical and 48 horizontal. Before this function photo mode kept the screen's portrait 88 degrees
// vertical and rendered it into a 16:9 frame: a picture about 120 degrees across (mobile review F1).
//
// No three.js import (the maths is unit-tested in bun without it); the arithmetic is the order of operations main.js always had, so every pixel of the screen is unchanged.
export const FOV = { landscape: 55, portraitHorizontal: 64, portraitMax: 88 };
const DEG2RAD = Math.PI / 180;

/** The vertical field of view (degrees) for a frame of this width / height. */
export function fovFor(aspect) {
  return aspect < 1
    ? Math.min(FOV.portraitMax, 2 * Math.atan(Math.tan((FOV.portraitHorizontal * DEG2RAD) / 2) / aspect) * 180 / Math.PI)
    : FOV.landscape;
}

/** The horizontal field of view (degrees) of a frame with this vertical field of view and aspect. */
export const horizontalFov = (vfov, aspect) => 2 * Math.atan(Math.tan((vfov * DEG2RAD) / 2) * aspect) / DEG2RAD;
