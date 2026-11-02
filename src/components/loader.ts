export function initLoader() {
  const loader = document.getElementById('loader');
  if (!loader) return;

  const seen = sessionStorage.getItem('ep_intro_seen');
  if (seen === '1') {
    loader.style.display = 'none';
    return;
  }

  const progressEl = document.getElementById('loader-progress');
  const tcEl = document.getElementById('loaderTc');
  const durationMs = 1800;
  const fps = 24;
  const startTime = performance.now();

  function pad(num: number, size = 2): string {
    let s = num.toString();
    while (s.length < size) s = '0' + s;
    return s;
  }

  function formatTimecode(seconds: number): string {
    const totalFrames = Math.floor(seconds * fps);
    const ff = totalFrames % fps;
    const totalSecs = Math.floor(totalFrames / fps);
    const ss = totalSecs % 60;
    const totalMins = Math.floor(totalSecs / 60);
    const mm = totalMins % 60;
    const hh = Math.floor(totalMins / 60);
    return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
  }

  function update() {
    const now = performance.now();
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / durationMs, 1);

    if (progressEl) {
      progressEl.style.left = `${progress * 100}%`;
    }

    if (tcEl) {
      // Map 1.8s progress to 0 to 4.5 seconds of timeline timecode
      const simulatedSeconds = progress * 4.5;
      tcEl.textContent = formatTimecode(simulatedSeconds);
    }

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      // Glitch / flash trigger then open shutters
      if (tcEl) tcEl.textContent = '00:00:04:12';
      setTimeout(() => {
        loader?.classList.add('is-finished');
        sessionStorage.setItem('ep_intro_seen', '1');
        setTimeout(() => {
          if (loader) loader.style.display = 'none';
        }, 700);
      }, 150);
    }
  }

  requestAnimationFrame(update);
}
