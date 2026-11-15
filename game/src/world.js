// The map: Cargo Nine, a freight terminal cut into two lanes by a container wall, with the
// uplink room on the north side and the loading bays on the south. Every box is a wall for the
// player, an occluder for a bot's line of sight, and a surface a bullet stops on. Plain
// geometry only: no models, no textures, so it loads as one set of static files.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const MAP = {
  halfX: 15,
  halfZ: 17,
  spawns: {
    // The player's side holds the north bay; the bots come in from the south.
    ct: [
      [0, -14.4],
      [-2.2, -13.6],
      [2.2, -13.6],
    ],
    t: [
      [0, 14.6],
      [-2.4, 13.8],
      [2.4, 13.8],
    ],
  },
  sites: {
    A: { label: 'A', x: 7.4, z: -5.4, radius: 2.6 },
    B: { label: 'B', x: -7.6, z: 5.2, radius: 2.4 },
  },
  waypoints: [
    [0, -12], [0, -8], [-5, -8], [5, -8], [7.4, -5.4],
    [0, -2], [-8, -1], [8, -1], [-10, 3], [10, 3],
    [-7.6, 5.2], [0, 6], [6, 6], [0, 11], [-6, 12], [6, 12], [0, 14],
  ],
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // The six tokens, raised into a readable range: a terminal at night still needs surfaces the
  // eye can separate, so the wall and floor tones sit two steps above the page canvas.
  const SURFACES = {
    canvas: { color: '#2a2e34', roughness: 0.95, metalness: 0.02 },
    surface: { color: '#343a42', roughness: 0.86, metalness: 0.06 },
    hairline: { color: '#3f4650', roughness: 0.7, metalness: 0.16 },
    ink: { color: PALETTE.ink, roughness: 0.5, metalness: 0.2 },
    muted: { color: PALETTE.muted, roughness: 0.6, metalness: 0.12 },
    accent: { color: PALETTE.accent, roughness: 0.38, metalness: 0.4 },
  };
  const materials = {};
  for (const [name, spec] of Object.entries(SURFACES)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec.color),
      roughness: spec.roughness,
      metalness: spec.metalness,
    });
  }
  const stripMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) });
  const floorMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color('#23272d'), roughness: 0.97, metalness: 0.02 });
  const stripeMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.6, metalness: 0.1 });

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material] ?? floorMaterial);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Perimeter: 30 x 34 m, walls 5 m high, open to the sky so one key light reaches every corner.
  box(30.4, 0.4, 34.4, 0, -0.2, 0, 'canvas');
  box(0.4, 5.0, 34.4, -15.2, 2.5, 0, 'surface');
  box(0.4, 5.0, 34.4, 15.2, 2.5, 0, 'surface');
  box(30.4, 5.0, 0.4, 0, 2.5, -17.2, 'surface');
  box(30.4, 5.0, 0.4, 0, 2.5, 17.2, 'surface');

  // The central container wall splits the map into a west and an east lane, with two gaps.
  box(6.0, 2.6, 1.4, -6.0, 1.3, 0, 'hairline');
  box(6.0, 2.6, 1.4, 6.0, 1.3, 0, 'hairline');
  box(3.4, 2.6, 1.4, 0, 1.3, -1.2, 'hairline');
  box(2.2, 1.2, 1.4, 0, 0.6, 1.6, 'hairline');

  // North lane: the uplink room (site A) behind a low wall, with a ramp to the gantry.
  box(7.2, 1.1, 0.5, 7.4, 0.55, -2.6, 'hairline');
  box(0.5, 1.1, 4.6, 3.9, 0.55, -4.9, 'hairline');
  box(2.4, 0.45, 2.4, 7.4, 0.22, -5.4, 'surface');
  box(1.6, 0.9, 1.6, 11.2, 0.45, -3.2, 'hairline');
  box(1.6, 0.9, 1.6, 11.6, 0.45, -9.4, 'hairline');
  box(5.0, 0.34, 2.0, -7.0, 3.4, -11.0, 'surface');
  box(0.34, 3.4, 0.34, -9.3, 1.7, -11.9, 'hairline');
  box(0.34, 3.4, 0.34, -4.7, 1.7, -11.9, 'hairline');
  box(2.0, 0.34, 4.4, -12.6, 0.17, -13.4, 'surface');

  // South lane: the loading bays (site B) and the crates the bots push through.
  box(2.4, 0.45, 2.4, -7.6, 0.22, 5.2, 'surface');
  box(5.6, 1.1, 0.5, -7.6, 0.55, 2.4, 'hairline');
  box(0.5, 1.1, 4.2, -4.5, 0.55, 5.0, 'hairline');
  box(1.6, 0.9, 1.6, -11.4, 0.45, 8.2, 'hairline');
  box(1.6, 0.9, 1.6, 11.0, 0.45, 6.4, 'hairline');
  box(1.6, 0.9, 1.6, 7.0, 0.45, 11.0, 'hairline');
  box(3.0, 2.6, 1.4, 0, 1.3, 9.2, 'hairline');

  // Sight-line breakers down the middle, so neither side owns a straight run to the other spawn.
  box(1.4, 3.2, 1.4, 0, 1.6, -8.0, 'hairline');
  box(1.4, 1.1, 1.4, 0, 0.55, 7.0, 'hairline');
  box(1.2, 0.8, 1.2, -10.6, 0.4, -4.4, 'hairline');
  box(1.2, 0.8, 1.2, 10.2, 0.4, 2.4, 'hairline');

  // Site markers: a lit pad and a stripe the HUD can name. Purely cosmetic, never a collider.
  for (const side of [-14.9, 14.9]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 26), stripMaterial);
    strip.position.set(side, 3.4, 0);
    group.add(strip);
  }
  for (const lampZ of [-14, 0, 14]) {
    const tube = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.1, 0.3), stripMaterial);
    tube.position.set(0, 4.4, lampZ);
    group.add(tube);
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.ink), 2.6, 20, 2);
    lamp.position.set(0, 4.2, lampZ);
    group.add(lamp);
  }

  for (const site of Object.values(MAP.sites)) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(site.radius, site.radius, 0.04, 32), stripeMaterial);
    pad.position.set(site.x, 0.03, site.z);
    group.add(pad);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.5, 0.08), stripeMaterial);
    post.position.set(site.x, 0.75, site.z + site.radius + 0.2);
    group.add(post);
    const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 1.1, 7.5, 2);
    light.position.set(site.x, 1.4, site.z);
    group.add(light);
  }

  // Outside the walls: a dark plain and a sky gradient, so the map never ends in a void.
  const plain = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), new THREE.MeshStandardMaterial({ color: new THREE.Color('#101216'), roughness: 1 }));
  plain.rotation.x = -Math.PI / 2;
  plain.position.y = -0.42;
  plain.receiveShadow = false;
  group.add(plain);

  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4;
  skyCanvas.height = 128;
  const skyContext = skyCanvas.getContext('2d');
  const gradient = skyContext.createLinearGradient(0, 0, 0, 128);
  gradient.addColorStop(0, '#454d57');
  gradient.addColorStop(0.5, '#2b3138');
  gradient.addColorStop(1, '#1b1f24');
  skyContext.fillStyle = gradient;
  skyContext.fillRect(0, 0, 4, 128);
  const skyTexture = new THREE.CanvasTexture(skyCanvas);
  skyTexture.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(180, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide, depthWrite: false, fog: false }),
  );
  scene.add(dome);

  // Light: warm key from the east, cool fill from the west, and a sky/ground gradient behind both.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.muted), new THREE.Color(PALETTE.canvas), 1.75);
  scene.add(sky);

  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.ink), 3.1);
  key.position.set(12, 18, 9);
  key.target.position.set(0, 0, -2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -20;
  key.shadow.camera.right = 20;
  key.shadow.camera.top = 20;
  key.shadow.camera.bottom = -20;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0007;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 1.1);
  fill.position.set(-11, 10, -13);
  scene.add(fill);

  function blocked(from, to) {
    const direction = new THREE.Vector3().subVectors(to, from);
    const distance = direction.length();
    if (distance < 0.001) return false;
    direction.divideScalar(distance);
    const ray = new THREE.Ray(from, direction);
    const point = new THREE.Vector3();
    for (const collider of colliders) {
      const hit = ray.intersectBox(collider, point);
      if (hit && hit.distanceTo(from) < distance - 0.05) return true;
    }
    return false;
  }

  return { colliders, shootables, group, blocked };
}
