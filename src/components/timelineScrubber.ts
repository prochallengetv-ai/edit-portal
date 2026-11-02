export function initTimelineScrubber() {
  const tlFill = document.getElementById('tlFill');
  const tlNow = document.getElementById('tlNow');
  const scrollBar = document.getElementById('scrollProgress');
  const clips = Array.from(document.querySelectorAll('.tl-clip')) as HTMLElement[];
  const navTabs = Array.from(document.querySelectorAll('.nav-tab[data-spy]')) as HTMLElement[];

  // Helper pad
  function pad(n: number, s = 2) {
    return n.toString().padStart(s, '0');
  }

  // Timecode mapping: total 80 seconds = 01:20:00 at 24fps
  function getTimecodeFromProgress(progress: number): string {
    const totalFrames = Math.floor(progress * 80 * 24);
    const ff = totalFrames % 24;
    const totalSecs = Math.floor(totalFrames / 24);
    const ss = totalSecs % 60;
    const mm = Math.floor(totalSecs / 60);
    return `00:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
  }

  function onScroll() {
    const homeView = document.getElementById('home');
    if (!homeView || homeView.classList.contains('hidden')) return;

    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const currentScroll = window.scrollY;
    const progress = maxScroll > 0 ? Math.min(Math.max(currentScroll / maxScroll, 0), 1) : 0;

    // Update global scroll bar
    if (scrollBar) {
      scrollBar.style.width = `${progress * 100}%`;
    }

    // Update timeline dock fill
    if (tlFill) {
      tlFill.style.height = `${progress * 100}%`;
    }

    // Update timeline timecode
    if (tlNow) {
      tlNow.textContent = getTimecodeFromProgress(progress);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Smooth scroll click on timeline clips
  clips.forEach((clip) => {
    clip.addEventListener('click', () => {
      const targetId = clip.getAttribute('data-target');
      if (!targetId) return;
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // IntersectionObserver for Section Active States & Stats Reveal
  const sectionIds = ['hero', 'tools', 'portal', 'why', 'story', 'contact'];
  const sections = sectionIds.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const currentId = entry.target.id;

          // Update timeline clips
          clips.forEach((c) => {
            if (c.getAttribute('data-target') === currentId) {
              c.classList.add('is-active');
            } else {
              c.classList.remove('is-active');
            }
          });

          // Update navbar tabs
          navTabs.forEach((tab) => {
            if (tab.getAttribute('data-spy') === currentId) {
              tab.classList.add('is-active');
            } else {
              tab.classList.remove('is-active');
            }
          });
        }
      });
    },
    { threshold: 0.3 }
  );

  sections.forEach((sec) => observer.observe(sec));

  // Stats number counter animation
  const statsEl = document.getElementById('stats');
  let animatedStats = false;

  if (statsEl) {
    const statsObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !animatedStats) {
          animatedStats = true;
          animateNumbers();
        }
      },
      { threshold: 0.25 }
    );
    statsObserver.observe(statsEl);
  }

  function animateNumbers() {
    const statNums = document.querySelectorAll('.stats-num');
    const duration = 1600;
    const start = performance.now();

    function easeOutCubic(t: number): number {
      return 1 - Math.pow(1 - t, 3);
    }

    function tick() {
      const now = performance.now();
      const p = Math.min((now - start) / duration, 1);
      const ease = easeOutCubic(p);

      statNums.forEach((el) => {
        const target = parseFloat(el.getAttribute('data-count') || '0');
        const decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
        const suffix = el.getAttribute('data-suffix') || '';
        const currentVal = (target * ease).toFixed(decimals);
        el.textContent = currentVal + suffix;
      });

      if (p < 1) {
        requestAnimationFrame(tick);
      }
    }

    requestAnimationFrame(tick);
  }
}
