// [play:missions] Where まちへ出る puts you: on foot, third person, about 6 m from the
// first quest giver (the 漁師), facing him. The camera eases down from the title shot.

export const FISHER = { x: 32.7, z: 86.8, yaw: 2.34 };
export const ARRIVE_M = 6;
export const ARRIVE_S = 1.5;

/** Feet, heading in degrees (yaw 0 is north), and how long the camera takes to come down. */
export function welcomePose() {
  const yaw = FISHER.yaw;
  return {
    x: FISHER.x + Math.sin(yaw) * ARRIVE_M,
    z: FISHER.z + Math.cos(yaw) * ARRIVE_M,
    yawDeg: yaw * 180 / Math.PI,
    person: 'third',
    fly: false,
    dur: ARRIVE_S,
  };
}
