type Method = 'passkey' | 'totp' | 'password';

export class IdentityConfirmation {
  open = $state(false);
  method = $state<Method | null>(null);
  busy = $state(false);
  error = $state('');
  description = $state('Confirm this sensitive account change before continuing.');
  private finish: ((confirmed: boolean) => void) | null = null;

  confirm = async (description: string) => {
    if (this.busy || this.open) return false;
    this.busy = true;
    this.error = '';
    this.description = description;
    try {
      const response = await fetch('/api/auth/step-up/method', { headers: { accept: 'application/json' } });
      const result = await response.json().catch(() => null) as { method?: Method; message?: string } | null;
      if (!response.ok || !result?.method) throw new Error(result?.message || 'Identity confirmation is not available.');
      this.method = result.method;
      this.open = true;
      return await new Promise<boolean>((resolve) => (this.finish = resolve));
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : 'Identity confirmation is not available.';
      return false;
    } finally {
      this.busy = false;
    }
  };

  close = () => {
    this.finish?.(false);
    this.finish = null;
    this.open = false;
    this.method = null;
  };

  continue = () => {
    this.finish?.(true);
    this.finish = null;
  };
}
