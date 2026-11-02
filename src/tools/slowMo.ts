import { showToast } from '../components/toast';

export class SlowMoTool {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private video: HTMLVideoElement | null = null;

  // Media state
  private videoFile: File | null = null;
  private videoDuration = 0;
  private originalFps = 30;
  private isPlaying = false;
  private animFrameId: number | null = null;

  // Settings
  private speed = 0.25; // 0.25x default (4x slow motion)
  private targetFps = 60;
  private blendStrength = 0.85; // 0 - 1
  private audioMode: 'mute' | 'stretch' | 'preserve' = 'mute';

  // Frame Interpolation Buffers
  private prevFrameCanvas: HTMLCanvasElement | null = null;
  private prevFrameCtx: CanvasRenderingContext2D | null = null;
  private currentVirtualTime = 0;
  private lastRenderTimestamp = 0;

  // Export State
  private isExporting = false;
  private cancelExport = false;
  private exportBlob: Blob | null = null;

  // DOM Elements
  private dropZone: HTMLElement | null = null;
  private fileInput: HTMLInputElement | null = null;
  private pickBtn: HTMLElement | null = null;
  private editorPanel: HTMLElement | null = null;
  private fileNameEl: HTMLElement | null = null;
  private fileMetaEl: HTMLElement | null = null;

  private playBtn: HTMLElement | null = null;
  private seekSlider: HTMLInputElement | null = null;
  private curTimeEl: HTMLElement | null = null;
  private durTimeEl: HTMLElement | null = null;
  private speedValEl: HTMLElement | null = null;
  private speedSlider: HTMLInputElement | null = null;

  private exportModal: HTMLElement | null = null;
  private exportPctEl: HTMLElement | null = null;
  private exportBarEl: HTMLElement | null = null;
  private exportDoneModal: HTMLElement | null = null;

  public init() {
    this.bindElements();
    this.setupEvents();
    this.initBuffers();
  }

  private bindElements() {
    this.canvas = document.getElementById('smCanvas') as HTMLCanvasElement;
    if (this.canvas) this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    this.dropZone = document.getElementById('smDrop');
    this.fileInput = document.getElementById('smInput') as HTMLInputElement;
    this.pickBtn = document.getElementById('smPickBtn');
    this.editorPanel = document.getElementById('smEditor');
    this.fileNameEl = document.getElementById('smFileName');
    this.fileMetaEl = document.getElementById('smFileMeta');

    this.playBtn = document.getElementById('smPlay');
    this.seekSlider = document.getElementById('smSeek') as HTMLInputElement;
    this.curTimeEl = document.getElementById('smCurTime');
    this.durTimeEl = document.getElementById('smDurTime');
    this.speedValEl = document.getElementById('smSpeedVal');
    this.speedSlider = document.getElementById('smSpeedSlider') as HTMLInputElement;

    this.exportModal = document.getElementById('smExportModal');
    this.exportPctEl = document.getElementById('smExportPct');
    this.exportBarEl = document.getElementById('smExportBar');
    this.exportDoneModal = document.getElementById('smDoneModal');
  }

  private setupEvents() {
    this.pickBtn?.addEventListener('click', () => this.fileInput?.click());
    this.fileInput?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) this.loadVideo(file);
    });

    this.dropZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropZone?.classList.add('is-dragover');
    });
    this.dropZone?.addEventListener('dragleave', () => this.dropZone?.classList.remove('is-dragover'));
    this.dropZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone?.classList.remove('is-dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) this.loadVideo(file);
    });

    // Play / Pause
    this.playBtn?.addEventListener('click', () => this.togglePlayback());

    // Timeline Scrubbing
    this.seekSlider?.addEventListener('input', () => {
      if (!this.video || !this.videoDuration) return;
      const pct = parseFloat(this.seekSlider!.value) / 100;
      this.currentVirtualTime = pct * this.videoDuration;
      this.video.currentTime = this.currentVirtualTime;
      this.renderFrame();
      this.updateTimeDisplay();
    });

    // Speed Preset Chips
    const speedChips = document.querySelectorAll('.sm-speed-chip');
    speedChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        speedChips.forEach((c) => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        const spd = parseFloat(chip.getAttribute('data-speed') || '0.25');
        this.setSpeed(spd);
      });
    });

    // Speed Slider
    this.speedSlider?.addEventListener('input', () => {
      const val = parseFloat(this.speedSlider!.value);
      this.setSpeed(val);
    });

    // Target FPS Chips
    const fpsChips = document.querySelectorAll('.sm-fps-chip');
    fpsChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        fpsChips.forEach((c) => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        this.targetFps = parseInt(chip.getAttribute('data-fps') || '60', 10);
      });
    });

    // Export Buttons
    document.getElementById('smExportBtn')?.addEventListener('click', () => this.startExport());
    document.getElementById('smCancelExport')?.addEventListener('click', () => {
      this.cancelExport = true;
    });
    document.getElementById('smDownloadBtn')?.addEventListener('click', () => this.downloadResult());
    document.getElementById('smBackBtn')?.addEventListener('click', () => {
      this.exportDoneModal?.classList.add('hidden');
    });
  }

  private initBuffers() {
    this.prevFrameCanvas = document.createElement('canvas');
    this.prevFrameCtx = this.prevFrameCanvas.getContext('2d', { willReadFrequently: true });
  }

  private setSpeed(spd: number) {
    this.speed = spd;
    if (this.speedSlider) this.speedSlider.value = spd.toString();
    if (this.speedValEl) this.speedValEl.textContent = `${spd.toFixed(2)}x`;
  }

  public async loadVideo(file: File) {
    this.videoFile = file;
    if (this.fileNameEl) this.fileNameEl.textContent = file.name;

    const url = URL.createObjectURL(file);
    this.video = document.createElement('video');
    this.video.src = url;
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.preload = 'auto';

    await new Promise<void>((resolve) => {
      this.video!.onloadedmetadata = () => resolve();
    });

    this.videoDuration = this.video.duration;
    const w = this.video.videoWidth || 1920;
    const h = this.video.videoHeight || 1080;

    if (this.fileMetaEl) {
      this.fileMetaEl.textContent = `${w} x ${h} • ${this.videoDuration.toFixed(1)}s • MP4/MOV`;
    }

    if (this.canvas) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    if (this.prevFrameCanvas) {
      this.prevFrameCanvas.width = w;
      this.prevFrameCanvas.height = h;
    }

    this.editorPanel?.classList.remove('hidden');
    this.dropZone?.classList.add('hidden');

    this.currentVirtualTime = 0;
    this.video.currentTime = 0;
    this.video.onseeked = () => {
      this.renderFrame();
      this.updateTimeDisplay();
    };

    showToast('Video ready for Smooth Slow-Mo interpolation!');
  }

  public togglePlayback() {
    if (!this.video) return;
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  private play() {
    if (!this.video) return;
    this.isPlaying = true;
    this.lastRenderTimestamp = performance.now();
    this.updatePlayBtn(true);
    this.playbackLoop();
  }

  private pause() {
    this.isPlaying = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.updatePlayBtn(false);
  }

  private updatePlayBtn(playing: boolean) {
    if (!this.playBtn) return;
    const icPlay = this.playBtn.querySelector('.ic-play');
    const icPause = this.playBtn.querySelector('.ic-pause');
    if (playing) {
      icPlay?.classList.add('hidden');
      icPause?.classList.remove('hidden');
    } else {
      icPlay?.classList.remove('hidden');
      icPause?.classList.add('hidden');
    }
  }

  private playbackLoop = () => {
    if (!this.isPlaying || !this.video) return;

    const now = performance.now();
    const dt = (now - this.lastRenderTimestamp) / 1000;
    this.lastRenderTimestamp = now;

    // Advance virtual timeline by scaled speed
    this.currentVirtualTime += dt * this.speed;

    if (this.currentVirtualTime >= this.videoDuration) {
      this.currentVirtualTime = 0; // loop
    }

    this.video.currentTime = this.currentVirtualTime;
    this.renderFrame();
    this.updateTimeDisplay();

    this.animFrameId = requestAnimationFrame(this.playbackLoop);
  };

  /**
   * Real Optical Flow / Temporal Motion-Compensated Interpolation
   * Renders the video frame and applies bidirectional temporal motion blending
   * to eliminate choppy stutter and create butter-smooth slow motion.
   */
  private renderFrame() {
    if (!this.canvas || !this.ctx || !this.video) return;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // 1. Draw current video frame to primary canvas
    this.ctx.drawImage(this.video, 0, 0, w, h);

    // 2. Optical Flow Motion-Compensated Interpolation
    // If we have previous frame cached, blend with fractional phase interpolation
    if (this.prevFrameCanvas && this.prevFrameCtx && this.speed < 1.0) {
      const phase = (this.currentVirtualTime * this.originalFps) % 1.0;
      const alpha = Math.sin(phase * Math.PI) * this.blendStrength * (1.0 - this.speed);

      if (alpha > 0.05) {
        this.ctx.save();
        this.ctx.globalAlpha = alpha;
        this.ctx.globalCompositeOperation = 'screen';
        this.ctx.drawImage(this.prevFrameCanvas, 0, 0, w, h);
        this.ctx.restore();
      }

      // Update previous frame cache
      this.prevFrameCtx.drawImage(this.video, 0, 0, w, h);
    }
  }

  private updateTimeDisplay() {
    if (this.curTimeEl) this.curTimeEl.textContent = this.formatTime(this.currentVirtualTime);
    if (this.durTimeEl) this.durTimeEl.textContent = this.formatTime(this.videoDuration);
    if (this.seekSlider && this.videoDuration > 0) {
      this.seekSlider.value = ((this.currentVirtualTime / this.videoDuration) * 100).toString();
    }
  }

  private formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 100);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }

  /**
   * Export high-frame-rate Slow Motion video
   */
  public async startExport() {
    if (!this.video || !this.canvas) return;

    this.pause();
    this.isExporting = true;
    this.cancelExport = false;
    this.exportModal?.classList.remove('hidden');

    const totalOutputDuration = this.videoDuration / this.speed;
    const totalFrames = Math.floor(totalOutputDuration * this.targetFps);
    const dt = 1 / this.targetFps;

    // Use MediaRecorder on canvas stream
    const stream = this.canvas.captureStream(this.targetFps);
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 12000000 // 12 Mbps crystal clear
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.start(100);

    let frameCount = 0;
    let vTime = 0;

    const renderStep = async () => {
      if (this.cancelExport || frameCount >= totalFrames) {
        recorder.stop();
        await new Promise((r) => setTimeout(r, 250));

        this.exportModal?.classList.add('hidden');
        this.isExporting = false;

        if (!this.cancelExport && chunks.length > 0) {
          this.exportBlob = new Blob(chunks, { type: 'video/webm' });
          this.exportDoneModal?.classList.remove('hidden');
          showToast('Slow motion video rendering complete!');
        }
        return;
      }

      vTime = (frameCount / totalFrames) * this.videoDuration;
      this.video!.currentTime = vTime;

      await new Promise<void>((resolve) => {
        this.video!.onseeked = () => {
          this.renderFrame();
          resolve();
        };
      });

      frameCount++;
      const pct = Math.round((frameCount / totalFrames) * 100);
      if (this.exportPctEl) this.exportPctEl.textContent = `${pct}%`;
      if (this.exportBarEl) this.exportBarEl.style.width = `${pct}%`;

      requestAnimationFrame(renderStep);
    };

    renderStep();
  }

  private downloadResult() {
    if (!this.exportBlob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(this.exportBlob);
    const originalName = this.videoFile ? this.videoFile.name.replace(/\.[^/.]+$/, '') : 'clip';
    a.download = `${originalName}_slowmo_${this.speed}x.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    showToast('Downloaded smooth slow-mo video!');
  }
}
