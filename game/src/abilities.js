// The operator system: three agents, each with two utility charges and an ultimate, in the shape a
// tactical shooter uses them. Every ability has a real effect on the simulation:
//
//   VEIL   F flash (blinds bots looking at it)   E smoke (breaks bot sight lines)   X recon (marks attackers)
//   BRICK  F flash                               E frag charge (blast damage)       X airburst (mortar at the aim point)
//   DOC    F smoke                               E stim (heals the player)          X nano surge (full heal + armor)
//
// Charges refill each round, the ultimate costs three kills, and nothing here touches the DOM: the
// abilities call back into main.js for damage, healing and HUD, so the rules stay in one place.
import * as THREE from 'three';
import { MAP } from './world.js';

const GRAVITY = 20;
const THROW_SPEED = 13;
const THROW_LIFT = 3.4;
const FLASH_FUSE = 0.8;
const FLASH_RADIUS = 14;
const FLASH_BLIND = 2.4; // seconds a bot cannot see
const SMOKE_FUSE = 1.1; // flight time before the cloud forms
const SMOKE_RADIUS = 3.2;
const SMOKE_LIFE = 9;
const FRAG_FUSE = 1.5;
const FRAG_RADIUS = 5.5;
const FRAG_DAMAGE = 90;
const MORTAR_DELAY = 1.2;
const MORTAR_RADIUS = 6;
const MORTAR_DAMAGE = 120;
const RECON_LIFE = 6;
const ULT_COST = 3;

export const OPERATORS = [
  {
    id: 'veil', name: 'Veil', role: 'scout',
    slot1: { key: 'F', label: 'Flash', kind: 'flash' },
    slot2: { key: 'E', label: 'Smoke', kind: 'smoke' },
    ult: { key: 'X', label: 'Recon pulse', kind: 'recon' },
  },
  {
    id: 'brick', name: 'Brick', role: 'breacher',
    slot1: { key: 'F', label: 'Flash', kind: 'flash' },
    slot2: { key: 'E', label: 'Frag charge', kind: 'frag' },
    ult: { key: 'X', label: 'Airburst', kind: 'mortar' },
  },
  {
    id: 'doc', name: 'Doc', role: 'anchor',
    slot1: { key: 'F', label: 'Smoke', kind: 'smoke' },
    slot2: { key: 'E', label: 'Stim', kind: 'stim' },
    ult: { key: 'X', label: 'Nano surge', kind: 'nano' },
  },
];

export function createAbilities(scene) {
  const state = { operator: 'veil', slot1: 1, slot2: 1, ult: 0, ultMax: ULT_COST };
  const flying = [];
  const smokes = [];
  const pending = [];
  let reconUntil = 0;
  let clock = 0;

  const flashGeometry = new THREE.SphereGeometry(0.11, 10, 8);
  const flashMaterial = new THREE.MeshStandardMaterial({ color: 0xd8d8d0, emissive: 0x222222 });
  const fragMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4f45, emissive: 0x151515 });
  const smokeMaterial = new THREE.MeshStandardMaterial({
    color: 0x9aa3a8, transparent: true, opacity: 0.62, depthWrite: false, roughness: 1,
  });
  const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff5a5a, transparent: true, opacity: 0.5 });

  const def = () => OPERATORS.find((entry) => entry.id === state.operator) || OPERATORS[0];

  function throwAt(origin, direction, kind) {
    const geometry = kind === 'smoke' ? new THREE.SphereGeometry(0.3, 10, 8)
      : kind === 'frag' ? new THREE.SphereGeometry(0.15, 10, 8) : flashGeometry;
    const material = kind === 'smoke' ? smokeMaterial : kind === 'frag' ? fragMaterial : flashMaterial;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(origin);
    scene.add(mesh);
    flying.push({
      kind,
      mesh,
      velocity: new THREE.Vector3(
        direction.x * THROW_SPEED,
        direction.y * THROW_SPEED + THROW_LIFT,
        direction.z * THROW_SPEED,
      ),
      fuse: kind === 'smoke' ? SMOKE_FUSE : kind === 'frag' ? FRAG_FUSE : FLASH_FUSE,
    });
  }

  function bounce(object) {
    const p = object.mesh.position;
    if (p.y < 0.12) {
      p.y = 0.12;
      object.velocity.y = Math.abs(object.velocity.y) * 0.35;
      object.velocity.x *= 0.7;
      object.velocity.z *= 0.7;
    }
    if (Math.abs(p.x) > MAP.halfX - 0.2) {
      p.x = Math.sign(p.x) * (MAP.halfX - 0.2);
      object.velocity.x *= -0.35;
    }
    if (Math.abs(p.z) > MAP.halfZ - 0.2) {
      p.z = Math.sign(p.z) * (MAP.halfZ - 0.2);
      object.velocity.z *= -0.35;
    }
  }

  function ring(point, radius) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(radius * 0.82, radius, 28), markerMaterial.clone());
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(point.x, 0.06, point.z);
    scene.add(mesh);
    return mesh;
  }

  function detonateFlash(point, ctx) {
    for (const bot of ctx.bots.items) {
      if (!bot.alive) continue;
      const dx = point.x - bot.position.x;
      const dz = point.z - bot.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > FLASH_RADIUS) continue;
      // Looking away saves a bot, which is what makes the flash a positioning tool, not a free kill.
      const facing = (dx * -Math.sin(bot.yaw) + dz * -Math.cos(bot.yaw)) / (distance || 1);
      if (facing < 0.15 && distance > 2.5) continue;
      bot.blind = Math.max(bot.blind || 0, FLASH_BLIND * (1 - distance / (FLASH_RADIUS * 1.6)));
    }
    if (ctx.onFlash) ctx.onFlash(point, FLASH_RADIUS);
  }

  function deploySmoke(point) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(SMOKE_RADIUS, 14, 12), smokeMaterial.clone());
    mesh.position.copy(point);
    mesh.position.y = Math.max(1.4, mesh.position.y);
    scene.add(mesh);
    smokes.push({ mesh, position: mesh.position.clone(), until: clock + SMOKE_LIFE });
  }

  return {
    state,
    def,
    operators: OPERATORS,
    setOperator(id) {
      if (!OPERATORS.some((entry) => entry.id === id)) return false;
      state.operator = id;
      return true;
    },
    get blockers() {
      return smokes.map((smoke) => ({ position: smoke.position, radius: SMOKE_RADIUS }));
    },
    reconActive() {
      return clock < reconUntil;
    },
    useSlot1(origin, direction, ctx) {
      if (state.slot1 <= 0) return false;
      const kind = def().slot1.kind;
      if (kind === 'flash' || kind === 'smoke') {
        state.slot1 -= 1;
        throwAt(origin, direction, kind);
        return true;
      }
      return false;
    },
    useSlot2(origin, direction, ctx) {
      if (state.slot2 <= 0) return false;
      const kind = def().slot2.kind;
      if (kind === 'smoke' || kind === 'frag') {
        state.slot2 -= 1;
        throwAt(origin, direction, kind);
        return true;
      }
      if (kind === 'stim') {
        state.slot2 -= 1;
        if (ctx && ctx.onHeal) ctx.onHeal(40);
        return true;
      }
      return false;
    },
    useUlt(origin, direction, ctx) {
      if (state.ult < ULT_COST) return false;
      const kind = def().ult.kind;
      state.ult = 0;
      if (kind === 'recon') {
        reconUntil = clock + RECON_LIFE;
        return 'recon';
      }
      if (kind === 'mortar') {
        // The airburst lands where the player is aiming, so the point is traced forward from the eye.
        const target = new THREE.Vector3().copy(origin).addScaledVector(direction, 18);
        pending.push({ kind: 'mortar', mesh: ring(target, MORTAR_RADIUS), point: target.clone(), at: clock + MORTAR_DELAY });
        return 'mortar';
      }
      if (kind === 'nano') {
        if (ctx && ctx.onHeal) ctx.onHeal(100);
        if (ctx && ctx.onArmor) ctx.onArmor(50);
        return 'nano';
      }
      return false;
    },
    onKill() {
      state.ult = Math.min(ULT_COST, state.ult + 1);
    },
    resetRound() {
      state.slot1 = 1;
      state.slot2 = 1;
      for (const object of flying) scene.remove(object.mesh);
      flying.length = 0;
      for (const smoke of smokes) scene.remove(smoke.mesh);
      smokes.length = 0;
      for (const item of pending) scene.remove(item.mesh);
      pending.length = 0;
      reconUntil = 0;
    },
    step(dt, ctx) {
      clock += dt;
      for (let index = flying.length - 1; index >= 0; index -= 1) {
        const object = flying[index];
        object.fuse -= dt;
        object.velocity.y -= GRAVITY * dt;
        object.mesh.position.addScaledVector(object.velocity, dt);
        bounce(object);
        if (object.fuse > 0) continue;
        const point = object.mesh.position.clone();
        if (object.kind === 'flash') detonateFlash(point, ctx);
        else if (object.kind === 'smoke') deploySmoke(point);
        else if (object.kind === 'frag' && ctx.onBlast) ctx.onBlast(point, FRAG_RADIUS, FRAG_DAMAGE);
        scene.remove(object.mesh);
        flying.splice(index, 1);
      }
      for (let index = smokes.length - 1; index >= 0; index -= 1) {
        if (clock < smokes[index].until) continue;
        scene.remove(smokes[index].mesh);
        smokes.splice(index, 1);
      }
      for (let index = pending.length - 1; index >= 0; index -= 1) {
        const item = pending[index];
        if (clock < item.at) continue;
        if (item.kind === 'mortar' && ctx.onBlast) {
          ctx.onBlast(item.point, MORTAR_RADIUS, MORTAR_DAMAGE);
          item.mesh.material.opacity = 0.85;
          pending.push({ kind: 'fade', mesh: item.mesh, at: clock + 1.2 });
          pending.splice(index, 1);
          continue;
        }
        scene.remove(item.mesh);
        pending.splice(index, 1);
      }
    },
  };
}
