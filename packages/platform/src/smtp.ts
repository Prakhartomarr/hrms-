/**
 * A small SMTP client (RFC 5321) over node:net / node:tls: EHLO, STARTTLS when offered,
 * AUTH PLAIN, MAIL FROM / RCPT TO / DATA with dot-stuffing, QUIT. No dependencies.
 */
import { connect as netConnect, type Socket } from 'node:net';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import { addressOf, buildMessage, type MailMessage } from './mime.js';

export interface SmtpOptions {
  /** smtp://user:pass@host:587 or smtps://user:pass@host:465. */
  url: string;
  /** Name sent in EHLO. */
  clientName?: string;
  timeoutMs?: number;
  /** Tests: accept self-signed certificates. */
  rejectUnauthorized?: boolean;
}

export class SmtpError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(`SMTP ${code}: ${message}`);
    this.name = 'SmtpError';
  }
}

class Conn {
  private buf = '';
  private waiters: ((line: string) => void)[] = [];
  private lines: string[] = [];
  private failed?: Error;

  constructor(public socket: Socket | TLSSocket) {
    this.attach();
  }

  attach() {
    this.socket.setEncoding('utf8');
    this.socket.on('data', (d: string) => {
      this.buf += d;
      let i;
      while ((i = this.buf.indexOf('\r\n')) >= 0) {
        const line = this.buf.slice(0, i);
        this.buf = this.buf.slice(i + 2);
        const w = this.waiters.shift();
        if (w) w(line);
        else this.lines.push(line);
      }
    });
    this.socket.on('error', (e) => {
      this.failed = e;
      for (const w of this.waiters.splice(0)) w('');
    });
  }

  private line(): Promise<string> {
    if (this.failed) return Promise.reject(this.failed);
    const l = this.lines.shift();
    if (l !== undefined) return Promise.resolve(l);
    return new Promise((resolve, reject) =>
      this.waiters.push((x) => (this.failed ? reject(this.failed) : resolve(x))),
    );
  }

  /** Reads one (possibly multi-line) reply. */
  async reply(): Promise<{ code: number; lines: string[] }> {
    const lines: string[] = [];
    for (;;) {
      const l = await this.line();
      lines.push(l.slice(4));
      if (l[3] !== '-') return { code: Number(l.slice(0, 3)), lines };
    }
  }

  async cmd(command: string | null, expect: number[]): Promise<string[]> {
    if (command !== null) this.socket.write(`${command}\r\n`);
    const r = await this.reply();
    if (!expect.includes(r.code)) {
      throw new SmtpError(r.code, `${command?.split(' ')[0] ?? 'greeting'}: ${r.lines.join(' ')}`);
    }
    return r.lines;
  }
}

/** Escapes lines starting with "." (RFC 5321 4.5.2) and normalises line endings to CRLF. */
export function dotStuff(message: string): string {
  return message.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
}

export async function sendMail(
  opts: SmtpOptions,
  mail: MailMessage,
): Promise<{ accepted: string[] }> {
  const u = new URL(opts.url);
  const secure = u.protocol === 'smtps:';
  const port = Number(u.port || (secure ? 465 : 587));
  const host = u.hostname;
  const name = opts.clientName ?? 'localhost';
  const tlsOpts = { servername: host, rejectUnauthorized: opts.rejectUnauthorized ?? true };
  const socket: Socket = await new Promise((resolve, reject) => {
    const s = secure
      ? tlsConnect({ host, port, ...tlsOpts }, () => resolve(s))
      : netConnect({ host, port }, () => resolve(s));
    s.once('error', reject);
  });
  socket.setTimeout(opts.timeoutMs ?? 30_000, () => socket.destroy(new Error('SMTP timeout')));
  let conn = new Conn(socket);
  try {
    await conn.cmd(null, [220]);
    let caps = await conn.cmd(`EHLO ${name}`, [250]);
    if (!secure && caps.some((c) => /^STARTTLS\b/i.test(c))) {
      await conn.cmd('STARTTLS', [220]);
      socket.removeAllListeners('data');
      const tls: TLSSocket = await new Promise((resolve, reject) => {
        const t = tlsConnect({ socket, ...tlsOpts }, () => resolve(t));
        t.once('error', reject);
      });
      conn = new Conn(tls);
      caps = await conn.cmd(`EHLO ${name}`, [250]);
    }
    const user = decodeURIComponent(u.username);
    if (user) {
      if (!caps.some((c) => /^AUTH\b.*\bPLAIN\b/i.test(c)))
        throw new SmtpError(0, 'server does not offer AUTH PLAIN');
      const token = Buffer.from(`\0${user}\0${decodeURIComponent(u.password)}`).toString('base64');
      await conn.cmd(`AUTH PLAIN ${token}`, [235]);
    }
    await conn.cmd(`MAIL FROM:<${addressOf(mail.from)}>`, [250]);
    const accepted: string[] = [];
    for (const to of mail.to) {
      await conn.cmd(`RCPT TO:<${addressOf(to)}>`, [250, 251]);
      accepted.push(addressOf(to));
    }
    await conn.cmd('DATA', [354]);
    conn.socket.write(`${dotStuff(buildMessage(mail)).replace(/\r\n$/, '')}\r\n.\r\n`);
    await conn.cmd(null, [250]);
    await conn.cmd('QUIT', [221]).catch(() => {});
    return { accepted };
  } finally {
    conn.socket.destroy();
  }
}
