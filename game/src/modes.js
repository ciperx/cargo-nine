// Game mode registry. The simulation stays round based in every mode; each mode only changes its
// objective and end condition, so the buy economy and weapon loop remain shared.
export const MODES = {
  elimination: { id: 'elimination', label: 'ELIMINATION', detail: 'First squad to 7 rounds', target: 7, liveSeconds: 105 },
  ctf: { id: 'ctf', label: 'CAPTURE THE FLAG', detail: 'First team to 3 captures', target: 3, liveSeconds: 180 },
  zombie: { id: 'zombie', label: 'OUTBREAK', detail: 'Survive eight escalating waves', target: 8, liveSeconds: 90 },
  defuse: { id: 'defuse', label: 'DEMOLITION', detail: 'Plant the charge, then hold the site', target: 7, liveSeconds: 115 },
};

export function modeFromQuery() {
  const value = new URLSearchParams(window.location.search).get('mode');
  return MODES[value] ?? MODES.elimination;
}

export function modeList() { return Object.values(MODES); }
