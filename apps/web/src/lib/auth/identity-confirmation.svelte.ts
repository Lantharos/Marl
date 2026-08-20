type Method = 'passkey' | 'totp' | 'password';

export class IdentityConfirmation {
  open = $state(false);
  method = $state<Method | null>(null);
  busy = $state(false);
  error = $state('');
  private pendingAction: (() => Promise<void>) | null = null;

  request = async (action: () => Promise<void>) => {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    try {
      const response = await fetch('/api/auth/step-up/method', { headers: { accept: 'application/json' } });
      const result = await response.json().catch(() => null) as { method?: Method; message?: string } | null;
      if (!response.ok || !result?.method) throw new Error(result?.message || 'Identity confirmation is not available.');
      this.method = result.method;
      this.pendingAction = action;
      this.open = true;
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : 'Identity confirmation is not available.';
    } finally {
      this.busy = false;
    }
  };

  close = () => {
    this.open = false;
    this.method = null;
    this.pendingAction = null;
  };

  continue = async () => {
    const action = this.pendingAction;
    this.pendingAction = null;
    this.method = null;
    if (action) await action();
  };
}
