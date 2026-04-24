/**
 * server/middleware/auth.ts
 *
 * JWT verification middleware — reads ONLY from the HttpOnly cookie `__ft_token`.
 * Bearer-header / localStorage token reading is intentionally omitted (XSS hardening).
 *
 * Rule applied: skills/03_Backend_Security.md §2 "Token Storage"
 */
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required.');
}

const COOKIE_NAME = '__ft_token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

export interface AuthRequest extends Request {
  userId?: string;
}

/** Parse a single cookie value from the raw Cookie header (no cookie-parser dep needed). */
function parseCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const pair = cookieHeader.split(';').find((c) => c.trim().startsWith(`${name}=`));
  return pair?.trim().slice(name.length + 1);
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = parseCookie(req.headers.cookie, COOKIE_NAME);

  if (!token) {
    res.status(401).json({ error: 'Unauthenticated — no session cookie present' });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET!) as { sub: string };
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session — please log in again' });
  }
}

/**
 * Issue a signed JWT and attach it as a Secure, HttpOnly, SameSite=Strict cookie.
 * Returns the raw token value so callers can keep the user JSON response clean.
 */
export function setTokenCookie(res: Response, userId: string): void {
  const token = signToken(userId);
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure:   isProd,           // HTTPS-only in prod; allow HTTP in local dev
    sameSite: 'strict',
    maxAge:   COOKIE_MAX_AGE,
    path:     '/',
  });
}

export function clearTokenCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'strict', path: '/' });
}

export function signToken(userId: string): string {
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? '7d') as jwt.SignOptions['expiresIn'];
  return jwt.sign({ sub: userId }, JWT_SECRET!, { expiresIn });
}
