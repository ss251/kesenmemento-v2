// [mobile-perf] Where the JS heap is retained: the dominator tree of a V8 .heapsnapshot (Cooper-Harvey-Kennedy over the snapshot's edges, weak
// edges left out), each node's retained size, and the biggest retainers with their chain of dominators back to the window, so a figure like
// "explore.X: 41 MB" names the object to free. heapsnap.mjs (self sizes by constructor) says what kind of thing fills the heap; this says
// who holds it.
//   env -u NODE_OPTIONS bun tools/anime/heapdom.mjs file.heapsnapshot [--top 40] [--min 2] [--depth 8]
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const TOP = Number(arg('top', 40)), MIN = Number(arg('min', 2)) * 1e6, DEPTH = Number(arg('depth', 8));
const t0 = performance.now();
const snap = JSON.parse(readFileSync(argv[0], 'utf8'));
const meta = snap.snapshot.meta;
const NF = meta.node_fields.length, EF = meta.edge_fields.length;
const ntypes = meta.node_types[0], etypes = meta.edge_types[0];
const iType = meta.node_fields.indexOf('type'), iName = meta.node_fields.indexOf('name'), iSelf = meta.node_fields.indexOf('self_size'), iEc = meta.node_fields.indexOf('edge_count');
const eType = meta.edge_fields.indexOf('type'), eName = meta.edge_fields.indexOf('name_or_index'), eTo = meta.edge_fields.indexOf('to_node');
const { nodes, edges, strings } = snap;
const N = nodes.length / NF;
const WEAK = etypes.indexOf('weak'), SHORTCUT = etypes.indexOf('shortcut'), PROP = etypes.indexOf('property'), ELEM = etypes.indexOf('element'), CTX = etypes.indexOf('context'), HIDDEN = etypes.indexOf('hidden'), INTERNAL = etypes.indexOf('internal');
// first edge of each node
const firstEdge = new Uint32Array(N + 1);
for (let n = 0, e = 0; n < N; n++) { firstEdge[n] = e; e += nodes[n * NF + iEc] * EF; firstEdge[n + 1] = e; }
const keep = (t) => t !== WEAK;
// ---- DFS from the root (node 0): preorder / postorder numbers
const post = new Int32Array(N).fill(-1), order = new Int32Array(N); let nPost = 0;
const pre = new Int32Array(N).fill(-1); let nPre = 0;
{
  const stack = new Int32Array(N + 1), it = new Uint32Array(N); let sp = 0;
  stack[sp++] = 0; pre[0] = nPre++; it[0] = firstEdge[0];
  while (sp) {
    const v = stack[sp - 1];
    let pushed = false;
    for (let e = it[v]; e < firstEdge[v + 1]; e += EF) {
      it[v] = e + EF;
      if (!keep(edges[e + eType])) continue;
      const w = edges[e + eTo] / NF;
      if (pre[w] >= 0) continue;
      pre[w] = nPre++; it[w] = firstEdge[w]; stack[sp++] = w; pushed = true; break;
    }
    if (!pushed) { sp--; post[v] = nPost; order[nPost++] = v; }
  }
}
// ---- predecessors (CSR) of the reachable nodes
const predCount = new Uint32Array(N + 1);
for (let v = 0; v < N; v++) { if (pre[v] < 0) continue; for (let e = firstEdge[v]; e < firstEdge[v + 1]; e += EF) { if (!keep(edges[e + eType])) continue; const w = edges[e + eTo] / NF; if (pre[w] >= 0) predCount[w + 1]++; } }
for (let i = 0; i < N; i++) predCount[i + 1] += predCount[i];
const preds = new Uint32Array(predCount[N]), fill = predCount.slice(0, N);
for (let v = 0; v < N; v++) { if (pre[v] < 0) continue; for (let e = firstEdge[v]; e < firstEdge[v + 1]; e += EF) { if (!keep(edges[e + eType])) continue; const w = edges[e + eTo] / NF; if (pre[w] >= 0) preds[fill[w]++] = v; } }
// ---- dominators (Cooper, Harvey, Kennedy: "A Simple, Fast Dominance Algorithm"), on postorder numbers
const idom = new Int32Array(N).fill(-1);   // by postorder number
const rootP = post[0]; idom[rootP] = rootP;
const intersect = (a, b) => { while (a !== b) { while (a < b) a = idom[a]; while (b < a) b = idom[b]; } return a; };
let changed = true, rounds = 0;
while (changed && rounds < 50) {
  changed = false; rounds++;
  for (let k = nPost - 1; k >= 0; k--) {
    const v = order[k]; if (v === 0) continue;
    const vp = post[v];
    let nd = -1;
    for (let j = predCount[v]; j < predCount[v + 1]; j++) { const pp = post[preds[j]]; if (idom[pp] < 0) continue; nd = nd < 0 ? pp : intersect(pp, nd); }
    if (nd >= 0 && idom[vp] !== nd) { idom[vp] = nd; changed = true; }
  }
}
// ---- retained sizes: children before parents (increasing postorder)
const ret = new Float64Array(N);
for (let k = 0; k < nPost; k++) { const v = order[k]; ret[k] += nodes[v * NF + iSelf]; if (k !== rootP) ret[idom[k]] += ret[k]; }
const nodeOf = (p) => order[p];
const nameOf = (v) => { const t = ntypes[nodes[v * NF + iType]], nm = strings[nodes[v * NF + iName]]; return (t === 'object' || t === 'native' || t === 'closure') ? `${nm}` : `(${t}) ${String(nm).slice(0, 40)}`; };
// the name of the edge from a (dominating) node to its child, when there is a direct one
const edgeName = (from, to) => { for (let e = firstEdge[from]; e < firstEdge[from + 1]; e += EF) { if (edges[e + eTo] / NF !== to) continue; const t = edges[e + eType]; const nm = edges[e + eName]; return t === ELEM || t === HIDDEN ? `[${nm}]` : String(strings[nm]).slice(0, 40); } return '…'; };
// the shortest retaining path from the root (breadth first over the strong edges): a readable "who holds it"
const bfsParent = new Int32Array(N).fill(-1), bfsEdge = new Int32Array(N).fill(-1);
{
  const q = new Int32Array(N); let h = 0, t = 0; q[t++] = 0; bfsParent[0] = 0;
  while (h < t) { const v = q[h++]; for (let e = firstEdge[v]; e < firstEdge[v + 1]; e += EF) { const et = edges[e + eType]; if (!keep(et)) continue; const w = edges[e + eTo] / NF; if (bfsParent[w] >= 0) continue; bfsParent[w] = v; bfsEdge[w] = e; q[t++] = w; } }
}
const eLabel = (e) => { const t = edges[e + eType], nm = edges[e + eName]; return t === ELEM || t === HIDDEN ? `[${nm}]` : String(strings[nm]).slice(0, 32); };
const chain = (p) => { const out = []; let v = nodeOf(p), d = 0; while (v !== 0 && d < 14) { const e = bfsEdge[v]; if (e < 0) break; const par = bfsParent[v]; const pn = ntypes[nodes[par * NF + iType]]; out.push((pn === 'object' || pn === 'closure') && d > 0 ? `${eLabel(e)}` : eLabel(e)); v = par; d++; } return out.reverse().join('.'); };
const mb = (x) => Math.round(x / 1e5) / 10;
let total = 0; for (let v = 0; v < N; v++) if (pre[v] >= 0) total += nodes[v * NF + iSelf];
console.log(`nodes ${N}, reachable ${nPre}, ${rounds} rounds, ${Math.round(performance.now() - t0)} ms; reachable self total ${mb(total)} MB`);
// the biggest retainers that are not just a wrapper of a bigger one: skip a node whose single dominated child keeps > 90 % of it
const kids = new Map();
for (let p = 0; p < nPost; p++) { if (p === rootP) continue; const d = idom[p]; let a = kids.get(d); if (!a) kids.set(d, (a = [])); a.push(p); }
const rows = [];
for (let p = 0; p < nPost; p++) {
  if (ret[p] < MIN || p === rootP) continue;
  const ks = kids.get(p) || [];
  let big = 0; for (const k of ks) big = Math.max(big, ret[k]);
  if (big > 0.9 * ret[p]) continue;   // a wrapper: its child is the real holder
  rows.push(p);
}
rows.sort((a, b) => ret[b] - ret[a]);
console.log(`\nretained MB  self MB  holder  (dominator chain from the root)`);
for (const p of rows.slice(0, TOP)) { const v = nodeOf(p); console.log(String(mb(ret[p])).padStart(8), String(mb(nodes[v * NF + iSelf])).padStart(8), ' ', nameOf(v).slice(0, 40).padEnd(40), chain(p)); }
// --by k: every node of a kind (e.g. 'system / JSArrayBufferData': the typed arrays' memory) grouped by its retaining path's first k steps
// after the window ("__ctx.services.water", "__explore.stream.sb"), largest groups first
if (arg('by', null)) {
  const want = arg('by', ''), K = Number(arg('k', 4)), groups = new Map();
  for (let v = 0; v < N; v++) {
    if (pre[v] < 0 || strings[nodes[v * NF + iName]] !== want) continue;
    const path = chain(post[v]); const i = path.indexOf('global_object.');
    const tail = (i >= 0 ? path.slice(i + 14) : path).split('.').filter((x) => x && x !== 'context' && x !== 'previous' && !x.startsWith('[')).slice(0, K).join('.');
    const g = groups.get(tail) || [0, 0]; g[0] += nodes[v * NF + iSelf]; g[1]++; groups.set(tail, g);
  }
  console.log(`\n${want} by holder (MB, count):`);
  for (const [k, [b, n]] of [...groups].sort((a, b) => b[1][0] - a[1][0]).slice(0, 40)) console.log(String(mb(b)).padStart(8), String(n).padStart(6), k.slice(0, 150));
}
// the top level: what the window's own properties and the module scopes retain
console.log('\nunder the root, by dominated child (MB):');
for (const k of (kids.get(rootP) || []).sort((a, b) => ret[b] - ret[a]).slice(0, 12)) console.log(String(mb(ret[k])).padStart(8), nameOf(nodeOf(k)).slice(0, 60));
void SHORTCUT; void PROP; void CTX; void INTERNAL;
