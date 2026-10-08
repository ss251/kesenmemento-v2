// The hub card for 「みんなで」. One 16:10 still, a hook, and three chips.
// The SVG is the stand-in until card-art.js holds a real 港町 capture.

const STILL = `<svg viewBox="0 0 320 200" aria-hidden="true">
  <rect width="320" height="200" fill="#89C3EB"/>
  <path fill="#7CB87A" d="M0 118 L70 78 L140 118 L210 86 L320 124 V200 H0Z"/>
  <path fill="#165E83" d="M0 132 C80 120 140 150 210 136 C260 128 300 140 320 134 V168 H0Z"/>
  <path fill="#223A70" d="M0 168 H320 V200 H0Z"/>
  <g fill="#F8B500" stroke="#223A70" stroke-width="3">
    <rect x="78" y="124" width="62" height="28" rx="4"/>
    <rect x="84" y="114" width="36" height="14" rx="3" fill="#FBFAF5"/>
  </g>
  <circle cx="94" cy="154" r="7" fill="#17184B"/>
  <circle cx="124" cy="154" r="7" fill="#17184B"/>
  <g fill="#00A3AF" stroke="#223A70" stroke-width="3">
    <rect x="168" y="118" width="62" height="28" rx="4"/>
    <rect x="174" y="108" width="36" height="14" rx="3" fill="#FBFAF5"/>
  </g>
  <circle cx="184" cy="148" r="7" fill="#17184B"/>
  <circle cx="214" cy="148" r="7" fill="#17184B"/>
</svg>`;

function stars(n) {
  const k = Math.max(0, Math.min(3, n | 0));
  return '★'.repeat(k) + '☆'.repeat(3 - k);
}

export function fillCard(root, spec, lang) {
  const L = lang === 'en' ? 'en' : 'ja';
  const title = spec?.title?.[L] || spec?.title?.ja || '';
  const hook = spec?.hook?.[L] || spec?.hook?.ja || '';
  const minutes = spec?.minutes ? (L === 'ja' ? spec.minutes + '分' : spec.minutes + ' min') : '';
  const who = spec?.players === 'many' ? (L === 'ja' ? 'みんなで' : 'Together') : (L === 'ja' ? '1人' : '1');
  const fresh = typeof spec?.isNew === 'function' ? !!spec.isNew() : false;
  const alt = L === 'ja' ? '港町を走る二台' : 'Two vans on the harbour road';
  root.innerHTML = `
    <article class="mode-card" data-mode="multi">
      <div class="still">${STILL}<img alt="${alt}" hidden></div>
      ${fresh ? '<b class="new">NEW</b>' : ''}
      <h3></h3>
      <p class="hook"></p>
      <p class="chips"><span></span><span></span><span></span></p>
    </article>`;
  root.querySelector('h3').textContent = title;
  root.querySelector('.hook').textContent = hook;
  const chips = root.querySelectorAll('.chips span');
  chips[0].textContent = minutes;
  chips[1].textContent = stars(spec?.stars || 0);
  chips[2].textContent = who;
  const img = root.querySelector('img');
  img.alt = alt;
  if (spec?.art) {
    img.hidden = false;
    img.src = spec.art;
    img.addEventListener?.('error', () => { img.hidden = true; img.removeAttribute('src'); });
  }
}
