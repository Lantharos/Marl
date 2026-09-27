import type { Env } from './platform';

type TransactionalEmail = {
  recipient: string;
  subject: string;
  heading: string;
  body: string;
  actionLabel: string;
  actionUrl: string;
};

export async function sendTransactionalEmail(env: Env, email: TransactionalEmail) {
  if (env.ENVIRONMENT === 'development') {
    console.info(`[email] ${email.subject} for ${email.recipient}: ${email.actionUrl}`);
    return;
  }
  if (!env.EMAIL) throw new Error('Cloudflare Email Service is not configured.');
  await env.EMAIL.send({
    to: email.recipient,
    from: { name: 'Marl', email: env.EMAIL_FROM ?? 'noreply@marl.sh' },
    subject: email.subject,
    text: `${email.heading}\n\n${email.body}\n\n${email.actionLabel}: ${email.actionUrl}`,
    html: emailHtml(email)
  });
}

function emailHtml(email: TransactionalEmail) {
  const heading = escapeHtml(email.heading);
  const body = escapeHtml(email.body);
  const label = escapeHtml(email.actionLabel);
  const url = escapeHtml(email.actionUrl);
  return `<!doctype html><html><body style="margin:0;background:#0d0d0f;color:#f4f1ed;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:48px 24px"><div style="width:16px;height:16px;margin-bottom:32px;background:#ef7657"></div><h1 style="margin:0 0 14px;font-size:24px;line-height:1.25">${heading}</h1><p style="margin:0 0 28px;color:#aaa5a0;font-size:15px;line-height:1.6">${body}</p><a href="${url}" style="display:inline-block;padding:11px 16px;border-radius:6px;background:#ef7657;color:#fff;font-size:14px;font-weight:700;text-decoration:none">${label}</a><p style="margin:30px 0 0;color:#77726e;font-size:12px;line-height:1.5">If you did not request this, you can ignore this email.</p></div></body></html>`;
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
