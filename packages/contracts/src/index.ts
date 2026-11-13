export * from './product.js';
export * from './primitives.js';
export * from './india.js';
export * from './access.js';
export * from './events.js';
export * from './api/endpoint.js';
export * from './api/meta.js';
export * from './api/identity.js';
export * from './api/org.js';
export * from './api/people.js';
export * from './api/access.js';
export * from './api/audit.js';
export * from './api/policy.js';

import { accessApi } from './api/access.js';
import { auditApi } from './api/audit.js';
import { identityApi } from './api/identity.js';
import { metaApi } from './api/meta.js';
import { orgApi } from './api/org.js';
import { peopleApi } from './api/people.js';
import { policyApi } from './api/policy.js';

/** Every endpoint, grouped by module. Clients build typed fetchers from this. */
export const api = {
  meta: metaApi,
  identity: identityApi,
  org: orgApi,
  people: peopleApi,
  access: accessApi,
  audit: auditApi,
  policy: policyApi,
};
