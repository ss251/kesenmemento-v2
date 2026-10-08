// A small DOM for unit tests of UI code that builds itself with innerHTML (the repo has no jsdom / happy-dom): elements with attributes and children, an
// innerHTML parser and serializer for the HTML the HUD writes, the selectors it uses (tag, #id, .class, [attr], [attr="v"], descendant combinator, comma lists),
// events with capture and bubble, focus, and a write log (dom.writes) so a test can say exactly which nodes a code path touched.
//
//   const dom = makeDom();  dom.document / dom.window (addEventListener) / dom.fire(target, 'click', { detail: 1 }) / dom.writes / dom.html(el)
//
// It is only as faithful as the HUD needs; the real-browser checks are in test/hud-sync.e2e.test.js.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const unesc = (s) => s.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (m) => ENT[m]);
const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const TOKEN = /<!--[\s\S]*?-->|<\/([A-Za-z][\w-]*)\s*>|<([A-Za-z][\w-]*)((?:\s+[^\s=\/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
const ATTR = /([^\s=\/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

export function makeDom({ search = '', hostname = 'klc.test' } = {}) {
  const writes = [];
  const wrote = (node, kind, name = '') => { writes.push({ node, kind, name }); };

  // ------------------------------------------------------------------ events
  const listen = (t, type, fn, opts) => { (t._l ||= []).push({ type, fn, capture: opts === true || !!opts?.capture }); };
  const unlisten = (t, type, fn) => { t._l = (t._l || []).filter((l) => l.type !== type || l.fn !== fn); };
  function fire(target, type, props = {}) {
    const ev = { type, target, currentTarget: null, bubbles: true, defaultPrevented: false, detail: 0, _stop: false, _stopNow: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this._stop = true; }, stopImmediatePropagation() { this._stop = true; this._stopNow = true; }, ...props };
    const path = []; for (let n = target; n; n = n.parentNode ?? (n === doc ? win : null)) path.push(n);
    const run = (n, capture) => { ev.currentTarget = n; for (const l of [...(n._l || [])]) { if (l.type !== type || (capture !== null && l.capture !== capture)) continue; l.fn.call(n, ev); if (ev._stopNow) return; } };
    for (let i = path.length - 1; i > 0 && !ev._stop; i--) run(path[i], true);
    if (!ev._stop) run(path[0], null);
    for (let i = 1; i < path.length && !ev._stop && ev.bubbles; i++) run(path[i], false);
    return ev;
  }

  // ------------------------------------------------------------------ selectors (descendant combinator only)
  const COMPOUND = /^([a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/;
  function compound(s) {
    const c = { tag: null, id: null, cls: [], attrs: [] };
    for (let rest = s; rest;) {
      const m = COMPOUND.exec(rest); if (!m) throw new Error('mini-dom: unsupported selector part ' + JSON.stringify(s));
      if (m[1]) c.tag = m[1].toLowerCase(); else if (m[2]) c.id = m[2]; else if (m[3]) c.cls.push(m[3]); else c.attrs.push([m[4], m[5] ?? m[6] ?? m[7] ?? null]);
      rest = rest.slice(m[0].length);
    }
    return c;
  }
  const parseSel = (sel) => sel.split(',').map((p) => p.trim().split(/\s+/).map(compound));
  const simple = (e, c) => e.nodeType === 1 && (!c.tag || e.localName === c.tag) && (!c.id || e.getAttribute('id') === c.id)
    && c.cls.every((k) => (e.getAttribute('class') || '').split(/\s+/).includes(k)) && c.attrs.every(([k, v]) => (v === null ? e.hasAttribute(k) : e.getAttribute(k) === v));
  function complex(e, parts, i) {
    if (!simple(e, parts[i])) return false;
    if (i === 0) return true;
    for (let a = e.parentNode; a; a = a.parentNode) if (complex(a, parts, i - 1)) return true;
    return false;
  }
  const matchesAny = (e, sel) => parseSel(sel).some((parts) => complex(e, parts, parts.length - 1));
  function* walk(n) { for (const c of n.childNodes) { if (c.nodeType === 1) yield c; yield* walk(c); } }

  // ------------------------------------------------------------------ nodes
  class Node {
    constructor() { this.parentNode = null; this.childNodes = []; }
    get firstChild() { return this.childNodes[0] ?? null; }
    get children() { return this.childNodes.filter((c) => c.nodeType === 1); }
    get lastChild() { return this.childNodes[this.childNodes.length - 1] ?? null; }
    get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === doc; }
    contains(o) { for (let n = o; n; n = n.parentNode) if (n === this) return true; return false; }
    appendChild(c) { return this.insertBefore(c, null); }
    insertBefore(c, ref) {
      if (c.parentNode) c.parentNode.removeChild(c);
      c.parentNode = this; const i = ref ? this.childNodes.indexOf(ref) : -1;
      if (i < 0) this.childNodes.push(c); else this.childNodes.splice(i, 0, c);
      wrote(this, 'child'); return c;
    }
    removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) { this.childNodes.splice(i, 1); c.parentNode = null; wrote(this, 'child'); } return c; }
    remove() { this.parentNode?.removeChild(this); }
    addEventListener(type, fn, opts) { listen(this, type, fn, opts); }
    removeEventListener(type, fn) { unlisten(this, type, fn); }
  }
  class Text extends Node {
    constructor(v) { super(); this.nodeType = 3; this._v = String(v); }
    get nodeValue() { return this._v; }
    set nodeValue(v) { this._v = String(v); wrote(this, 'text'); }
    get textContent() { return this._v; }
    set textContent(v) { this.nodeValue = v; }
  }
  /** el.style: plain properties (el.style.opacity = '0') plus the three methods code uses for custom properties (the touch pad's --kx / --ky). Not serialized, not part of the write log. */
  class Style { setProperty(k, v) { this[k] = String(v); } removeProperty(k) { delete this[k]; } getPropertyValue(k) { return this[k] ?? ''; } }
  class El extends Node {
    constructor(tag) {
      super(); this.nodeType = 1; this.localName = String(tag).toLowerCase(); this.tagName = this.localName.toUpperCase(); this._attrs = new Map();
      this.scrollWidth = 0; this.clientWidth = 0; this.scrollLeft = 0; this.options = []; this.style = new Style();
    }
    getAttribute(k) { return this._attrs.has(k) ? this._attrs.get(k) : null; }
    hasAttribute(k) { return this._attrs.has(k); }
    setAttribute(k, v) { this._attrs.set(String(k), String(v)); wrote(this, 'attr', String(k)); }
    removeAttribute(k) { if (this._attrs.delete(k)) wrote(this, 'attr', k); }
    get attributes() { return [...this._attrs].map(([name, value]) => ({ name, value })); }
    get id() { return this.getAttribute('id') ?? ''; }
    set id(v) { this.setAttribute('id', v); }
    get className() { return this.getAttribute('class') ?? ''; }
    set className(v) { this.setAttribute('class', v); }
    get title() { return this.getAttribute('title') ?? ''; }
    set title(v) { this.setAttribute('title', v); }
    get hidden() { return this.hasAttribute('hidden'); }
    set hidden(v) { if (v) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }
    get dataset() {
      const el = this, attr = (k) => 'data-' + String(k).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
      return this._ds ||= new Proxy({}, {
        get: (_, k) => el.getAttribute(attr(k)) ?? undefined,
        set: (_, k, v) => { el.setAttribute(attr(k), v); return true; },
        has: (_, k) => el.hasAttribute(attr(k)),
        deleteProperty: (_, k) => { el.removeAttribute(attr(k)); return true; },
      });
    }
    get classList() {
      const el = this, list = () => (el.getAttribute('class') || '').split(/\s+/).filter(Boolean), put = (a) => el.setAttribute('class', a.join(' '));
      return this._cl ||= {
        contains: (k) => list().includes(k),
        add: (...ks) => { const a = list(); let ch = false; for (const k of ks) if (!a.includes(k)) { a.push(k); ch = true; } if (ch) put(a); },
        remove: (...ks) => { const a = list(), b = a.filter((x) => !ks.includes(x)); if (b.length !== a.length) put(b); },
        toggle: (k, force) => { const has = list().includes(k), on = force ?? !has; if (on && !has) put([...list(), k]); else if (!on && has) put(list().filter((x) => x !== k)); return on; },
      };
    }
    get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
    set textContent(v) { this.#clear(); const s = String(v); if (s) { const t = new Text(s); t.parentNode = this; this.childNodes.push(t); } wrote(this, 'text'); }
    get innerHTML() { return this.childNodes.map((c) => serialize(c)).join(''); }
    set innerHTML(html) { this.#clear(); this.htmlSets = (this.htmlSets || 0) + 1; for (const c of parse(String(html))) { c.parentNode = this; this.childNodes.push(c); } wrote(this, 'html'); }
    #clear() { for (const c of this.childNodes) c.parentNode = null; this.childNodes = []; }
    prepend(...ns) { for (const n of [...ns].reverse()) this.insertBefore(n, this.childNodes[0] ?? null); }
    matches(sel) { return matchesAny(this, sel); }
    closest(sel) { for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (matchesAny(n, sel)) return n; return null; }
    querySelectorAll(sel) { const p = parseSel(sel); return [...walk(this)].filter((e) => p.some((parts) => complex(e, parts, parts.length - 1))); }
    querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
    focus() { if (this.isConnected) doc.activeElement = this; }
    blur() { doc.blurs.push(this); if (doc.activeElement === this) doc.activeElement = doc.body; }
    click() { return fire(this, 'click', { detail: 0 }); }
  }

  // ------------------------------------------------------------------ innerHTML
  function parse(html) {
    const root = new El('#root'), stack = [root];
    for (const m of html.matchAll(TOKEN)) {
      if (m[0].startsWith('<!--')) continue;
      if (m[1]) { const i = stack.map((e) => e.localName).lastIndexOf(m[1].toLowerCase()); if (i > 0) stack.length = i; continue; }
      if (m[2]) {
        const e = new El(m[2]);
        for (const a of m[3].matchAll(ATTR)) e._attrs.set(a[1], unesc(a[2] ?? a[3] ?? a[4] ?? ''));
        const top = stack[stack.length - 1]; e.parentNode = top; top.childNodes.push(e);
        if (!m[4] && !VOID.has(e.localName)) stack.push(e);
        continue;
      }
      const t = new Text(unesc(m[5])), top = stack[stack.length - 1]; t.parentNode = top; top.childNodes.push(t);
    }
    const out = root.childNodes; for (const c of out) c.parentNode = null; return out;
  }
  /** outerHTML with the attributes sorted, so two DOMs that differ only in attribute order read the same. */
  function serialize(n) {
    if (n.nodeType === 3) return escText(n._v);
    const attrs = [...n._attrs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('');
    return VOID.has(n.localName) ? `<${n.localName}${attrs}>` : `<${n.localName}${attrs}>${n.innerHTML}</${n.localName}>`;
  }

  // ------------------------------------------------------------------ document and window
  const win = { addEventListener(type, fn, opts) { listen(win, type, fn, opts); }, removeEventListener(type, fn) { unlisten(win, type, fn); }, parentNode: null };
  const html = new El('html'), head = new El('head'), body = new El('body');
  html.childNodes.push(head, body); head.parentNode = html; body.parentNode = html;
  const doc = {
    nodeType: 9, parentNode: null, childNodes: [html], documentElement: html, head, body, activeElement: body, blurs: [], readyState: 'complete',
    createElement: (t) => new El(t), createTextNode: (s) => new Text(s),
    getElementById: (id) => [html, ...walk(html)].find((e) => e.getAttribute('id') === id) ?? null,
    querySelector: (s) => html.querySelector(s), querySelectorAll: (s) => html.querySelectorAll(s),
    addEventListener(type, fn, opts) { listen(doc, type, fn, opts); }, removeEventListener(type, fn) { unlisten(doc, type, fn); },
  };
  html.parentNode = doc;
  const store = new Map();
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); }, _m: store };
  const location = { search, hostname, href: `https://${hostname}/${search}` };
  class MutationObserver { constructor(cb) { this.cb = cb; } observe() {} disconnect() {} }
  return { document: doc, window: win, localStorage, location, MutationObserver, writes, fire, El, Text, serialize, parse, html: (n) => n.innerHTML };
}
