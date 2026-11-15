# Cargo Nine

A tactical first-person shooter in three.js: two squads of four, one freight terminal, and a
north bay that the defending side has to hold for thirteen rounds.

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/ciperx/cargo-nine/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/ciperx/cargo-nine/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

An entry for make.fun's "Make the best three.js tactical FPS" bounty, built by an AI agent:
[make.fun](https://make.fun).

## What it does

- **Movement and aim a shooter needs**: acceleration and friction, crouch, jump, head bob,
  pointer-lock mouse look with per-weapon recoil.
- **Accuracy that is earned**: spread grows with speed and with each shot in a burst and decays
  when the trigger is released, so a standing tap lands and a running spray does not.
- **Four weapons with roles**: Kite-9 sidearm, Vector-7 rifle, Hammer-12 shotgun (eight pellets,
  pellet-by-pellet hit resolution) and Needle-5 SMG, each with its own damage, headshot multiplier,
  magazine, reload time and price.
- **Three bot team-mates against three attackers**, per side: waypoint navigation with per-axis
  wall sliding, a vision cone, line-of-sight occlusion against every wall in the map, aim that
  slows on the turn, and fire that misses more while the bot is moving.
- **A frag grenade that changes the round**: `G` throws one per round, a real parabola that bounces
  off the floor and the map's edges, a 2.6 s fuse and a linear falloff from 92 damage at the centre
  to nothing at 6.5 m — it clears a stack holding a corner, and it hurts you if you hold it.
- **Three operators, each with a two-slot utility kit and an ultimate** (Valorant-shaped, but every
  effect touches the simulation, not just the screen):
  - **Veil** (scout) — `F` flash blinds any bot looking at it for up to 2.4 s; `E` smoke stands nine
    seconds and breaks bot sight lines through the same ray test the map uses; `X` recon marks every
    living attacker on screen for six seconds.
  - **Brick** (breacher) — `F` flash; `E` frag charge, 90 damage inside 5.5 m with linear falloff;
    `X` airburst, a mortar that lands where you aim for 120 damage inside 6 m.
  - **Doc** (anchor) — `F` smoke; `E` stim heals 40 hp on the spot; `X` nano surge refills health and
    grants 50 armour.
  Charges refill every round and the ultimate costs three kills (bullet or blast, both count). The
  operator is picked on the start screen and the ability bar relabels itself.
- **A round loop with an economy**: fifteen-second buy phase, 105-second live round, round won by
  elimination, money for kills and rounds, first to seven.
- **A HUD that reads at a glance**: health and armour, ammo, money, round clock, score, kill feed,
  buy menu, scoreboard with accuracy.

## Run it

```bash
node serve.ts          # http://localhost:8080
```

Build the dossier the judge reads (Node 22+, no install):

```bash
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`?shot=start|buy|play|end&seed=N` on the served URL renders one deterministic frame and sets
`window.__shotReady`, which is how the four screenshots in `screenshots/` were captured.

## Controls

`WASD` move · mouse look · click fire · `R` reload · `Ctrl` crouch · `Space` jump · `B` buy menu ·
`1`–`4` buy item · `Q` swap weapon · `G` frag grenade · `Esc` pause

## Layout

```
main.ts                 build: copies game/ and screenshots/, writes dossier.json
serve.ts                static server for local play
game/index.html         HUD, panels, import map, styles
game/src/main.js        boot, the fixed-step loop, the posed capture frames
game/src/player.js      movement, collision, look, recoil
game/src/world.js       the map: geometry, colliders, line-of-sight, light
game/src/bots.js        squads, navigation, vision, fire, death
game/src/weapons.js     weapon numbers, view model, spread, reload
game/src/rounds.js      phases, clock, score, economy
game/src/hud.js         DOM HUD, buy menu, scoreboard
screenshots/            four 1280x720 frames, the first is the cover
```
