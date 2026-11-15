// Supply box gacha: a weighted drop table over five rarity bands. Boxes are opened during the buy
// phase from the buy counter or with V between rounds; each pull spends one box (or $500 in-round)
// and grants exactly one item. Items are immediate effects plus a feed line; the pull shows a short
// reveal so the moment reads on stream and in screenshots.
const TABLE = [
  { id: 'refill', name: 'Munition cache', rarity: 'common', weight: 26, kind: 'refill' },
  { id: 'plates', name: 'Plate bundle', rarity: 'common', weight: 22, kind: 'armor', amount: 50 },
  { id: 'pouch', name: 'Frag pouch', rarity: 'common', weight: 12, kind: 'grenade' },
  { id: 'stim', name: 'Combat stim', rarity: 'uncommon', weight: 16, kind: 'heal', amount: 60 },
  { id: 'coils', name: 'Recoil coils', rarity: 'uncommon', weight: 10, kind: 'recoil', amount: 0.25 },
  { id: 'plates2', name: 'Heavy plating', rarity: 'uncommon', weight: 8, kind: 'armor', amount: 100 },
  { id: 'gilded', name: 'Gilded finish', rarity: 'rare', weight: 9, kind: 'gilded' },
  { id: 'reload', name: 'Auto-loader', rarity: 'rare', weight: 5, kind: 'reload' },
  { id: 'overwatch', name: 'Overwatch optics', rarity: 'epic', weight: 3, kind: 'optics', amount: 2.4 },
  { id: 'railround', name: 'Rail round', rarity: 'legendary', weight: 1, kind: 'rail' },
];

const RARITY = {
  common: { label: 'COMMON', tone: 'neutral' },
  uncommon: { label: 'UNCOMMON', tone: 'good' },
  rare: { label: 'RARE', tone: 'good' },
  epic: { label: 'EPIC', tone: 'epic' },
  legendary: { label: 'LEGENDARY', tone: 'legendary' },
};

const BOX_PRICE = 500;

export function createGacha(onPull) {
  const totalWeight = TABLE.reduce((sum, item) => sum + item.weight, 0);

  function pick(random) {
    let roll = random() * totalWeight;
    for (const item of TABLE) {
      roll -= item.weight;
      if (roll > 0) continue;
      return item;
    }
    return TABLE[0];
  }

  // `random` is the match's seeded generator so a capture replay pulls the same item.
  function open(random, spend) {
    if (!spend()) return null;
    const item = pick(random);
    const rarity = RARITY[item.rarity];
    onPull(item, rarity);
    return { item, rarity };
  }

  return {
    TABLE,
    RARITY,
    BOX_PRICE,
    open,
    canAfford(money) {
      return money >= BOX_PRICE;
    },
  };
}
