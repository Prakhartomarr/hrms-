/** Errors that map to HTTP responses `{ error: { code, message, details } }`. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError('bad_request', 400, message, details);
export const unauthorized = (message = 'Authentication required') => new AppError('unauthorized', 401, message);
export const forbidden = (message = 'You do not have access to this', details?: unknown) =>
  new AppError('forbidden', 403, message, details);
export const notFound = (what = 'Resource') => new AppError('not_found', 404, `${what} not found`);
export const conflict = (message: string, details?: unknown) => new AppError('conflict', 409, message, details);
export const tooManyRequests = (retryAfter: number) =>
  new AppError('rate_limited', 429, 'Too many requests', { retryAfter });
export const notImplemented = (message: string) => new AppError('not_implemented', 501, message);
