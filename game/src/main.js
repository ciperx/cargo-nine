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
import { createWeaponry, WEAPONS, BUY_LIST } from './weapons.js';
import { createBots } from './bots.js';
import { createMatch, PHASE } from './rounds.js';
import { createHud } from './hud.js';

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
const bots = createBots(scene, world, MAP);
const weaponry = createWeaponry(camera);
const hud = createHud();
const player = createPlayer(world.colliders);
const match = createMatch();
const input = createInput(renderer.domElement, onLockChange);

const raycaster = new THREE.Raycaster();
const direction = new THREE.Vector3();
const body = player.state;

const stats = { kills: 0, deaths: 0, headshots: 0, roundsWon: 0, roundsLost: 0, damage: 0 };
const vitals = { health: 100, alive: true, dead: false };
const playerName = 'YOU';

let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let buyOpen = false;
let overlayMode = null;

function announce(text, tone = 'neutral', holdMs = 1600) {
  if (!shot) hud.banner(text, tone, holdMs);
}

function spawnPlayer() {
  const spawn = MAP.spawns.ct[0];
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

function onPlayerHit(amount, bot) {
  if (!vitals.alive) return;
  let left = amount;
  if (match.state.armor > 0) {
    const absorbed = left * 0.5;
    match.state.armor = Math.max(0, match.state.armor - absorbed);
    left -= absorbed;
  }
  vitals.health = Math.max(0, vitals.health - left);
  hud.setVitals(vitals.health, match.state.armor);
  hud.damage('hit');
  if (vitals.health === 0) die(`shot by ${bot.team.toUpperCase()} bot ${bot.index + 1}`);
}

function onBotHit(bot, amount, by) {
  const result = bots.damage(bot, amount, false);
  if (result.killed) hud.feed(`${by.team.toUpperCase()} bot ${by.index + 1} downed ${bot.team.toUpperCase()} bot ${bot.index + 1}`, 'neutral');
}

function die(reason) {
  if (!vitals.alive) return;
  vitals.alive = false;
  vitals.dead = true;
  stats.deaths += 1;
  hud.feed(`${playerName} down — ${reason}`, 'bad');
  hud.damage('kill');
  if (document.pointerLockElement) document.exitPointerLock();
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
    const hit = raycaster.intersectObjects(targets, false)[0];
    if (!hit) continue;
    const bot = hit.object.userData.bot;
    if (!bot || !bot.alive) continue;
    hitSomething = true;
    weaponry.state.shotsHit += pellets === 1 ? 1 : 1 / pellets;
    const head = hit.object === bot.head;
    const damage = head ? weapon.damage * weapon.headshot : weapon.damage;
    stats.damage += damage;
    if (head) stats.headshots += 1;
    const result = bots.damage(bot, damage, true);
    hud.hitMarker(result.killed, 140);
    if (result.killed) {
      stats.kills += 1;
      match.awardKill();
      hud.setMoney(match.state.money);
      hud.feed(`${playerName} ${head ? 'HS' : 'killed'} ${bot.team.toUpperCase()} bot ${bot.index + 1}`, 'good');
      announce(head ? 'Headshot' : 'Target down', 'good', 900);
    }
  }
  if (!hitSomething && pellets === 1) weaponry.state.shotsHit += 0;
  weaponry.pullTrigger();
  player.recoil(weapon.recoil + random() * 0.004, (random() * 2 - 1) * 0.005);
  hud.setAmmo(weaponry.state.mag, weaponry.state.reserve, weapon.name);
  return true;
}

function step(dt) {
  elapsed += dt;
  match.step(dt);
  player.step(dt, input.state.keys);
  weaponry.step(dt);
  if (vitals.alive) {
    bots.step(dt, {
      player: { position: body.position, alive: vitals.alive, dead: vitals.dead },
      onPlayerHit,
      onBotHit,
      onBotShot(bot, seen) {
        if (seen && seen.ref && seen.ref.isPlayer) hud.damage('hit');
      },
    });
  }
  if (match.state.phase === PHASE.LIVE) {
    if (bots.aliveCount('t') === 0) {
      stats.roundsWon += 1;
      match.endRound('ct', 'elimination');
      announce('Round won — bay held', 'good', 2400);
      hud.feed('Round won: attackers eliminated', 'good');
    } else if (!vitals.alive || bots.aliveCount('ct') === 0) {
      stats.roundsLost += 1;
      match.endRound('t', 'elimination');
      announce('Round lost — squad down', 'bad', 2400);
      hud.feed('Round lost: squad eliminated', 'bad');
    }
  }
  hud.setClock(match.clock());
  hud.setVitals(vitals.health, match.state.armor);
  hud.setMoney(match.state.money);
  hud.setScore(match.state.scoreCT, match.state.scoreT);
  if (match.state.phase === PHASE.BUY && !buyOpen && !vitals.dead && !shot) openBuy();
}

match.onPhase((phase, state) => {
  if (shot) return;
  hud.setPhase(phase === PHASE.BUY ? 'BUY PHASE' : phase === PHASE.LIVE ? 'LIVE' : phase === PHASE.OVER ? 'ROUND OVER' : 'MATCH', phase === PHASE.LIVE ? 'live' : 'idle');
  if (phase === PHASE.LIVE) {
    closeBuy();
    announce('Live — hold the bay', 'info', 1400);
  } else if (phase === PHASE.OVER) {
    closeBuy();
    const rows = buildScoreRows();
    hud.setScoreboard(rows, `You: ${stats.kills} kills · ${stats.deaths} deaths · ${stats.headshots} headshots · ${Math.round(weaponry.accuracy() * 100)}% accuracy`);
    hud.showScoreboard(true);
    const won = state.lastResult.winner === 'ct';
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

function buildScoreRows() {
  const rows = [{ name: playerName, team: 'ct', kills: stats.kills, alive: vitals.alive, you: true }];
  for (const bot of bots.items) {
    rows.push({ name: `BOT ${bot.index + 1}`, team: bot.team, kills: 0, alive: bot.alive, you: false });
  }
  return rows;
}

function handleHotkeys() {
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
    const attackers = bots.items.filter((bot) => bot.team === 't');
    attackers[0].position.set(7.4, 0, -8.2);
    attackers[1].position.set(4.2, 0, -9.0);
    attackers[2].position.set(9.6, 0, -10.4);
    const friendlies = bots.items.filter((bot) => bot.team === 'ct');
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
