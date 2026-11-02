import './style.css';
import { initCursor } from './components/cursor';
import { initStarfield } from './components/starfield';
import { initLoader } from './components/loader';
import { initTimelineScrubber } from './components/timelineScrubber';
import { initProgramMonitor } from './components/programMonitor';
import { router } from './router';
import { BeatMarkerTool } from './tools/beatMarker';
import { AudioStudioTool } from './tools/audioStudio';
import { QualityBoostTool } from './tools/qualityBoost';
import { SlowMoTool } from './tools/slowMo';
import { AeConverterTool } from './tools/aeConverter';
import { ExpressionGeneratorTool } from './tools/expressionGenerator';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Visual Infrastructure
  initCursor();
  initStarfield();
  initLoader();
  initTimelineScrubber();
  initProgramMonitor();

  // 2. Cookie / Local Storage Banner
  const cookieBanner = document.getElementById('cookieBanner');
  const cookieAccept = document.getElementById('cookieAccept');
  if (cookieBanner && cookieAccept) {
    const isAccepted = localStorage.getItem('ep_cookie_accepted');
    if (!isAccepted) {
      cookieBanner.classList.remove('hidden');
    }
    cookieAccept.addEventListener('click', () => {
      localStorage.setItem('ep_cookie_accepted', '1');
      cookieBanner.classList.add('hidden');
    });
  }

  // 3. Instantiate Tools
  const beatMarker = new BeatMarkerTool();
  beatMarker.init();

  const audioStudio = new AudioStudioTool(beatMarker);
  audioStudio.init();

  const qualityBoost = new QualityBoostTool();
  qualityBoost.init();

  const slowMo = new SlowMoTool();
  slowMo.init();

  const aeConverter = new AeConverterTool();
  aeConverter.init();

  const expressionGen = new ExpressionGeneratorTool();
  expressionGen.init();

  // 4. Initialize History Router
  router.init();

  // 5. Scroll Reveal Observer for [data-reveal]
  const revealElements = document.querySelectorAll('[data-reveal]');
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  revealElements.forEach((el) => revealObserver.observe(el));
});
