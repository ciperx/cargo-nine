// Capture-the-flag objective. Flags are lightweight simulation objects so the mode remains usable
// on the existing map and does not allocate meshes during the fixed-step loop.
export function createCTF(map) {
  const base = {
    ct: { x: map.spawns.ct[0][0], z: map.spawns.ct[0][1] },
    t: { x: map.spawns.t[0][0], z: map.spawns.t[0][1] },
  };
  const state = {
    score: { ct: 0, t: 0 },
    flags: { ct: { home: true, carrier: null, dropped: 0 }, t: { home: true, carrier: null, dropped: 0 } },
    winner: null,
    message: 'Take the orange flag to your blue base',
  };

  function distance(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
  function reset() {
    state.score.ct = 0; state.score.t = 0; state.winner = null;
    for (const flag of Object.values(state.flags)) { flag.home = true; flag.carrier = null; flag.dropped = 0; }
    state.message = 'Take the orange flag to your blue base';
  }
  function drop(team, position) {
    const flag = state.flags[team];
    if (flag.carrier === null) return;
    flag.carrier = null; flag.home = false; flag.dropped = 12;
    flag.x = position.x; flag.z = position.z;
  }
  function tick(dt, player, bots) {
    for (const flag of Object.values(state.flags)) {
      if (!flag.home && flag.carrier === null) {
        flag.dropped = Math.max(0, flag.dropped - dt);
        if (flag.dropped === 0) flag.home = true;
      }
    }
    const actors = [{ id: 'player', team: 'ct', position: player.position, alive: player.alive }, ...bots.items.map((bot) => ({ id: `bot-${bot.index}`, team: bot.team, position: bot.position, alive: bot.alive }))];
    for (const actor of actors) {
      if (!actor.alive) continue;
      const enemy = actor.team === 'ct' ? 't' : 'ct';
      const enemyFlag = state.flags[enemy];
      if (enemyFlag.carrier === null) {
        const location = enemyFlag.home ? base[enemy] : enemyFlag;
        if (distance(actor.position, location) < 1.35) {
          enemyFlag.carrier = actor.id; enemyFlag.home = false;
          state.message = `${actor.team.toUpperCase()} runner has the ${enemy.toUpperCase()} flag`;
        }
      }
      const ownFlag = state.flags[actor.team];
      if (enemyFlag.carrier === actor.id && distance(actor.position, base[actor.team]) < 1.6 && ownFlag.carrier === null && ownFlag.home) {
        enemyFlag.carrier = null; enemyFlag.home = true;
        state.score[actor.team] += 1;
        state.message = `${actor.team.toUpperCase()} captured the flag (${state.score[actor.team]}/3)`;
        if (state.score[actor.team] >= 3) state.winner = actor.team;
      }
    }
    for (const flag of Object.values(state.flags)) {
      if (flag.carrier) {
        const actor = actors.find((entry) => entry.id === flag.carrier);
        if (actor) { flag.x = actor.position.x; flag.z = actor.position.z; }
      }
    }
  }
  function onDeath(actorId, position) {
    for (const [team, flag] of Object.entries(state.flags)) if (flag.carrier === actorId) drop(team, position);
  }
  return { state, base, reset, tick, onDeath };
}
