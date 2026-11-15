// Demolition objective: the attacking side carries one charge to a site and arms it, then the
// defenders have the fuse to cut it. Bots run the same state machine as the player, so the round
// plays out whether or not the player is the one holding the charge. Everything here is plain
// numbers on the existing map: no meshes are allocated inside the fixed-step loop.
const SITE_RADIUS = 1.7;
const PLANT_SECONDS = 3.2;
const DEFUSE_SECONDS = 10;
const FUSE_SECONDS = 40;
const DECAY = 0.45;

export function createDefuse(map, playerTeam) {
  const attacking = 't';
  const defending = 'ct';
  const sites = {
    A: { id: 'A', x: map.sites.A.x, z: map.sites.A.z },
    B: { id: 'B', x: map.sites.B.x, z: map.sites.B.z },
  };
  const state = {
    stage: 'carry',
    carrier: null,
    site: null,
    bomb: { x: 0, z: 0 },
    fuse: 0,
    plant: 0,
    defuse: 0,
    winner: null,
    message: 'Charge is with the attackers',
  };

  function distance(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

  function reset() {
    state.stage = 'carry';
    state.carrier = null;
    state.site = null;
    state.fuse = 0;
    state.plant = 0;
    state.defuse = 0;
    state.winner = null;
    state.message = playerTeam === attacking
      ? 'Carry the charge to A or B, then hold E on site'
      : 'Hold A and B — the attackers are carrying a charge';
  }

  // The charge belongs to one body: the player when they took the attacking side, otherwise the
  // first living attacker. Handing it over when that body dies keeps the round alive.
  function livingCarrier(bots) {
    if (playerTeam === attacking) {
      return { id: 'player', position: null, isPlayer: true };
    }
    const bot = bots.items.find((entry) => entry.alive && entry.team === attacking);
    return bot ? { id: `bot-${bot.index}`, bot, isPlayer: false } : null;
  }

  function nearestSite(position) {
    let best = null;
    let bestDistance = Infinity;
    for (const site of Object.values(sites)) {
      const range = distance(position, site);
      if (range < bestDistance) { bestDistance = range; best = site; }
    }
    return { site: best, range: bestDistance };
  }

  function tick(dt, ctx) {
    const bots = ctx.bots;
    if (state.winner) return;
    const playerPosition = ctx.player.position;

    if (state.stage === 'carry') {
      const carrier = livingCarrier(bots);
      if (!carrier) return;
      state.carrier = carrier.id;
      const position = carrier.isPlayer ? playerPosition : carrier.bot.position;
      const { site, range } = nearestSite(position);
      const arming = ctx.holding || !carrier.isPlayer;
      // Bots keep walking to the site while the player has to stand still and hold the key.
      if (!carrier.isPlayer && carrier.bot) carrier.bot.objective = { x: site.x, z: site.z };
      if (range < SITE_RADIUS && arming) {
        state.site = site;
        state.plant = Math.min(1, state.plant + dt / PLANT_SECONDS);
        state.message = `${attacking.toUpperCase()} arming site ${site.id} — ${Math.round(state.plant * 100)}%`;
        if (!carrier.isPlayer && carrier.bot) carrier.bot.objective = null;
        if (state.plant >= 1) {
          state.stage = 'planted';
          state.bomb = { x: site.x, z: site.z };
          state.fuse = FUSE_SECONDS;
          state.message = `Charge armed at ${site.id} — ${FUSE_SECONDS}s`;
          if (ctx.onEvent) ctx.onEvent('planted', `Charge armed at site ${site.id}`);
        }
      } else {
        state.plant = Math.max(0, state.plant - dt * DECAY);
        state.site = site;
        state.message = carrier.isPlayer
          ? `Carry the charge — head to site ${site.id}`
          : `${attacking.toUpperCase()} runner is moving to ${site.id}`;
      }
      return;
    }

    // Armed: the fuse runs down and anybody close enough can cut it.
    state.fuse = Math.max(0, state.fuse - dt);
    let cutting = false;
    if (playerTeam === defending && ctx.player.alive) {
      const playerRange = distance(playerPosition, state.bomb);
      if (playerRange < SITE_RADIUS && ctx.holding) cutting = true;
    }
    for (const bot of bots.items) {
      if (!bot.alive || bot.team !== defending) continue;
      bot.objective = { x: state.bomb.x, z: state.bomb.z };
      if (distance(bot.position, state.bomb) < SITE_RADIUS) cutting = true;
    }
    if (cutting) state.defuse = Math.min(1, state.defuse + dt / DEFUSE_SECONDS);
    else state.defuse = Math.max(0, state.defuse - dt * DECAY);

    if (state.defuse >= 1) {
      state.stage = 'defused';
      state.winner = defending;
      state.message = 'Charge defused';
      if (ctx.onEvent) ctx.onEvent('defused', 'Charge defused — site held');
      return;
    }
    if (state.fuse === 0) {
      state.stage = 'exploded';
      state.winner = attacking;
      state.message = 'Charge detonated';
      if (ctx.onEvent) ctx.onEvent('exploded', 'Charge detonated at site');
      return;
    }
    state.message = `CHARGE ${state.fuse.toFixed(1)}s · defuse ${Math.round(state.defuse * 100)}%`;
  }

  function onDeath(actorId) {
    if (state.carrier === actorId) state.carrier = null;
  }

  return { state, sites, reset, tick, onDeath, attacking, defending };
}
