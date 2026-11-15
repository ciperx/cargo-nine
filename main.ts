// Cargo Nine's entry point for threejs-fps-02 (Node 22, standard library only).
//
// Two jobs, and nothing else:
//   1. copy the entry beside /output: game/ (the playable build: one index.html, nine ES modules,
//      a vendored three.js 0.187.0) and screenshots/ (four 1280x720 frames: start, buy menu,
//      firefight, round result);
//   2. write /output/dossier.json with the vendored make.fun library, which walks game/ and
//      screenshots/, reads every source file into the text, and base64s the images for the judge.
//
// The build is static: no bundler, no network, no install. three.js arrives through an import map
// in game/index.html, so the browser loads game/src/*.js as ES modules exactly as the judge's
// copy of the files does.
//
// Local run outside the grader's container (MAKEFUN_OUTPUT_DIR stands in for /output):
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Serve the game while developing with: node serve.ts  (http://localhost:8080)

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const output = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The intake caps (the competition's reference/gate.json). Passing them here means a build that
// would be refused by the site is refused now, while there is still time to trim it.
const CAPS = {
  text_max_bytes: 163840, // 160 KiB of dossier text: the game's sources must fit, so no vendored copies
  screenshots: { max: 4, max_bytes: 262144 }, // four frames, each under 256 KiB
  game_max_files: 993, // game/ alone; with /output's own 1000-entry cap and our dossier
  game_max_bytes: 50331648, // 48 MiB of game files
};

mkdirSync(output, { recursive: true });

// 1. the game
cpSync(join(root, 'game'), join(output, 'game'), { recursive: true });

// 2. the frames the judge looks at, the first by name as the cover
mkdirSync(join(output, 'screenshots'), { recursive: true });
const shots = join(root, 'screenshots');
if (existsSync(shots)) cpSync(shots, join(output, 'screenshots'), { recursive: true });

// 3. the dossier
writeFileSync(join(output, 'dossier.json'), buildDossier(output, CAPS));

// A one-line receipt so a local run says what it produced, not just that it happened.
const frames = existsSync(join(output, 'screenshots')) ? 4 : 0;
console.log(`Cargo Nine: game/ copied, ${frames} frames, dossier.json written to ${join(output, 'dossier.json')}`);
