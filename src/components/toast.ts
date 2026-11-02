let toastTimeout: number | null = null;

export function showToast(message: string, duration = 2800) {
  const toastEl = document.getElementById('toast');
  if (!toastEl) return;

  toastEl.textContent = message;
  toastEl.classList.add('show');

  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }

  toastTimeout = window.setTimeout(() => {
    toastEl.classList.remove('show');
    toastTimeout = null;
  }, duration);
}
