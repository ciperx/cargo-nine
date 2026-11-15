// Bot difficulty: one table drives every readable difference between the three settings, so the
// choice changes reaction speed, shot spread and the damage a bot can land — never a hidden cheat.
// `reflex` is the delay after a bot first sees a target before it may fire; `steady` is the hit
// chance at point-blank range, which falls off with distance by `falloff` per metre.
export const DIFFICULTIES = {
  easy: {
    id: 'easy', label: 'EASY', detail: 'slow to react, wide shots',
    turnRate: 2.4, fireGap: 0.3, steady: 0.58, falloff: 0.022, damage: 16, sightRange: 34, reflex: 0.55, walkSpeed: 3.4,
  },
  normal: {
    id: 'normal', label: 'NORMAL', detail: 'balanced reflexes and aim',
    turnRate: 4.2, fireGap: 0.19, steady: 0.86, falloff: 0.014, damage: 24, sightRange: 46, reflex: 0.22, walkSpeed: 4.0,
  },
  hard: {
    id: 'hard', label: 'HARD', detail: 'fast, accurate, punishing',
    turnRate: 6.4, fireGap: 0.125, steady: 0.96, falloff: 0.008, damage: 32, sightRange: 60, reflex: 0.08, walkSpeed: 4.6,
  },
};

export function difficultyFromQuery() {
  const value = new URLSearchParams(window.location.search).get('bot');
  return DIFFICULTIES[value] ?? DIFFICULTIES.normal;
}

export function difficultyList() { return Object.values(DIFFICULTIES); }
