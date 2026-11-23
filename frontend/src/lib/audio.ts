/**
 * CareerDiff Audio Utilities
 * 16kHz 16-bit Mono Linear PCM Capture & Playback with Web Audio API.
 * Sub-150ms barge-in interruption capability.
 */

const activeMediaStreams = new Set<MediaStream>();

/**
 * Register a MediaStream to be tracked globally so that on interview conclusion
 * or view transitions, all hardware devices (camera & microphone) can be reliably terminated.
 */
export function registerActiveStream(stream: MediaStream): void {
  activeMediaStreams.add(stream);
  stream.getTracks().forEach((track) => {
    track.addEventListener('ended', () => {
      const allEnded = stream.getTracks().every((t) => t.readyState === 'ended');
      if (allEnded) {
        activeMediaStreams.delete(stream);
      }
    });
  });
}

/**
 * Comprehensive hardware media terminator.
 * Stops all active MediaStreamTracks and clears any <video> element srcObject sinks
 * across the DOM, immediately releasing camera and microphone hardware in the browser.
 */
export function stopAllMediaHardware(): void {
  for (const stream of activeMediaStreams) {
    try {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore individual track termination error
        }
      });
    } catch {
      // Ignore stream iteration error
    }
  }
  activeMediaStreams.clear();

  if (typeof document !== 'undefined') {
    const videoElements = document.querySelectorAll('video');
    videoElements.forEach((video) => {
      try {
        video.pause();
        video.srcObject = null;
      } catch {
        // Ignore video detachment error
      }
    });
  }
}

export class PcmPlayer {
  private audioCtx: AudioContext | null = null;
  private nextPlayTime: number = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private sampleRate: number;
  private inputNode: AudioNode | null = null;
  public onAllEnded: (() => void) | null = null;
  public onProgress: ((ratio: number) => void) | null = null;
  public onPlaybackStart: (() => void) | null = null;
  private progressInterval: number | null = null;
  private utteranceStartTime: number = 0;
  private totalUtteranceDuration: number = 0;

  constructor(sampleRate: number = 24000) {
    this.sampleRate = sampleRate;

    // Autoplay Policy Unlock: Chrome requires user interaction to resume AudioContext
    if (typeof window !== 'undefined') {
      const unlock = () => {
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
          this.audioCtx.resume().catch(() => {});
        }
      };
      ['click', 'keydown', 'touchstart', 'pointerdown'].forEach((evt) => {
        window.addEventListener(evt, unlock, { once: false, passive: true });
      });
    }
  }

  public async resume(): Promise<void> {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume().catch(() => {});
    }
  }

  setSampleRate(rate: number): void {
    if (this.sampleRate !== rate) {
      this.sampleRate = rate;
      this.close();
    }
  }

  private getContext(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass({ sampleRate: this.sampleRate });
      this.audioCtx = ctx;

      // Studio-Grade Acoustic Processing Graph for Human Vocal Realism:
      // 1. High-Pass Filter: Cuts sub-audible low rumble & DC offset (< 80 Hz)
      const highPass = ctx.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = 80;
      highPass.Q.value = 0.7;

      // 2. Vocal Presence Peaking EQ: Emphasizes vocal clarity & intimacy (2.8 kHz, +1.8 dB)
      const presence = ctx.createBiquadFilter();
      presence.type = 'peaking';
      presence.frequency.value = 2800;
      presence.Q.value = 0.9;
      presence.gain.value = 1.8;

      // 3. High-Shelf De-Hiss Filter: Rolls off harsh digital sibilance (> 9.5 kHz, -1.5 dB)
      const deHiss = ctx.createBiquadFilter();
      deHiss.type = 'highshelf';
      deHiss.frequency.value = 9500;
      deHiss.gain.value = -1.5;

      // 4. Dynamics Compressor: Provides broadcast-level speech warmth & consistency
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -22;
      compressor.knee.value = 10;
      compressor.ratio.value = 3.0;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.12;

      // 5. Master Gain Node
      const masterGain = ctx.createGain();
      masterGain.gain.value = 1.0;

      highPass.connect(presence);
      presence.connect(deHiss);
      deHiss.connect(compressor);
      compressor.connect(masterGain);
      masterGain.connect(ctx.destination);

      this.inputNode = highPass;
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /**
   * Pre-configures utterance duration for perfect character-audio lockstep.
   */
  prepareUtterance(expectedDurationSec?: number): void {
    if (this.progressInterval !== null) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
    const ctx = this.getContext();
    this.utteranceStartTime = Math.max(ctx.currentTime + 0.05, this.nextPlayTime);
    this.totalUtteranceDuration = expectedDurationSec || 0;
    this.onProgress?.(0.0);
    this.startProgressTracking();
  }

  /**
   * Queue and play raw 16-bit signed integer Linear PCM buffer (24kHz Gemini Live or 16kHz fallback)
   */
  feed(pcm16Data: ArrayBuffer, customRate?: number): void {
    const rate = customRate || this.sampleRate;
    const ctx = this.getContext();
    const int16Array = new Int16Array(pcm16Data);
    if (int16Array.length === 0) return;

    const float32Array = new Float32Array(int16Array.length);

    // Convert Int16 [-32768, 32767] to Float32 [-1.0, 1.0]
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }

    const audioBuffer = ctx.createBuffer(1, float32Array.length, rate);
    audioBuffer.copyToChannel(float32Array, 0);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.inputNode || ctx.destination);

    const currentTime = ctx.currentTime;
    // Jitter lead buffer: if playback queue has fallen behind, add a 50ms buffer
    // to prevent packet-arrival underrun clicks/pops.
    if (this.nextPlayTime < currentTime) {
      this.nextPlayTime = currentTime + 0.05;
    }

    if (this.activeSources.length === 0) {
      this.utteranceStartTime = this.nextPlayTime;
      if (this.totalUtteranceDuration <= 0) {
        this.totalUtteranceDuration = audioBuffer.duration;
      }
      this.startProgressTracking();
    } else if (this.totalUtteranceDuration > 0) {
      this.totalUtteranceDuration = Math.max(
        this.totalUtteranceDuration,
        this.nextPlayTime - this.utteranceStartTime + audioBuffer.duration
      );
    } else {
      this.totalUtteranceDuration += audioBuffer.duration;
    }

    source.start(this.nextPlayTime);
    this.nextPlayTime += audioBuffer.duration;

    this.activeSources.push(source);
    source.onended = () => {
      const idx = this.activeSources.indexOf(source);
      if (idx !== -1) {
        this.activeSources.splice(idx, 1);
      }
      if (this.activeSources.length === 0) {
        if (this.progressInterval !== null) {
          clearInterval(this.progressInterval);
          this.progressInterval = null;
        }
        if (this.onProgress) {
          this.onProgress(1.0);
        }
        if (this.onAllEnded) {
          this.onAllEnded();
        }
      }
    };
  }

  private startProgressTracking(): void {
    if (this.progressInterval !== null) {
      clearInterval(this.progressInterval);
    }
    let playbackStarted = false;
    this.progressInterval = window.setInterval(() => {
      if (!this.audioCtx) {
        if (this.progressInterval !== null) {
          clearInterval(this.progressInterval);
          this.progressInterval = null;
        }
        return;
      }
      const cur = this.audioCtx.currentTime;
      if (cur < this.utteranceStartTime) {
        this.onProgress?.(0.0);
        return;
      }
      if (!playbackStarted) {
        playbackStarted = true;
        this.onPlaybackStart?.();
      }
      const elapsed = cur - this.utteranceStartTime;
      const total = Math.max(0.1, this.totalUtteranceDuration);
      const ratio = Math.max(0.0, Math.min(1.0, elapsed / total));
      this.onProgress?.(ratio);
    }, 40);
  }

  activeSourcesCount(): number {
    return this.activeSources.length;
  }

  /**
   * Immediately stops all ongoing playback (Barge-In Preemption)
   */
  stopAll(): void {
    if (this.progressInterval !== null) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
    for (const src of this.activeSources) {
      try {
        src.stop(0);
        src.disconnect();
      } catch {
        // Source might have already finished
      }
    }
    this.activeSources = [];
    if (this.audioCtx) {
      this.nextPlayTime = this.audioCtx.currentTime;
    }
  }

  close(): void {
    this.stopAll();
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => { });
      this.audioCtx = null;
      this.inputNode = null;
    }
  }
}

export class PcmRecorder {
  private mediaStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private onDataChunk: ((pcm16: ArrayBuffer) => void) | null = null;
  private onVolumeChange: ((level: number) => void) | null = null;

  async start(
    onChunk: (pcm16: ArrayBuffer) => void,
    onVolume: (level: number) => void
  ): Promise<void> {
    this.onDataChunk = onChunk;
    this.onVolumeChange = onVolume;

    const preferredAudioId = typeof localStorage !== 'undefined' ? localStorage.getItem('careerdiff_preferred_audio_device') : null;
    const effectiveAudioId = preferredAudioId && !preferredAudioId.toLowerCase().includes('virtual') ? preferredAudioId : 'default';
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          deviceId: { ideal: effectiveAudioId },
        },
      });
    } catch {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    }

    this.mediaStream = stream;
    registerActiveStream(stream);
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioCtx = new AudioContextClass();
    const sampleRate = this.audioCtx.sampleRate;

    this.sourceNode = this.audioCtx.createMediaStreamSource(stream);
    // Buffer size 2048 is ~46ms at 44.1kHz or ~128ms at 16kHz
    this.scriptProcessor = this.audioCtx.createScriptProcessor(2048, 1, 1);

    this.scriptProcessor.onaudioprocess = (e) => {
      const inputBuffer = e.inputBuffer.getChannelData(0);

      // 1. Calculate RMS volume level for UI visualizer
      let sum = 0;
      for (let i = 0; i < inputBuffer.length; i++) {
        sum += inputBuffer[i] * inputBuffer[i];
      }
      const rms = Math.sqrt(sum / inputBuffer.length);
      const normalizedLevel = Math.min(1, rms * 5); // amplify for visual display
      if (this.onVolumeChange) {
        this.onVolumeChange(normalizedLevel);
      }

      // 2. Resample to 16kHz if needed and convert to Linear PCM 16-bit
      const pcm16 = this.downsampleToPcm16(inputBuffer, sampleRate, 16000);
      if (this.onDataChunk && pcm16.byteLength > 0) {
        this.onDataChunk(pcm16);
      }
    };

    this.sourceNode.connect(this.scriptProcessor);
    // Connect through a zero-gain node to keep the ScriptProcessor running in Chromium
    // without leaking candidate microphone audio into output speakers (prevents feedback loop & hum)
    const silentSink = this.audioCtx.createGain();
    silentSink.gain.value = 0.0;
    this.scriptProcessor.connect(silentSink);
    silentSink.connect(this.audioCtx.destination);
  }

  private downsampleToPcm16(
    buffer: Float32Array,
    inputSampleRate: number,
    outputSampleRate: number
  ): ArrayBuffer {
    if (inputSampleRate === outputSampleRate) {
      const pcm16 = new Int16Array(buffer.length);
      for (let i = 0; i < buffer.length; i++) {
        const s = Math.max(-1, Math.min(1, buffer[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      return pcm16.buffer;
    }

    const ratio = inputSampleRate / outputSampleRate;
    const newLength = Math.round(buffer.length / ratio);
    const pcm16 = new Int16Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < newLength) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      const sample = count > 0 ? accum / count : 0;
      const s = Math.max(-1, Math.min(1, sample));
      pcm16[offsetResult] = s < 0 ? s * 0x8000 : s * 0x7fff;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }

    return pcm16.buffer;
  }

  stop(): void {
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => { });
      this.audioCtx = null;
    }
    if (this.onVolumeChange) {
      this.onVolumeChange(0);
    }
  }
}
