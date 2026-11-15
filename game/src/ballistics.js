// Weighted ammunition profiles: mass drives recoil, range retention and cover penetration.
// Hits remain deterministic hitscan; damage is never selected by a random loot roll.
const PROFILES = {
  kite: { grams: 8, retention: 0.72, penetration: 0.35, budget: 0.22 },
  vector: { grams: 4, retention: 0.86, penetration: 0.72, budget: 0.65 },
  hammer: { grams: 3.5, retention: 0.25, penetration: 0.12, budget: 0.08 },
  needle: { grams: 3, retention: 0.65, penetration: 0.3, budget: 0.18 },
  cobra: { grams: 8, retention: 0.62, penetration: 0.32, budget: 0.2 },
  volk: { grams: 8, retention: 0.88, penetration: 0.78, budget: 0.72 },
  spine: { grams: 9, retention: 0.94, penetration: 0.85, budget: 0.85 },
  widow: { grams: 12, retention: 0.97, penetration: 0.92, budget: 1.1 },
};
export function ammoProfile(id) { return PROFILES[id] ?? PROFILES.kite; }
export function weightedDamage(weapon, distance, head, cover = 1) {
  const profile = ammoProfile(weapon.id);
  const fraction = Math.min(1, Math.max(0, distance / weapon.range));
  return weapon.damage * (head ? weapon.headshot : 1) * (1 - (1 - profile.retention) * fraction) * cover;
}
export function traceWeighted(hits, weapon) {
  const profile = ammoProfile(weapon.id);
  let budget = profile.budget;
  let multiplier = 1;
  const crossed = new Set();
  for (const hit of hits) {
    if (hit.object.userData.bot) return { hit, multiplier };
    if (crossed.has(hit.object)) continue;
    crossed.add(hit.object);
    const thickness = hit.object.userData.penetrableThickness;
    if (!Number.isFinite(thickness) || thickness > budget) return null;
    budget -= thickness;
    multiplier *= profile.penetration;
  }
  return null;
}
export function weightedRecoil(weapon) { return weapon.recoil * (0.8 + ammoProfile(weapon.id).grams / 20); }
