/**
 * Outgoing email. Transport from config: `SMTP_URL=smtp://...` sends over SMTP (development
 * points at Mailpit), `SMTP_URL=memory` keeps messages in `sentMail` (tests), unset writes them
 * to the log so nothing is lost in a fresh checkout.
 */
import { sendMail } from './smtp.js';

export interface OutgoingMail {
  to: string[];
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  readonly transport: 'smtp' | 'log' | 'memory';
  send(mail: OutgoingMail): Promise<void>;
}

/** Messages sent through the memory transport, newest last. */
export const sentMail: OutgoingMail[] = [];

export function createMailer(opts: { smtpUrl?: string | undefined; from: string; log: (obj: object, msg: string) => void }): Mailer {
  const url = opts.smtpUrl?.trim();
  if (url === 'memory') {
    return {
      transport: 'memory',
      async send(m) {
        sentMail.push(m);
      },
    };
  }
  if (!url) {
    return {
      transport: 'log',
      async send(m) {
        opts.log({ to: m.to, subject: m.subject }, `email (log transport, SMTP_URL not set):\n${m.text}`);
      },
    };
  }
  return {
    transport: 'smtp',
    async send(m) {
      await sendMail({ url }, { ...m, from: opts.from });
    },
  };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Plain, calm email body: a short paragraph and one link. */
export function simpleEmail(opts: { product: string; heading: string; body: string; linkText?: string; link?: string }): { text: string; html: string } {
  const text = [opts.heading, '', opts.body, ...(opts.link ? ['', `${opts.linkText ?? 'Open'}: ${opts.link}`] : []), '', `— ${opts.product}`].join('\n');
  const html = `<div style="font-family:system-ui,sans-serif;color:#1e1e1e;line-height:1.5;max-width:520px">
<h2 style="font-size:18px;font-weight:600;margin:0 0 16px">${escapeHtml(opts.heading)}</h2>
<p style="margin:0 0 16px">${escapeHtml(opts.body)}</p>
${opts.link ? `<p style="margin:0 0 24px"><a href="${escapeHtml(opts.link)}" style="background:#1f4fd8;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none">${escapeHtml(opts.linkText ?? 'Open')}</a></p>` : ''}
<p style="color:#5c5c5c;font-size:13px;margin:0">${escapeHtml(opts.product)}</p></div>`;
  return { text, html };
}
