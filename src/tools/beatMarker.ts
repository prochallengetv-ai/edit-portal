import { showToast } from '../components/toast';

export interface Marker {
  id: string;
  time: number; // in seconds
  type: 'auto' | 'manual';
}

export class BeatMarkerTool {
  private audioCtx: AudioContext | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private audioSource: AudioBufferSourceNode | null = null;

  private markers: Marker[] = [];
  private isPlaying = false;
  private startTime = 0;
  private pauseOffset = 0;
  private trimStart = 0;
  private trimEnd = 0;

  // View & Zoom
  private zoom = 1.0;
  private viewStart = 0; // in seconds
  private fps = 24;
  private offsetMs = 0;
  private sensitivity = 30; // 0 - 100
  private lastTaps: number[] = [];

  // Metronome
  private lastTriggeredMarkerIndex = -1;

  // UI Elements
  private dropZone: HTMLElement | null = null;
  private fileInput: HTMLInputElement | null = null;
  private pickBtn: HTMLElement | null = null;
  private loading: HTMLElement | null = null;
  private loadingText: HTMLElement | null = null;
  private editor: HTMLElement | null = null;
  private waveformCanvas: HTMLCanvasElement | null = null;
  private seekCanvas: HTMLCanvasElement | null = null;
  private wfCtx: CanvasRenderingContext2D | null = null;
  private seekCtx: CanvasRenderingContext2D | null = null;

  private playBtn: HTMLElement | null = null;
  private curTimeEl: HTMLElement | null = null;
  private durTimeEl: HTMLElement | null = null;
  private bpmValEl: HTMLElement | null = null;
  private beatCountEl: HTMLElement | null = null;
  private sensSlider: HTMLInputElement | null = null;
  private sensValEl: HTMLElement | null = null;
  private offsetSlider: HTMLInputElement | null = null;
  private offsetValEl: HTMLElement | null = null;
  private clickToggle: HTMLInputElement | null = null;
  private seekView: HTMLElement | null = null;
  private seekFill: HTMLElement | null = null;
  private seekHead: HTMLElement | null = null;

  // Interaction State
  private isDraggingPlayhead = false;
  private isDraggingThreshold = false;
  private isDraggingTrimStart = false;
  private isDraggingTrimEnd = false;

  public init() {
    this.bindElements();
    this.setupEvents();
  }

  private bindElements() {
    this.dropZone = document.getElementById('dropZone');
    this.fileInput = document.getElementById('fileInput') as HTMLInputElement;
    this.pickBtn = document.getElementById('pickBtn');
    this.loading = document.getElementById('loading');
    this.loadingText = document.getElementById('loadingText');
    this.editor = document.getElementById('editor');

    this.waveformCanvas = document.getElementById('waveform') as HTMLCanvasElement;
    this.seekCanvas = document.getElementById('seekCanvas') as HTMLCanvasElement;
    if (this.waveformCanvas) this.wfCtx = this.waveformCanvas.getContext('2d');
    if (this.seekCanvas) this.seekCtx = this.seekCanvas.getContext('2d');

    this.playBtn = document.getElementById('playBtn');
    this.curTimeEl = document.getElementById('curTime');
    this.durTimeEl = document.getElementById('durTime');
    this.bpmValEl = document.getElementById('bpmVal');
    this.beatCountEl = document.getElementById('beatCount');
    this.sensSlider = document.getElementById('sensSlider') as HTMLInputElement;
    this.sensValEl = document.getElementById('sensVal');
    this.offsetSlider = document.getElementById('offsetSlider') as HTMLInputElement;
    this.offsetValEl = document.getElementById('offsetVal');
    this.clickToggle = document.getElementById('clickToggle') as HTMLInputElement;
    this.seekView = document.getElementById('seekView');
    this.seekFill = document.getElementById('seekFill');
    this.seekHead = document.getElementById('seekHead');
  }

  private setupEvents() {
    // Pick Button & File Input
    this.pickBtn?.addEventListener('click', () => this.fileInput?.click());
    this.fileInput?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) this.loadFile(file);
    });

    // Drag and Drop
    this.dropZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropZone?.classList.add('is-dragover');
    });
    this.dropZone?.addEventListener('dragleave', () => this.dropZone?.classList.remove('is-dragover'));
    this.dropZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone?.classList.remove('is-dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) this.loadFile(file);
    });

    // Play button
    this.playBtn?.addEventListener('click', () => this.togglePlayback());

    // Sensitivity Slider
    this.sensSlider?.addEventListener('input', () => {
      this.sensitivity = parseInt(this.sensSlider!.value, 10);
      if (this.sensValEl) this.sensValEl.textContent = this.sensitivity.toString();
      this.detectBeats();
    });

    // Offset Slider
    this.offsetSlider?.addEventListener('input', () => {
      this.offsetMs = parseInt(this.offsetSlider!.value, 10);
      if (this.offsetValEl) this.offsetValEl.textContent = `${this.offsetMs > 0 ? '+' : ''}${this.offsetMs}ms`;
      this.drawWaveform();
    });

    // FPS selection
    const fpsButtons = document.querySelectorAll('.fps-btn');
    fpsButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        fpsButtons.forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        this.fps = parseInt(btn.getAttribute('data-fps') || '24', 10);
        this.drawWaveform();
      });
    });

    // Zoom Buttons
    document.getElementById('zoomInBtn')?.addEventListener('click', () => this.setZoom(this.zoom * 1.4));
    document.getElementById('zoomOutBtn')?.addEventListener('click', () => this.setZoom(this.zoom / 1.4));
    document.getElementById('zoomFitBtn')?.addEventListener('click', () => this.setZoom(1.0));

    // Wheel zoom on waveform canvas
    this.waveformCanvas?.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      this.setZoom(this.zoom * zoomFactor);
    });

    // Canvas click & drag interactions
    this.setupCanvasInteractions();

    // Quick Actions
    document.getElementById('addBtn')?.addEventListener('click', () => this.addManualMarkerAtPlayhead());
    document.getElementById('fillBtn')?.addEventListener('click', () => this.fillFromTaps());
    document.getElementById('redetectBtn')?.addEventListener('click', () => this.detectBeats());
    document.getElementById('clearBtn')?.addEventListener('click', () => {
      this.markers = [];
      this.updateBeatCount();
      this.drawWaveform();
      showToast('All markers cleared');
    });

    // Export Buttons
    document.getElementById('exportTxtBtn')?.addEventListener('click', () => this.exportTxt());
    document.getElementById('exportWavBtn')?.addEventListener('click', () => this.exportWavWithXmp());

    // Global Key shortcuts ('T' for marker, Space for play)
    window.addEventListener('keydown', (e) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      const appView = document.getElementById('app');
      if (appView && !appView.classList.contains('hidden')) {
        if (e.key === 't' || e.key === 'T') {
          e.preventDefault();
          this.addManualMarkerAtPlayhead();
        } else if (e.code === 'Space') {
          e.preventDefault();
          this.togglePlayback();
        }
      }
    });

    // Window resize
    window.addEventListener('resize', () => {
      this.resizeCanvases();
      this.drawWaveform();
      this.drawMinimap();
    });
  }

  private resizeCanvases() {
    if (this.waveformCanvas) {
      this.waveformCanvas.width = this.waveformCanvas.clientWidth * window.devicePixelRatio;
      this.waveformCanvas.height = this.waveformCanvas.clientHeight * window.devicePixelRatio;
    }
    if (this.seekCanvas) {
      this.seekCanvas.width = this.seekCanvas.clientWidth * window.devicePixelRatio;
      this.seekCanvas.height = this.seekCanvas.clientHeight * window.devicePixelRatio;
    }
  }

  public async loadAudioBuffer(buffer: AudioBuffer, fileName = 'Processed Audio') {
    this.audioBuffer = buffer;
    this.trimStart = 0;
    this.trimEnd = buffer.duration;
    this.viewStart = 0;
    this.zoom = 1.0;
    this.pauseOffset = 0;

    this.dropZone?.classList.add('hidden');
    this.editor?.classList.remove('hidden');

    this.resizeCanvases();
    this.detectBeats();
    this.drawMinimap();
    this.drawWaveform();
    showToast(`Loaded "${fileName}" (${buffer.duration.toFixed(1)}s)`);
  }

  public async loadFile(file: File) {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    this.dropZone?.classList.add('hidden');
    this.loading?.classList.remove('hidden');
    if (this.loadingText) this.loadingText.textContent = `READING ${file.name.toUpperCase()}...`;

    try {
      const arrayBuffer = await file.arrayBuffer();
      if (this.loadingText) this.loadingText.textContent = 'DECODING PCM AUDIO...';
      const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
      this.loading?.classList.add('hidden');
      await this.loadAudioBuffer(audioBuffer, file.name);
    } catch (err: any) {
      this.loading?.classList.add('hidden');
      this.dropZone?.classList.remove('hidden');
      showToast('Error decoding audio: ' + (err.message || 'Unsupported format'));
    }
  }

  // --- Beat Detection & BPM Estimation Algorithm ---
  public detectBeats() {
    if (!this.audioBuffer) return;

    const buffer = this.audioBuffer;
    const sampleRate = buffer.sampleRate;
    const channelData = buffer.getChannelData(0);
    const duration = buffer.duration;

    // Preserve manual markers
    const manualMarkers = this.markers.filter((m) => m.type === 'manual');
    this.markers = [...manualMarkers];

    // Multi-Band Spectral Flux Onset Detection (Sub-bass, Mid-punch, High-transient)
    const windowSize = 512;
    const hopSize = 256;
    const numWindows = Math.floor((channelData.length - windowSize) / hopSize);

    // Filter coefficients for 3 distinct frequency bands
    const dt = 1 / sampleRate;
    // Band 1: Low-pass ~160Hz (Kick / 808 / Sub)
    const alphaLow = dt / (1 / (2 * Math.PI * 160) + dt);
    // Band 2: Band-pass ~1.8kHz (Snare / Clap body)
    const alphaMid = dt / (1 / (2 * Math.PI * 1800) + dt);
    // Band 3: High-pass ~4.5kHz (Hi-hats, percussive clicks)
    const alphaHigh = dt / (1 / (2 * Math.PI * 4500) + dt);

    const bassEnergies: number[] = new Array(numWindows);
    const midEnergies: number[] = new Array(numWindows);
    const highEnergies: number[] = new Array(numWindows);
    const spectralFlux: number[] = new Array(numWindows);

    let fLow = 0;
    let fMid = 0;
    let fHigh = 0;

    for (let w = 0; w < numWindows; w++) {
      let sumLow = 0;
      let sumMid = 0;
      let sumHigh = 0;
      const startIdx = w * hopSize;

      for (let i = 0; i < windowSize; i++) {
        const raw = channelData[startIdx + i];

        fLow += alphaLow * (raw - fLow);
        sumLow += fLow * fLow;

        fMid += alphaMid * (raw - fMid);
        const midOnly = raw - fLow;
        sumMid += midOnly * midOnly;

        fHigh += alphaHigh * (raw - fHigh);
        const highOnly = raw - fMid;
        sumHigh += highOnly * highOnly;
      }

      bassEnergies[w] = Math.sqrt(sumLow / windowSize);
      midEnergies[w] = Math.sqrt(sumMid / windowSize);
      highEnergies[w] = Math.sqrt(sumHigh / windowSize);

      if (w > 0) {
        // Positive Spectral Flux (half-wave rectification): sum only positive energy increases
        const dLow = Math.max(0, bassEnergies[w] - bassEnergies[w - 1]);
        const dMid = Math.max(0, midEnergies[w] - midEnergies[w - 1]);
        const dHigh = Math.max(0, highEnergies[w] - highEnergies[w - 1]);

        spectralFlux[w] = dLow * 1.5 + dMid * 1.1 + dHigh * 0.7;
      } else {
        spectralFlux[w] = 0;
      }
    }

    // Dynamic moving average threshold with sensitivity scaling
    const avgWindow = 20;
    const sensMultiplier = 2.4 - (this.sensitivity / 100) * 1.35; // 0: 2.4x threshold, 100: 1.05x threshold
    const minDebounceSec = 0.15; // 150ms minimum distance between beats
    let lastBeatTime = -1;
    const detectedTimes: number[] = [];

    for (let w = avgWindow; w < numWindows - avgWindow; w++) {
      let localSum = 0;
      for (let k = -avgWindow; k <= avgWindow; k++) {
        localSum += spectralFlux[w + k];
      }
      const localAvg = localSum / (avgWindow * 2 + 1);
      const threshold = localAvg * sensMultiplier;
      const time = (w * hopSize) / sampleRate;

      // Peak condition on Spectral Flux
      if (
        spectralFlux[w] > threshold &&
        spectralFlux[w] > spectralFlux[w - 1] &&
        spectralFlux[w] > spectralFlux[w + 1] &&
        spectralFlux[w] > 0.003
      ) {
        if (lastBeatTime < 0 || time - lastBeatTime >= minDebounceSec) {
          detectedTimes.push(time);
          lastBeatTime = time;
        }
      }
    }

    // Add auto markers
    detectedTimes.forEach((t) => {
      this.markers.push({
        id: Math.random().toString(36).substr(2, 9),
        time: t,
        type: 'auto'
      });
    });

    this.markers.sort((a, b) => a.time - b.time);
    this.updateBeatCount();

    // BPM Calculation from Inter-Onset Intervals (IOI)
    this.calculateBpm(detectedTimes);
    this.drawWaveform();
    this.drawMinimap();
  }

  private calculateBpm(times: number[]) {
    if (times.length < 4) {
      if (this.bpmValEl) this.bpmValEl.textContent = '---';
      return;
    }

    const intervals: number[] = [];
    for (let i = 1; i < times.length; i++) {
      const delta = times[i] - times[i - 1];
      if (delta >= 0.25 && delta <= 1.2) {
        intervals.push(delta);
      }
    }

    if (intervals.length < 3) {
      if (this.bpmValEl) this.bpmValEl.textContent = '---';
      return;
    }

    // Histogram of BPMs from 70 to 180
    const histogram: Record<number, number> = {};
    intervals.forEach((dt) => {
      let rawBpm = 60 / dt;
      // fold into 70 - 180 range
      while (rawBpm < 70) rawBpm *= 2;
      while (rawBpm > 180) rawBpm /= 2;
      const rounded = Math.round(rawBpm);
      histogram[rounded] = (histogram[rounded] || 0) + 1;
    });

    let bestBpm = 120;
    let maxVotes = -1;
    for (const [bpmStr, count] of Object.entries(histogram)) {
      const bpm = parseInt(bpmStr, 10);
      if (count > maxVotes) {
        maxVotes = count;
        bestBpm = bpm;
      }
    }

    if (this.bpmValEl) this.bpmValEl.textContent = bestBpm.toString();
  }

  private updateBeatCount() {
    if (this.beatCountEl) {
      this.beatCountEl.textContent = this.markers.length.toString();
    }
  }

  // --- Zoom & Viewport ---
  private setZoom(newZoom: number) {
    if (!this.audioBuffer) return;
    this.zoom = Math.min(Math.max(newZoom, 1.0), 40.0);
    const visibleDuration = this.audioBuffer.duration / this.zoom;
    const playhead = this.getCurrentTime();
    this.viewStart = Math.min(Math.max(playhead - visibleDuration / 2, 0), this.audioBuffer.duration - visibleDuration);
    this.drawWaveform();
    this.drawMinimap();
  }

  // --- Playback & Metronome ---
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

    if (this.pauseOffset >= this.trimEnd) {
      this.pauseOffset = this.trimStart;
    }

    this.audioSource = this.audioCtx.createBufferSource();
    this.audioSource.buffer = this.audioBuffer;
    this.audioSource.connect(this.audioCtx.destination);

    const offset = Math.max(this.pauseOffset, this.trimStart);
    const duration = Math.max(this.trimEnd - offset, 0);

    this.audioSource.start(0, offset, duration);
    this.startTime = this.audioCtx.currentTime - offset;
    this.isPlaying = true;
    this.updatePlayBtn(true);

    this.audioSource.onended = () => {
      if (this.isPlaying) {
        this.pause();
        this.pauseOffset = this.trimStart;
        this.drawWaveform();
      }
    };

    this.playbackLoop();
  }

  public pause() {
    if (!this.isPlaying) return;
    try {
      this.audioSource?.stop();
      this.audioSource?.disconnect();
    } catch (e) {}
    this.isPlaying = false;
    this.pauseOffset = this.getCurrentTime();
    this.updatePlayBtn(false);
  }

  private updatePlayBtn(playing: boolean) {
    const icPlay = this.playBtn?.querySelector('.ic-play');
    const icPause = this.playBtn?.querySelector('.ic-pause');
    const txt = this.playBtn?.querySelector('.play-txt');
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
      return this.audioCtx.currentTime - this.startTime;
    }
    return this.pauseOffset;
  }

  private playbackLoop = () => {
    if (!this.isPlaying) return;
    const current = this.getCurrentTime();

    // Check Metronome click
    if (this.clickToggle?.checked && this.audioCtx) {
      const syncTime = current - this.offsetMs / 1000;
      // find markers passed
      this.markers.forEach((m, idx) => {
        if (idx > this.lastTriggeredMarkerIndex && Math.abs(m.time - syncTime) < 0.03) {
          this.playMetronomeClick();
          this.lastTriggeredMarkerIndex = idx;
        }
      });
    }

    // Scroll view if playhead moves outside
    if (this.audioBuffer) {
      const visibleDuration = this.audioBuffer.duration / this.zoom;
      if (current > this.viewStart + visibleDuration * 0.95) {
        this.viewStart = Math.min(current - visibleDuration * 0.1, this.audioBuffer.duration - visibleDuration);
      }
    }

    this.updateTimeDisplays();
    this.drawWaveform();
    this.drawMinimap();

    if (current >= this.trimEnd) {
      this.pause();
      this.pauseOffset = this.trimStart;
      this.drawWaveform();
    } else {
      requestAnimationFrame(this.playbackLoop);
    }
  };

  private playMetronomeClick() {
    if (!this.audioCtx) return;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1000, this.audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, this.audioCtx.currentTime + 0.015);

    gain.gain.setValueAtTime(0.4, this.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.015);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start();
    osc.stop(this.audioCtx.currentTime + 0.018);
  }

  private updateTimeDisplays() {
    const cur = this.getCurrentTime();
    const dur = this.audioBuffer?.duration || 0;
    if (this.curTimeEl) this.curTimeEl.textContent = this.formatTimeSec(cur);
    if (this.durTimeEl) this.durTimeEl.textContent = this.formatTimeSec(dur);
  }

  private formatTimeSec(sec: number): string {
    const mm = Math.floor(sec / 60);
    const ss = (sec % 60).toFixed(2);
    return `${mm.toString().padStart(2, '0')}:${ss.padStart(5, '0')}`;
  }

  // --- Marker Operations ---
  public addManualMarkerAtPlayhead() {
    const cur = this.getCurrentTime();
    this.markers.push({
      id: Math.random().toString(36).substr(2, 9),
      time: cur,
      type: 'manual'
    });
    this.markers.sort((a, b) => a.time - b.time);
    this.lastTaps.push(cur);
    if (this.lastTaps.length > 8) this.lastTaps.shift();
    this.updateBeatCount();
    this.drawWaveform();
    this.drawMinimap();
    showToast(`Added manual marker at ${cur.toFixed(2)}s`);
  }

  public fillFromTaps() {
    if (this.lastTaps.length < 2) {
      showToast('Tap at least 2 manual markers (T) first to calculate tempo!');
      return;
    }

    const deltas: number[] = [];
    for (let i = 1; i < this.lastTaps.length; i++) {
      deltas.push(this.lastTaps[i] - this.lastTaps[i - 1]);
    }
    const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    if (avgDelta < 0.15) {
      showToast('Taps too close together.');
      return;
    }

    const lastTap = this.lastTaps[this.lastTaps.length - 1];
    const totalDuration = this.audioBuffer?.duration || 0;
    let nextTime = lastTap + avgDelta;
    let added = 0;

    while (nextTime <= totalDuration) {
      this.markers.push({
        id: Math.random().toString(36).substr(2, 9),
        time: nextTime,
        type: 'manual'
      });
      nextTime += avgDelta;
      added++;
    }

    this.markers.sort((a, b) => a.time - b.time);
    this.updateBeatCount();
    this.drawWaveform();
    this.drawMinimap();
    const bpm = Math.round(60 / avgDelta);
    showToast(`Autofilled ${added} markers at ~${bpm} BPM`);
  }

  // --- Interactive Canvas Events ---
  private setupCanvasInteractions() {
    if (!this.waveformCanvas) return;

    this.waveformCanvas.addEventListener('mousedown', (e) => {
      if (!this.audioBuffer) return;
      const rect = this.waveformCanvas!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const w = rect.width;
      const h = rect.height;

      const visibleDuration = this.audioBuffer.duration / this.zoom;
      const clickedTime = this.viewStart + (x / w) * visibleDuration;

      // 1. Check if clicked near sensitivity threshold horizontal line
      const thresholdY = (1 - this.sensitivity / 100) * h;
      if (Math.abs(y - thresholdY) < 12) {
        this.isDraggingThreshold = true;
        return;
      }

      // 2. Check if clicked near existing marker (within 8px) -> delete
      const markerThresholdSec = (8 / w) * visibleDuration;
      const clickedMarkerIdx = this.markers.findIndex((m) => Math.abs(m.time - clickedTime) < markerThresholdSec);
      if (clickedMarkerIdx >= 0) {
        this.markers.splice(clickedMarkerIdx, 1);
        this.updateBeatCount();
        this.drawWaveform();
        this.drawMinimap();
        showToast('Marker deleted');
        return;
      }

      // 3. Otherwise: drag playhead to scrub or click empty to add manual marker
      this.isDraggingPlayhead = true;
      this.pauseOffset = Math.max(0, Math.min(clickedTime, this.audioBuffer.duration));
      this.updateTimeDisplays();
      this.drawWaveform();
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.waveformCanvas || !this.audioBuffer) return;
      const rect = this.waveformCanvas.getBoundingClientRect();

      if (this.isDraggingThreshold) {
        const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
        const sens = Math.round((1 - y / rect.height) * 100);
        this.sensitivity = sens;
        if (this.sensSlider) this.sensSlider.value = sens.toString();
        if (this.sensValEl) this.sensValEl.textContent = sens.toString();
        this.detectBeats();
        return;
      }

      if (this.isDraggingPlayhead) {
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const visibleDuration = this.audioBuffer.duration / this.zoom;
        this.pauseOffset = this.viewStart + (x / rect.width) * visibleDuration;
        this.updateTimeDisplays();
        this.drawWaveform();
      }
    });

    window.addEventListener('mouseup', () => {
      this.isDraggingThreshold = false;
      this.isDraggingPlayhead = false;
    });

    // Minimap Navigation Drag
    const seekEl = document.getElementById('seek');
    let isDraggingSeek = false;

    seekEl?.addEventListener('mousedown', (e) => {
      if (!this.audioBuffer) return;
      isDraggingSeek = true;
      const rect = seekEl.getBoundingClientRect();
      const pct = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1));
      this.pauseOffset = pct * this.audioBuffer.duration;
      const visibleDuration = this.audioBuffer.duration / this.zoom;
      this.viewStart = Math.min(Math.max(this.pauseOffset - visibleDuration / 2, 0), this.audioBuffer.duration - visibleDuration);
      this.updateTimeDisplays();
      this.drawWaveform();
      this.drawMinimap();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDraggingSeek || !seekEl || !this.audioBuffer) return;
      const rect = seekEl.getBoundingClientRect();
      const pct = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1));
      this.pauseOffset = pct * this.audioBuffer.duration;
      const visibleDuration = this.audioBuffer.duration / this.zoom;
      this.viewStart = Math.min(Math.max(this.pauseOffset - visibleDuration / 2, 0), this.audioBuffer.duration - visibleDuration);
      this.updateTimeDisplays();
      this.drawWaveform();
      this.drawMinimap();
    });

    window.addEventListener('mouseup', () => {
      isDraggingSeek = false;
    });
  }

  // --- Canvas Rendering ---
  public drawWaveform() {
    if (!this.waveformCanvas || !this.wfCtx || !this.audioBuffer) return;
    const ctx = this.wfCtx;
    const w = this.waveformCanvas.width;
    const h = this.waveformCanvas.height;

    ctx.clearRect(0, 0, w, h);

    const channelData = this.audioBuffer.getChannelData(0);
    const sampleRate = this.audioBuffer.sampleRate;
    const visibleDuration = this.audioBuffer.duration / this.zoom;
    const viewEnd = this.viewStart + visibleDuration;
    const startSample = Math.floor(this.viewStart * sampleRate);
    const endSample = Math.floor(viewEnd * sampleRate);
    const totalSamples = endSample - startSample;

    const cy = h / 2;

    // Draw center baseline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(w, cy);
    ctx.stroke();

    // Draw Sensitivity Threshold Line
    const threshY = (1 - this.sensitivity / 100) * h;
    ctx.strokeStyle = 'rgba(236, 72, 153, 0.45)';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, threshY);
    ctx.lineTo(w, threshY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw Threshold text tag
    ctx.fillStyle = 'rgba(236, 72, 153, 0.8)';
    ctx.font = '10px Space Grotesk, monospace';
    ctx.fillText(`THRESHOLD: ${this.sensitivity}%`, 10, threshY - 6);

    // Waveform gradient
    const waveGrad = ctx.createLinearGradient(0, 0, 0, h);
    waveGrad.addColorStop(0, 'rgba(182, 145, 255, 0.85)');
    waveGrad.addColorStop(0.5, 'rgba(223, 113, 220, 0.95)');
    waveGrad.addColorStop(1, 'rgba(182, 145, 255, 0.85)');
    ctx.fillStyle = waveGrad;

    const step = Math.ceil(totalSamples / w);
    for (let x = 0; x < w; x++) {
      const idx = startSample + x * step;
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step && idx + j < channelData.length; j++) {
        const val = channelData[idx + j];
        if (val < min) min = val;
        if (val > max) max = val;
      }
      if (max < min) { min = 0; max = 0; }
      const y1 = cy + min * (h * 0.45);
      const y2 = cy + max * (h * 0.45);
      ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
    }

    // Draw Markers (Diamonds + Lines)
    const effectiveOffset = this.offsetMs / 1000;
    this.markers.forEach((m) => {
      const markerTime = m.time + effectiveOffset;
      if (markerTime >= this.viewStart && markerTime <= viewEnd) {
        const mx = ((markerTime - this.viewStart) / visibleDuration) * w;

        // Line
        ctx.strokeStyle = m.type === 'auto' ? 'rgba(182, 145, 255, 0.75)' : 'rgba(241, 90, 169, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(mx, 0);
        ctx.lineTo(mx, h);
        ctx.stroke();

        // Diamond head at top
        ctx.fillStyle = m.type === 'auto' ? '#b691ff' : '#f15aa9';
        ctx.beginPath();
        ctx.moveTo(mx, 0);
        ctx.lineTo(mx + 5, 8);
        ctx.lineTo(mx, 16);
        ctx.lineTo(mx - 5, 8);
        ctx.closePath();
        ctx.fill();
      }
    });

    // Draw Playhead
    const curTime = this.getCurrentTime();
    if (curTime >= this.viewStart && curTime <= viewEnd) {
      const px = ((curTime - this.viewStart) / visibleDuration) * w;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#f15aa9';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  public drawMinimap() {
    if (!this.seekCanvas || !this.seekCtx || !this.audioBuffer) return;
    const ctx = this.seekCtx;
    const w = this.seekCanvas.width;
    const h = this.seekCanvas.height;

    ctx.clearRect(0, 0, w, h);

    const channelData = this.audioBuffer.getChannelData(0);
    const totalSamples = channelData.length;
    const step = Math.ceil(totalSamples / w);
    const cy = h / 2;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    for (let x = 0; x < w; x++) {
      const idx = x * step;
      let max = 0;
      for (let j = 0; j < step && idx + j < totalSamples; j++) {
        const val = Math.abs(channelData[idx + j]);
        if (val > max) max = val;
      }
      const barH = max * (h * 0.8);
      ctx.fillRect(x, cy - barH / 2, 1, Math.max(1, barH));
    }

    // Update minimap overlays
    const cur = this.getCurrentTime();
    const dur = this.audioBuffer.duration;
    const curPct = (cur / dur) * 100;
    const viewStartPct = (this.viewStart / dur) * 100;
    const viewWidthPct = ((dur / this.zoom) / dur) * 100;

    if (this.seekFill) this.seekFill.style.width = `${curPct}%`;
    if (this.seekHead) this.seekHead.style.left = `${curPct}%`;
    if (this.seekView) {
      this.seekView.style.left = `${viewStartPct}%`;
      this.seekView.style.width = `${viewWidthPct}%`;
    }
  }

  // --- Exports ---
  public exportTxt() {
    if (this.markers.length === 0) {
      showToast('No markers to export!');
      return;
    }

    const effectiveOffset = this.offsetMs / 1000;
    let content = `# Edit Portal - After Effects & Premiere Cue Markers\n`;
    content += `# FPS: ${this.fps}\n`;
    content += `# Total Markers: ${this.markers.length}\n`;
    content += `# Timecode\tFrame\tSeconds\tType\n`;

    this.markers.forEach((m, idx) => {
      const t = Math.max(0, m.time + effectiveOffset);
      const frame = Math.round(t * this.fps);
      const sec = t.toFixed(4);
      content += `Marker ${idx + 1}\t${frame}\t${sec}s\t${m.type}\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    this.downloadBlob(blob, 'editportal_markers.txt');
    showToast('Exported marker list (.txt)!');
  }

  public exportWavWithXmp() {
    if (!this.audioBuffer) {
      showToast('No audio loaded to export!');
      return;
    }

    const sampleRate = this.audioBuffer.sampleRate;
    const numChannels = this.audioBuffer.numberOfChannels;
    const startSample = Math.floor(this.trimStart * sampleRate);
    const endSample = Math.floor(this.trimEnd * sampleRate);
    const numSamples = endSample - startSample;

    // Build 16-bit PCM RIFF WAV
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numSamples * blockAlign;

    // Generate Adobe XMP XML packet with Cue Markers
    const effectiveOffset = this.offsetMs / 1000;
    let markerSeqXml = '';
    this.markers.forEach((m, i) => {
      const markerTime = Math.max(0, m.time - this.trimStart + effectiveOffset);
      const sampleOffset = Math.floor(markerTime * sampleRate);
      markerSeqXml += `
         <rdf:li>
          <rdf:Description xmpDM:startTime="${sampleOffset}" xmpDM:name="Beat ${i + 1}" xmpDM:comment="${m.type}" />
         </rdf:li>`;
    });

    const xmpPayload = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:xmpDM="http://ns.adobe.com/xmp/1.0/DynamicMedia/">
   <xmpDM:Tracks>
    <rdf:Bag>
     <rdf:li>
      <rdf:Description xmpDM:trackName="Beat Markers" xmpDM:trackType="Cue">
       <xmpDM:markers>
        <rdf:Seq>${markerSeqXml}
        </rdf:Seq>
       </xmpDM:markers>
      </rdf:Description>
     </rdf:li>
    </rdf:Bag>
   </xmpDM:Tracks>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

    const xmpBytes = new TextEncoder().encode(xmpPayload);
    // Pad XMP chunk to even length
    const xmpPaddedLength = xmpBytes.length + (xmpBytes.length % 2);

    // Total file size = 44 (standard WAV header) + dataSize + 8 (XMP header) + xmpPaddedLength
    const totalFileSize = 44 + dataSize + 8 + xmpPaddedLength;
    const buffer = new ArrayBuffer(totalFileSize);
    const view = new DataView(buffer);

    // Helper write string
    function writeString(offset: number, str: string) {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    }

    // RIFF chunk descriptor
    writeString(0, 'RIFF');
    view.setUint32(4, totalFileSize - 8, true);
    writeString(8, 'WAVE');

    // "fmt " sub-chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true); // BitsPerSample

    // "data" sub-chunk
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // Interleave channels & write 16-bit PCM samples
    let offset = 44;
    const channels: Float32Array[] = [];
    for (let c = 0; c < numChannels; c++) {
      channels.push(this.audioBuffer.getChannelData(c));
    }

    for (let i = 0; i < numSamples; i++) {
      for (let c = 0; c < numChannels; c++) {
        const s = Math.max(-1, Math.min(1, channels[c][startSample + i]));
        const sample16 = s < 0 ? s * 0x8000 : s * 0x7fff;
        view.setInt16(offset, sample16, true);
        offset += 2;
      }
    }

    // Adobe XMP chunk "_PMX "
    writeString(offset, '_PMX ');
    view.setUint32(offset + 4, xmpBytes.length, true);
    offset += 8;

    // Copy XMP payload bytes
    new Uint8Array(buffer, offset, xmpBytes.length).set(xmpBytes);

    const wavBlob = new Blob([buffer], { type: 'audio/wav' });
    this.downloadBlob(wavBlob, 'editportal_synced_beats.wav');
    showToast('Exported 16-bit WAV with embedded Adobe XMP markers!');
  }

  private downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
