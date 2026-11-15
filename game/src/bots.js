// The bots: two squads of three, each a capsule with a head, a rifle and a short temper. They
// walk the map's waypoints, hold the site their side owns, look for an enemy in their cone,
// stop to shoot (accuracy counts, so a moving bot misses), and fall over when their health runs
// out. A bot never reads the player's position except through its own eyes: the same line-of-sight
// test that stops a bullet stops its aim.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const BOT_HEALTH = 100;
const BOT_SPEED = 4.0;
const EYE = 1.58;
const SIGHT_RANGE = 46;
const FIRE_GAP = 0.19;
const DAMAGE = 24;
const TURN_RATE = 4.2;
const WAYPOINT_REACHED = 0.9;

export function createBots(scene, world, map) {
  const bodyGeometry = new THREE.CapsuleGeometry(0.28, 0.86, 6, 12);
  const headGeometry = new THREE.SphereGeometry(0.16, 14, 10);
  const rifleGeometry = new THREE.BoxGeometry(0.07, 0.07, 0.52);
  const materialCT = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.muted), roughness: 0.62, metalness: 0.12 });
  const materialT = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.08 });
  const materialHead = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.45, metalness: 0.15 });
  const materialGun = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.4 });

  const items = [];

  function build(team, index) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(bodyGeometry, team === 'ct' ? materialCT : materialT);
    body.position.y = 0.86;
    const head = new THREE.Mesh(headGeometry, materialHead);
    head.position.y = 1.62;
    const rifle = new THREE.Mesh(rifleGeometry, materialGun);
    rifle.position.set(0.16, 1.18, -0.28);
    group.add(body, head, rifle);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(group);
    const bot = {
      team,
      index,
      group,
      body,
      head,
      health: BOT_HEALTH,
      alive: true,
      yaw: team === 'ct' ? Math.PI : 0,
      aimYaw: team === 'ct' ? Math.PI : 0,
      aimPitch: 0,
      cooldown: 0,
      decideIn: 0,
      waypoint: null,
      target: null,
      killedByPlayer: false,
      fall: 0,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      home: new THREE.Vector3(),
      site: team === 'ct' ? map.sites.A : map.sites.B,
    };
    body.userData.bot = bot;
    head.userData.bot = bot;
    items.push(bot);
    return bot;
  }

  function spawnRound() {
    items.length = 0;
    for (let i = 0; i < 3; i += 1) {
      const ctSpawn = map.spawns.ct[(i + 1) % map.spawns.ct.length];
      const tSpawn = map.spawns.t[i % map.spawns.t.length];
      const friendly = build('ct', i);
      friendly.position.set(ctSpawn[0] + (i - 1) * 1.1, 0, ctSpawn[1] - 1.2);
      friendly.home.copy(friendly.position);
      const enemy = build('t', i);
      enemy.position.set(tSpawn[0] + (i - 1) * 1.2, 0, tSpawn[1] + 1.0);
      enemy.home.copy(enemy.position);
    }
    for (const bot of items) {
      bot.alive = true;
      bot.health = BOT_HEALTH;
      bot.fall = 0;
      bot.killedByPlayer = false;
      bot.group.rotation.set(0, bot.yaw, 0);
      bot.group.position.copy(bot.position);
      bot.group.visible = true;
    }
  }

  function pickWaypoint(bot, from) {
    const pool = map.waypoints;
    let best = null;
    let bestScore = -Infinity;
    for (const point of pool) {
      const dx = point[0] - from.x;
      const dz = point[1] - from.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 2.4) continue;
      const toSite = Math.hypot(point[0] - bot.site.x, point[1] - bot.site.z);
      const score = -distance * 0.35 - toSite * 1.15 + Math.random() * 2.2;
      if (score > bestScore) {
        bestScore = score;
        best = point;
      }
    }
    return best ?? [bot.site.x, bot.site.z];
  }

  function eyeOf(bot, out) {
    out.set(bot.position.x, bot.position.y + EYE, bot.position.z);
    return out;
  }

  const eye = new THREE.Vector3();
  const candidatePoint = new THREE.Vector3();

  function sense(bot, targets) {
    eyeOf(bot, eye);
    let closest = null;
    let closestDistance = Infinity;
    const forwardX = -Math.sin(bot.yaw);
    const forwardZ = -Math.cos(bot.yaw);
    for (const other of targets) {
      if (!other.alive) continue;
      const dx = other.position.x - bot.position.x;
      const dz = other.position.z - bot.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > SIGHT_RANGE) continue;
      const facing = (dx * forwardX + dz * forwardZ) / (distance || 1);
      const cone = distance < 7 ? -0.35 : 0.32;
      if (facing < cone) continue;
      candidatePoint.set(other.position.x, other.position.y + 1.2, other.position.z);
      if (world.blocked(eye, candidatePoint)) continue;
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = { x: other.position.x, y: other.position.y, z: other.position.z, ref: other, distance };
      }
    }
    return closest;
  }

  function moveToward(bot, x, z, dt) {
    const dx = x - bot.position.x;
    const dz = z - bot.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.08) return true;
    const stepX = (dx / distance) * BOT_SPEED * dt;
    const stepZ = (dz / distance) * BOT_SPEED * dt;
    // Resolve each axis on its own against a small probe, so a bot slides along a wall.
    const probe = new THREE.Box3();
    const tryAxis = (nx, nz) => {
      probe.min.set(nx - 0.3, bot.position.y + 0.1, nz - 0.3);
      probe.max.set(nx + 0.3, bot.position.y + 1.7, nz + 0.3);
      return !world.colliders.some((collider) => probe.intersectsBox(collider));
    };
    if (tryAxis(bot.position.x + stepX, bot.position.z)) bot.position.x += stepX;
    if (tryAxis(bot.position.x, bot.position.z + stepZ)) bot.position.z += stepZ;
    return distance < WAYPOINT_REACHED;
  }

  function step(dt, ctx) {
    for (const bot of items) {
      if (!bot.alive) {
        bot.fall = Math.min(1, bot.fall + dt * 3.4);
        bot.group.rotation.x = -bot.fall * 1.4;
        bot.group.position.y = -bot.fall * 0.1;
        continue;
      }
      bot.cooldown = Math.max(0, bot.cooldown - dt);
      bot.decideIn -= dt;

      const targets = [];
      if (ctx.player.alive && !ctx.player.dead) targets.push({ position: ctx.player.position, alive: true, isPlayer: true, team: 'player' });
      for (const other of items) {
        if (other.alive && other.team !== bot.team) targets.push(other);
      }

      const seen = sense(bot, targets);
      if (seen) {
        bot.target = seen;
        const desiredYaw = Math.atan2(-(seen.x - bot.position.x), -(seen.z - bot.position.z));
        let delta = desiredYaw - bot.yaw;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        bot.yaw += Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, delta));
        bot.aimPitch = Math.atan2(seen.y + 1.15 - (bot.position.y + EYE), seen.distance);
        // A moving bot shoots late and wide, so a player who breaks line of sight survives.
        if (bot.cooldown === 0 && Math.abs(delta) < 0.22 && seen.distance < SIGHT_RANGE) {
          bot.cooldown = FIRE_GAP * (0.85 + Math.random() * 0.5);
          const hitChance = Math.max(0.1, 0.86 - seen.distance * 0.014 - (bot.moving ? 0.22 : 0));
          if (Math.random() < hitChance) {
            if (seen.ref.isPlayer) ctx.onPlayerHit(DAMAGE, bot);
            else ctx.onBotHit(seen.ref, DAMAGE, bot);
          }
          if (ctx.onBotShot) ctx.onBotShot(bot, seen);
        }
        bot.moving = false;
      } else {
        bot.target = null;
        if (bot.decideIn <= 0 || !bot.waypoint) {
          bot.waypoint = pickWaypoint(bot, bot.position);
          bot.decideIn = 2.2 + Math.random() * 2.4;
        }
        const arrived = moveToward(bot, bot.waypoint[0], bot.waypoint[1], dt);
        if (arrived) bot.waypoint = null;
        const desiredYaw = Math.atan2(-(bot.waypoint[0] - bot.position.x), -(bot.waypoint[1] - bot.position.z));
        let delta = desiredYaw - bot.yaw;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        bot.yaw += Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, delta));
        bot.aimPitch = 0;
        bot.moving = true;
      }

      bot.group.position.set(bot.position.x, bot.position.y, bot.position.z);
      bot.group.rotation.set(-bot.aimPitch, bot.yaw, 0, 'YXZ');
    }
  }

  function damage(bot, amount, fromPlayer) {
    if (!bot || typeof bot !== 'object' || !bot.body) {
      console.error('damage: bad target', typeof bot, bot && Object.keys(bot).slice(0, 8));
      return { killed: false, team: null };
    }
    if (!bot.alive) return { killed: false, team: bot.team };
    bot.health -= amount;
    if (bot.health > 0) return { killed: false, team: bot.team };
    bot.alive = false;
    bot.fall = 0;
    bot.killedByPlayer = Boolean(fromPlayer);
    return { killed: true, team: bot.team };
  }

  function aliveCount(team) {
    return items.filter((bot) => bot.alive && bot.team === team).length;
  }

  function meshes() {
    const list = [];
    for (const bot of items) if (bot.alive) list.push(bot.body, bot.head);
    return list;
  }

  return { items, spawnRound, step, damage, aliveCount, meshes };
}
