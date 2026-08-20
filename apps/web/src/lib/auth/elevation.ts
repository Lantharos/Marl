type ElevationHandler = (description: string) => Promise<boolean>;

let handler: ElevationHandler | null = null;
let pending: Promise<boolean> | null = null;

export function registerElevationHandler(next: ElevationHandler) {
  handler = next;
  return () => {
    if (handler === next) handler = null;
  };
}

export function requestElevation(description: string) {
  if (!handler) return Promise.resolve(false);
  if (!pending) pending = handler(description).finally(() => (pending = null));
  return pending;
}
