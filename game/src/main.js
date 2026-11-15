// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's rate.
// The match runs buy phase -> live round -> result, with the player as the north squad's fourth
// body alongside three bot team-mates against three attackers.
// ?shot=start|buy|play|end with &seed=N sets up a deterministic frame for a capture, renders it
// twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP, createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeaponry, WEAPONS, buyList } from './weapons.js';
import { difficultyFromQuery, difficultyList } from './difficulty.js';
import { createBots } from './bots.js';
import { createMatch, PHASE } from './rounds.js';
import { createHud } from './hud.js';
import { createGrenades } from './grenades.js';
import { createAbilities } from './abilities.js';
import { weightedDamage, traceWeighted, weightedRecoil } from './ballistics.js';
import { modeFromQuery } from './modes.js';
import { createCTF } from './ctf.js';
import { createDefuse } from './defuse.js';
import { createOutbreak } from './outbreak.js';
import { createProgression } from './progression.js';
import { createGacha } from './gacha.js';
import { createAudio, STRIDE } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 62);
const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const difficulty = difficultyFromQuery();
// The player picks a side on the deploy screen; everything team-shaped below reads these two.
const PLAYER_TEAM = new URLSearchParams(window.location.search).get('side') === 't' ? 't' : 'ct';
const ENEMY_TEAM = PLAYER_TEAM === 'ct' ? 't' : 'ct';
const BUY_LIST = buyList(PLAYER_TEAM);
const bots = createBots(scene, world, MAP, difficulty, PLAYER_TEAM);
const difficultyPicker = document.createElement('div');
difficultyPicker.id = 'difficulty-pick';
difficultyPicker.setAttribute('aria-label', 'Bot difficulty');
for (const preset of difficultyList()) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = preset.label;
  button.title = preset.detail;
  button.setAttribute('aria-pressed', String(preset.id === difficulty.id));
  button.addEventListener('click', () => {
    const url = new URL(window.location.href);
    url.searchParams.set('bot', preset.id);
    window.location.assign(url.href);
  });
  difficultyPicker.appendChild(button);
}
document.getElementById('play').before(difficultyPicker);
// Side picker: the same switch the query string reads, so a chosen side survives the reload that
// swaps the buy list, spawn point and which bots are hostile.
const sidePicker = document.createElement('div');
sidePicker.id = 'side-pick';
sidePicker.setAttribute('aria-label', 'Team');
for (const side of [{ id: 'ct', label: 'CT · north squad' }, { id: 't', label: 'T · attackers' }]) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = side.label;
  button.setAttribute('aria-pressed', String(side.id === PLAYER_TEAM));
  button.addEventListener('click', () => {
    const url = new URL(window.location.href);
    url.searchParams.set('side', side.id);
    window.location.assign(url.href);
  });
  sidePicker.appendChild(button);
}
document.getElementById('play').before(sidePicker);
const weaponry = createWeaponry(camera);
const hud = createHud();
const player = createPlayer(world.colliders);
const match = createMatch();
const mode = modeFromQuery();
const ctf = createCTF(MAP);
const defuse = createDefuse(MAP, PLAYER_TEAM);
const outbreak = createOutbreak();
const progression = createProgression();
const gacha = createGacha((item, rarity) => hud.feed(`SUPPLY BOX · ${rarity.label} · ${item.name}`, rarity.tone));
const grenades = createGrenades(scene);
const audio = createAudio();
const abilities = createAbilities(scene);
const input = createInput(renderer.domElement, onLockChange);

const raycaster = new THREE.Raycaster();
const direction = new THREE.Vector3();
const body = player.state;

const stats = { kills: 0, deaths: 0, headshots: 0, roundsWon: 0, roundsLost: 0, damage: 0 };
const vitals = { health: 100, alive: true, dead: false };
const playerName = 'YOU';

let elapsed = 0;
let grenadeArmed = true;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let buyOpen = false;
let overlayMode = null;
let objectiveText = '';
// Runtime weapon tuning written by supply-box pulls: recoil scale, gilded finish, rail round.
const weaponTuning = { recoilScale: 1, gilded: false, rail: 0 };

function announce(text, tone = 'neutral', holdMs = 1600) {
  if (!shot) hud.banner(text, tone, holdMs);
}

function spawnPlayer() {
  const spawn = MAP.spawns[PLAYER_TEAM][0];
  body.position.set(spawn[0], 0, spawn[1]);
  body.velocity.set(0, 0, 0);
  body.yaw = Math.PI;
  body.pitch = 0;
  vitals.health = 100;
  vitals.alive = true;
  vitals.dead = false;
  match.state.armor = 0;
  weaponry.equip('kite');
  weaponry.refill();
  weaponry.resetAccuracy();
}

function startRound() {
  bots.spawnRound();
  spawnPlayer();
  grenades.clear();
  playerStride = 0;
  strideAcc.clear();
  grenadeArmed = true;
  abilities.resetRound();
  hud.setVitals(vitals.health, match.state.armor);
  hud.setAmmo(weaponry.state.mag, weaponry.state.reserve, weaponry.def().name);
  hud.setRound(match.state.round);
  hud.setScore(match.state.scoreCT, match.state.scoreT);
  hud.setMoney(match.state.money);
  hud.setClock(match.clock());
  if (!shot) announce(`Round ${match.state.round} · buy phase`, 'info', 1800);
  if (!shot) openBuy();
}

function openBuy() {
  buyOpen = true;
  const entries = BUY_LIST.map((item, index) => {
    const cost = item.id === 'armor' ? 650 : WEAPONS[item.id].price;
    const owned = item.id === 'armor' ? match.state.armor >= 100 : weaponry.state.primary === item.id;
    return { id: item.id, label: owned ? `${item.label} ✓` : item.label, detail: item.detail, key: String(index + 1), disabled: owned || match.state.money < cost };
  });
  hud.openBuy(entries, match.state.money, buy);
}

function closeBuy() {
  buyOpen = false;
  hud.closeBuy();
}

function buy(id) {
  if (!match.canBuy()) {
    announce('Buy phase is over', 'warn');
    return;
  }
  if (id === 'armor') {
    if (match.buyArmor()) {
      hud.setVitals(vitals.health, match.state.armor);
      hud.feed('Plate carrier equipped', 'good');
      hud.setMoney(match.state.money);
      openBuy();
    } else hud.feed('Not enough money for armour', 'warn');
    return;
  }
  const weapon = WEAPONS[id];
  if (!weapon) return;
  if (!match.spend(weapon.price)) {
    hud.feed(`Need $${weapon.price} for the ${weapon.name}`, 'warn');
    return;
  }
  weaponry.give(id, 'primary');
  weaponry.equip(id);
  hud.setMoney(match.state.money);
  hud.setAmmo(weaponry.state.mag, weaponry.state.reserve, weapon.name);
  hud.feed(`${weapon.name} bought`, 'good');
  closeBuy();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    overlayMode = null;
  } else if (overlayMode) {
    hud.showOverlay(overlayMode);
  } else {
    overlayMode = 'paused';
    hud.showOverlay('paused');
  }
}

hud.onOperator(chooseOperator);
hud.setOperator(abilities.def());

hud.onPlay(() => {
  if (shot) return;
  if (overlayMode === 'match') {
    match.state.round = 1;
    match.state.scoreCT = 0;
    match.state.scoreT = 0;
    match.state.money = 800;
    stats.kills = 0;
    stats.deaths = 0;
    stats.headshots = 0;
    startRound();
  } else if (overlayMode === 'won' || overlayMode === 'lost') {
    match.nextRound();
    startRound();
  } else if (buyOpen) {
    closeBuy();
  }
  input.requestLock();
});

function syncCamera() {
  const drop = vitals.dead ? 0.28 : 0;
  camera.position.set(body.position.x, body.position.y + body.eye - drop, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, vitals.dead ? 0.24 : 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function onBotShot(bot) {
  // Bots carry the standard rifle kit, so their fire reads as rifle chatter with a direction.
  audio.play('rifle', bot.position.x, bot.position.z, { gain: 0.9 });
}

function onPlayerHit(amount, bot) {
  if (!vitals.alive || match.state.phase !== PHASE.LIVE) return;
  let left = amount;
  if (match.state.armor > 0) {
    const absorbed = left * 0.5;
    match.state.armor = Math.max(0, match.state.armor - absorbed);
    left -= absorbed;
  }
  vitals.health = Math.max(0, vitals.health - left);
  hud.setVitals(vitals.health, match.state.armor);
  hud.damage('hit');
  if (vitals.health === 0) {
    bot.kills += 1;
    die(`shot by ${bot.team.toUpperCase()} bot ${bot.index + 1}`);
  }
}

function onBotHit(bot, amount, by) {
  const result = bots.damage(bot, amount, false);
  if (result.killed) {
    by.kills += 1;
    if (mode.id === 'defuse') defuse.onDeath(`bot-${bot.index}`);
    hud.feed(`${by.team.toUpperCase()} bot ${by.index + 1} downed ${bot.team.toUpperCase()} bot ${bot.index + 1}`, 'neutral');
  }
}

function die(reason) {
  if (!vitals.alive) return;
  vitals.alive = false;
  if (mode.id === 'defuse') defuse.onDeath('player');
  vitals.dead = true;
  stats.deaths += 1;
  hud.feed(`${playerName} down — ${reason}`, 'bad');
  hud.damage('kill');
  // Dead but the round is not over: say so, and show what the squad is doing about it.
  hud.banner('YOU ARE DOWN', 'bad', 2200);
  hud.setPhase('SPECTATING', 'bad');
  hud.setDeathNote(`${reason} · ${bots.aliveCount(PLAYER_TEAM)} team-mate${bots.aliveCount(PLAYER_TEAM) === 1 ? '' : 's'} still holding the bay`);
  if (document.pointerLockElement) document.exitPointerLock();
}

// Footstep bookkeeping: distance travelled per body drives the cadence, so steps land on ground
// contact instead of a metronome. The player's own steps are unpositioned; every bot's are placed
// in the map, which is what gives a nearby body a direction.
const strideAcc = new Map();
let playerStride = 0;
// Landing bookkeeping: a fall ends with a thud the player hears in their own head.
let wasOnGround = true;
let fallSpeed = 0;
let prevPlayer = { x: body.position.x, z: body.position.z };
let chargeBeep = 0;

// Weapon-to-clip mapping: a sniper should not sound like a carbine across the yard.
function shotKind(weapon) {
  if (weapon.id === 'widow') return 'sniper';
  if (weapon.id === 'hammer') return 'shotgun';
  if (weapon.id === 'spine' || weapon.id === 'volk') return 'heavy';
  return 'rifle';
}

function stepSounds(dt) {
  audio.setListener(body.position.x, body.position.z, player.state.yaw);
  // A jump ends with a landing: the thud plays unpositioned and pitched down, so the drop reads
  // as the player's own weight rather than someone else's step nearby.
  if (!player.state.onGround) fallSpeed = Math.max(fallSpeed, -player.state.velocity.y);
  if (wasOnGround !== player.state.onGround) {
    if (player.state.onGround && fallSpeed > 3.5) {
      audio.play('stepCrouch', 0, 0, { self: true, gain: Math.min(1, 0.35 + fallSpeed / 14), rate: 0.82 });
    }
    wasOnGround = player.state.onGround;
    if (!wasOnGround) fallSpeed = 0;
  }
  const moved = Math.hypot(body.position.x - prevPlayer.x, body.position.z - prevPlayer.z);
  prevPlayer = { x: body.position.x, z: body.position.z };
  const gait = player.state.crouching ? 'crouch' : (player.state.walking ? 'walk' : 'run');
  playerStride += moved;
  if (playerStride >= STRIDE[gait]) {
    playerStride = 0;
    audio.play(gait === 'run' ? 'stepRun' : gait === 'walk' ? 'stepWalk' : 'stepCrouch', 0, 0, { self: true });
  }
  for (const bot of bots.items) {
    if (!bot.alive) { strideAcc.set(bot.index, 0); continue; }
    const previous = strideAcc.get(bot.index);
    if (!previous || typeof previous !== 'object') { strideAcc.set(bot.index, { x: bot.position.x, z: bot.position.z, acc: 0 }); continue; }
    const walked = Math.hypot(bot.position.x - previous.x, bot.position.z - previous.z);
    previous.x = bot.position.x; previous.z = bot.position.z;
    previous.acc += walked;
    if (previous.acc >= STRIDE.run) {
      previous.acc = 0;
      // A body on the other side of the wall still rustles: the panner puts it behind the player.
      audio.play('stepRun', bot.position.x, bot.position.z, { gain: bot.team === ENEMY_TEAM ? 1 : 0.8 });
    }
  }
}

function shoot(spread) {
  const weapon = weaponry.def();
  if (!weaponry.takeRound()) return false;
  camera.getWorldDirection(direction);
  const pellets = weapon.pellets ?? 1;
  let hitSomething = false;
  for (let pellet = 0; pellet < pellets; pellet += 1) {
    const dir = direction.clone();
    dir.x += (random() * 2 - 1) * spread;
    dir.y += (random() * 2 - 1) * spread;
    dir.z += (random() * 2 - 1) * spread;
    dir.normalize();
    scene.updateMatrixWorld(true);
    raycaster.set(camera.position, dir);
    raycaster.far = weapon.range;
    const targets = world.shootables.concat(bots.meshes());
    const trace = traceWeighted(raycaster.intersectObjects(targets, false), weapon);
    const hit = trace?.hit;
    if (!hit) continue;
    const bot = hit.object.userData.bot;
    if (!bot || !bot.alive) continue;
    hitSomething = true;
    weaponry.state.shotsHit += pellets === 1 ? 1 : 1 / pellets;
    const head = hit.object === bot.head;
    const baseDamage = weightedDamage(weapon, hit.distance, head, trace.multiplier);
    const gilded = weaponTuning.gilded ? 1.1 : 1;
    const rail = weaponTuning.rail > 0 ? (weaponTuning.rail = 0, 6) : 1;
    const damage = baseDamage * gilded * rail;
    stats.damage += damage;
    if (head) stats.headshots += 1;
    const result = bots.damage(bot, damage, true);
    hud.hitMarker(result.killed, 140);
    if (result.killed) {
      stats.kills += 1;
      if (mode.id === 'ctf') ctf.onDeath(`bot-${bot.index}`, bot.position);
      if (mode.id === 'defuse') defuse.onDeath(`bot-${bot.index}`);
      progression.award('kill');
      if (head) progression.award('headshot');
      progression.flush();
      match.awardKill();
      abilities.onKill();
      hud.setMoney(match.state.money);
      hud.feed(`${playerName} ${head ? 'HS' : 'killed'} ${bot.team.toUpperCase()} bot ${bot.index + 1}`, 'good');
      announce(head ? 'Headshot' : 'Target down', 'good', 900);
    }
  }
  if (!hitSomething && pellets === 1) weaponry.state.shotsHit += 0;
  audio.play(shotKind(weapon), 0, 0, { self: true, gain: 1 });
  weaponry.pullTrigger();
  player.recoil(weightedRecoil(weapon) * weaponTuning.recoilScale + random() * 0.004, (random() * 2 - 1) * 0.005);
  hud.setAmmo(weaponry.state.mag, weaponry.state.reserve, weapon.name);
  return true;
}

function throwGrenade() {
  if (!grenadeArmed || !vitals.alive || match.state.phase !== PHASE.LIVE) return false;
  camera.getWorldDirection(direction);
  grenades.spawn(camera.position.clone(), direction.clone());
  grenadeArmed = false;
  hud.feed('Frag out', 'neutral');
  announce('Frag out — no more this round', 'info', 900);
  return true;
}

// The blast reaches the bots through the same damage path a bullet takes, so a kill by grenade
// pays the round's money and lands in the kill feed exactly as a shot does.
function onBlast(damageAt, point) {
  audio.play('shotgun', point.x, point.z, { gain: 1 });
  let kills = 0;
  for (const bot of bots.items) {
    if (!bot.alive) continue;
    const amount = damageAt(bot.position);
    if (amount <= 0) continue;
    const result = bots.damage(bot, amount, true);
    stats.damage += amount;
    if (result.killed) {
      kills += 1;
      stats.kills += 1;
      match.awardKill();
      abilities.onKill();
      hud.feed(`${playerName} fragged ${bot.team.toUpperCase()} bot ${bot.index + 1}`, 'good');
    }
  }
  const self = damageAt(body.position);
  if (self > 0) onPlayerHit(self * 0.8, null);
  if (kills > 0) {
    hud.setMoney(match.state.money);
    announce(kills === 1 ? 'Frag kill' : `${kills} fragged`, 'good', 1200);
  }
}

// --- the agent kit -------------------------------------------------------------------------------
// The abilities own their own physics; main.js only decides where a throw starts, what the HUD shows
// and how a live flash reaches the player's own eyes.
const abilityDir = new THREE.Vector3();
const projection = new THREE.Vector3();

function chooseOperator(id) {
  if (!abilities.setOperator(id)) return;
  const operator = abilities.def();
  hud.setOperator(operator);
  hud.setAbilities(abilities.state, operator);
  hud.feed(`${operator.name} deployed · ${operator.role}`, 'neutral');
  announce(`${operator.name} — ${operator.role}`, 'neutral', 1200);
}

function throwDirection() {
  camera.getWorldDirection(abilityDir);
  return abilityDir.clone();
}

function onFlashBlast(point, radius) {
  const toFlash = point.clone().sub(camera.position);
  const distance = toFlash.length();
  if (distance > radius) return;
  const facing = toFlash.normalize().dot(throwDirection());
  if (facing < 0.1) return;
  hud.blind(0.45 + 1.1 * (1 - distance / (radius * 1.6)));
}

// One blast routine shared by the frag charge and the airburst: falloff by distance, kills counted
// exactly like a bullet kill so the ultimate charges the same way whatever landed the damage.
function abilityBlast(point, radius, damage) {
  for (const bot of bots.items) {
    if (!bot.alive) continue;
    const distance = Math.hypot(bot.position.x - point.x, bot.position.z - point.z);
    if (distance > radius) continue;
    const amount = damage * (1 - distance / radius);
    const result = bots.damage(bot, amount, true);
    stats.damage += Math.round(amount);
    hud.feed(`blast hit ${bot.team.toUpperCase()} bot ${bot.index + 1} ${Math.round(amount)}`, 'neutral');
    if (result.killed) {
      stats.kills += 1;
      match.awardKill();
      abilities.onKill();
      hud.feed(`${playerName} blasted ${bot.team.toUpperCase()} bot ${bot.index + 1}`, 'good');
    }
  }
  const toBlast = point.clone().sub(camera.position);
  if (toBlast.length() < radius) hud.damage('hit');
}

function abilityHeal(amount) {
  if (!vitals.alive) return;
  const before = vitals.health;
  vitals.health = Math.min(100, vitals.health + amount);
  hud.setVitals(vitals.health, match.state.armor);
  if (vitals.health > before) hud.feed(`stim +${Math.round(vitals.health - before)} hp`, 'good');
}

function abilityArmor(amount) {
  match.state.armor = Math.min(100, match.state.armor + amount);
  hud.setVitals(vitals.health, match.state.armor);
  hud.feed(`nano surge +${amount} armour`, 'good');
}

const abilityCtx = {
  bots,
  onFlash: onFlashBlast,
  onBlast: abilityBlast,
  onHeal: abilityHeal,
  onArmor: abilityArmor,
};

// A supply box pull resolves into exactly one immediate effect plus a feed line. Cosmetic pulls
// (gilded finish, optics) set flags the render path and gunplay read on the next shot.
function applyPull(item) {
  hud.feed(`Supply box · ${item.name}`, 'good');
  switch (item.kind) {
    case 'refill':
      weaponry.state.reserve = weaponry.def().reserve;
      weaponry.reload();
      break;
    case 'armor':
      abilityArmor(item.amount);
      break;
    case 'grenade':
      grenadeArmed = true;
      hud.feed('Frag re-armed', 'good');
      break;
    case 'heal':
      abilityHeal(item.amount);
      break;
    case 'recoil':
      weaponTuning.recoilScale = Math.max(0.4, weaponTuning.recoilScale - item.amount);
      break;
    case 'gilded':
      progression.state.gilded = true;
      weaponTuning.gilded = true;
      break;
    case 'reload':
      weaponry.reload();
      audio.play('reload', 0, 0, { self: true });
      break;
    case 'optics':
      camera.fov = 74 + item.amount;
      camera.updateProjectionMatrix();
      break;
    case 'rail':
      weaponTuning.rail = 1;
      break;
    default:
      break;
  }
}

function openSupplyBox() {
  if (match.state.phase === PHASE.BUY || match.state.phase === PHASE.LIVE) {
    // Prefer a stored box; otherwise pay for one out of the round economy.
  } else {
    hud.feed('Supply box opens during a round', 'neutral');
    return false;
  }
  const result = gacha.open(random, () => {
    if (progression.spendBox()) { progression.flush(); return true; }
    if (gacha.canAfford(match.state.money)) { match.state.money -= gacha.BOX_PRICE; hud.setMoney(match.state.money); return true; }
    hud.feed('No box and not enough cash', 'bad');
    return false;
  });
  if (!result) return false;
  applyPull(result.item);
  return true;
}

function updateAbilities(dt) {
  abilities.step(dt, abilityCtx);
  hud.setAbilities(abilities.state, abilities.def());
  if (!abilities.reconActive()) {
    hud.radar(null);
    return;
  }
  const dots = [];
  for (const bot of bots.items) {
    if (!bot.alive || bot.team !== ENEMY_TEAM) continue;
    projection.set(bot.position.x, bot.position.y + 1.1, bot.position.z).project(camera);
    dots.push({
      x: (projection.x * 0.5 + 0.5) * window.innerWidth,
      y: (-projection.y * 0.5 + 0.5) * window.innerHeight,
      onScreen: projection.z < 1,
    });
  }
  hud.radar(dots);
}

function step(dt) {
  elapsed += dt;
  const progress = progression.state;
  document.getElementById('progression-readout').textContent = `LV ${progress.level} · ${progress.xp} XP · ${progress.boxes} BOX`;
  const objectiveLabel = mode.id === 'ctf' ? `CTF ${ctf.state.score.ct}-${ctf.state.score.t} · ${ctf.state.message}`
    : mode.id === 'zombie' ? `${outbreak.state.message}`
    : mode.id === 'defuse' ? `${defuse.state.message}`
    : 'Elimination · hold the bay';
  document.getElementById('objective-readout').textContent = `${mode.label} — ${objectiveLabel}`;
  match.step(dt);
  player.step(dt, input.state.keys);
  weaponry.step(dt);
  // The buy phase is a truce: the bots hold their spawns until the round goes live, so a player
  // can pick a weapon without being shot at the counter.
  if (vitals.alive && match.state.phase === PHASE.LIVE) {
    bots.step(dt, {
      player: { position: body.position, alive: vitals.alive, dead: vitals.dead },
      blockers: abilities.blockers,
      onPlayerHit,
      onBotHit,
      onBotShot(bot, seen) {
        onBotShot(bot);
        if (seen && seen.ref && seen.ref.isPlayer) hud.damage('hit');
      },
    });
  }
  if (match.state.phase === PHASE.LIVE) {
    if (mode.id === 'ctf') {
      const before = ctf.state.score.ct + ctf.state.score.t;
      ctf.tick(dt, { position: body.position, alive: vitals.alive }, bots);
      const after = ctf.state.score.ct + ctf.state.score.t;
      if (after > before) {
        progression.award('capture');
        progression.addBox(1);
        progression.flush();
        hud.feed(`Capture secured · +1 supply box`, 'good');
      }
      if (objectiveText !== ctf.state.message) { objectiveText = ctf.state.message; hud.feed(objectiveText, 'neutral'); }
      if (ctf.state.winner) {
        const won = ctf.state.winner === PLAYER_TEAM;
        match.endRound(ctf.state.winner, 'capture');
        announce(won ? 'Flag captured — round won' : 'Flag lost — round lost', won ? 'good' : 'bad', 2400);
      }
    } else if (mode.id === 'zombie') {
      const alive = bots.aliveCount(ENEMY_TEAM);
      const waveBefore = outbreak.state.wave;
      const wasActive = outbreak.state.active;
      outbreak.tick(dt, alive);
      if (objectiveText !== outbreak.state.message) { objectiveText = outbreak.state.message; hud.feed(objectiveText, 'neutral'); }
      if (wasActive && !outbreak.state.active && outbreak.state.wave >= waveBefore && !outbreak.state.cleared) {
        progression.award('waveClear');
        progression.addBox(1);
        progression.flush();
        hud.feed('Wave cleared · +1 supply box', 'good');
      }
      if (outbreak.state.cleared) {
        progression.award('matchWin');
        progression.flush();
        match.endRound(PLAYER_TEAM, 'outbreak');
        announce('Outbreak cleared', 'good', 3000);
      }
    } else if (mode.id === 'defuse') {
      const before = defuse.state.winner;
      defuse.tick(dt, {
        player: { position: body.position, alive: vitals.alive },
        holding: input.state.keys.has('KeyE'),
        bots,
        onEvent(kind, text) {
          hud.feed(text, kind === 'planted' ? 'warn' : 'good');
          hud.banner(text.toUpperCase(), kind === 'planted' ? 'warn' : 'good', 1800);
          if (kind === 'planted') progression.award('roundWin');
          progression.flush();
        },
      });
      if (objectiveText !== defuse.state.message) { objectiveText = defuse.state.message; hud.feed(objectiveText, 'neutral'); }
      if (!before && defuse.state.winner) {
        const won = defuse.state.winner === PLAYER_TEAM;
        const reason = defuse.state.stage === 'defused' ? 'defuse' : 'demolition';
        match.endRound(defuse.state.winner, reason);
        announce(won ? defuse.state.message + ' — round won' : defuse.state.message + ' — round lost', won ? 'good' : 'bad', 2400);
      }
    } else if (bots.aliveCount(ENEMY_TEAM) === 0) {
      stats.roundsWon += 1;
      progression.award('roundWin');
      progression.flush();
      match.endRound(PLAYER_TEAM, 'elimination');
      announce('Round won — bay held', 'good', 2400);
      hud.feed('Round won: attackers eliminated', 'good');
    } else if (!vitals.alive && bots.aliveCount(PLAYER_TEAM) === 0) {
      // The squad is only eliminated when the player and every team-mate are down; the player
      // dying alone leaves the round to the survivors.
      stats.roundsLost += 1;
      match.endRound(ENEMY_TEAM, 'elimination');
      announce('Round lost — squad down', 'bad', 2400);
      hud.feed('Round lost: squad eliminated', 'bad');
    }
  }
  stepSounds(dt);
  if (mode.id === 'defuse' && defuse.state.stage === 'planted' && match.state.phase === PHASE.LIVE) {
    chargeBeep += dt;
    if (chargeBeep >= 1) { chargeBeep = 0; audio.play('click', defuse.state.bomb.x, defuse.state.bomb.z, { gain: 0.9, rate: 1 + (40 - defuse.state.fuse) * 0.01 }); }
  } else chargeBeep = 0;
  handleLeaderboardKey();
  hud.setClock(match.clock());
  hud.setVitals(vitals.health, match.state.armor);
  hud.setMoney(match.state.money);
  hud.setScore(match.state.scoreCT, match.state.scoreT);
  grenades.step(dt, { onBlast });
  updateAbilities(dt);
  if (match.state.phase === PHASE.BUY && !buyOpen && !vitals.dead && !shot) openBuy();
}

match.onPhase((phase, state) => {
  if (shot) return;
  hud.setPhase(phase === PHASE.BUY ? 'BUY PHASE' : phase === PHASE.LIVE ? 'LIVE' : phase === PHASE.OVER ? 'ROUND OVER' : 'MATCH', phase === PHASE.LIVE ? 'live' : 'idle');
  if (phase === PHASE.LIVE) {
    closeBuy();
    if (mode.id === 'ctf') ctf.reset();
    if (mode.id === 'defuse') { defuse.reset(); announce(defuse.state.message, 'info', 1600); }
    if (mode.id === 'zombie' && outbreak.state.wave === 0) { outbreak.reset(); outbreak.startWave(); }
    announce(mode.id === 'ctf' ? 'Live — take their flag' : mode.id === 'zombie' ? `Live — ${outbreak.state.message}` : 'Live — hold the bay', 'info', 1400);
  } else if (phase === PHASE.OVER) {
    closeBuy();
    const rows = buildScoreRows();
    hud.setScoreboard(rows, `You: ${stats.kills} kills · ${stats.deaths} deaths · ${stats.headshots} headshots · ${Math.round(weaponry.accuracy() * 100)}% accuracy`);
    hud.showScoreboard(true);
    const won = state.lastResult.winner === PLAYER_TEAM;
    overlayMode = won ? 'won' : 'lost';
    if (vitals.dead) vitals.dead = false;
    setTimeout(() => {
      if (shot) return;
      hud.showOverlay(overlayMode, `Score ${state.scoreCT}–${state.scoreT}.`);
      if (document.pointerLockElement) document.exitPointerLock();
    }, 900);
  } else if (phase === PHASE.MATCH) {
    overlayMode = 'match';
    hud.setScoreboard(buildScoreRows(), `Final: ${state.scoreCT}–${state.scoreT} · ${stats.kills} kills · ${stats.headshots} headshots · ${Math.round(weaponry.accuracy() * 100)}% accuracy`);
    hud.showScoreboard(true);
    hud.showOverlay('match', `You finished ${state.scoreCT > state.scoreT ? 'ahead' : 'behind'} ${state.scoreCT}–${state.scoreT}.`);
    if (document.pointerLockElement) document.exitPointerLock();
  }
});

// Browsers refuse to start audio before a gesture, so the first click or key press opens the graph.
for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, () => audio.unlock(), { once: true });

function buildScoreRows() {
  const rows = [{ name: playerName, team: PLAYER_TEAM, kills: stats.kills, deaths: stats.deaths, alive: vitals.alive, you: true }];
  for (const bot of bots.items) {
    rows.push({ name: `BOT ${bot.index + 1}`, team: bot.team, kills: bot.kills, deaths: bot.deaths, alive: bot.alive, you: false });
  }
  return rows;
}

// The charge owns E whenever the player is standing where it matters; outside that the key stays
// the operator's second utility.
function defuseInteractionOpen() {
  if (mode.id !== 'defuse' || match.state.phase !== PHASE.LIVE) return false;
  if (defuse.state.stage === 'planted') {
    if (PLAYER_TEAM !== defuse.defending) return false;
    return Math.hypot(body.position.x - defuse.state.bomb.x, body.position.z - defuse.state.bomb.z) < 2.4;
  }
  if (defuse.state.carrier === 'player' && defuse.state.site) {
    return Math.hypot(body.position.x - defuse.state.site.x, body.position.z - defuse.state.site.z) < 2.6;
  }
  return false;
}

// Tab is the mid-round leaderboard: hold it for the live table, release to go back to the fight.
function handleLeaderboardKey() {
  const held = input.state.keys.has('Tab');
  if (shot) return;
  if (held) {
    hud.setScoreboard(buildScoreRows(), `Live table · you: ${stats.kills} kills · ${stats.deaths} deaths`);
    hud.showScoreboard(true);
  } else if (match.state.phase === PHASE.LIVE) {
    hud.showScoreboard(false);
  }
}

function handleHotkeys() {
  if (input.state.keys.has('KeyG') && throwGrenade()) input.state.keys.delete('KeyG');
  // F and E are the operator's two utility slots, X is the ultimate — one press each, and the key
  // is consumed so holding it does nothing.
  const slot1 = abilities.def().slot1;
  const slot2 = abilities.def().slot2;
  if (input.state.keys.has('KeyF') && abilities.useSlot1(camera.position.clone(), throwDirection(), abilityCtx)) {
    input.state.keys.delete('KeyF');
    hud.feed(`${slot1.label} out`, 'neutral');
  }
  if (input.state.keys.has('KeyE') && !defuseInteractionOpen() && abilities.useSlot2(camera.position.clone(), throwDirection(), abilityCtx)) {
    input.state.keys.delete('KeyE');
    hud.feed(`${slot2.label} used`, 'neutral');
  }
  if (input.state.keys.has('KeyX')) {
    const ultimate = abilities.useUlt(camera.position.clone(), throwDirection(), abilityCtx);
    if (ultimate) {
      input.state.keys.delete('KeyX');
      const text = ultimate === 'recon' ? 'Recon pulse — attackers marked'
        : ultimate === 'mortar' ? 'Airburst inbound' : 'Nano surge — topped up';
      announce(text, 'good', 1400);
      hud.feed(text, 'good');
    }
  }

  if (input.state.keys.has('KeyV') && openSupplyBox()) input.state.keys.delete('KeyV');

  if (input.state.keys.has('KeyB') && match.canBuy() && !buyOpen) openBuy();
  const digits = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];
  for (let index = 0; index < digits.length; index += 1) {
    if (input.state.keys.has(digits[index]) && buyOpen) {
      buy(BUY_LIST[index].id);
      input.state.keys.delete(digits[index]);
    }
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (!buyOpen && vitals.alive) player.look(look.x, look.y);
    if (!buyOpen && vitals.alive && input.state.firing) {
      const weapon = weaponry.def();
      if (weapon.auto ? weaponry.ready() : weaponry.ready()) shoot(weaponry.spread(player.groundSpeed()));
    }
    if (input.state.keys.has('KeyR')) weaponry.reload();
    if (input.state.keys.has('KeyQ')) {
      const other = weaponry.state.current === weaponry.state.primary ? weaponry.state.secondary : weaponry.state.primary;
      if (other !== weaponry.state.current) weaponry.equip(other);
    }
    handleHotkeys();
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

// A posed frame per capture: the start screen, the buy menu, a live firefight, and a round result.
function runShot(name) {
  hud.hideOverlay();
  hud.showScoreboard(false);
  closeBuy();
  startRound();
  match.beginLive();
  hud.setPhase('LIVE', 'live');

  if (name === 'start') {
    body.position.set(0, 0, -13.4);
    body.yaw = Math.PI * 0.02;
    body.pitch = -0.02;
    settle(10);
    overlayMode = 'start';
    hud.showOverlay('start');
    hud.setPhase('BUY PHASE', 'idle');
    hud.setClock('0:15');
    hud.setMoney(800);
    hud.setScore(0, 0);
  } else if (name === 'buy') {
    body.position.set(-2.4, 0, -12.6);
    body.yaw = 0.22;
    body.pitch = 0.0;
    settle(8);
    hud.setMoney(4150);
    match.state.money = 4150;
    openBuy();
    hud.setPhase('BUY PHASE', 'idle');
    hud.setClock('0:09');
  } else if (name === 'play' || name === 'end') {
    // Stage the firefight at the uplink room: the player holds the low wall, three attackers push in.
    body.position.set(6.6, 0, -0.6);
    body.yaw = 0.12;
    body.pitch = -0.02;
    settle(6);
    const attackers = bots.items.filter((bot) => bot.team === ENEMY_TEAM);
    attackers[0].position.set(7.4, 0, -8.2);
    attackers[1].position.set(4.2, 0, -9.0);
    attackers[2].position.set(9.6, 0, -10.4);
    const friendlies = bots.items.filter((bot) => bot.team === PLAYER_TEAM);
    friendlies[0].position.set(3.0, 0, -4.2);
    friendlies[1].position.set(10.6, 0, -2.6);
    friendlies[2].position.set(-0.6, 0, -6.8);
    settle(4);
    weaponry.give('vector', 'primary');
    weaponry.equip('vector');
    weaponry.refill();
    vitals.health = 100;
    match.state.armor = 0;
    if (name === 'play') {
      // Two aimed shots: one body hit, one headshot. The kill feed is written by shoot() itself.
      aimAt(new THREE.Vector3(attackers[1].position.x, attackers[1].position.y + 1.0, attackers[1].position.z));
      shoot(0);
      settle(4);
      aimAt(new THREE.Vector3(attackers[0].position.x, attackers[0].position.y + 1.62, attackers[0].position.z));
      shoot(0);
      settle(14);
      vitals.health = 74;
      match.state.armor = 50;
      match.state.scoreCT = 1;
      match.state.scoreT = 1;
      match.state.money = 2600;
      hud.setScore(1, 1);
      hud.setMoney(2600);
      hud.setClock('1:44');
      hud.banner('HEADSHOT', 'good', 60000);
      hud.setPhase('LIVE', 'live');
      hud.setRound(2);
    } else {
      for (const bot of attackers) bots.damage(bot, 400, true);
      settle(8);
      match.state.scoreCT = 3;
      match.state.scoreT = 2;
      match.state.money = 4750;
      hud.setScore(3, 2);
      hud.setMoney(4750);
      hud.setClock('1:12');
      hud.setRound(6);
      vitals.health = 46;
      match.state.armor = 62;
      hud.showScoreboard(true);
      hud.setScoreboard(buildScoreRows(), 'You: 4 kills · 1 death · 3 headshots · 67% accuracy');
      hud.banner('ROUND WON — BAY HELD', 'good', 60000);
      hud.setPhase('ROUND OVER', 'good');
    }
    hud.setAmmo(weaponry.state.mag, weaponry.state.reserve, weaponry.def().name);
  }
  hud.setVitals(vitals.health, match.state.armor);
  paintTwiceThenReady();
}

// A test seam: run the simulation without waiting on the display's frame rate (used to verify the
// round loop in a headless browser, and harmless in play).
window.__advance = (seconds) => {
  const steps = Math.min(6000, Math.round(seconds / FIXED_STEP));
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
  syncCamera();
  return { phase: match.state.phase, clock: match.clock(), score: [match.state.scoreCT, match.state.scoreT], hp: vitals.health, alive: bots.aliveCount(ENEMY_TEAM), round: match.state.round };
};
window.__audio = () => ({ ready: audio.ready(), clips: audio.clipNames().length, stats: audio.stats, stride: STRIDE, listener: { x: body.position.x, z: body.position.z, yaw: player.state.yaw } });
window.__keys = () => [...input.state.keys];
window.__phys = () => ({ onGround: player.state.onGround, y: player.state.y, vy: player.state.velocity.y, crouch: player.state.crouching, walking: player.state.walking, keys: [...input.state.keys] });
window.__state = () => ({ phase: match.state.phase, clock: match.clock(), hp: vitals.health, armor: match.state.armor, score: [match.state.scoreCT, match.state.scoreT], enemiesAlive: bots.aliveCount(ENEMY_TEAM), friendsAlive: bots.aliveCount(PLAYER_TEAM), weapon: weaponry.state.current, mag: weaponry.state.mag, money: match.state.money });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
if (shot) runShot(shot);
else {
  startRound();
  requestAnimationFrame(frame);
}
