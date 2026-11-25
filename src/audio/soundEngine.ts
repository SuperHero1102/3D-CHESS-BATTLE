import { PieceSymbol } from '../types/chess';

class MedievalSoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private volume = 0.65;

  private unlockInstalled = false;

  private ensureContext(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return null;
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  public installAudioUnlock(): () => void {
    if (typeof window === 'undefined' || this.unlockInstalled) return () => {};
    this.unlockInstalled = true;
    const handleUnlock = () => {
      try {
        if (!this.enabled) return;
        const ctx = this.ensureContext();
        if (ctx && ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
      } catch {
        // Ignore iOS Safari / restricted autoplay rejections silently
      }
      window.removeEventListener('pointerdown', handleUnlock);
      window.removeEventListener('touchstart', handleUnlock);
      window.removeEventListener('keydown', handleUnlock);
    };
    window.addEventListener('pointerdown', handleUnlock, { passive: true, once: true });
    window.addEventListener('touchstart', handleUnlock, { passive: true, once: true });
    window.addEventListener('keydown', handleUnlock, { passive: true, once: true });
    return () => {
      window.removeEventListener('pointerdown', handleUnlock);
      window.removeEventListener('touchstart', handleUnlock);
      window.removeEventListener('keydown', handleUnlock);
    };
  }

  public configure(enabled: boolean, volume: number) {
    this.enabled = enabled;
    this.volume = Math.max(0, Math.min(1, volume));
  }

  public playSelect() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(760, now + 0.06);
    gain.gain.setValueAtTime(0.08 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  public playMove() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(62, now + 0.11);
    gain.gain.setValueAtTime(0.24 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playCapture(attacker: PieceSymbol) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (attacker === 'b') {
      // Arcane crystal sweep
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(440, now);
      osc1.frequency.exponentialRampToValueAtTime(980, now + 0.25);
      osc1.frequency.exponentialRampToValueAtTime(320, now + 0.6);
      osc2.frequency.setValueAtTime(660, now);
      osc2.frequency.exponentialRampToValueAtTime(1320, now + 0.25);
      gain.gain.setValueAtTime(0.16 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.66);
      osc2.stop(now + 0.66);
      return;
    }

    if (attacker === 'r') {
      // Heavy warhammer shockwave boom
      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(120, now + 0.28);
      sub.frequency.exponentialRampToValueAtTime(32, now + 0.78);
      subGain.gain.setValueAtTime(0.001, now);
      subGain.gain.setValueAtTime(0.42 * this.volume, now + 0.28);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
      sub.connect(subGain).connect(ctx.destination);
      sub.start(now + 0.27);
      sub.stop(now + 0.86);
    }

    if (attacker === 'n') {
      // Gallop hoof beats before steel clash
      [0.05, 0.16, 0.27].forEach((offset) => {
        const hoof = ctx.createOscillator();
        const hGain = ctx.createGain();
        hoof.type = 'triangle';
        hoof.frequency.setValueAtTime(140, now + offset);
        hoof.frequency.exponentialRampToValueAtTime(55, now + offset + 0.06);
        hGain.gain.setValueAtTime(0.18 * this.volume, now + offset);
        hGain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.07);
        hoof.connect(hGain).connect(ctx.destination);
        hoof.start(now + offset);
        hoof.stop(now + offset + 0.08);
      });
    }

    // Metallic sword clash burst
    const impactTime = attacker === 'n' || attacker === 'r' ? now + 0.32 : now + 0.18;
    const bufferSize = Math.floor(ctx.sampleRate * 0.24);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.06));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2200, impactTime);
    filter.Q.setValueAtTime(3.2, impactTime);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.32 * this.volume, impactTime);
    nGain.gain.exponentialRampToValueAtTime(0.001, impactTime + 0.24);
    noise.connect(filter).connect(nGain).connect(ctx.destination);
    noise.start(impactTime);

    const ring = ctx.createOscillator();
    const rGain = ctx.createGain();
    ring.type = 'sine';
    ring.frequency.setValueAtTime(1480, impactTime);
    ring.frequency.exponentialRampToValueAtTime(920, impactTime + 0.35);
    rGain.gain.setValueAtTime(0.14 * this.volume, impactTime);
    rGain.gain.exponentialRampToValueAtTime(0.001, impactTime + 0.36);
    ring.connect(rGain).connect(ctx.destination);
    ring.start(impactTime);
    ring.stop(impactTime + 0.37);
  }

  public playCheck() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [330, 440].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1100, now);
      gain.gain.setValueAtTime(0.09 * this.volume, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);
      osc.connect(filter).connect(gain).connect(ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.36);
    });
  }

  public playVictory(isWin: boolean) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = isWin ? [261.6, 329.6, 392.0, 523.3] : [329.6, 293.7, 246.9, 196.0];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.12);
      gain.gain.setValueAtTime(0.14 * this.volume, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.48);
    });
  }
}

export const soundEngine = new MedievalSoundEngine();
