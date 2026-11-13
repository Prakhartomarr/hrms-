import { randomUUID } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { unauthorized } from './errors.js';

export interface AccessClaims {
  userId: string;
  tenantId: string;
  /** The sign-in this token belongs to; ending the session ends the token within seconds. */
  sessionId: string;
}

export interface RefreshClaims {
  userId: string;
  tenantId: string;
  tokenId: string;
}

/** Half-way through sign-in: the password was right, a second factor is still owed. */
export interface MfaClaims {
  userId: string;
  tenantId: string;
  purpose: 'verify' | 'setup';
}

export interface TokenOptions {
  secret: string;
  issuer: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
}

const MFA_TTL_SECONDS = 600;

/**
 * JWT access tokens (short-lived, stateless; standing re-read from the database on every
 * request), refresh tokens (rotated, tracked by id) and short sign-in tokens for the 2FA step.
 * Access tokens carry no rights: rights are read fresh from the user's roles.
 */
export class TokenService {
  private readonly key: Uint8Array;
  constructor(private readonly opts: TokenOptions) {
    this.key = new TextEncoder().encode(opts.secret);
  }

  get accessTtlSeconds(): number {
    return this.opts.accessTtlSeconds;
  }
  get refreshTtlSeconds(): number {
    return this.opts.refreshTtlSeconds;
  }

  private sign(claims: Record<string, unknown>, sub: string, ttl: number, jti = randomUUID()) {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(sub)
      .setIssuer(this.opts.issuer)
      .setIssuedAt()
      .setJti(jti)
      .setExpirationTime(`${ttl}s`)
      .sign(this.key);
  }

  signAccess(c: AccessClaims): Promise<string> {
    return this.sign({ tid: c.tenantId, sid: c.sessionId, typ: 'access' }, c.userId, this.opts.accessTtlSeconds);
  }

  async signRefresh(c: Omit<RefreshClaims, 'tokenId'>): Promise<{ token: string; tokenId: string }> {
    const tokenId = randomUUID();
    const token = await this.sign({ tid: c.tenantId, typ: 'refresh' }, c.userId, this.opts.refreshTtlSeconds, tokenId);
    return { token, tokenId };
  }

  signMfa(c: MfaClaims): Promise<string> {
    return this.sign({ tid: c.tenantId, typ: 'mfa', purpose: c.purpose }, c.userId, MFA_TTL_SECONDS);
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    const p = await this.verify(token, 'access');
    if (typeof p.sid !== 'string') throw unauthorized('Invalid or expired token');
    return { userId: p.sub as string, tenantId: p.tid as string, sessionId: p.sid };
  }

  async verifyRefresh(token: string): Promise<RefreshClaims> {
    const p = await this.verify(token, 'refresh');
    return { userId: p.sub as string, tenantId: p.tid as string, tokenId: p.jti as string };
  }

  async verifyMfa(token: string): Promise<MfaClaims> {
    const p = await this.verify(token, 'mfa');
    return { userId: p.sub as string, tenantId: p.tid as string, purpose: p.purpose === 'setup' ? 'setup' : 'verify' };
  }

  private async verify(token: string, typ: string) {
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: this.opts.issuer, algorithms: ['HS256'] });
      if (payload.typ !== typ || !payload.sub || typeof payload.tid !== 'string') throw new Error('bad claims');
      return payload;
    } catch {
      throw unauthorized('Invalid or expired token');
    }
  }
}
