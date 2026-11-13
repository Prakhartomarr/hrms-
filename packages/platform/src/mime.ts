/** RFC 5322 / MIME message building: UTF-8 headers, text + HTML alternatives, attachments. */
import { randomBytes } from 'node:crypto';

export interface Attachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface MailMessage {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: Attachment[];
}

/** RFC 2047 encoded-word for non-ASCII header values. */
export function encodeHeader(v: string): string {
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, 'utf8').toString('base64')}?=`;
}

/** Bare address from `Name <a@b>` or `a@b`. */
export function addressOf(v: string): string {
  return (/<([^>]+)>/.exec(v)?.[1] ?? v).trim();
}

const b64 = (b: Buffer) => b.toString('base64').replace(/.{76}/g, '$&\r\n');

/** The full message with CRLF line endings, ready for SMTP DATA (before dot-stuffing). */
export function buildMessage(
  m: MailMessage,
  opts: { date?: Date; messageId?: string } = {},
): string {
  const boundary = (tag: string) => `=_${tag}_${randomBytes(12).toString('hex')}`;
  const domain = addressOf(m.from).split('@')[1] ?? 'localhost';
  const headers = [
    `From: ${m.from.replace(/^([^<]+)</, (_, name: string) => `${encodeHeader(name.trim())} <`)}`,
    `To: ${m.to.join(', ')}`,
    `Subject: ${encodeHeader(m.subject)}`,
    `Date: ${(opts.date ?? new Date()).toUTCString()}`,
    `Message-ID: <${opts.messageId ?? randomBytes(16).toString('hex')}@${domain}>`,
    'MIME-Version: 1.0',
  ];
  const textPart = [
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(Buffer.from(m.text, 'utf8')),
  ].join('\r\n');
  let body: string[];
  let contentType: string;
  if (m.html) {
    const alt = boundary('alt');
    const htmlPart = [
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64(Buffer.from(m.html, 'utf8')),
    ].join('\r\n');
    body = [`--${alt}`, textPart, `--${alt}`, htmlPart, `--${alt}--`];
    contentType = `multipart/alternative; boundary="${alt}"`;
  } else {
    body = [textPart.split('\r\n').slice(3).join('\r\n')];
    contentType = 'text/plain; charset=utf-8';
  }
  if (m.attachments?.length) {
    const mixed = boundary('mixed');
    const inner = [
      `Content-Type: ${contentType}`,
      ...(m.html ? [] : ['Content-Transfer-Encoding: base64']),
      '',
      ...body,
    ].join('\r\n');
    const parts = m.attachments.map((a) =>
      [
        `Content-Type: ${a.contentType}; name="${encodeHeader(a.filename)}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${encodeHeader(a.filename)}"`,
        '',
        b64(a.content),
      ].join('\r\n'),
    );
    body = [`--${mixed}`, inner, ...parts.flatMap((p) => [`--${mixed}`, p]), `--${mixed}--`];
    contentType = `multipart/mixed; boundary="${mixed}"`;
    return [...headers, `Content-Type: ${contentType}`, '', ...body, ''].join('\r\n');
  }
  return [
    ...headers,
    `Content-Type: ${contentType}`,
    ...(m.html ? [] : ['Content-Transfer-Encoding: base64']),
    '',
    ...body,
    '',
  ].join('\r\n');
}
