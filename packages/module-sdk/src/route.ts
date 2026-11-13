import type { Endpoint, EndpointResponse } from '@hrms/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import type { ModuleApp, RouteAccess } from './types.js';

type Out<T> = [NonNullable<T>] extends [never] ? undefined : NonNullable<T> extends z.ZodType ? z.output<NonNullable<T>> : undefined;

export interface RouteRequest<E extends Endpoint> {
  params: Out<E['params']>;
  query: Out<E['query']>;
  body: Out<E['body']>;
  raw: FastifyRequest;
  reply: FastifyReply;
}

export interface RouteOptions {
  /** Page access required (checked after authentication). */
  page?: string;
  /** Action right required, at any scope. Narrow to the record's scope in the handler. */
  access?: RouteAccess;
  /** Per-route limit per tenant (or per IP for public routes), requests per minute. */
  rateLimitPerMinute?: number;
  /** Status code for success (default 200). */
  status?: number;
  /** Raw body (file uploads): the body is a Buffer. */
  rawBody?: boolean;
}

/** Fastify route config read by the host's auth, guard and rate-limit hooks. */
export interface RouteConfig {
  public?: boolean;
  page?: string;
  access?: RouteAccess;
  rateLimitPerMinute?: number;
  rawBody?: boolean;
}

/**
 * Registers a route from a contracts endpoint: method, path, validation and response schema
 * all come from the shared contract, so server and clients cannot drift. Every authenticated
 * route passes the central guard before its handler.
 */
export function route<E extends Endpoint>(
  app: ModuleApp,
  endpoint: E,
  opts: RouteOptions,
  handler: (req: RouteRequest<E>) => Promise<EndpointResponse<E>>,
): void {
  const status = opts.status ?? 200;
  const config: RouteConfig = {
    public: !endpoint.auth,
    ...(opts.page ? { page: opts.page } : {}),
    ...(opts.access ? { access: opts.access } : {}),
    ...(opts.rateLimitPerMinute ? { rateLimitPerMinute: opts.rateLimitPerMinute } : {}),
    ...(opts.rawBody ? { rawBody: true } : {}),
  };
  app.route({
    method: endpoint.method,
    url: endpoint.path,
    config,
    schema: {
      summary: endpoint.summary,
      ...(endpoint.params ? { params: endpoint.params } : {}),
      ...(endpoint.query ? { querystring: endpoint.query } : {}),
      ...(endpoint.body && !opts.rawBody ? { body: endpoint.body } : {}),
      response: { [status]: endpoint.response },
      ...(endpoint.auth ? { security: [{ bearer: [] }] } : {}),
    },
    handler: async (request, reply) => {
      const result = await handler({
        params: request.params as Out<E['params']>,
        query: request.query as Out<E['query']>,
        body: request.body as Out<E['body']>,
        raw: request,
        reply,
      });
      return reply.status(status).send(result);
    },
  });
}
