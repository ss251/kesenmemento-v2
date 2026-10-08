// Shared start for a race the multiplayer lane can join. Nothing leaves the device.
// The kit countdown hits GO at 2.16 s, so a shared GO instant starts the count this much earlier.

export const COUNT_LEAD_MS = 2160;

/** Milliseconds to wait before the countdown, so GO lands on `at` (epoch ms). A pose is not a clock. */
export function startDelay(at, now, lead = COUNT_LEAD_MS) {
  if (typeof at !== 'number' || !Number.isFinite(at) || !Number.isFinite(now)) return 0;
  const wait = at - lead - now;
  return wait > 0 ? wait : 0;
}
