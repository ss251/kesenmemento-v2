// Local pose for the relay. One reused object on the hot path; callers that keep it must copy.
// Yaw is the walker's: 0 looks north. The ship already stores that on playerObj (sail adds π).

const MODES = ['avatar', 'car', 'boat', 'gull', 'fish'];

export function readPose(ctx, out) {
  const p = ctx?.player?.position;
  const pl = ctx?.playerObj;
  out.x = p?.x || 0;
  out.y = p?.y || 0;
  out.z = p?.z || 0;
  out.yaw = Number.isFinite(pl?.yaw) ? pl.yaw : 0;
  out.look = Number.isFinite(pl?.pitch) ? pl.pitch : 0;
  out.pitch = 0;
  out.vehicle = 0;
  const uw = ctx?.services?.underwater;
  const drive = ctx?.services?.explore?.drive;
  const sail = ctx?.services?.sail || ctx?.services?.explore?.sail;
  const gull = ctx?.services?.gull;
  if (uw?.active) out.mode = 'fish';
  else if (drive?.active) {
    out.mode = 'car';
    if (Number.isFinite(drive.state?.yaw)) out.yaw = drive.state.yaw;
    if (Number.isFinite(drive.state?.pitch)) out.pitch = drive.state.pitch;
    const g = ctx?.services?.garage?.style;
    if (Number.isInteger(g)) out.vehicle = g & 15;
  } else if (sail?.active) {
    out.mode = 'boat';
    const kind = sail.boatKind || sail.boatId;
    out.vehicle = kind === 'katsuo' ? 1 : 0;
  }
  else if (gull?.active || pl?.fly) out.mode = 'gull';
  else out.mode = 'avatar';
  if (MODES.indexOf(out.mode) < 0) out.mode = 'avatar';
  return out;
}
