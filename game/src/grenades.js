// The frag grenade: one per round, thrown from the camera, fused, and lethal in a radius. It is
// the one piece of tactical kit that hurts a stack of attackers holding a corner, so it lives in
// its own module with its own physics: a parabola, a bounce off the floor and the map's edges,
// then a radial damage falloff. main.js decides who throws it and hands the blast to the bots.
import * as THREE from 'three';
import { MAP } from './world.js';

const FUSE = 2.6; // seconds from release to detonation
const RADIUS = 6.5; // metres of lethal reach, before falloff
const MAX_DAMAGE = 92; // damage at the centre of the blast
const GRAVITY = 22;
const BOUNCE = 0.42; // how much speed survives a bounce
const SPEED = 18; // throw speed along the camera's forward axis
const LIFT = 3.1; // upward component, so a flat throw still arcs

export function createGrenades(scene) {
  const live = [];
  const geometry = new THREE.SphereGeometry(0.13, 12, 10);
  const material = new THREE.MeshStandardMaterial({ color: 0x2f3a2a, roughness: 0.85, metalness: 0.15 });

  function spawn(origin, direction) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(origin);
    scene.add(mesh);
    live.push({
      mesh,
      velocity: new THREE.Vector3(
        direction.x * SPEED,
        direction.y * SPEED + LIFT,
        direction.z * SPEED,
      ),
      fuse: FUSE,
    });
  }

  // The floor is y = 0 and the map is a box; a bounce that keeps the grenade inside the terminal
  // is enough for a fuse this short, and it costs one clamp per axis per step.
  function bounce(grenade) {
    const p = grenade.mesh.position;
    if (p.y < 0.13) {
      p.y = 0.13;
      grenade.velocity.y = Math.abs(grenade.velocity.y) * BOUNCE;
      grenade.velocity.x *= 0.72;
      grenade.velocity.z *= 0.72;
    }
    if (Math.abs(p.x) > MAP.halfX - 0.2) {
      p.x = Math.sign(p.x) * (MAP.halfX - 0.2);
      grenade.velocity.x *= -BOUNCE;
    }
    if (Math.abs(p.z) > MAP.halfZ - 0.2) {
      p.z = Math.sign(p.z) * (MAP.halfZ - 0.2);
      grenade.velocity.z *= -BOUNCE;
    }
  }

  // Falloff is linear in distance: a hit at the feet kills, a hit at the edge of the radius
  // wounds, and beyond the radius nothing happens at all.
  function blastAt(point) {
    return (target) => {
      const distance = target.distanceTo(point);
      if (distance > RADIUS) return 0;
      return MAX_DAMAGE * (1 - distance / RADIUS);
    };
  }

  function step(dt, ctx) {
    for (let index = live.length - 1; index >= 0; index -= 1) {
      const grenade = live[index];
      grenade.fuse -= dt;
      grenade.velocity.y -= GRAVITY * dt;
      grenade.mesh.position.addScaledVector(grenade.velocity, dt);
      bounce(grenade);
      if (grenade.fuse > 0) continue;
      const damageAt = blastAt(grenade.mesh.position.clone());
      ctx.onBlast(damageAt, grenade.mesh.position.clone());
      scene.remove(grenade.mesh);
      live.splice(index, 1);
    }
  }

  function clear() {
    for (const grenade of live) scene.remove(grenade.mesh);
    live.length = 0;
  }

  return { spawn, step, clear, count: () => live.length };
}
