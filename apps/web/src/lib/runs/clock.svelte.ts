import { createSubscriber } from 'svelte/reactivity';

const subscribe = createSubscriber((update) => {
  const timer = setInterval(update, 1000);
  return () => clearInterval(timer);
});

export function ticking(active: boolean) {
  if (active) subscribe();
  return Date.now();
}
