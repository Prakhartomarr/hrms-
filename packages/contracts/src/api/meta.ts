import { z } from 'zod';
import { pageDef, resourceDef, ACTIONS, SCOPES } from '../access.js';
import { endpoint } from './endpoint.js';

export const navItem = z.object({
  id: z.string(),
  label: z.string(),
  path: z.string(),
  page: z.string(),
  section: z.string().optional(),
  order: z.number(),
  module: z.string(),
});
export type NavItem = z.infer<typeof navItem>;

export const accessCatalog = z.object({
  actions: z.array(z.enum(ACTIONS)),
  scopes: z.array(z.enum(SCOPES)),
  resources: z.array(resourceDef),
  pages: z.array(pageDef),
});
export type AccessCatalog = z.infer<typeof accessCatalog>;

export const metaApi = {
  health: endpoint({
    method: 'GET',
    path: '/api/v1/health',
    auth: false,
    response: z.object({ status: z.literal('ok'), product: z.string(), version: z.string() }),
    summary: 'Liveness',
  }),
  modules: endpoint({
    method: 'GET',
    path: '/api/v1/meta/modules',
    auth: true,
    response: z.object({ items: z.array(z.object({ id: z.string(), name: z.string(), version: z.string() })) }),
    summary: 'Loaded modules',
  }),
  nav: endpoint({
    method: 'GET',
    path: '/api/v1/meta/nav',
    auth: true,
    response: z.object({ items: z.array(navItem) }),
    summary: 'Navigation the current user may open (page access)',
  }),
  catalog: endpoint({
    method: 'GET',
    path: '/api/v1/meta/access-catalog',
    auth: true,
    response: accessCatalog,
    summary: 'Every page and protected resource, for the role editor',
  }),
};
