// The bots: two squads of three, each a capsule with a head, a rifle and a short temper. They
// walk the map's waypoints, hold the site their side owns, look for an enemy in their cone,
// stop to shoot (accuracy counts, so a moving bot misses), and fall over when their health runs
// out. A bot never reads the player's position except through its own eyes: the same line-of-sight
// test that stops a bullet stops its aim.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const BOT_HEALTH = 100;
const EYE = 1.58;
const WAYPOINT_REACHED = 0.9;
// Difficulty only changes these through the tuning object handed to createBots(); the defaults
// mirror the NORMAL preset so a missing argument cannot make the bots unplayable.
const DEFAULT_TUNING = { turnRate: 4.2, fireGap: 0.19, steady: 0.86, falloff: 0.014, damage: 24, sightRange: 46, reflex: 0.22, walkSpeed: 4.0 };

export function createBots(scene, world, map, preset = DEFAULT_TUNING, playerTeam = 'ct') {
  const tuning = { ...DEFAULT_TUNING, ...preset };
  // Whichever side the player took, the opposing side is spawned as the live shooters; the
  // player's own side is only there for the scoreboard.
  const enemyTeam = playerTeam === 'ct' ? 't' : 'ct';

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
      kills: 0,
      deaths: 0,
      // A mode that needs a bot somewhere specific sets this; null means free patrol.
      objective: null,
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
      const friendlySpawns = map.spawns[playerTeam];
      const enemySpawns = map.spawns[enemyTeam];
      const friendlySpawn = friendlySpawns[(i + 1) % friendlySpawns.length];
      const enemySpawn = enemySpawns[i % enemySpawns.length];
      const friendly = build(playerTeam, i);
      friendly.position.set(friendlySpawn[0] + (i - 1) * 1.1, 0, friendlySpawn[1] - 1.2);
      friendly.home.copy(friendly.position);
      const enemy = build(enemyTeam, i);
      enemy.position.set(enemySpawn[0] + (i - 1) * 1.2, 0, enemySpawn[1] + 1.0);
      enemy.home.copy(enemy.position);
    }
    for (const bot of items) {
      bot.alive = true;
      bot.health = BOT_HEALTH;
      bot.fall = 0;
      bot.killedByPlayer = false;
      bot.objective = null;
      bot.kills = 0;
      bot.deaths = 0;
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

  // Distance from a segment (the sight line) to a point, used to decide whether a smoke cloud sits
  // between a bot and what it is trying to see.
  function segmentHitsSphere(from, to, centre, radius) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const fx = centre.x - from.x;
    const fy = centre.y - from.y;
    const fz = centre.z - from.z;
    const lengthSquared = dx * dx + dy * dy + dz * dz || 1;
    let t = (fx * dx + fy * dy + fz * dz) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    const cx = from.x + dx * t - centre.x;
    const cy = from.y + dy * t - centre.y;
    const cz = from.z + dz * t - centre.z;
    return cx * cx + cy * cy + cz * cz <= radius * radius;
  }

  function sense(bot, targets, blockers) {
    // A blinded bot sees nothing at all: no target, no aim, no shot. The blind decays in step().
    if (bot.blind > 0) return null;
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
      if (distance > tuning.sightRange) continue;
      const facing = (dx * forwardX + dz * forwardZ) / (distance || 1);
      const cone = distance < 7 ? -0.35 : 0.32;
      if (facing < cone) continue;
      candidatePoint.set(other.position.x, other.position.y + 1.2, other.position.z);
      if (world.blocked(eye, candidatePoint)) continue;
      // Smoke breaks the sight line even when the geometry does not.
      let smoked = false;
      for (const blocker of blockers || []) {
        if (segmentHitsSphere(eye, candidatePoint, blocker.position, blocker.radius)) {
          smoked = true;
          break;
        }
      }
      if (smoked) continue;
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
    const stepX = (dx / distance) * tuning.walkSpeed * dt;
    const stepZ = (dz / distance) * tuning.walkSpeed * dt;
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
      if (bot.blind > 0) bot.blind = Math.max(0, bot.blind - dt);

      const targets = [];
      // The player always counts as the side they picked: only the opposing bots may shoot at
      // them, and no bot on the player's own side ever does.
      if (bot.team !== playerTeam && ctx.player.alive && !ctx.player.dead) {
        targets.push({ position: ctx.player.position, alive: true, isPlayer: true, team: playerTeam });
      }
      for (const other of items) {
        if (other.alive && other.team !== bot.team) targets.push(other);
      }

      const seen = sense(bot, targets, ctx.blockers);
      if (seen) {
        bot.target = seen;
        const desiredYaw = Math.atan2(-(seen.x - bot.position.x), -(seen.z - bot.position.z));
        let delta = desiredYaw - bot.yaw;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        bot.yaw += Math.max(-tuning.turnRate * dt, Math.min(tuning.turnRate * dt, delta));
        bot.aimPitch = Math.atan2(seen.y + 1.15 - (bot.position.y + EYE), seen.distance);
        // A moving bot shoots late and wide, so a player who breaks line of sight survives. The
        // first sighting also costs the preset's reflex time before the trigger is live.
        bot.exposed = (bot.exposed ?? 0) + dt;
        if (bot.cooldown === 0 && bot.exposed >= tuning.reflex && Math.abs(delta) < 0.22 && seen.distance < tuning.sightRange) {
          bot.cooldown = tuning.fireGap * (0.85 + Math.random() * 0.5);
          const hitChance = Math.max(0.1, tuning.steady - seen.distance * tuning.falloff - (bot.moving ? 0.22 : 0));
          if (Math.random() < hitChance) {
            if (seen.ref.isPlayer) ctx.onPlayerHit(tuning.damage, bot);
            else ctx.onBotHit(seen.ref, tuning.damage, bot);
          }
          if (ctx.onBotShot) ctx.onBotShot(bot, seen);
        }
        bot.moving = false;
      } else {
        bot.target = null;
        bot.exposed = 0;
        let goalX;
        let goalZ;
        if (bot.objective) {
          goalX = bot.objective.x;
          goalZ = bot.objective.z;
          moveToward(bot, goalX, goalZ, dt);
        } else {
          if (bot.decideIn <= 0 || !bot.waypoint) {
            bot.waypoint = pickWaypoint(bot, bot.position);
            bot.decideIn = 2.2 + Math.random() * 2.4;
          }
          goalX = bot.waypoint[0];
          goalZ = bot.waypoint[1];
          const arrived = moveToward(bot, goalX, goalZ, dt);
          if (arrived) bot.waypoint = null;
        }
        const desiredYaw = Math.atan2(-(goalX - bot.position.x), -(goalZ - bot.position.z));
        let delta = desiredYaw - bot.yaw;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        bot.yaw += Math.max(-tuning.turnRate * dt, Math.min(tuning.turnRate * dt, delta));
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
    bot.deaths += 1;
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
