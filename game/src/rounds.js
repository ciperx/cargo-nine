// The match: a buy phase, a live round, a scoreboard that counts to seven, and the money that
// decides what you can buy next round. Live rounds end on elimination or when the clock runs out
// (the defenders hold, which is this map's asymmetry: the north bay is theirs). The module owns
// the clock and the money; main.js owns the bodies and the shooting.
export const PHASE = { BUY: 'buy', LIVE: 'live', OVER: 'over', MATCH: 'match' };

const BUY_SECONDS = 15;
const LIVE_SECONDS = 105;
const OVER_SECONDS = 5;
const WIN_TARGET = 7;
const START_MONEY = 800;
const KILL_REWARD = 300;
const WIN_REWARD = 3250;
const LOSS_REWARD = 1900;
const MAX_MONEY = 9000;

export function createMatch() {
  const state = {
    phase: PHASE.BUY,
    phaseLeft: BUY_SECONDS,
    round: 1,
    scoreCT: 0,
    scoreT: 0,
    money: START_MONEY,
    armor: 0,
    playerTeam: 'ct',
    lastResult: null,
    history: [],
  };

  let onPhase = () => {};

  function beginBuyRound() {
    state.phase = PHASE.BUY;
    state.phaseLeft = BUY_SECONDS;
    state.lastResult = null;
    onPhase(PHASE.BUY, state);
  }

  function beginLive() {
    state.phase = PHASE.LIVE;
    state.phaseLeft = LIVE_SECONDS;
    onPhase(PHASE.LIVE, state);
  }

  function endRound(winner, reason) {
    if (state.phase === PHASE.OVER || state.phase === PHASE.MATCH) return;
    state.phase = PHASE.OVER;
    state.phaseLeft = OVER_SECONDS;
    state.lastResult = { winner, reason };
    if (winner === 'ct') state.scoreCT += 1;
    else state.scoreT += 1;
    const playerWon = winner === state.playerTeam;
    state.money = Math.min(MAX_MONEY, state.money + (playerWon ? WIN_REWARD : LOSS_REWARD));
    state.history.push({ round: state.round, winner, reason });
    if (state.scoreCT >= WIN_TARGET || state.scoreT >= WIN_TARGET) {
      state.phase = PHASE.MATCH;
      state.phaseLeft = 0;
      onPhase(PHASE.MATCH, state);
      return;
    }
    onPhase(PHASE.OVER, state);
  }

  function nextRound() {
    state.round += 1;
    state.armor = 0;
    beginBuyRound();
  }

  function step(dt) {
    if (state.phase === PHASE.MATCH) return;
    state.phaseLeft = Math.max(0, state.phaseLeft - dt);
    if (state.phase === PHASE.BUY && state.phaseLeft === 0) beginLive();
    else if (state.phase === PHASE.LIVE && state.phaseLeft === 0) endRound('ct', 'time');
    else if (state.phase === PHASE.OVER && state.phaseLeft === 0) nextRound();
  }

  return {
    state,
    step,
    beginBuyRound,
    beginLive,
    endRound,
    nextRound,
    onPhase(handler) {
      onPhase = handler;
    },
    awardKill() {
      state.money = Math.min(MAX_MONEY, state.money + KILL_REWARD);
    },
    spend(cost) {
      if (state.money < cost) return false;
      state.money -= cost;
      return true;
    },
    buyArmor() {
      if (state.armor >= 100) return false;
      if (!this.spend(650)) return false;
      state.armor = 100;
      return true;
    },
    canBuy() {
      return state.phase === PHASE.BUY;
    },
    clock() {
      const total = Math.ceil(state.phaseLeft);
      const minutes = Math.floor(total / 60);
      const seconds = total % 60;
      return `${minutes}:${String(seconds).padStart(2, '0')}`;
    },
  };
}
