const theme = /(?:^|; )marl-theme=(light|dark)(?:;|$)/.exec(document.cookie)?.[1];
if (theme) document.documentElement.dataset.theme = theme;

if ('serviceWorker' in navigator && !navigator.serviceWorker.controller) {
  const type = document.currentScript?.getAttribute('data-worker-type') === 'module' ? 'module' : 'classic';
  navigator.serviceWorker.register('/service-worker.js', { type }).catch((error) => {
    console.warn('Could not save the offline page.', error);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('retry-page')?.addEventListener('click', () => {
    if (location.pathname === '/offline') location.replace('/');
    else location.reload();
  });
});
