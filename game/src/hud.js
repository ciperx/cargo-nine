// The DOM HUD: vitals, ammo, money, the round clock, the score line, the kill feed, the buy menu
// and the two overlay panels (start/pause and round/match result). It reads nothing from the
// simulation; main.js pushes numbers in and reads clicks out.
const COPY = {
  start: { title: 'Cargo Nine', copy: 'Two squads, one terminal. Hold the north bay: three bots push from the south every round, and the clock is on your side. Click to deploy.', action: 'Deploy' },
  paused: { title: 'Holding', copy: 'Paused. Click to get back in.', action: 'Resume' },
  won: { title: 'Round won', copy: 'The bay held.', action: 'Next round' },
  lost: { title: 'Round lost', copy: 'They took the terminal.', action: 'Next round' },
  match: { title: 'Match over', copy: 'The scoreboard is final.', action: 'Play again' },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const ammoBox = $('ammo');
  const weaponName = $('weapon-name');
  const healthValue = $('health-value');
  const armorValue = $('armor-value');
  const moneyValue = $('money-value');
  const clockValue = $('clock');
  const roundValue = $('round');
  const scoreCT = $('score-ct');
  const scoreT = $('score-t');
  const hitmarker = $('hitmarker');
  const killfeed = $('killfeed');
  const banner = $('banner');
  const deathNote = $('death-note');
  const phaseTag = $('phase-tag');
  const buyMenu = $('buy-menu');
  const buyList = $('buy-list');
  const buyMoney = $('buy-money');
  const damageFlash = $('damage-flash');
  const scoreboard = $('scoreboard');
  const scoreboardBody = $('scoreboard-body');
  const accuracyLine = $('accuracy-line');
  const flashSlot = $('ab-flash');
  const smokeSlot = $('ab-smoke');
  const ultSlot = $('ab-ult');
  const blindLayer = $('blind');
  const radarLayer = $('radar');
  const operatorName = $('ab-op');
  const operatorPicker = $('operator-pick');
  let blindTimer = 0;

  let hitTimer = 0;
  let bannerTimer = 0;
  let flashTimer = 0;
  const last = {};

  function setIfChanged(key, value, apply) {
    if (last[key] === value) return;
    last[key] = value;
    apply(value);
  }

  return {
    setVitals(hp, armor) {
      setIfChanged('hp', Math.max(0, Math.round(hp)), (v) => {
        healthValue.textContent = String(v);
        healthValue.classList.toggle('low', v <= 35);
      });
      setIfChanged('armor', Math.round(armor), (v) => {
        armorValue.textContent = String(v);
      });
    },
    setAmmo(mag, reserve, name) {
      setIfChanged(`mag:${name}`, mag, (v) => {
        ammoMag.textContent = String(v);
        ammoBox.classList.toggle('empty', v === 0);
      });
      setIfChanged(`res:${name}`, reserve, (v) => {
        ammoReserve.textContent = `/ ${v}`;
      });
      setIfChanged('weapon', name, (v) => {
        weaponName.textContent = v;
      });
    },
    setMoney(value) {
      setIfChanged('money', Math.round(value), (v) => {
        moneyValue.textContent = `$${v}`;
      });
    },
    setClock(text) {
      setIfChanged('clock', text, (v) => {
        clockValue.textContent = v;
      });
    },
    setRound(number) {
      setIfChanged('round', number, (v) => {
        roundValue.textContent = `ROUND ${v}`;
      });
    },
    setScore(ct, t) {
      setIfChanged('score', `${ct}:${t}`, () => {
        scoreCT.textContent = String(ct);
        scoreT.textContent = String(t);
      });
    },
    setDeathNote(text) {
      deathNote.textContent = text || '';
      deathNote.classList.toggle('on', Boolean(text));
    },

    setPhase(text, tone) {
      setIfChanged('phase', `${text}|${tone}`, () => {
        phaseTag.textContent = text;
        phaseTag.dataset.tone = tone;
      });
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', Boolean(killed));
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on', 'kill');
      }, holdMs);
    },
    feed(text, tone = 'neutral') {
      const row = document.createElement('div');
      row.className = `feed-row ${tone}`;
      row.textContent = text;
      killfeed.appendChild(row);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.firstChild);
      setTimeout(() => row.classList.add('fade'), 4200);
    },
    banner(text, tone = 'neutral', holdMs = 2200) {
      banner.textContent = text;
      banner.dataset.tone = tone;
      banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('on'), holdMs);
    },
    damage(kind = 'hit') {
      damageFlash.dataset.kind = kind;
      damageFlash.classList.add('on');
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => damageFlash.classList.remove('on'), kind === 'kill' ? 620 : 320);
    },
    openBuy(entries, money, onPick) {
      buyMoney.textContent = `$${money}`;
      buyList.textContent = '';
      for (const entry of entries) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'buy-row';
        button.disabled = entry.disabled;
        button.innerHTML = `<span class="buy-name">${entry.label}</span><span class="buy-detail">${entry.detail}</span><kbd>${entry.key}</kbd>`;
        button.addEventListener('click', () => onPick(entry.id));
        buyList.appendChild(button);
      }
      buyMenu.hidden = false;
    },
    closeBuy() {
      buyMenu.hidden = true;
    },
    setScoreboard(rows, summary) {
      scoreboardBody.textContent = '';
      for (const row of rows) {
        const line = document.createElement('div');
        line.className = `sb-row ${row.team === 'ct' ? 'ct' : 't'}${row.alive ? '' : ' dead'}${row.you ? ' you' : ''}`;
        line.innerHTML = `<span>${row.name}</span><span>${row.team.toUpperCase()}</span><span>${row.kills}</span><span>${row.alive ? 'alive' : 'down'}</span>`;
        scoreboardBody.appendChild(line);
      }
      accuracyLine.textContent = summary;
    },
    showScoreboard(visible) {
      scoreboard.hidden = !visible;
    },
    showOverlay(mode, extra = '') {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = extra ? `${text.copy} ${extra}` : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    // The operator line: which agent is deployed, the two utility charges and the ultimate.
    setAbilities(state, operator) {
      const agent = operator || { id: 'veil', slot1: { key: 'F', label: 'Flash' }, slot2: { key: 'E', label: 'Smoke' },
        ult: { key: 'X', label: 'Recon' } };
      const signature = `${agent.id}|${state.slot1}|${state.slot2}|${state.ult}`;
      setIfChanged('ab', signature, () => {
        flashSlot.querySelector('b').textContent = agent.slot1.key;
        flashSlot.querySelector('span').textContent = agent.slot1.label;
        smokeSlot.querySelector('b').textContent = agent.slot2.key;
        smokeSlot.querySelector('span').textContent = agent.slot2.label;
        ultSlot.querySelector('b').textContent = agent.ult.key;
        flashSlot.classList.toggle('spent', state.slot1 <= 0);
        smokeSlot.classList.toggle('spent', state.slot2 <= 0);
        ultSlot.classList.toggle('spent', state.ult < state.ultMax);
        ultSlot.classList.toggle('ready', state.ult >= state.ultMax);
        ultSlot.querySelector('span').textContent = state.ult >= state.ultMax
          ? `${agent.ult.label} ready`
          : `${agent.ult.label} ${state.ult}/${state.ultMax}`;
      });
    },
    setOperator(operator) {
      if (operatorName) operatorName.querySelector('span').textContent = `${operator.name} · ${operator.role}`;
      if (!operatorPicker) return;
      for (const button of operatorPicker.querySelectorAll('[data-op]')) {
        button.classList.toggle('picked', button.dataset.op === operator.id);
      }
    },
    onOperator(handler) {
      if (!operatorPicker) return;
      operatorPicker.addEventListener('click', (event) => {
        const button = event.target.closest('[data-op]');
        if (button) handler(button.dataset.op);
      });
    },
    blind(seconds) {
      blindLayer.style.opacity = '0.9';
      clearTimeout(blindTimer);
      blindTimer = setTimeout(() => {
        blindLayer.style.opacity = '0';
      }, Math.max(120, seconds * 1000));
    },
    // Recon draws one dot per living attacker, projected from world space into screen space.
    radar(dots) {
      const wanted = dots || [];
      while (radarLayer.children.length > wanted.length) radarLayer.lastChild.remove();
      while (radarLayer.children.length < wanted.length) radarLayer.appendChild(document.createElement('i'));
      wanted.forEach((dot, index) => {
        const node = radarLayer.children[index];
        node.style.left = `${dot.x}px`;
        node.style.top = `${dot.y}px`;
        node.style.display = dot.onScreen ? 'block' : 'none';
      });
    },
  };
}
