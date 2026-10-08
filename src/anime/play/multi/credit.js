// Shown while a remote friend is the walking ホヤぼーや. The avatar lane already
// credits him when you are him; this covers the case where a friend is him and
// you are in a car, a boat, or the original walker.
// The line is the city's, from the design manual (p.4).

export const HOYA_CREDIT = '気仙沼市観光キャラクター「海の子 ホヤぼーや」';

export function mountCredit(parent) {
  const p = parent.ownerDocument.createElement('p');
  p.className = 'multi-hoya-credit';
  p.hidden = true;
  p.textContent = HOYA_CREDIT;
  parent.appendChild(p);
  return {
    set(on) { p.hidden = !on; },
  };
}
