// [play] The view button cycles 歩く（3人称） → 歩く（1人称） → 飛ぶ.
// `ui.view` stays 'walk' | 'drone' so places, digits and the auto tour keep working.
// The button names the view it switches TO.

export const VIEW_CYCLE = ['walk3', 'walk1', 'fly'];

export function viewId(view, person) {
  if (view === 'drone') return 'fly';
  return person === 'first' ? 'walk1' : 'walk3';
}

export function nextView(id) {
  const i = VIEW_CYCLE.indexOf(id);
  return VIEW_CYCLE[(i < 0 ? 0 : i + 1) % VIEW_CYCLE.length];
}

export function viewLabelKey(id) {
  if (id === 'walk1') return 'play.avatar.view.walk1';
  if (id === 'fly') return 'play.avatar.view.fly';
  return 'play.avatar.view.walk3';
}
