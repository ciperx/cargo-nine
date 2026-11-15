// Outbreak mode: deterministic wave controller. It supplies the objective and pacing; the existing
// bot manager remains responsible for meshes, movement and hits, keeping one combat implementation.
export function createOutbreak() {
  const state = { wave: 0, total: 8, left: 0, intermission: 8, active: false, cleared: false, message: 'Prepare for wave 1' };
  function reset() { state.wave = 0; state.left = 0; state.intermission = 8; state.active = false; state.cleared = false; state.message = 'Prepare for wave 1'; }
  function startWave() {
    state.wave += 1; state.left = 4 + state.wave * 2; state.active = true; state.intermission = 0;
    state.message = `Wave ${state.wave}/${state.total} · ${state.left} hostiles`; return state.left;
  }
  function killed() { state.left = Math.max(0, state.left - 1); }
  function tick(dt, aliveEnemies) {
    if (state.cleared) return;
    if (!state.active) {
      state.intermission = Math.max(0, state.intermission - dt);
      if (state.intermission === 0) startWave();
      return;
    }
    state.left = Math.max(state.left, aliveEnemies);
    if (state.left === 0 && aliveEnemies === 0) {
      if (state.wave >= state.total) { state.cleared = true; state.message = 'OUTBREAK CLEARED'; }
      else { state.active = false; state.intermission = 8; state.message = `Wave ${state.wave} clear · next wave in 8`; }
    }
  }
  return { state, reset, startWave, killed, tick };
}
