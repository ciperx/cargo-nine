// Positional audio. Every world sound is an emitter with a place in the map: the browser's HRTF
// panner places it in the stereo field, distance sets the level, and a low-pass plus a short
// synthetic room tail make far sounds read as far. The player's own sounds skip the panner so they
// sit "in the head" the way a soldier hears their own feet.
const CLIPS = {
  stepRun: ['fm-01', 'fm-02', 'fm-03', 'fm-04', 'fm-05', 'fm-06'],
  stepWalk: ['fm-02', 'fm-04', 'fm-06'],
  stepCrouch: ['fm-05'],
  reload: ['clipload1', 'clipload2'],
  impact: ['singlebullet1'],
  click: ['equipmentclicks'],
  rifle: ['gunshot-carbine', 'gunshot-rifle'],
  sniper: ['gunshot-sniper'],
  shotgun: ['gunshot-shotgun'],
  heavy: ['ak47'],
};

// How far a sound carries. A runner is audible across the yard; a crouching player is barely there.
const PROFILE = {
  stepRun: { gain: 0.55, ref: 3.2, rolloff: 1.05, max: 46 },
  stepWalk: { gain: 0.3, ref: 2.6, rolloff: 1.5, max: 22 },
  stepCrouch: { gain: 0.14, ref: 2, rolloff: 1.9, max: 11 },
  selfStepRun: { gain: 0.42 },
  selfStepWalk: { gain: 0.2 },
  selfStepCrouch: { gain: 0.1 },
  reload: { gain: 0.5, ref: 2.4, rolloff: 1.6, max: 20 },
  impact: { gain: 0.45, ref: 2.6, rolloff: 1.5, max: 26 },
  click: { gain: 0.4, ref: 2.6, rolloff: 1.6, max: 20 },
  rifle: { gain: 0.95, ref: 6, rolloff: 0.95, max: 90 },
  heavy: { gain: 1, ref: 7, rolloff: 0.9, max: 100 },
  sniper: { gain: 1, ref: 8, rolloff: 0.85, max: 120 },
  shotgun: { gain: 1, ref: 6, rolloff: 1, max: 80 },
};

export function createAudio() {
  let ctx = null;
  let master = null;
  let send = null;
  let wall = null;
  let available = false;
  const buffers = new Map();
  const voices = { count: 0, max: 24 };
  // Small counter so a test can prove sounds actually reached the graph.
  const stats = { played: 0, self: 0, positional: 0, lastKind: null, lastPosition: null };

  function graph() {
    master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(ctx.destination);
    // One shared room: a decaying noise tail, cheap and synthetic, so shots and steps arrive with
    // a hint of the bay instead of a dry click.
    wall = ctx.createConvolver();
    const seconds = 1.4;
    const rate = ctx.sampleRate;
    const impulse = ctx.createBuffer(2, Math.floor(rate * seconds), rate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < data.length; i += 1) {
        const decay = Math.pow(1 - i / data.length, 3.2);
        data[i] = (Math.random() * 2 - 1) * decay * 0.35;
      }
    }
    wall.buffer = impulse;
    send = ctx.createGain();
    send.gain.value = 0.22;
    send.connect(wall);
    wall.connect(master);
    if (ctx.listener.forwardX) {
      ctx.listener.upX.value = 0; ctx.listener.upY.value = 1; ctx.listener.upZ.value = 0;
    }
  }

  async function load(name) {
    if (buffers.has(name)) return buffers.get(name);
    try {
      const response = await fetch(`audio/${name}.ogg`);
      const bytes = await response.arrayBuffer();
      const buffer = await ctx.decodeAudioData(bytes);
      buffers.set(name, buffer);
      return buffer;
    } catch (error) {
      buffers.set(name, null);
      return null;
    }
  }

  async function unlock() {
    if (ctx) return available;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    ctx = new Ctor();
    graph();
    const names = new Set();
    for (const list of Object.values(CLIPS)) for (const name of list) names.add(name);
    await Promise.all([...names].map(load));
    available = true;
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function setListener(x, z, yaw) {
    if (!ctx) return;
    const l = ctx.listener;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    if (l.positionX) {
      l.positionX.value = x; l.positionY.value = 0; l.positionZ.value = z;
      l.forwardX.value = fx; l.forwardY.value = 0; l.forwardZ.value = fz;
      return;
    }
    l.setPosition(x, 0, z);
    l.setOrientation(fx, 0, fz, 0, 1, 0);
  }

  function pick(list) { return list[(Math.random() * list.length) | 0]; }

  // kind is a key of CLIPS; opts.self plays it unpositioned, opts.detune nudges pitch so repeated
  // steps never sound like the same sample twice.
  function play(kind, x, z, opts = {}) {
    if (!ctx || !available) return false;
    const list = CLIPS[kind];
    if (!list) return false;
    const name = opts.clip && buffers.has(opts.clip) ? opts.clip : pick(list);
    const buffer = buffers.get(name);
    if (!buffer) return false;
    if (voices.count >= voices.max) return false;
    const profile = opts.self
      ? (PROFILE[`self${kind[0].toUpperCase()}${kind.slice(1)}`] || { gain: 0.4 })
      : (PROFILE[kind] || { gain: 0.6, ref: 4, rolloff: 1.2, max: 40 });
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = opts.rate || (0.95 + Math.random() * 0.1);
    const gain = ctx.createGain();
    gain.gain.value = (opts.gain ?? 1) * profile.gain;
    if (opts.self) {
      source.connect(gain).connect(master);
      if (opts.self) { const wet = ctx.createGain(); wet.gain.value = 0.05; gain.connect(wet).connect(send); }
    } else {
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = profile.ref;
      panner.rolloffFactor = profile.rolloff;
      panner.maxDistance = profile.max;
      if (panner.positionX) { panner.positionX.value = x; panner.positionY.value = 0.4; panner.positionZ.value = z; }
      else panner.setPosition(x, 0.4, z);
      // Far sounds lose their edge, which is most of what makes distance feel real.
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 4200;
      source.connect(tone).connect(panner).connect(gain);
      gain.connect(master);
      const wet = ctx.createGain();
      wet.gain.value = 0.3;
      gain.connect(wet).connect(send);
    }
    voices.count += 1;
    stats.played += 1;
    stats.lastKind = kind;
    if (opts.self) stats.self += 1;
    else { stats.positional += 1; stats.lastPosition = { x, z }; }
    source.onended = () => { voices.count -= 1; };
    source.start();
    return true;
  }

  function ready() { return available; }
  function clipNames() { return [...buffers.keys()]; }

  return { unlock, ready, play, setListener, clipNames, stats };
}

// Footstep cadence: stride length per gait, so the sound follows real distance travelled rather
// than a timer, and a slow walk lands its steps further apart.
export const STRIDE = { run: 1.85, walk: 1.35, crouch: 1.15 };
