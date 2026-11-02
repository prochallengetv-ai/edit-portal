import { showToast } from '../components/toast';
import { router } from '../router';
import { BeatMarkerTool } from './beatMarker';

export class AudioStudioTool {
  private audioCtx: AudioContext | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private beatMarkerRef: BeatMarkerTool | null = null;

  // DSP Parameters
  private speed = 1.0;
  private bassGain = 0; // dB
  private reverbWet = 0; // 0 to 1
  private fadeIn = 0; // s
  private fadeOut = 0; // s
  private isLooping = true;

  // Trim Region (seconds in source)
  private trimStart = 0;
  private trimEnd = 0;
  private playStartTime = 0;
  private pauseOffset = 0;
  private isPlaying = false;

  // Audio Nodes (Real-time playback)
  private bassFilter: BiquadFilterNode | null = null;
  private convolver: ConvolverNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private impulseBuffer: AudioBuffer | null = null;

  // DOM Elements
  private dropStrip: HTMLElement | null = null;
  private fileInput: HTMLInputElement | null = null;
  private pickBtn: HTMLElement | null = null;
  private fileNameEl: HTMLElement | null = null;
  private bgCanvas: HTMLCanvasElement | null = null;
  private waveCanvas: HTMLCanvasElement | null = null;
  private bgCtx: CanvasRenderingContext2D | null = null;
  private waveCtx: CanvasRenderingContext2D | null = null;

  private playBtn: HTMLElement | null = null;
  private curTimeEl: HTMLElement | null = null;
  private startEl: HTMLElement | null = null;
  private endEl: HTMLElement | null = null;
  private outEl: HTMLElement | null = null;
  private loopToggle: HTMLInputElement | null = null;

  private speedSlider: HTMLInputElement | null = null;
  private bassSlider: HTMLInputElement | null = null;
  private reverbSlider: HTMLInputElement | null = null;
  private fadeInSlider: HTMLInputElement | null = null;
  private fadeOutSlider: HTMLInputElement | null = null;

  private speedValEl: HTMLElement | null = null;
  private bassValEl: HTMLElement | null = null;
  private reverbValEl: HTMLElement | null = null;
  private fadeInValEl: HTMLElement | null = null;
  private fadeOutValEl: HTMLElement | null = null;

  // Dragging handles
  private isDraggingStart = false;
  private isDraggingEnd = false;

  constructor(beatMarker: BeatMarkerTool) {
    this.beatMarkerRef = beatMarker;
  }

  public init() {
    this.bindElements();
    this.setupEvents();
    this.initBgVisualizer();
  }

  private bindElements() {
    this.dropStrip = document.getElementById('studioDrop');
    this.fileInput = document.getElementById('studioInput') as HTMLInputElement;
    this.pickBtn = document.getElementById('studioPickBtn');
    this.fileNameEl = document.getElementById('studioFileName');

    this.bgCanvas = document.getElementById('studioBg') as HTMLCanvasElement;
    this.waveCanvas = document.getElementById('studioCanvas') as HTMLCanvasElement;
    if (this.bgCanvas) this.bgCtx = this.bgCanvas.getContext('2d');
    if (this.waveCanvas) this.waveCtx = this.waveCanvas.getContext('2d');

    this.playBtn = document.getElementById('studioPlay');
    this.curTimeEl = document.getElementById('studioCurTime');
    this.startEl = document.getElementById('studioStart');
    this.endEl = document.getElementById('studioEnd');
    this.outEl = document.getElementById('studioOut');
    this.loopToggle = document.getElementById('studioLoop') as HTMLInputElement;

    this.speedSlider = document.getElementById('studioSpeed') as HTMLInputElement;
    this.bassSlider = document.getElementById('studioBass') as HTMLInputElement;
    this.reverbSlider = document.getElementById('studioReverb') as HTMLInputElement;
    this.fadeInSlider = document.getElementById('studioFadeIn') as HTMLInputElement;
    this.fadeOutSlider = document.getElementById('studioFadeOut') as HTMLInputElement;

    this.speedValEl = document.getElementById('studioSpeedVal');
    this.bassValEl = document.getElementById('studioBassVal');
    this.reverbValEl = document.getElementById('studioReverbVal');
    this.fadeInValEl = document.getElementById('studioFadeInVal');
    this.fadeOutValEl = document.getElementById('studioFadeOutVal');
  }

  private setupEvents() {
    // Pick / Drop file
    this.pickBtn?.addEventListener('click', () => this.fileInput?.click());
    this.fileInput?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) this.loadFile(file);
    });

    this.dropStrip?.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropStrip?.classList.add('is-dragover');
    });
    this.dropStrip?.addEventListener('dragleave', () => this.dropStrip?.classList.remove('is-dragover'));
    this.dropStrip?.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropStrip?.classList.remove('is-dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) this.loadFile(file);
    });

    // Play button
    this.playBtn?.addEventListener('click', () => this.togglePlayback());

    // Select all / Full range
    document.getElementById('studioFullBtn')?.addEventListener('click', () => {
      if (!this.audioBuffer) return;
      this.trimStart = 0;
      this.trimEnd = this.audioBuffer.duration;
      this.updateRegionInfo();
      this.drawWaveform();
    });

    this.loopToggle?.addEventListener('change', () => {
      this.isLooping = this.loopToggle?.checked ?? true;
    });

    // Sliders
    this.speedSlider?.addEventListener('input', () => {
      this.speed = parseFloat(this.speedSlider!.value);
      if (this.speedValEl) this.speedValEl.textContent = `${this.speed.toFixed(2)}x`;
      if (this.currentSource && this.audioCtx) {
        this.currentSource.playbackRate.setValueAtTime(this.speed, this.audioCtx.currentTime);
      }
      this.updateRegionInfo();
    });

    this.bassSlider?.addEventListener('input', () => {
      this.bassGain = parseFloat(this.bassSlider!.value);
      if (this.bassValEl) this.bassValEl.textContent = `${this.bassGain > 0 ? '+' : ''}${this.bassGain.toFixed(1)} dB`;
      if (this.bassFilter && this.audioCtx) {
        this.bassFilter.gain.setValueAtTime(this.bassGain, this.audioCtx.currentTime);
      }
    });

    this.reverbSlider?.addEventListener('input', () => {
      const val = parseInt(this.reverbSlider!.value, 10);
      this.reverbWet = val / 100;
      if (this.reverbValEl) this.reverbValEl.textContent = `${val}%`;
      this.updateDryWet();
    });

    this.fadeInSlider?.addEventListener('input', () => {
      this.fadeIn = parseFloat(this.fadeInSlider!.value);
      if (this.fadeInValEl) this.fadeInValEl.textContent = this.fadeIn.toFixed(1);
    });

    this.fadeOutSlider?.addEventListener('input', () => {
      this.fadeOut = parseFloat(this.fadeOutSlider!.value);
      if (this.fadeOutValEl) this.fadeOutValEl.textContent = this.fadeOut.toFixed(1);
    });

    // Preset Chips
    const chips = document.querySelectorAll('.studio-chip');
    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        chips.forEach((c) => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        const preset = chip.getAttribute('data-preset');
        this.applyPreset(preset);
      });
    });

    // Canvas Trim Dragging
    this.setupTrimInteractions();

    // Export WAV
    document.getElementById('studioExportBtn')?.addEventListener('click', () => this.renderAndExportWav());

    // Send to Beat Marker
    document.getElementById('studioSendBtn')?.addEventListener('click', () => this.sendToBeatMarker());

    window.addEventListener('resize', () => {
      this.resizeCanvases();
      this.drawWaveform();
    });
  }

  private applyPreset(preset: string | null) {
    if (!preset) return;
    switch (preset) {
      case 'original':
        this.setSpeed(1.0);
        this.setBass(0);
        this.setReverb(0);
        break;
      case 'spedup':
        this.setSpeed(1.22);
        this.setBass(1.5);
        this.setReverb(0);
        break;
      case 'slowed':
        this.setSpeed(0.84);
        this.setBass(3.0);
        this.setReverb(45);
        break;
      case 'nightcore':
        this.setSpeed(1.32);
        this.setBass(4.0);
        this.setReverb(10);
        break;
      case 'bass':
        this.setSpeed(1.0);
        this.setBass(9.0);
        this.setReverb(0);
        break;
    }
    showToast(`Applied Preset: ${preset.toUpperCase()}`);
  }

  private setSpeed(val: number) {
    this.speed = val;
    if (this.speedSlider) this.speedSlider.value = val.toString();
    if (this.speedValEl) this.speedValEl.textContent = `${val.toFixed(2)}x`;
    if (this.currentSource && this.audioCtx) {
      this.currentSource.playbackRate.setValueAtTime(this.speed, this.audioCtx.currentTime);
    }
    this.updateRegionInfo();
  }

  private setBass(val: number) {
    this.bassGain = val;
    if (this.bassSlider) this.bassSlider.value = val.toString();
    if (this.bassValEl) this.bassValEl.textContent = `${val > 0 ? '+' : ''}${val.toFixed(1)} dB`;
    if (this.bassFilter && this.audioCtx) {
      this.bassFilter.gain.setValueAtTime(this.bassGain, this.audioCtx.currentTime);
    }
  }

  private setReverb(val: number) {
    this.reverbWet = val / 100;
    if (this.reverbSlider) this.reverbSlider.value = val.toString();
    if (this.reverbValEl) this.reverbValEl.textContent = `${val}%`;
    this.updateDryWet();
  }

  private updateDryWet() {
    if (!this.dryGain || !this.wetGain || !this.audioCtx) return;
    const now = this.audioCtx.currentTime;
    // Equal-power crossfade
    this.dryGain.gain.setValueAtTime(Math.cos(this.reverbWet * 0.5 * Math.PI), now);
    this.wetGain.gain.setValueAtTime(Math.sin(this.reverbWet * 0.5 * Math.PI), now);
  }

  private resizeCanvases() {
    if (this.waveCanvas) {
      this.waveCanvas.width = this.waveCanvas.clientWidth * window.devicePixelRatio;
      this.waveCanvas.height = this.waveCanvas.clientHeight * window.devicePixelRatio;
    }
    if (this.bgCanvas) {
      this.bgCanvas.width = this.bgCanvas.clientWidth;
      this.bgCanvas.height = this.bgCanvas.clientHeight;
    }
  }

  public async loadFile(file: File) {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    try {
      if (this.fileNameEl) this.fileNameEl.textContent = `DECODING ${file.name.toUpperCase()}...`;
      const arrayBuffer = await file.arrayBuffer();
      const decoded = await this.audioCtx.decodeAudioData(arrayBuffer);
      this.audioBuffer = decoded;
      this.trimStart = 0;
      this.trimEnd = decoded.duration;
      this.pauseOffset = 0;

      if (this.fileNameEl) {
        this.fileNameEl.textContent = `${file.name} (${decoded.duration.toFixed(1)}s, ${decoded.sampleRate}Hz)`;
      }

      this.generateImpulseResponse();
      this.resizeCanvases();
      this.updateRegionInfo();
      this.drawWaveform();
      showToast('Audio loaded in Audio Studio!');
    } catch (err: any) {
      showToast('Error loading audio: ' + (err.message || 'Corrupted file'));
      if (this.fileNameEl) this.fileNameEl.textContent = 'ERROR LOADING FILE';
    }
  }

  // Generate acoustic stereo impulse response: Early reflections + frequency-damped late tail
  private generateImpulseResponse() {
    if (!this.audioCtx) return;
    const rate = this.audioCtx.sampleRate;
    const length = Math.floor(rate * 2.8);
    const impulse = this.audioCtx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    // 1. Early Reflections (geometrically distributed discrete echo taps)
    const taps = [
      { t: 0.012, g: 0.75, pan: -0.3 },
      { t: 0.024, g: 0.62, pan: 0.4 },
      { t: 0.038, g: 0.51, pan: -0.5 },
      { t: 0.055, g: 0.42, pan: 0.6 },
      { t: 0.075, g: 0.35, pan: -0.2 },
      { t: 0.098, g: 0.28, pan: 0.3 },
    ];

    taps.forEach((tap) => {
      const idx = Math.floor(tap.t * rate);
      if (idx < length) {
        left[idx] += tap.g * (1 - tap.pan);
        right[idx] += tap.g * (1 + tap.pan);
      }
    });

    // 2. Late Diffuse Reverb Tail with frequency-dependent absorption (LPF accumulator)
    let lpL = 0;
    let lpR = 0;
    const damping = 0.88; // high-frequency damping factor

    for (let i = 0; i < length; i++) {
      const decay = Math.exp(-i / (rate * 0.85));
      const noiseL = (Math.random() * 2 - 1) * decay;
      const noiseR = (Math.random() * 2 - 1) * decay;

      lpL = lpL * damping + noiseL * (1 - damping);
      lpR = lpR * damping + noiseR * (1 - damping);

      left[i] += lpL * 0.8;
      right[i] += lpR * 0.8;
    }

    this.impulseBuffer = impulse;
  }

  // --- Playback & DSP Graph ---
  public togglePlayback() {
    if (!this.audioBuffer) return;
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  private play() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    if (this.pauseOffset < this.trimStart || this.pauseOffset >= this.trimEnd) {
      this.pauseOffset = this.trimStart;
    }

    // Connect DSP chain
    this.currentSource = this.audioCtx.createBufferSource();
    this.currentSource.buffer = this.audioBuffer;
    this.currentSource.playbackRate.setValueAtTime(this.speed, this.audioCtx.currentTime);

    // 1. Lowshelf filter at 90Hz
    this.bassFilter = this.audioCtx.createBiquadFilter();
    this.bassFilter.type = 'lowshelf';
    this.bassFilter.frequency.setValueAtTime(90, this.audioCtx.currentTime);
    this.bassFilter.gain.setValueAtTime(this.bassGain, this.audioCtx.currentTime);

    // 2. Convolver Reverb with dry/wet split
    this.convolver = this.audioCtx.createConvolver();
    if (!this.impulseBuffer) this.generateImpulseResponse();
    this.convolver.buffer = this.impulseBuffer;

    this.dryGain = this.audioCtx.createGain();
    this.wetGain = this.audioCtx.createGain();
    this.updateDryWet();

    // 3. Master Gain & Dynamics Compressor (Anti-Clipping Limiter)
    this.masterGain = this.audioCtx.createGain();
    const compressor = this.audioCtx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-1.0, this.audioCtx.currentTime);
    compressor.knee.setValueAtTime(10.0, this.audioCtx.currentTime);
    compressor.ratio.setValueAtTime(12.0, this.audioCtx.currentTime);
    compressor.attack.setValueAtTime(0.003, this.audioCtx.currentTime);
    compressor.release.setValueAtTime(0.20, this.audioCtx.currentTime);

    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 128;

    // Routing
    this.currentSource.connect(this.bassFilter);
    this.bassFilter.connect(this.dryGain);
    this.bassFilter.connect(this.convolver);
    this.convolver.connect(this.wetGain);

    this.dryGain.connect(this.masterGain);
    this.wetGain.connect(this.masterGain);

    this.masterGain.connect(compressor);
    compressor.connect(this.analyser);
    this.analyser.connect(this.audioCtx.destination);

    // Fade in
    const now = this.audioCtx.currentTime;
    if (this.fadeIn > 0) {
      this.masterGain.gain.setValueAtTime(0.001, now);
      this.masterGain.gain.exponentialRampToValueAtTime(1.0, now + this.fadeIn);
    } else {
      this.masterGain.gain.setValueAtTime(1.0, now);
    }

    const startOffset = this.pauseOffset;
    const duration = Math.max(0, this.trimEnd - startOffset);

    this.currentSource.start(0, startOffset, duration);
    this.playStartTime = this.audioCtx.currentTime - (startOffset - this.trimStart) / this.speed;
    this.isPlaying = true;
    this.updatePlayBtn(true);

    this.currentSource.onended = () => {
      if (this.isPlaying) {
        if (this.isLooping) {
          this.pauseOffset = this.trimStart;
          this.play();
        } else {
          this.pause();
          this.pauseOffset = this.trimStart;
          this.drawWaveform();
        }
      }
    };

    this.playbackLoop();
  }

  public pause() {
    if (!this.isPlaying) return;
    try {
      this.currentSource?.stop();
      this.currentSource?.disconnect();
    } catch (e) {}
    this.isPlaying = false;
    this.pauseOffset = this.getCurrentTime();
    this.updatePlayBtn(false);
  }

  private updatePlayBtn(playing: boolean) {
    const icPlay = this.playBtn?.querySelector('.ic-play');
    const icPause = this.playBtn?.querySelector('.ic-pause');
    const txt = this.playBtn?.querySelector('.studio-play-txt');
    if (playing) {
      icPlay?.classList.add('hidden');
      icPause?.classList.remove('hidden');
      if (txt) txt.textContent = 'Pause';
    } else {
      icPlay?.classList.remove('hidden');
      icPause?.classList.add('hidden');
      if (txt) txt.textContent = 'Play';
    }
  }

  private getCurrentTime(): number {
    if (!this.audioBuffer) return 0;
    if (this.isPlaying && this.audioCtx) {
      const elapsedOutputSec = this.audioCtx.currentTime - this.playStartTime;
      const sourceElapsed = elapsedOutputSec * this.speed;
      return Math.min(this.trimStart + sourceElapsed, this.trimEnd);
    }
    return this.pauseOffset;
  }

  private playbackLoop = () => {
    if (!this.isPlaying) return;
    const cur = this.getCurrentTime();
    if (this.curTimeEl) this.curTimeEl.textContent = this.formatTimeSec(cur);
    this.drawWaveform();

    if (cur >= this.trimEnd) {
      if (this.isLooping) {
        this.pause();
        this.pauseOffset = this.trimStart;
        this.play();
      } else {
        this.pause();
        this.pauseOffset = this.trimStart;
        this.drawWaveform();
      }
    } else {
      requestAnimationFrame(this.playbackLoop);
    }
  };

  private formatTimeSec(sec: number): string {
    const mm = Math.floor(sec / 60);
    const ss = (sec % 60).toFixed(2);
    return `${mm.toString().padStart(2, '0')}:${ss.padStart(5, '0')}`;
  }

  private updateRegionInfo() {
    if (this.startEl) this.startEl.textContent = this.formatTimeSec(this.trimStart);
    if (this.endEl) this.endEl.textContent = this.formatTimeSec(this.trimEnd);
    const outSec = Math.max(0, (this.trimEnd - this.trimStart) / this.speed);
    if (this.outEl) this.outEl.textContent = this.formatTimeSec(outSec);
  }

  // --- Waveform & Trim Handles Interaction ---
  private setupTrimInteractions() {
    if (!this.waveCanvas) return;

    this.waveCanvas.addEventListener('mousedown', (e) => {
      if (!this.audioBuffer) return;
      const rect = this.waveCanvas!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const w = rect.width;
      const dur = this.audioBuffer.duration;

      const startX = (this.trimStart / dur) * w;
      const endX = (this.trimEnd / dur) * w;

      if (Math.abs(x - startX) < 14) {
        this.isDraggingStart = true;
      } else if (Math.abs(x - endX) < 14) {
        this.isDraggingEnd = true;
      } else {
        // Click inside to seek
        const clickedTime = (x / w) * dur;
        this.pauseOffset = Math.max(this.trimStart, Math.min(this.trimEnd, clickedTime));
        this.drawWaveform();
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.waveCanvas || !this.audioBuffer) return;
      const rect = this.waveCanvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const dur = this.audioBuffer.duration;
      const t = (x / rect.width) * dur;

      if (this.isDraggingStart) {
        this.trimStart = Math.max(0, Math.min(t, this.trimEnd - 0.2));
        this.updateRegionInfo();
        this.drawWaveform();
      } else if (this.isDraggingEnd) {
        this.trimEnd = Math.min(dur, Math.max(t, this.trimStart + 0.2));
        this.updateRegionInfo();
        this.drawWaveform();
      }
    });

    window.addEventListener('mouseup', () => {
      this.isDraggingStart = false;
      this.isDraggingEnd = false;
    });
  }

  public drawWaveform() {
    if (!this.waveCanvas || !this.waveCtx || !this.audioBuffer) return;
    const ctx = this.waveCtx;
    const w = this.waveCanvas.width;
    const h = this.waveCanvas.height;

    ctx.clearRect(0, 0, w, h);

    const channelData = this.audioBuffer.getChannelData(0);
    const totalSamples = channelData.length;
    const dur = this.audioBuffer.duration;
    const step = Math.ceil(totalSamples / w);
    const cy = h / 2;

    const startX = (this.trimStart / dur) * w;
    const endX = (this.trimEnd / dur) * w;

    // Draw dim wave outside trim, bright wave inside
    for (let x = 0; x < w; x++) {
      const idx = x * step;
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step && idx + j < totalSamples; j++) {
        const val = channelData[idx + j];
        if (val < min) min = val;
        if (val > max) max = val;
      }
      if (max < min) { min = 0; max = 0; }

      const y1 = cy + min * (h * 0.42);
      const y2 = cy + max * (h * 0.42);
      const isInside = x >= startX && x <= endX;

      ctx.fillStyle = isInside ? '#df71dc' : 'rgba(255, 255, 255, 0.15)';
      ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
    }

    // Dim mask outside trim
    ctx.fillStyle = 'rgba(6, 7, 12, 0.65)';
    ctx.fillRect(0, 0, startX, h);
    ctx.fillRect(endX, 0, w - endX, h);

    // Draw Trim Start Line & Handle
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(startX, 0);
    ctx.lineTo(startX, h);
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(startX - 5, 0, 10, 20);

    // Draw Trim End Line & Handle
    ctx.strokeStyle = '#f15aa9';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(endX, 0);
    ctx.lineTo(endX, h);
    ctx.stroke();

    ctx.fillStyle = '#f15aa9';
    ctx.fillRect(endX - 5, 0, 10, 20);

    // Draw Playhead
    const cur = this.getCurrentTime();
    if (cur >= this.trimStart && cur <= this.trimEnd) {
      const px = (cur / dur) * w;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#f15aa9';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  // --- Background Reactive Visualizer ---
  private initBgVisualizer() {
    const render = () => {
      if (!this.bgCtx || !this.bgCanvas) return;
      const ctx = this.bgCtx;
      const w = this.bgCanvas.width;
      const h = this.bgCanvas.height;

      ctx.clearRect(0, 0, w, h);

      if (this.analyser && this.isPlaying) {
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteFrequencyData(dataArray);

        ctx.beginPath();
        const sliceWidth = w / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 255.0;
          const y = h - v * (h * 0.55);

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);

          x += sliceWidth;
        }

        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, h / 2, 0, h);
        grad.addColorStop(0, 'rgba(223, 113, 220, 0.25)');
        grad.addColorStop(1, 'rgba(6, 7, 12, 0)');
        ctx.fillStyle = grad;
        ctx.fill();
      }

      requestAnimationFrame(render);
    };

    render();
  }

  // --- Offline Rendering & Handoff ---
  public async renderProcessedBuffer(): Promise<AudioBuffer | null> {
    if (!this.audioBuffer) return null;

    const sourceDuration = this.trimEnd - this.trimStart;
    const outputDuration = sourceDuration / this.speed;
    const sampleRate = this.audioBuffer.sampleRate;
    const numChannels = 2; // stereo

    const offlineCtx = new OfflineAudioContext(numChannels, Math.ceil(outputDuration * sampleRate), sampleRate);

    // Build offline graph identical to real-time DSP
    const source = offlineCtx.createBufferSource();
    source.buffer = this.audioBuffer;
    source.playbackRate.setValueAtTime(this.speed, 0);

    const bass = offlineCtx.createBiquadFilter();
    bass.type = 'lowshelf';
    bass.frequency.setValueAtTime(90, 0);
    bass.gain.setValueAtTime(this.bassGain, 0);

    const conv = offlineCtx.createConvolver();
    if (!this.impulseBuffer) this.generateImpulseResponse();
    conv.buffer = this.impulseBuffer;

    const dry = offlineCtx.createGain();
    const wet = offlineCtx.createGain();
    dry.gain.setValueAtTime(Math.cos(this.reverbWet * 0.5 * Math.PI), 0);
    wet.gain.setValueAtTime(Math.sin(this.reverbWet * 0.5 * Math.PI), 0);

    const master = offlineCtx.createGain();
    if (this.fadeIn > 0) {
      master.gain.setValueAtTime(0.001, 0);
      master.gain.exponentialRampToValueAtTime(1.0, this.fadeIn);
    } else {
      master.gain.setValueAtTime(1.0, 0);
    }

    if (this.fadeOut > 0) {
      const fadeOutStart = Math.max(0, outputDuration - this.fadeOut);
      master.gain.setValueAtTime(1.0, fadeOutStart);
      master.gain.exponentialRampToValueAtTime(0.001, outputDuration);
    }

    const compressor = offlineCtx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-1.0, 0);
    compressor.knee.setValueAtTime(10.0, 0);
    compressor.ratio.setValueAtTime(12.0, 0);
    compressor.attack.setValueAtTime(0.003, 0);
    compressor.release.setValueAtTime(0.20, 0);

    source.connect(bass);
    bass.connect(dry);
    bass.connect(conv);
    conv.connect(wet);

    dry.connect(master);
    wet.connect(master);
    master.connect(compressor);
    compressor.connect(offlineCtx.destination);

    source.start(0, this.trimStart, sourceDuration);
    const rendered = await offlineCtx.startRendering();
    return rendered;
  }

  public async renderAndExportWav() {
    if (!this.audioBuffer) {
      showToast('No audio loaded in studio!');
      return;
    }

    showToast('Rendering DSP chain offline...');
    const rendered = await this.renderProcessedBuffer();
    if (!rendered) return;

    // Encode to 16-bit PCM RIFF WAV
    const sampleRate = rendered.sampleRate;
    const numChannels = rendered.numberOfChannels;
    const numSamples = rendered.length;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = numSamples * blockAlign;
    const totalSize = 44 + dataSize;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);

    function writeStr(offset: number, s: string) {
      for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    }

    writeStr(0, 'RIFF');
    view.setUint32(4, totalSize - 8, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    const left = rendered.getChannelData(0);
    const right = rendered.getChannelData(1);
    let offset = 44;

    for (let i = 0; i < numSamples; i++) {
      const l = Math.max(-1, Math.min(1, left[i]));
      const r = Math.max(-1, Math.min(1, right[i]));
      view.setInt16(offset, l < 0 ? l * 0x8000 : l * 0x7fff, true);
      view.setInt16(offset + 2, r < 0 ? r * 0x8000 : r * 0x7fff, true);
      offset += 4;
    }

    const blob = new Blob([buffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `editportal_studio_${this.speed}x.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    document.getElementById('studioShare')?.classList.remove('hidden');
    showToast('WAV Downloaded! Check your Downloads folder.');
  }

  public async sendToBeatMarker() {
    if (!this.audioBuffer) {
      showToast('No audio loaded in studio!');
      return;
    }

    this.pause();
    showToast('Rendering DSP audio for Beat Marker...');
    const rendered = await this.renderProcessedBuffer();
    if (!rendered) return;

    // Switch view to /beat-marker
    router.navigate('/beat-marker');
    if (this.beatMarkerRef) {
      await this.beatMarkerRef.loadAudioBuffer(rendered, 'Studio_Processed.wav');
    }
  }
}
