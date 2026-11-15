// The armoury: four weapons with the numbers that make accuracy beat speed. Spread grows with
// movement and with each shot taken in a burst, and it decays when the trigger is released, so a
// standing tap is precise and a running spray is not. main.js owns the ray; this module owns the
// numbers, the view model and the reload.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Two arsenals, one per side: the CT (north) squad fields precise service weapons with quicker
// reloads, the T (attacker) squad fields heavier, harder-hitting guns that recover slower. The
// pistol and the shotgun are shared issue. Every name and silhouette here is original to Cargo
// Nine; nothing is a copy of another game's armoury.
export const WEAPONS = {
  kite: {
    id: 'kite',
    team: 'both',
    name: 'Kite-9',
    class: 'pistol',
    slot: 'sidearm',
    price: 0,
    damage: 26,
    headshot: 3.4,
    magSize: 15,
    reserve: 60,
    fireGap: 0.14,
    reloadTime: 1.5,
    spreadStill: 0.0032,
    spreadMoving: 0.03,
    spreadPerShot: 0.0042,
    spreadMax: 0.05,
    recovery: 0.055,
    recoil: 0.011,
    range: 60,
    auto: false,
  },
  vector: {
    id: 'vector',
    team: 'ct',
    name: 'Vector-7',
    class: 'rifle',
    slot: 'primary',
    price: 2700,
    damage: 33,
    headshot: 3.9,
    magSize: 30,
    reserve: 90,
    fireGap: 0.099,
    reloadTime: 2.1,
    spreadStill: 0.0021,
    spreadMoving: 0.028,
    spreadPerShot: 0.0052,
    spreadMax: 0.062,
    recovery: 0.05,
    recoil: 0.0125,
    range: 90,
    auto: true,
  },
  hammer: {
    id: 'hammer',
    team: 'both',
    name: 'Hammer-12',
    class: 'shotgun',
    slot: 'primary',
    price: 1900,
    damage: 21,
    headshot: 2.2,
    pellets: 8,
    magSize: 7,
    reserve: 28,
    fireGap: 0.72,
    reloadTime: 2.6,
    spreadStill: 0.028,
    spreadMoving: 0.05,
    spreadPerShot: 0.004,
    spreadMax: 0.07,
    recovery: 0.08,
    recoil: 0.03,
    range: 34,
    auto: false,
  },
  needle: {
    id: 'needle',
    team: 'ct',
    name: 'Needle-5',
    class: 'smg',
    slot: 'primary',
    price: 1250,
    damage: 22,
    headshot: 4.2,
    magSize: 20,
    reserve: 80,
    fireGap: 0.078,
    reloadTime: 1.8,
    spreadStill: 0.0016,
    spreadMoving: 0.022,
    spreadPerShot: 0.0038,
    spreadMax: 0.045,
    recovery: 0.045,
    recoil: 0.008,
    range: 100,
    auto: true,
  },
  cobra: {
    id: 'cobra',
    team: 't',
    name: 'Cobra-9',
    class: 'smg',
    slot: 'primary',
    price: 1100,
    damage: 25,
    headshot: 3.6,
    magSize: 25,
    reserve: 100,
    fireGap: 0.088,
    reloadTime: 2.3,
    spreadStill: 0.0038,
    spreadMoving: 0.034,
    spreadPerShot: 0.0058,
    spreadMax: 0.075,
    recovery: 0.048,
    recoil: 0.015,
    range: 68,
    auto: true,
  },
  volk: {
    id: 'volk',
    team: 't',
    name: 'Volk-K',
    class: 'rifle',
    slot: 'primary',
    price: 2500,
    damage: 38,
    headshot: 4.3,
    magSize: 30,
    reserve: 90,
    fireGap: 0.112,
    reloadTime: 2.7,
    spreadStill: 0.0034,
    spreadMoving: 0.036,
    spreadPerShot: 0.0072,
    spreadMax: 0.082,
    recovery: 0.042,
    recoil: 0.019,
    range: 92,
    auto: true,
  },
  spine: {
    id: 'spine',
    team: 'ct',
    name: 'Spine-8',
    class: 'marksman',
    slot: 'primary',
    price: 3100,
    damage: 58,
    headshot: 4.6,
    magSize: 10,
    reserve: 40,
    fireGap: 0.34,
    reloadTime: 2.2,
    spreadStill: 0.0012,
    spreadMoving: 0.03,
    spreadPerShot: 0.011,
    spreadMax: 0.07,
    recovery: 0.06,
    recoil: 0.026,
    range: 120,
    auto: false,
  },
  widow: {
    id: 'widow',
    team: 't',
    name: 'Widow-7',
    class: 'sniper',
    slot: 'primary',
    price: 4200,
    damage: 105,
    headshot: 3.9,
    magSize: 5,
    reserve: 25,
    fireGap: 1.18,
    reloadTime: 3.1,
    spreadStill: 0.0004,
    spreadMoving: 0.055,
    spreadPerShot: 0.02,
    spreadMax: 0.09,
    recovery: 0.035,
    recoil: 0.055,
    range: 150,
    auto: false,
  },
};

// The buy counter only offers the player's own side: shared issue plus that team's kit.
export function buyList(team) {
  return [...Object.values(WEAPONS)
    .filter(w => w.slot === 'primary' && (w.team === 'both' || w.team === team))
    .map(w => ({ id: w.id, label: `${w.name} ${w.class}`, detail: `${w.price} · ${w.magSize} rounds · ${w.damage} dmg` })),
    { id: 'armor', label: 'Plate carrier', detail: '650 · 100 armour' }];
}

function legacyBuyList(team) {
  const rows = Object.values(WEAPONS).filter((weapon) => weapon.slot === 'primary' && (weapon.team === 'both' || weapon.team === team));
  const list = [
    { id: 'vector', label: 'Vector-7 rifle', detail: '2700 · 30 rounds · 33 dmg' },
    { id: 'needle', label: 'Needle-5 SMG', detail: '1250 · 20 rounds · 22 dmg' },
    { id: 'hammer', label: 'Hammer-12 shotgun', detail: '1900 · 7 shells · 8 pellets' },
    { id: 'armor', label: 'Plate carrier', detail: '650 · 100 armour' },
  ];
  if (team === 't') {
    list[0] = { id: 'volk', label: 'Volk-K rifle', detail: '2500 · 30 rounds · 38 dmg' };
    list[1] = { id: 'cobra', label: 'Cobra-9 SMG', detail: '1100 · 25 rounds · 25 dmg' };
  }
  if (team === 'ct') {
    list[0] = { id: 'spine', label: 'Spine-8 marksman', detail: '3100 · 10 rounds · 58 dmg' };
    list[1] = { id: 'needle', label: 'Needle-5 SMG', detail: '1250 · 20 rounds · 22 dmg' };
  }
  void rows;
  return list;
}

export const BUY_LIST = buyList('ct');

export function createWeaponry(camera) {
  const materialBody = new THREE.MeshStandardMaterial({ color: new THREE.Color('#7f858d'), roughness: 0.38, metalness: 0.62 });
  const materialGrip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.75, metalness: 0.18 });

  const model = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.1, 0.4), materialBody);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.38), materialGrip);
  barrel.position.set(0, 0.026, -0.36);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.075, 0.2), materialGrip);
  stock.position.set(0, -0.018, 0.28);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }));
  sight.position.set(0, 0.07, -0.05);
  model.add(receiver, barrel, stock, sight);
  model.position.set(0.27, -0.245, -0.52);
  model.scale.setScalar(1.05);
  model.rotation.set(0.02, -0.06, 0);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.23, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
  flashLight.position.set(0.23, -0.16, -0.6);
  camera.add(flashLight);

  const state = {
    current: 'kite',
    primary: 'kite',
    secondary: 'kite',
    mag: WEAPONS.kite.magSize,
    reserve: WEAPONS.kite.reserve,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    bloom: 0,
    shotsFired: 0,
    shotsHit: 0,
  };

  function def() {
    return WEAPONS[state.current];
  }

  function equip(id) {
    if (!WEAPONS[id]) return;
    state.current = id;
    state.mag = WEAPONS[id].magSize;
    state.reserve = WEAPONS[id].reserve;
    state.cooldown = 0;
    state.reloadLeft = 0;
    state.bloom = 0;
    receiver.scale.set(id === 'hammer' ? 1.18 : id === 'kite' ? 0.72 : 1, 1, id === 'needle' ? 0.82 : 1);
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    state.bloom = Math.max(0, state.bloom - def().recovery * dt);
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.4;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 20 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      const total = def().reloadTime;
      model.rotation.x = -0.6 * Math.min(1, (total - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def().magSize - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    step,
    equip,
    def,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      state.shotsFired += 1;
      state.bloom = Math.min(def().spreadMax, state.bloom + def().spreadPerShot);
      return true;
    },
    pullTrigger() {
      state.cooldown = def().fireGap;
      state.flash = 0.06;
      state.kick = 0.05;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === def().magSize || state.reserve === 0) return;
      state.reloadLeft = def().reloadTime;
    },
    spread(speed) {
      const d = def();
      return d.spreadStill + Math.min(1, speed / 5.2) * d.spreadMoving + state.bloom;
    },
    refill() {
      const d = def();
      state.mag = d.magSize;
      state.reserve = d.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
    },
    give(id, slot) {
      if (slot === 'primary') state.primary = id;
      else state.secondary = id;
    },
    accuracy() {
      return state.shotsFired === 0 ? 0 : state.shotsHit / state.shotsFired;
    },
    resetAccuracy() {
      state.shotsFired = 0;
      state.shotsHit = 0;
    },
  };
}
