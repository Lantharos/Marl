import type { Env } from './platform';

type TransactionalEmail = {
  recipient: string;
  subject: string;
  heading: string;
  body: string;
  actionLabel: string;
  actionUrl: string;
};

type OutgoingEmail = {
  recipient: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
};

export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function emailButton(label: string, url: string) {
  return `<a href="${escapeHtml(url)}" style="display:inline-block;padding:11px 16px;border-radius:6px;background:#ef7657;color:#fff;font-size:14px;font-weight:700;text-decoration:none">${escapeHtml(label)}</a>`;
}

export function emailLayout(heading: string, content: string, footer: string) {
  return `<!doctype html><html><body style="margin:0;background:#0d0d0f;color:#f4f1ed;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:48px 24px"><div style="width:16px;height:16px;margin-bottom:32px;background:#ef7657"></div><h1 style="margin:0 0 14px;font-size:24px;line-height:1.25">${escapeHtml(heading)}</h1>${content}<p style="margin:30px 0 0;color:#77726e;font-size:12px;line-height:1.5">${footer}</p></div></body></html>`;
}

export async function sendEmail(env: Env, email: OutgoingEmail) {
  if (env.ENVIRONMENT === 'development') {
    console.info(`[email] ${email.subject} for ${email.recipient}\n${email.text}`);
    return;
  }
  if (!env.EMAIL) throw new Error('Cloudflare Email Service is not configured.');
  await env.EMAIL.send({
    to: email.recipient,
    from: { name: 'Marl', email: env.EMAIL_FROM ?? 'noreply@marl.sh' },
    subject: email.subject,
    text: email.text,
    html: email.html,
    headers: email.headers
  });
}

export function sendTransactionalEmail(env: Env, email: TransactionalEmail) {
  return sendEmail(env, {
    recipient: email.recipient,
    subject: email.subject,
    text: `${email.heading}\n\n${email.body}\n\n${email.actionLabel}: ${email.actionUrl}`,
    html: emailLayout(
      email.heading,
      `<p style="margin:0 0 28px;color:#aaa5a0;font-size:15px;line-height:1.6">${escapeHtml(email.body)}</p>${emailButton(email.actionLabel, email.actionUrl)}`,
      'If you did not request this, you can ignore this email.'
    )
  });
}
