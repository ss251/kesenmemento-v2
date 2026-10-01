// [v4:phone] Summarise a V8 .heapsnapshot: self size by node type and constructor name (top 40), and the count and
// size of plain objects by their property-name shape (top 20: which data records dominate the heap).
//   env -u NODE_OPTIONS bun tools/anime/heapsnap.mjs file.heapsnapshot
import { readFileSync } from 'node:fs';

const snap = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const meta = snap.snapshot.meta;
const NF = meta.node_fields.length, EF = meta.edge_fields.length;
const types = meta.node_types[0], etypes = meta.edge_types[0];
const iType = meta.node_fields.indexOf('type'), iName = meta.node_fields.indexOf('name'), iSelf = meta.node_fields.indexOf('self_size'), iEc = meta.node_fields.indexOf('edge_count');
const eType = meta.edge_fields.indexOf('type'), eName = meta.edge_fields.indexOf('name_or_index'), eTo = meta.edge_fields.indexOf('to_node');
const { nodes, edges, strings } = snap;
const by = new Map(), shapes = new Map();
let total = 0, e = 0;
for (let n = 0; n < nodes.length; n += NF) {
  const t = types[nodes[n + iType]], name = strings[nodes[n + iName]], self = nodes[n + iSelf], ec = nodes[n + iEc];
  total += self;
  const k = t === 'object' || t === 'native' || t === 'hidden' ? `${t}:${name}` : t;
  const v = by.get(k) || [0, 0]; v[0]++; v[1] += self; by.set(k, v);
  if (t === 'object' && name === 'Object') {
    const props = [];
    for (let j = 0; j < ec; j++) { const ei = e + j * EF; if (etypes[edges[ei + eType]] === 'property' && props.length < 8) props.push(strings[edges[ei + eName]]); }
    const sk = props.sort().join(',');
    const s = shapes.get(sk) || [0, 0]; s[0]++; s[1] += self; shapes.set(sk, s);
  }
  e += ec * EF;
}
const mb = (x) => Math.round(x / 1e5) / 10;
console.log('total self MB', mb(total));
console.log('\nby type:constructor (count, MB)');
for (const [k, [c, s]] of [...by].sort((a, b) => b[1][1] - a[1][1]).slice(0, 40)) console.log(String(mb(s)).padStart(8), String(c).padStart(9), k.slice(0, 100));
console.log('\nplain Object shapes (count, MB self)');
for (const [k, [c, s]] of [...shapes].sort((a, b) => b[1][0] - a[1][0]).slice(0, 25)) console.log(String(mb(s)).padStart(8), String(c).padStart(9), k.slice(0, 110));
void eTo;
