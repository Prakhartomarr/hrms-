import { randomUUID } from 'node:crypto';
import swagger from '@fastify/swagger';
import { ACTIONS, api as contracts, PRODUCT, SCOPES } from '@hrms/contracts';
import { canPage } from '@hrms/domain';
import { route, type ModuleApp, type RouteConfig } from '@hrms/module-sdk';
import { AppError, currentAccess, currentContext, requireAction, requirePage, runWithContext, tooManyRequests, unauthorized } from '@hrms/platform';
import Fastify from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Runtime } from './runtime.js';

export const API_VERSION = '0.1.0';
export const API_PREFIX = '/api/v1';
/** Largest JSON body; uploads (raw bodies) have their own limit. */
const BODY_LIMIT = 2 * 1024 * 1024;
const UPLOAD_LIMIT = 20 * 1024 * 1024;

export function trustProxy(value: string): boolean | string | ((address: string, hop: number) => boolean) {
  const v = value.trim().toLowerCase();
  if (v === '' || v === 'false') return false;
  if (v === 'true') return true;
  if (/^\d+$/.test(v)) return (_a, hop) => hop < Number(v);
  return value.trim();
}

/**
 * Builds the HTTP API: request context, JWT auth, the central access guard (page and action
 * rights from route config; data scope inside handlers through @hrms/platform's guard), rate
 * limits, uniform errors, OpenAPI, and every module's routes.
 */
export async function buildApi(rt: Runtime): Promise<ModuleApp> {
  const app = Fastify({
    loggerInstance: rt.logger,
    genReqId: (req) => (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
    bodyLimit: BODY_LIMIT,
    trustProxy: trustProxy(rt.config.TRUST_PROXY),
  }).withTypeProvider<ZodTypeProvider>() as unknown as ModuleApp;

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Uploads (xlsx, documents) arrive as Buffers.
  app.addContentTypeParser(
    [
      'application/octet-stream',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/pdf',
      'image/png',
      'image/jpeg',
    ],
    { parseAs: 'buffer', bodyLimit: UPLOAD_LIMIT },
    (_req, body, done) => done(null, body),
  );

  // 1. Execution context for the whole request (AsyncLocalStorage).
  app.addHook('onRequest', (req, reply, done) => {
    reply.header('x-request-id', req.id);
    const ua = req.headers['user-agent'];
    runWithContext({ requestId: req.id, ip: req.ip, ...(ua ? { userAgent: ua.slice(0, 400) } : {}) }, done);
  });

  // 2. CORS (allow-list from CORS_ORIGINS).
  const origins = new Set(rt.config.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean));
  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    if (origin && (origins.has(origin) || origins.has('*'))) {
      reply.header('access-control-allow-origin', origin);
      reply.header('vary', 'origin');
      reply.header('access-control-allow-headers', 'authorization, content-type, x-request-id');
      reply.header('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      reply.header('access-control-expose-headers', 'content-disposition, x-request-id');
      if (req.method === 'OPTIONS') return reply.status(204).send();
    }
  });

  // 3. Authentication, then the guard: page access and action rights from route config.
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'OPTIONS' || reply.sent) return;
    const config = (req.routeOptions.config ?? {}) as RouteConfig;
    if (!req.routeOptions.url) return; // 404s
    const ctx = currentContext()!;
    if (config.public) {
      const r = await rt.rateLimiter.hit(`ip:${req.ip}:${req.routeOptions.url}`, config.rateLimitPerMinute ?? 60, 60_000);
      if (!r.allowed) throw tooManyRequests(Math.ceil(r.resetMs / 1000));
      return;
    }
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();
    const claims = await rt.tokens.verifyAccess(header.slice(7));
    // The token says who they were; the database says who they are now.
    const who = await rt.identity(claims.tenantId, claims.userId, claims.sessionId);
    if (!who) throw unauthorized('This session has ended. Sign in again.');
    ctx.tenantId = claims.tenantId;
    ctx.userId = claims.userId;
    ctx.userName = who.name;
    ctx.sessionId = claims.sessionId;
    ctx.access = who.access;
    ctx.viewer = who.viewer;
    const r = await rt.rateLimiter.hit(
      `t:${claims.tenantId}${config.rateLimitPerMinute ? `:${req.routeOptions.url}` : ''}`,
      config.rateLimitPerMinute ?? rt.config.RATE_LIMIT_PER_MINUTE,
      60_000,
    );
    if (!r.allowed) throw tooManyRequests(Math.ceil(r.resetMs / 1000));
    if (config.page) requirePage(config.page);
    if (config.access) requireAction(config.access.resource, config.access.action);
  });

  app.setErrorHandler((err, req, reply) => {
    const requestId = req.id;
    if (err instanceof AppError) {
      const retryAfter = (err.details as { retryAfter?: number } | undefined)?.retryAfter;
      if (err.status === 429 && retryAfter) reply.header('retry-after', retryAfter);
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details, requestId } });
    }
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.status(400).send({ error: { code: 'validation', message: 'Some fields are not valid', details: err.validation, requestId } });
    }
    if (isResponseSerializationError(err)) {
      req.log.error({ err, issues: err.cause.issues }, 'response does not match its contract');
      return reply.status(500).send({ error: { code: 'internal', message: 'Internal error', requestId } });
    }
    const code = (err as { code?: string }).code;
    if (code === '23505') {
      return reply.status(409).send({ error: { code: 'conflict', message: 'That already exists', details: { constraint: (err as { constraint?: string }).constraint }, requestId } });
    }
    if (code === '23503') {
      return reply.status(409).send({ error: { code: 'in_use', message: 'It is still referenced by other records', requestId } });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) req.log.error({ err }, 'request failed');
    return reply.status(status).send({
      error: { code: status >= 500 ? 'internal' : 'bad_request', message: status >= 500 ? 'Internal error' : (err as Error).message, requestId },
    });
  });

  app.setNotFoundHandler((req, reply) =>
    reply.status(404).send({ error: { code: 'not_found', message: `No route ${req.method} ${req.url}`, requestId: req.id } }),
  );

  await app.register(swagger, {
    openapi: {
      info: { title: `${PRODUCT.name} API`, version: API_VERSION },
      components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
    },
    transform: jsonSchemaTransform,
  });

  route(app, contracts.meta.health, {}, async () => ({ status: 'ok' as const, product: PRODUCT.name, version: API_VERSION }));
  route(app, contracts.meta.modules, {}, async () => ({
    items: rt.modules.map((m) => ({ id: m.definition.id, name: m.definition.name, version: m.definition.version ?? m.pkg.version })),
  }));
  route(app, contracts.meta.nav, {}, async () => {
    const access = currentAccess();
    return {
      items: rt.modules
        .flatMap((m) => (m.definition.nav ?? []).map((n) => ({ ...n, module: m.definition.id, order: n.order ?? 100 })))
        .filter((n) => canPage(access, n.page))
        .sort((a, b) => a.order - b.order),
    };
  });
  route(app, contracts.meta.catalog, {}, async () => ({
    actions: [...ACTIONS],
    scopes: [...SCOPES],
    resources: rt.catalog.resources(),
    pages: rt.catalog.pages(),
  }));
  app.get(`${API_PREFIX}/openapi.json`, { config: { public: true } satisfies RouteConfig, schema: { hide: true } }, async () => app.swagger());

  for (const m of rt.modules) {
    const routes = m.definition.routes;
    if (!routes) continue;
    await app.register(async (scope) => {
      await routes(scope as unknown as ModuleApp, rt.contextFor(m.definition.id));
    });
  }

  await app.ready();
  return app;
}
