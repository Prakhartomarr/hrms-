import { describe, expect, it } from 'vitest';
import { hashPassword, keyedHash, SecretBox, verifyPassword } from './crypto.js';
import { createMailer, sentMail } from './mail.js';
import { base32Decode, base32Encode, hotp, otpauthUrl, totp, verifyTotp } from './totp.js';

// RFC 6238 appendix B: the SHA-1 secret is the ASCII string "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP', () => {
  it('round-trips base32', () => {
    expect(RFC_SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(RFC_SECRET).toString()).toBe('12345678901234567890');
  });
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('matches the RFC 6238 vector at T=%d', (t, code) => {
    expect(totp(RFC_SECRET, t * 1000)).toBe(code);
  });
  it('accepts one step of drift either side, not two', () => {
    const now = 1_700_000_000_000;
    const counter = Math.floor(now / 30_000);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, counter - 1), now)).toBe(counter - 1);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, counter + 1), now)).toBe(counter + 1);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, counter + 2), now)).toBeNull();
  });
  it('builds an otpauth URL', () => {
    expect(otpauthUrl({ issuer: 'HRMS', account: 'a@b.co', secret: 'ABC' })).toMatch(/^otpauth:\/\/totp\/HRMS%3Aa%40b\.co\?secret=ABC&issuer=HRMS/);
  });
});

describe('crypto', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  it('hashes passwords with scrypt', async () => {
    const h = await hashPassword('correct-horse-battery');
    expect(await verifyPassword('correct-horse-battery', h)).toBe(true);
    expect(await verifyPassword('wrong', h)).toBe(false);
  });
  it('seals secrets', () => {
    const box = new SecretBox(key);
    expect(box.open(box.seal('ABCPE1234F'))).toBe('ABCPE1234F');
  });
  it('keyed hashes are stable and key-dependent', () => {
    expect(keyedHash(key, 'X')).toBe(keyedHash(key, 'X'));
    expect(keyedHash(key, 'X')).not.toBe(keyedHash(Buffer.alloc(32, 8).toString('base64'), 'X'));
  });
});

describe('mailer', () => {
  it('keeps messages in memory for tests', async () => {
    const m = createMailer({ smtpUrl: 'memory', from: 'x', log: () => {} });
    await m.send({ to: ['a@b.co'], subject: 'Hi', text: 'Body' });
    expect(sentMail.at(-1)?.subject).toBe('Hi');
  });
});
