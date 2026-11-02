export function initStarfield() {
  const canvas = document.querySelector('.starfield') as HTMLCanvasElement;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const starCount = Math.floor((width * height) / 9000);
  const stars: { x: number; y: number; r: number; alpha: number; speed: number; pulse: number }[] = [];

  for (let i = 0; i < starCount; i++) {
    stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 1.3 + 0.4,
      alpha: Math.random() * 0.7 + 0.2,
      speed: Math.random() * 0.2 + 0.05,
      pulse: Math.random() * Math.PI * 2
    });
  }

  function animate() {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      s.pulse += 0.02;
      const currentAlpha = s.alpha * (0.6 + 0.4 * Math.sin(s.pulse));

      ctx.fillStyle = `rgba(223, 113, 220, ${currentAlpha * 0.4})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * 1.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(255, 255, 255, ${currentAlpha})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();

      s.y -= s.speed;
      if (s.y < 0) {
        s.y = height;
        s.x = Math.random() * width;
      }
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}
