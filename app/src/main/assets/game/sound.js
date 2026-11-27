// Original synthesized dashboard radio, motor, and patrol siren. Audio starts on a player gesture.
export class Soundscape {
  constructor(enabled) {
    this.enabled = enabled;
    this.step = 0;
    this.active = false;
  }

  start() {
    this.active = true;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio || !this.enabled) return;
    try {
      if (!this.ctx) {
        this.ctx = new Audio();
        this.master = this.ctx.createGain();
        this.master.gain.value = .43;
        this.master.connect(this.ctx.destination);
        this.engine = this.voice('sawtooth', 400);
        this.siren = this.voice('sine', 1400);
      }
      this.ctx.resume().catch(() => {});
      this.beatTime = this.ctx.currentTime + .1;
    } catch (_) { /* The city remains playable when audio output is unavailable. */ }
  }

  voice(shape, cutoff) {
    const osc = this.ctx.createOscillator(), filter = this.ctx.createBiquadFilter(), gain = this.ctx.createGain();
    osc.type = shape; filter.frequency.value = cutoff; gain.gain.value = 0;
    osc.connect(filter);filter.connect(gain);gain.connect(this.master);osc.start();
    return { osc, gain, filter };
  }

  stop() {
    this.active = false;
    if (this.ctx) this.ctx.suspend().catch(() => {});
  }

  note(midi, at, duration, volume, shape = 'triangle') {
    const osc = this.ctx.createOscillator(), amp = this.ctx.createGain();
    osc.type = shape; osc.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    amp.gain.setValueAtTime(.0001, at);
    amp.gain.exponentialRampToValueAtTime(volume, at + .018);
    amp.gain.exponentialRampToValueAtTime(.0001, at + duration);
    osc.connect(amp);amp.connect(this.master);
    osc.start(at);osc.stop(at + duration + .02);
    osc.onended = () => { osc.disconnect();amp.disconnect(); };
  }

  update(game) {
    if (!this.enabled || !this.active || !this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime, driving = game.player.carId != null;
    const speed = game.speedKph || 0;
    this.engine.gain.gain.setTargetAtTime(driving ? .038 : 0, t, .12);
    this.engine.osc.frequency.setTargetAtTime(37 + (speed % 36) * 1.2 + Math.min(4, speed / 35) * 4, t, .08);
    this.siren.gain.gain.setTargetAtTime(game.wanted ? .023 : 0, t, .35);
    this.siren.osc.frequency.setTargetAtTime(620 + 210*Math.sin(game.time*4.2), t, .06);
    if (!driving) { this.beatTime = t + .05; return; }
    if (this.beatTime < t - .2) this.beatTime = t + .02;
    const eighth = 60/97/2;
    while (this.beatTime < t + .12) {
      const when = Math.max(t, this.beatTime);
      const root = [45,41,48,43][Math.floor(this.step / 8) % 4];
      const arp = [0,7,12,7,3,7,15,10][this.step % 8];
      if (this.step % 2 === 0) this.note(root - 12, when, .24, .073);
      this.note(root + 12 + arp, when, .42, .035, 'sine');
      if (this.step % 8 === 0) for (const n of [0,7,12]) this.note(root+n,when,1.65,.022);
      this.step++;this.beatTime += eighth;
    }
  }
}
