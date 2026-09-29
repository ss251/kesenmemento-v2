// [v3:town] Fictional shops and companies for the inner-bay town, in natural Japanese. No real brands: names are
// invented (common Kesennuma surnames + trade words, or harbour-flavoured yagō). Real place names appear only as
// place signage (気仙沼, 内湾, 魚町, 八日町, 南町).
//
// style: 'wa' (wooden lattice, brush sign, noren) | 'modern' (aluminium glass front, fascia board, awning)
//        'open' (wide open front with display tables: fish, vegetables) | 'cafe' | 'shutter' (closed today)
// interior: which shelf / counter set is glimpsed through the glass.
export const SHOPS = [
  { type: '鮮魚', name: '畠山鮮魚店', sub: '鮮魚・塩干', en: 'HATAKEYAMA FISH', style: 'open', interior: 'fish', board: ['#f4efe2', '#23466e'], awning: ['#2e5d8f', '#f2efe6'], noren: null, font: 'serif' },
  { type: '鮮魚', name: 'さかなの丸八', sub: '朝どれ 生かつお', en: 'MARUHACHI', style: 'open', interior: 'fish', board: ['#1f4f7a', '#ffffff'], awning: ['#d6453a', '#f4f0e6'], noren: null, font: 'brush' },
  { type: '寿司', name: 'すし処 汐さい', sub: '三陸の地魚', en: 'SUSHI SHIOSAI', style: 'wa', interior: 'sushi', board: ['#6a4a34', '#f3ead8'], noren: ['#28324a', 'すし'], font: 'brush' },
  { type: '寿司', name: '寿司 魚竹', sub: 'ふかひれ寿司', en: 'UOTAKE', style: 'wa', interior: 'sushi', board: ['#2d2a30', '#efe6d0'], noren: ['#f0ebe0', '寿し'], font: 'brush', norenInk: '#2d2a30' },
  { type: '酒店', name: '菅原酒店', sub: '地酒・焼酎', en: 'SUGAWARA SAKE', style: 'wa', interior: 'sake', board: ['#f2ead6', '#3b2c24'], noren: ['#2f4a3a', '酒'], font: 'serif', sugidama: true },
  { type: '酒店', name: '酒のみなと屋', sub: '気仙沼の地酒', en: 'MINATOYA', style: 'modern', interior: 'sake', board: ['#8d2f2a', '#fff4e3'], awning: ['#8d2f2a', '#f2e8d8'], font: 'sans' },
  { type: '喫茶', name: '喫茶 かもめ', sub: 'COFFEE & TOAST', en: 'KISSA KAMOME', style: 'cafe', interior: 'cafe', board: ['#4b6b58', '#f7f1e3'], awning: ['#3f6a54', '#efe6d2'], font: 'round' },
  { type: '喫茶', name: '珈琲 灯台', sub: '自家焙煎', en: 'TOUDAI COFFEE', style: 'cafe', interior: 'cafe', board: ['#f1e9d8', '#5a3b2a'], awning: ['#7a4a33', '#f1e6d0'], font: 'serif' },
  { type: '乾物', name: '海産物 山十', sub: '乾物・珍味', en: 'YAMAJU', style: 'open', interior: 'dry', board: ['#f5eddc', '#7a2d22'], awning: ['#b8452e', '#f5ecdc'], font: 'brush' },
  { type: '乾物', name: '熊谷海産', sub: 'わかめ・昆布・するめ', en: 'KUMAGAI KAISAN', style: 'modern', interior: 'dry', board: ['#2e5b52', '#fbf4e2'], awning: ['#2e5b52', '#f2ecd9'], font: 'sans' },
  { type: 'ふかひれ', name: 'ふかひれの汐見屋', sub: 'ふかひれスープ・姿煮', en: 'SHIOMIYA', style: 'wa', interior: 'goods', board: ['#f3e7c9', '#7b2f22'], noren: ['#7b2f22', 'ふかひれ'], font: 'brush' },
  { type: '食堂', name: '海鮮食堂 うみねこ亭', sub: '海鮮丼・定食', en: 'UMINEKOTEI', style: 'wa', interior: 'diner', board: ['#f4ecd9', '#23466e'], noren: ['#23466e', '海鮮'], font: 'brush', lanterns: true },
  { type: 'ラーメン', name: '中華そば 港屋', sub: '塩ラーメン', en: 'MINATOYA RAMEN', style: 'wa', interior: 'diner', board: ['#b8322a', '#fff1d8'], noren: ['#b8322a', 'ら〜めん'], font: 'brush', lanterns: true },
  { type: '菓子', name: '菓子処 浜乃屋', sub: '手焼き煎餅・どら焼き', en: 'HAMANOYA', style: 'wa', interior: 'sweets', board: ['#f6ecd6', '#5a3a2b'], noren: ['#b4495b', '和菓子'], font: 'serif' },
  { type: '青果', name: 'みなと青果', sub: '八百屋', en: 'MINATO SEIKA', style: 'open', interior: 'veg', board: ['#2f7a45', '#ffffff'], awning: ['#2f7a45', '#f4f0e0'], font: 'round' },
  { type: '理容', name: 'バーバー シオサイ', sub: 'HAIR CUT', en: 'BARBER SHIOSAI', style: 'modern', interior: 'barber', board: ['#f5f2ec', '#2c4f8a'], awning: ['#2c4f8a', '#f5f2ec'], font: 'en', pole: true },
  { type: '薬局', name: '千葉薬局', sub: '処方せん受付', en: 'CHIBA PHARMACY', style: 'modern', interior: 'pharmacy', board: ['#2f8a5e', '#ffffff'], awning: null, font: 'sans' },
  { type: '文具', name: '文具のみうら', sub: '文房具・事務用品', en: 'MIURA STATIONERY', style: 'modern', interior: 'goods', board: ['#f7f0da', '#2a5f95'], awning: ['#e0a93a', '#f7f0da'], font: 'round' },
  { type: '金物', name: '阿部金物店', sub: '漁具・金物・荒物', en: 'ABE KANAMONO', style: 'open', interior: 'hardware', board: ['#3a3f4a', '#f3e9c9'], awning: ['#3a4a66', '#eeeadf'], font: 'sans' },
  { type: '呉服', name: '呉服 小野寺', sub: '着物・帯', en: 'ONODERA', style: 'wa', interior: 'kimono', board: ['#2d2a30', '#f1e3c4'], noren: ['#6d3a5c', '呉服'], font: 'brush' },
  { type: '土産', name: 'みやげ処 内湾', sub: '三陸のおみやげ', en: 'NAIWAN GIFTS', style: 'modern', interior: 'goods', board: ['#f6efdd', '#b8452e'], awning: ['#d98a3a', '#f6efdd'], font: 'round' },
  { type: '牡蠣', name: 'かき処 波音', sub: '唐桑の牡蠣', en: 'NAMIOTO', style: 'wa', interior: 'diner', board: ['#23364f', '#f3ead6'], noren: ['#e8e2d4', 'かき'], font: 'brush', norenInk: '#23364f', lanterns: true },
  { type: '茶舗', name: '茶舗 斎藤園', sub: '日本茶・海苔', en: 'SAITOEN', style: 'wa', interior: 'goods', board: ['#f0e6cf', '#3e5a33'], noren: ['#3e5a33', 'お茶'], font: 'serif' },
  { type: '酒場', name: '居酒屋 大漁', sub: '地魚 炉端焼き', en: 'IZAKAYA TAIRYO', style: 'wa', interior: 'diner', board: ['#2b2b33', '#f7e3b0'], noren: ['#8a2c26', '大漁'], font: 'brush', lanterns: true },
  { type: '写真', name: '千田写真館', sub: 'PHOTO STUDIO', en: 'CHIDA PHOTO', style: 'modern', interior: 'goods', board: ['#f5f3ee', '#3a3346'], awning: ['#6b7a8a', '#f5f3ee'], font: 'serif' },
  { type: '雑貨', name: '村上商店', sub: '日用品・たばこ・塩', en: 'MURAKAMI', style: 'open', interior: 'grocery', board: ['#f4efe0', '#2a5b3e'], awning: ['#2a7a4f', '#f4efe0'], font: 'sans' },
  { type: '鮮魚', name: '千葉鮮魚', sub: 'メカジキ・さんま', en: 'CHIBA SENGYO', style: 'open', interior: 'fish', board: ['#f2efe6', '#b8322a'], awning: ['#23466e', '#f2efe6'], font: 'sans' },
  { type: 'パン', name: 'パン工房 しおかぜ', sub: 'BAKERY', en: 'SHIOKAZE BAKERY', style: 'cafe', interior: 'bakery', board: ['#f6ead3', '#8a4a2a'], awning: ['#c7743f', '#f6ead3'], font: 'round' },
  { type: '花', name: '花のさいとう', sub: 'FLOWER', en: 'SAITO FLOWER', style: 'open', interior: 'flower', board: ['#f7f2ea', '#b04a6e'], awning: ['#5f8f5a', '#f7f2ea'], font: 'round' },
  { type: '電器', name: '三浦電器', sub: '家電・修理', en: 'MIURA DENKI', style: 'modern', interior: 'goods', board: ['#2458a8', '#ffffff'], awning: null, font: 'sans' },
];

// Generated extras so no two shops in the inner bay share a name: common Kesennuma surnames + a trade.
const SURN = ['小野寺', '佐藤', '菅原', '熊谷', '畠山', '千葉', '三浦', '阿部', '村上', '斎藤', '佐々木', '及川', '吉田', '鈴木', '高橋', '菊田', '尾形', '臼井', '伊東', '昆野'];
const TRADES = [
  ['鮮魚店', '鮮魚・刺身', 'open', 'fish', 'serif', ['#f2efe6', '#23466e'], ['#2e5d8f', '#f2efe6']],
  ['商店', '食料品・日用品', 'open', 'grocery', 'sans', ['#f4efe0', '#2a5b3e'], ['#2a7a4f', '#f4efe0']],
  ['酒店', '地酒・ビール', 'wa', 'sake', 'serif', ['#f2ead6', '#3b2c24'], null],
  ['海産', '乾物・塩辛', 'modern', 'dry', 'sans', ['#2e5b52', '#fbf4e2'], ['#2e5b52', '#f2ecd9']],
  ['菓子店', '和菓子・団子', 'wa', 'sweets', 'serif', ['#f6ecd6', '#5a3a2b'], null],
  ['食堂', '定食・中華', 'wa', 'diner', 'brush', ['#f4ecd9', '#8a2c26'], null],
  ['薬局', '処方せん受付', 'modern', 'pharmacy', 'sans', ['#2f8a5e', '#ffffff'], null],
  ['電器', '家電・修理', 'modern', 'goods', 'sans', ['#2458a8', '#ffffff'], null],
  ['時計店', '時計・メガネ', 'modern', 'goods', 'serif', ['#f5f2ec', '#3a3346'], ['#6b7a8a', '#f5f2ec']],
  ['呉服店', '着物・帯', 'wa', 'kimono', 'brush', ['#2d2a30', '#f1e3c4'], null],
  ['理容所', 'HAIR CUT', 'modern', 'barber', 'sans', ['#f5f2ec', '#2c4f8a'], ['#2c4f8a', '#f5f2ec']],
  ['茶舗', 'お茶・海苔', 'wa', 'goods', 'serif', ['#f0e6cf', '#3e5a33'], null],
  ['文具店', '文房具', 'modern', 'goods', 'round', ['#f7f0da', '#2a5f95'], ['#e0a93a', '#f7f0da']],
  ['青果店', '野菜・果物', 'open', 'veg', 'round', ['#2f7a45', '#ffffff'], ['#2f7a45', '#f4f0e0']],
  ['金物店', '金物・漁具', 'open', 'hardware', 'sans', ['#3a3f4a', '#f3e9c9'], ['#3a4a66', '#eeeadf']],
  ['寿し', '地魚にぎり', 'wa', 'sushi', 'brush', ['#6a4a34', '#f3ead8'], null],
  ['パン店', 'パン・洋菓子', 'cafe', 'bakery', 'round', ['#f6ead3', '#8a4a2a'], ['#c7743f', '#f6ead3']],
  ['花店', '生花・鉢物', 'open', 'flower', 'round', ['#f7f2ea', '#b04a6e'], ['#5f8f5a', '#f7f2ea']],
];
const NOREN_WORD = { '酒店': '酒', '菓子店': '菓子', '食堂': '食堂', '呉服店': '呉服', '茶舗': 'お茶', '寿し': 'すし' };
const EN = { '小野寺': 'ONODERA', '佐藤': 'SATO', '菅原': 'SUGAWARA', '熊谷': 'KUMAGAI', '畠山': 'HATAKEYAMA', '千葉': 'CHIBA', '三浦': 'MIURA', '阿部': 'ABE', '村上': 'MURAKAMI', '斎藤': 'SAITO', '佐々木': 'SASAKI', '及川': 'OIKAWA', '吉田': 'YOSHIDA', '鈴木': 'SUZUKI', '高橋': 'TAKAHASHI', '菊田': 'KIKUTA', '尾形': 'OGATA', '臼井': 'USUI', '伊東': 'ITO', '昆野': 'KONNO' };
{
  const used = new Set(SHOPS.map((s) => s.name));
  let k = 0;
  while (SHOPS.length < 64 && k < 400) {
    const sn = SURN[(k * 7) % SURN.length], tr = TRADES[(k * 5 + Math.floor(k / SURN.length)) % TRADES.length];
    k++;
    const name = sn + tr[0];
    if (used.has(name)) continue;
    used.add(name);
    const e = { type: tr[0].replace(/店|所$/, ''), name, sub: tr[1], en: EN[sn], style: tr[2], interior: tr[3], font: tr[4], board: tr[5], awning: tr[6] };
    if (tr[2] === 'wa') e.noren = [['#28324a', '#2f4a3a', '#6d3a5c', '#8a2c26', '#3e5a33'][k % 5], NOREN_WORD[tr[0]] || sn];
    SHOPS.push(e);
  }
}

/** Warehouses / processing plants near the port (painted on walls and tank sides). */
export const COMPANIES = [
  { name: '丸汐水産', sub: '冷凍・加工', mark: '◯汐' }, { name: '宝来冷蔵', sub: '冷蔵倉庫', mark: '宝' },
  { name: '福寿製氷', sub: '製氷・貯氷', mark: '寿' }, { name: '潮見海産', sub: '水産加工', mark: '潮' },
  { name: '大鷹水産', sub: 'かつお・まぐろ', mark: '鷹' }, { name: '三陸マリン工業', sub: '船舶用品', mark: 'M' },
  { name: '内湾漁具', sub: '漁網・ロープ', mark: '網' }, { name: '汐音フーズ', sub: '水産加工品', mark: '音' },
  { name: '北浜冷凍', sub: '冷凍工場', mark: '北' }, { name: '鶴浦造船', sub: '船舶修理', mark: '浦' },
  { name: 'かもめ運送', sub: '冷凍輸送', mark: 'か' }, { name: '魚町製函', sub: '発泡スチロール箱', mark: '函' },
];

/** Small house name plates / office signs */
export const OFFICES = ['内湾ビル', 'みなと会館', '八日町ビル', '汐見ビル', '気仙沼 港町ビル', '魚町センター', '南町ハイツ', 'コーポ汐風', 'メゾン安波', 'ハイツかもめ'];
