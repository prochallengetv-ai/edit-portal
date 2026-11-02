export function initProgramMonitor() {
  const monitor = document.getElementById('monitor');
  if (!monitor) return;

  const video = document.getElementById('promoVideo') as HTMLVideoElement;
  const canvas = document.getElementById('promoCanvas') as HTMLCanvasElement;
  const playBtn = document.getElementById('promoPlay');
  const soundBtn = document.getElementById('promoSound');
  const fullBtn = document.getElementById('promoFull');
  const scrubTrack = document.getElementById('promoScrub');
  const scrubFill = document.getElementById('promoFill');
  const scrubHead = document.getElementById('promoHead');
  const tcEl = document.getElementById('promoTc');
  const soundTxt = document.querySelector('.monitor-sound-txt');
  const icMuted = document.querySelector('.ic-muted');
  const icSound = document.querySelector('.ic-sound');
  const icPlay = playBtn?.querySelector('.ic-play');
  const icPause = playBtn?.querySelector('.ic-pause');

  let isPlaying = false;
  let isMuted = true;
  let currentTimeSec = 0;
  const totalDurationSec = 80; // 00:01:20:00
  const fps = 23.976;
  let lastTimestamp = performance.now();

  // Helper pad
  function pad(n: number, s = 2) {
    return Math.floor(n).toString().padStart(s, '0');
  }

  function formatTimecode(sec: number): string {
    const totalFrames = Math.floor(sec * fps);
    const ff = totalFrames % 24;
    const totalSecs = Math.floor(totalFrames / fps);
    const ss = totalSecs % 60;
    const totalMins = Math.floor(totalSecs / 60);
    const mm = totalMins % 60;
    const hh = Math.floor(totalMins / 60);
    return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
  }

  // --- Synthetic NLE Canvas Visual Generator ---
  const ctx = canvas.getContext('2d');
  function resizeCanvas() {
    if (!canvas) return;
    canvas.width = canvas.parentElement?.clientWidth || 640;
    canvas.height = canvas.parentElement?.clientHeight || 360;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  let animFrameId: number;

  function renderSyntheticNleFrame(time: number) {
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    // Background gradient pulse
    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    bgGrad.addColorStop(0, '#060710');
    bgGrad.addColorStop(0.5, '#0e1122');
    bgGrad.addColorStop(1, '#080914');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Grid lines (motion design grid)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    const step = 40;
    for (let x = 0; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Dynamic Central Waveform Visualizer
    const cy = h / 2;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    const bars = 80;
    for (let i = 0; i < bars; i++) {
      const bx = (i / bars) * w;
      const freq = 0.05 + (i % 5) * 0.03;
      const amp = Math.sin(time * 4 + i * 0.2) * 45 + Math.cos(time * 8 + i * 0.1) * 25;
      ctx.lineTo(bx, cy + amp);
    }
    ctx.strokeStyle = 'rgba(223, 113, 220, 0.8)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#f15aa9';
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Second cyan waveform
    ctx.beginPath();
    ctx.moveTo(0, cy);
    for (let i = 0; i < bars; i++) {
      const bx = (i / bars) * w;
      const amp = Math.cos(time * 3 + i * 0.3) * 30 + Math.sin(time * 6 + i * 0.15) * 15;
      ctx.lineTo(bx, cy + amp);
    }
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Central Title / Glitch Text overlay
    ctx.font = `700 ${Math.floor(w * 0.055)}px Bebas Neue, Michroma, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Chromatic aberration glitch text
    const glitchOffset = Math.sin(time * 12) > 0.85 ? 4 : 0;
    if (glitchOffset > 0) {
      ctx.fillStyle = 'rgba(244, 63, 94, 0.8)';
      ctx.fillText('EDIT PORTAL // STUDIO WORKSTATION', w / 2 - glitchOffset, cy - 60);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.8)';
      ctx.fillText('EDIT PORTAL // STUDIO WORKSTATION', w / 2 + glitchOffset, cy - 60);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillText('EDIT PORTAL // STUDIO WORKSTATION', w / 2, cy - 60);

    // Audio frequency spectrum bars at bottom
    const specBars = 36;
    const barWidth = (w * 0.6) / specBars;
    const startX = w * 0.2;
    for (let i = 0; i < specBars; i++) {
      const barH = (Math.sin(time * 8 + i * 0.8) * 0.5 + 0.5) * 60 + 8;
      const grad = ctx.createLinearGradient(0, h - 30 - barH, 0, h - 30);
      grad.addColorStop(0, '#f15aa9');
      grad.addColorStop(1, '#b691ff');
      ctx.fillStyle = grad;
      ctx.fillRect(startX + i * (barWidth + 2), h - 30 - barH, barWidth, barH);
    }
  }

  function loop(now: number) {
    const delta = (now - lastTimestamp) / 1000;
    lastTimestamp = now;

    if (isPlaying) {
      currentTimeSec += delta;
      if (currentTimeSec >= totalDurationSec) {
        currentTimeSec = 0;
      }
      updateUI();
    }

    renderSyntheticNleFrame(currentTimeSec);
    animFrameId = requestAnimationFrame(loop);
  }

  function updateUI() {
    const progress = currentTimeSec / totalDurationSec;
    if (scrubFill) scrubFill.style.width = `${progress * 100}%`;
    if (scrubHead) scrubHead.style.left = `${progress * 100}%`;
    if (tcEl) tcEl.textContent = formatTimecode(currentTimeSec);
  }

  // Play / Pause Toggle
  function togglePlay() {
    isPlaying = !isPlaying;
    if (isPlaying) {
      icPlay?.classList.add('hidden');
      icPause?.classList.remove('hidden');
    } else {
      icPlay?.classList.remove('hidden');
      icPause?.classList.add('hidden');
    }
  }

  playBtn?.addEventListener('click', togglePlay);

  // Mute Toggle
  soundBtn?.addEventListener('click', () => {
    isMuted = !isMuted;
    if (isMuted) {
      icMuted?.classList.remove('hidden');
      icSound?.classList.add('hidden');
      if (soundTxt) soundTxt.textContent = 'MUTED';
    } else {
      icMuted?.classList.add('hidden');
      icSound?.classList.remove('hidden');
      if (soundTxt) soundTxt.textContent = 'STEREO';
    }
  });

  // Fullscreen
  fullBtn?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      monitor.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  });

  // Scrubber Dragging & Clicking
  let isScrubbing = false;
  function handleScrub(e: MouseEvent) {
    if (!scrubTrack) return;
    const rect = scrubTrack.getBoundingClientRect();
    const pos = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    currentTimeSec = pos * totalDurationSec;
    updateUI();
  }

  scrubTrack?.addEventListener('mousedown', (e) => {
    isScrubbing = true;
    handleScrub(e);
  });

  window.addEventListener('mousemove', (e) => {
    if (isScrubbing) handleScrub(e);
  });

  window.addEventListener('mouseup', () => {
    if (isScrubbing) isScrubbing = false;
  });

  // Spacebar toggle when not typing in an input
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag !== 'input' && activeTag !== 'textarea') {
        const homeView = document.getElementById('home');
        if (homeView && !homeView.classList.contains('hidden')) {
          e.preventDefault();
          togglePlay();
        }
      }
    }
  });

  // Start animation loop
  isPlaying = true;
  icPlay?.classList.add('hidden');
  icPause?.classList.remove('hidden');
  animFrameId = requestAnimationFrame(loop);

  // --- Reel Cards in Story Section (#story) ---
  const reelCards = document.querySelectorAll('.edit-card');
  reelCards.forEach((card, idx) => {
    const reelCanvas = card.querySelector('.edit-canvas') as HTMLCanvasElement;
    const reelPlayBtn = card.querySelector('.edit-play');
    if (!reelCanvas) return;

    const rCtx = reelCanvas.getContext('2d');
    let reelPlaying = false;
    let reelTime = idx * 1.5;

    function renderReel() {
      if (!rCtx) return;
      reelCanvas.width = 360;
      reelCanvas.height = 640;
      const rw = reelCanvas.width;
      const rh = reelCanvas.height;

      // Dark background
      rCtx.fillStyle = '#06070e';
      rCtx.fillRect(0, 0, rw, rh);

      // Cyber lines & gradient pulses
      const rGrad = rCtx.createRadialGradient(
        rw / 2 + Math.sin(reelTime * 2) * 50,
        rh / 2 + Math.cos(reelTime * 2) * 80,
        10,
        rw / 2,
        rh / 2,
        rw
      );
      if (idx === 0) {
        rGrad.addColorStop(0, 'rgba(182, 145, 255, 0.45)');
        rGrad.addColorStop(1, 'rgba(6, 7, 14, 0.95)');
      } else if (idx === 1) {
        rGrad.addColorStop(0, 'rgba(241, 90, 169, 0.45)');
        rGrad.addColorStop(1, 'rgba(6, 7, 14, 0.95)');
      } else {
        rGrad.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
        rGrad.addColorStop(1, 'rgba(6, 7, 14, 0.95)');
      }
      rCtx.fillStyle = rGrad;
      rCtx.fillRect(0, 0, rw, rh);

      // Animated geometric cuts & beats
      rCtx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      rCtx.lineWidth = 2;
      const scale = 1 + Math.sin(reelTime * 6) * 0.15;
      rCtx.save();
      rCtx.translate(rw / 2, rh / 2);
      rCtx.scale(scale, scale);
      rCtx.rotate(reelTime * 0.4);
      rCtx.strokeRect(-60, -60, 120, 120);
      rCtx.restore();

      if (reelPlaying) {
        reelTime += 0.03;
      }
      requestAnimationFrame(renderReel);
    }

    renderReel();

    reelPlayBtn?.addEventListener('click', () => {
      reelPlaying = !reelPlaying;
      if (reelPlayBtn) {
        reelPlayBtn.innerHTML = reelPlaying
          ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`
          : `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
      }
    });
  });
}
