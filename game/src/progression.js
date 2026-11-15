// Progression: XP, levels and unlocks, kept across sessions in localStorage. Kills, captures,
// wave clears and match results pay XP; levels unlock the second and third operator, the supply
// box, and cosmetic trails. The HUD reads a snapshot through setProgression().
const STORE_KEY = 'cargo9.progression';

const TABLE = [
  { level: 1, xp: 0, unlocks: 'VEIL · elimination, capture the flag, outbreak' },
  { level: 2, xp: 700, unlocks: 'BRICK · frag charge operator' },
  { level: 3, xp: 1600, unlocks: 'Supply box gacha at the buy counter' },
  { level: 4, xp: 2900, unlocks: 'DOC · nano surge operator' },
  { level: 5, xp: 4600, unlocks: 'Gilded rifle finish (+10% damage)' },
  { level: 6, xp: 6500, unlocks: 'Veteran rank' },
  { level: 7, xp: 8600, unlocks: 'Twin frag pouch (+1 grenade)' },
];

const XP = { kill: 100, headshot: 50, capture: 400, waveClear: 300, roundWin: 250, matchWin: 1000 };

export function createProgression() {
  let saved = { xp: 0, level: 1, boxes: 1, wins: 0, gilded: false };
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) saved = { ...saved, ...JSON.parse(raw) };
  } catch { /* private mode: progression simply does not persist */ }

  const state = saved;
  let dirty = false;

  function threshold(level) {
    const row = TABLE.find((entry) => entry.level === level);
    return row ? row.xp : TABLE[TABLE.length - 1].xp + (level - TABLE[TABLE.length - 1].level) * 2400;
  }

  function persist() {
    dirty = true;
  }

  function flush() {
    if (!dirty) return;
    dirty = false;
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }

  function award(kind) {
    const amount = XP[kind] ?? 0;
    if (!amount) return null;
    state.xp += amount;
    let leveled = null;
    while (state.level < TABLE[TABLE.length - 1].level && state.xp >= threshold(state.level + 1)) {
      state.level += 1;
      leveled = TABLE.find((entry) => entry.level === state.level) ?? null;
    }
    persist();
    return leveled;
  }

  function unlocked(level) {
    return state.level >= level;
  }

  function operatorLocked(operatorLevel) {
    return !unlocked(operatorLevel);
  }

  function addBox(count = 1) {
    state.boxes += count;
    persist();
  }

  function spendBox() {
    if (state.boxes <= 0) return false;
    state.boxes -= 1;
    persist();
    return true;
  }

  function snapshot() {
    const next = state.level < TABLE[TABLE.length - 1].level ? threshold(state.level + 1) : null;
    const floor = threshold(state.level);
    return {
      level: state.level,
      xp: state.xp,
      boxes: state.boxes,
      wins: state.wins,
      gilded: state.gilded,
      next,
      floor,
      span: next ? next - floor : 1,
      unlocks: TABLE.filter((entry) => entry.level > state.level).slice(0, 2),
    };
  }

  return { state, award, unlocked, operatorLocked, addBox, spendBox, snapshot, flush, threshold };
}
