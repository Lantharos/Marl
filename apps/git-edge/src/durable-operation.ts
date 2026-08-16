export type OperationStatus = 'queued' | 'running' | 'retrying' | 'completed';

export type DurableOperation<T> = {
  id: string;
  kind: string;
  payload: T;
  status: OperationStatus;
  attempts: number;
  createdAt: number;
  updatedAt: number;
  nextAttemptAt: number | null;
  lastError: string | null;
};

const OPERATION_KEY = 'operation';

export async function scheduleOperation<T>(storage: DurableObjectStorage, kind: string, id: string, payload: T, now = Date.now()) {
  const current = await storage.get<DurableOperation<T>>(OPERATION_KEY);
  if (current?.id === id && current.status !== 'completed') return current;
  const operation: DurableOperation<T> = { id, kind, payload, status: 'queued', attempts: 0, createdAt: now, updatedAt: now, nextAttemptAt: now, lastError: null };
  await storage.put(OPERATION_KEY, operation);
  await storage.setAlarm(now);
  return operation;
}

export async function beginOperation<T>(storage: DurableObjectStorage, now = Date.now()) {
  const current = await storage.get<DurableOperation<T>>(OPERATION_KEY);
  if (!current || current.status === 'completed') return null;
  const operation: DurableOperation<T> = { ...current, status: 'running', attempts: current.attempts + 1, updatedAt: now, nextAttemptAt: null };
  await storage.put(OPERATION_KEY, operation);
  return operation;
}

export async function completeOperation<T>(storage: DurableObjectStorage, id: string, now = Date.now()) {
  const current = await storage.get<DurableOperation<T>>(OPERATION_KEY);
  if (!current || current.id !== id) {
    await storage.setAlarm(now);
    return false;
  }
  await storage.put(OPERATION_KEY, { ...current, status: 'completed', updatedAt: now, nextAttemptAt: null, lastError: null });
  return true;
}

export async function retryOperation<T>(storage: DurableObjectStorage, id: string, error: unknown, delayMs: number, now = Date.now()) {
  const current = await storage.get<DurableOperation<T>>(OPERATION_KEY);
  if (!current || current.id !== id) {
    await storage.setAlarm(now);
    return false;
  }
  const nextAttemptAt = now + delayMs;
  await storage.put(OPERATION_KEY, { ...current, status: 'retrying', updatedAt: now, nextAttemptAt, lastError: error instanceof Error ? error.message : String(error) });
  await storage.setAlarm(nextAttemptAt);
  return true;
}

export function operationResponse(operation: DurableOperation<unknown> | undefined) {
  return Response.json({ operation: operation ?? null });
}

export async function readOperation<T>(storage: DurableObjectStorage) {
  return storage.get<DurableOperation<T>>(OPERATION_KEY);
}
