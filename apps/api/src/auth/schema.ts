import { authUser as user, authSession as session, authAccount as account, authVerification as verification, authPasskey as passkey, authTwoFactor as twoFactor, authRateLimit as rateLimit } from '../db/schema/auth';

export const authSchema = { user, session, account, verification, passkey, twoFactor, rateLimit };
