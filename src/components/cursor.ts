export function initCursor() {
  const cursor = document.getElementById('cursor');
  const follower = document.getElementById('cursor-follower');
  if (!cursor || !follower) return;

  // Touch screen check
  if (window.matchMedia('(hover: none) or (pointer: coarse)').matches) {
    cursor.style.display = 'none';
    follower.style.display = 'none';
    return;
  }

  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let followerX = mouseX;
  let followerY = mouseY;
  let isHovered = false;

  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    cursor.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
  });

  const interactiveSelector = 'a, button, input, select, textarea, .tcard, .edit-play, .minimap-track, .waveform-canvas-wrap, .qb-viewport';
  
  document.addEventListener('mouseover', (e) => {
    const target = (e.target as HTMLElement)?.closest(interactiveSelector);
    if (target) {
      isHovered = true;
      follower.classList.add('is-hover');
    }
  });

  document.addEventListener('mouseout', (e) => {
    const target = (e.target as HTMLElement)?.closest(interactiveSelector);
    if (target) {
      isHovered = false;
      follower.classList.remove('is-hover');
    }
  });

  function render() {
    // Lerp factor
    const ease = 0.18;
    followerX += (mouseX - followerX) * ease;
    followerY += (mouseY - followerY) * ease;

    follower.style.transform = `translate3d(${followerX}px, ${followerY}px, 0) translate(-50%, -50%)`;
    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
}
