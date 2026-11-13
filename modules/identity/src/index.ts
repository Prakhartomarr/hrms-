import { fileURLToPath } from 'node:url';
import { PAGES, PRODUCT, RES } from '@hrms/contracts';
import { defineJob, defineModule } from '@hrms/module-sdk';
import { simpleEmail } from '@hrms/platform';
import { z } from 'zod';
import { authRoutes } from './auth.js';
import { meRoutes } from './me.js';
import { userRoutes } from './users.js';

export default defineModule({
  id: 'identity',
  name: 'Identity',
  description: 'Workspace signup, sign-in with password and TOTP 2FA, sessions, password reset, SSO stubs, user accounts.',
  migrations: fileURLToPath(new URL('../migrations', import.meta.url)),
  resources: [
    { id: RES.users, label: 'User accounts and role assignments', group: 'Administration', actions: ['view', 'add', 'edit'], scoped: false },
    { id: RES.security, label: 'Security settings (require 2FA)', group: 'Administration', actions: ['view', 'edit'], scoped: false },
  ],
  pages: [
    { id: PAGES.home, label: 'Home', group: 'General' },
    { id: PAGES.users, label: 'Users', group: 'Administration' },
    { id: PAGES.settings, label: 'Settings', group: 'Administration' },
  ],
  nav: [
    { id: 'home', label: 'Home', path: '/', page: PAGES.home, section: 'main', order: 10 },
    { id: 'users', label: 'Users', path: '/settings/users', page: PAGES.users, section: 'admin', order: 820 },
    { id: 'settings', label: 'Security', path: '/settings/security', page: PAGES.settings, section: 'admin', order: 900 },
  ],
  routes(app, ctx) {
    authRoutes(app, ctx);
    meRoutes(app, ctx);
    userRoutes(app, ctx);
  },
  jobs: {
    sendResetEmail: defineJob({
      schema: z.object({ to: z.email(), workspace: z.string(), link: z.string() }),
      attempts: 5,
      handler: async (p, ctx) => {
        const body = simpleEmail({
          product: PRODUCT.name,
          heading: 'Reset your password',
          body: `Someone asked to reset the password for your ${p.workspace} account. The link works for one hour. If it was not you, ignore this email.`,
          linkText: 'Choose a new password',
          link: p.link,
        });
        await ctx.mailer.send({ to: [p.to], subject: `Reset your ${PRODUCT.name} password`, ...body });
      },
    }),
  },
});
