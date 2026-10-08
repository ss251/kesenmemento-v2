// The car lives in the notebook under meta.car. The kit's migrate keeps that object (see store.js).
// The race medal also lands in courses['race-minato'], which is the shape the courses tab already reads.
import { DEFAULT_ASSIST, DEFAULT_LOOK } from '../garage/catalog.js';

export const RACE_ID = 'race-minato';

export function readCar(store) {
  const meta = store?.get?.('meta') || {};
  const car = meta.car && typeof meta.car === 'object' ? meta.car : {};
  const src = car.look && typeof car.look === 'object' ? car.look : {};
  return {
    assist: car.assist !== false && car.assist !== 0,
    look: {
      paint: src.paint || DEFAULT_LOOK.paint,
      livery: src.livery || DEFAULT_LOOK.livery,
      wheel: src.wheel || DEFAULT_LOOK.wheel,
      roof: src.roof || DEFAULT_LOOK.roof,
      plate: src.plate || DEFAULT_LOOK.plate,
    },
    unlocked: car.unlocked && typeof car.unlocked === 'object' ? car.unlocked : {},
    race: car.race && typeof car.race === 'object' ? car.race : {},
  };
}

export function writeCar(store, patch) {
  if (!store?.update) return;
  store.update('meta', (d) => {
    const prev = d.car && typeof d.car === 'object' ? d.car : {};
    d.car = Object.assign(prev, patch);
    if (d.car.assist == null) d.car.assist = DEFAULT_ASSIST;
  });
}

export function readCourse(store) {
  const all = store?.get?.('courses') || {};
  return all[RACE_ID] || null;
}

export function writeCourse(store, row) {
  if (!store?.update) return;
  store.update('courses', (d) => { d[RACE_ID] = row; });
}
