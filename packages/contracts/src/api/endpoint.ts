import type { z } from 'zod';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * A typed HTTP endpoint description. Servers register routes from these; clients
 * (web app, add-ins) derive request/response types from them.
 */
export interface Endpoint<
  P extends z.ZodType | undefined = z.ZodType | undefined,
  Q extends z.ZodType | undefined = z.ZodType | undefined,
  B extends z.ZodType | undefined = z.ZodType | undefined,
  R extends z.ZodType = z.ZodType,
> {
  method: HttpMethod;
  /** Path with `:param` placeholders, always under `/api/v1`. */
  path: string;
  /** False for public endpoints (signup, login, refresh). */
  auth: boolean;
  params?: P;
  query?: Q;
  body?: B;
  response: R;
  summary: string;
}

export const endpoint = <
  P extends z.ZodType | undefined = undefined,
  Q extends z.ZodType | undefined = undefined,
  B extends z.ZodType | undefined = undefined,
  R extends z.ZodType = z.ZodType,
>(
  e: Endpoint<P, Q, B, R>,
) => e;

type Out<T> = T extends z.ZodType ? z.output<T> : never;
type In<T> = T extends z.ZodType ? z.input<T> : never;
export type EndpointParams<E> = E extends Endpoint<infer P> ? In<P> : never;
export type EndpointQuery<E> = E extends Endpoint<z.ZodType | undefined, infer Q> ? In<Q> : never;
export type EndpointBody<E> =
  E extends Endpoint<z.ZodType | undefined, z.ZodType | undefined, infer B> ? In<B> : never;
export type EndpointResponse<E> =
  E extends Endpoint<z.ZodType | undefined, z.ZodType | undefined, z.ZodType | undefined, infer R>
    ? Out<R>
    : never;
