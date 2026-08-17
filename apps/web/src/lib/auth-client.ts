import { passkeyClient } from '@better-auth/passkey/client';
import { createAuthClient } from 'better-auth/svelte';
import { genericOAuthClient, twoFactorClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [passkeyClient(), twoFactorClient({ twoFactorPage: '/two-factor' }), genericOAuthClient()]
});
