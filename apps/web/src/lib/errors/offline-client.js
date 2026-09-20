try {
  const theme = localStorage.getItem('marl-theme') === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f7f6f3' : '#0d0d0f');
} catch {}

if ('serviceWorker' in navigator && !navigator.serviceWorker.controller) {
  const type = document.currentScript?.getAttribute('data-worker-type') === 'module' ? 'module' : 'classic';
  navigator.serviceWorker.register('/service-worker.js', { type }).catch(error => {
    console.warn('Could not save the offline page.', error);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('retry-page')?.addEventListener('click', () => {
    if (location.pathname === '/offline') location.replace('/');
    else location.reload();
  });
});
