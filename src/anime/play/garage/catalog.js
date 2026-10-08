// Garage catalog. Hex values are 和色 from the craft palette (docs/CRAFT.md). Locked ids are quest rewards:
// the missions lane grants them through unlockGarage() / QUEST_GARAGE_IDS. No free-text plates.

/** Ids a quest may grant. Stable: the missions lane imports this list. */
export const QUEST_GARAGE_IDS = ['car.paint.kon', 'car.livery.tairyo', 'car.wheel.spoke', 'car.roof.surf'];

export const PAINTS = [
  { id: 'yamabuki', hex: '#F8B500', ja: '山吹色', en: 'Golden yellow' },             // 山吹色
  { id: 'akane', hex: '#B7282E', ja: '茜色', en: 'Madder red' },                     // 茜色
  { id: 'ai', hex: '#165E83', ja: '藍色', en: 'Indigo blue' },                       // 藍色
  { id: 'asagi', hex: '#00A3AF', ja: '浅葱色', en: 'Blue-green' },                   // 浅葱色
  { id: 'kinari', hex: '#FBFAF5', ja: '生成り色', en: 'Natural' },                   // 生成り色
  { id: 'sumi', hex: '#595857', ja: '墨色', en: 'Ink' },                             // 墨
  { id: 'kon', hex: '#223A70', ja: '紺色', en: 'Navy', unlock: 'car.paint.kon' },    // 紺色
  { id: 'shinonome', hex: '#F19072', ja: '東雲色', en: 'Dawn', unlock: null },       // 東雲色
];

export const LIVERIES = [
  { id: 'none', key: 'play.car.livery.none' },
  { id: 'nami', key: 'play.car.livery.nami' },
  { id: 'tairyo', key: 'play.car.livery.tairyo', unlock: 'car.livery.tairyo' },
];

export const WHEELS = [
  { id: 'steel', key: 'play.car.wheel.steel' },
  { id: 'dish', key: 'play.car.wheel.dish' },
  { id: 'spoke', key: 'play.car.wheel.spoke', unlock: 'car.wheel.spoke' },
];

export const ROOFS = [
  { id: 'none', key: 'play.car.roof.none' },
  { id: 'rack', key: 'play.car.roof.rack' },
  { id: 'surf', key: 'play.car.roof.surf', unlock: 'car.roof.surf' },
];

export const PLATES = [
  { id: 'kei', key: 'play.car.plate.kei' },
  { id: 'tairyo', key: 'play.car.plate.tairyo' },
  { id: 'nami', key: 'play.car.plate.nami' },
];

export const DEFAULT_LOOK = {
  paint: 'yamabuki',
  livery: 'none',
  wheel: 'steel',
  roof: 'none',
  plate: 'kei',
};

export const DEFAULT_ASSIST = true;

export function paintById(id) {
  return PAINTS.find((p) => p.id === id) || PAINTS[0];
}

export function itemUnlocked(item, unlocked) {
  if (!item.unlock) return true;
  return !!unlocked?.[item.unlock];
}

/** Grant a quest reward. `unlocked` is the meta.car.unlocked map (mutated). Unknown ids are ignored. */
export function grantUnlock(unlocked, id) {
  if (!QUEST_GARAGE_IDS.includes(id)) return false;
  unlocked[id] = true;
  return true;
}
