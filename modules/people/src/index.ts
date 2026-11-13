import { fileURLToPath } from 'node:url';
import { api, EVENTS, PAGES, RES } from '@hrms/contracts';
import { sql } from '@hrms/db';
import { todayIst } from '@hrms/domain';
import { defineJob, defineModule, route } from '@hrms/module-sdk';
import { badRequest, employeeScope, publishEvent, recordAudit, requirePage } from '@hrms/platform';
import { z } from 'zod';
import { exportWorkbook, importEmployees, templateWorkbook } from './excel.js';
import { peopleRoutes } from './routes.js';
import { customDefs, refreshCurrentJob, unmaskedFor } from './service.js';
import type { Trx } from './tables.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export { createEmployee, refreshCurrentJob } from './service.js';
export { COLUMNS as IMPORT_COLUMNS, importEmployees, templateWorkbook } from './excel.js';

export default defineModule({
  id: 'people',
  name: 'People',
  description: 'Employee master: profile sections, custom fields, effective-dated job history, masking, Excel import and export.',
  migrations: fileURLToPath(new URL('../migrations', import.meta.url)),
  resources: [
    { id: RES.directory, label: 'Directory (name, designation, department, work email)', group: 'People', actions: ['view'], scoped: true },
    { id: RES.employees, label: 'Employee profiles', group: 'People', actions: ['view', 'add', 'edit', 'delete', 'approve', 'export'], scoped: true },
    { id: RES.job, label: 'Job history (designation, grade, unit, manager)', group: 'People', actions: ['view', 'edit'], scoped: true },
    { id: RES.pan, label: 'PAN', group: 'Sensitive fields', actions: ['view', 'edit'], scoped: true, sensitive: true },
    { id: RES.aadhaar, label: 'Aadhaar', group: 'Sensitive fields', actions: ['view', 'edit'], scoped: true, sensitive: true },
    { id: RES.bank, label: 'Bank details', group: 'Sensitive fields', actions: ['view', 'edit'], scoped: true, sensitive: true },
    { id: RES.salary, label: 'Salary (CTC)', group: 'Sensitive fields', actions: ['view', 'edit'], scoped: true, sensitive: true },
    { id: RES.import, label: 'Excel import of employees', group: 'People', actions: ['add'], scoped: false },
    { id: RES.customFields, label: 'Custom profile fields', group: 'People', actions: ['view', 'add', 'edit'], scoped: false },
  ],
  pages: [
    { id: PAGES.directory, label: 'Directory', group: 'People' },
    { id: PAGES.myProfile, label: 'My profile', group: 'People' },
    { id: PAGES.import, label: 'Import employees', group: 'People' },
  ],
  nav: [
    { id: 'directory', label: 'People', path: '/people', page: PAGES.directory, section: 'main', order: 20 },
    { id: 'me', label: 'My profile', path: '/me', page: PAGES.myProfile, section: 'main', order: 15 },
    { id: 'import', label: 'Import', path: '/people/import', page: PAGES.import, section: 'admin', order: 810 },
  ],

  routes(app, ctx) {
    peopleRoutes(app, ctx);

    app.get('/api/v1/employees/import/template', { config: { page: PAGES.import, access: { resource: RES.import, action: 'add' } }, schema: { summary: 'Blank import template (.xlsx)', tags: ['people'] } }, async (_req, reply) => {
      const buf = await ctx.db.tx(async (trx: Trx) => templateWorkbook(await customDefs(trx)));
      return reply.header('content-type', XLSX).header('content-disposition', 'attachment; filename="employee-import-template.xlsx"').send(buf);
    });

    route(app, api.people.importEmployees, { page: PAGES.import, access: { resource: RES.import, action: 'add' }, rawBody: true, rateLimitPerMinute: 30 }, async ({ query, raw }) => {
      requirePage(PAGES.import);
      const body = raw.body;
      if (!Buffer.isBuffer(body) || body.length === 0) throw badRequest('Send the .xlsx file as the request body');
      // Nothing is written unless every row is valid: one transaction, rolled back on any error.
      return ctx.db.tx(async (trx: Trx) => {
        const report = await importEmployees(ctx, trx, body, query.dryRun);
        if (report.imported) {
          await recordAudit(trx, { action: 'create', entityType: 'employee.import', entityId: raw.id, entityLabel: `${report.summary.created} employees imported`, after: { created: report.summary.created } });
          await publishEvent(trx, EVENTS.employeesImported, { count: report.summary.created });
        }
        return report;
      });
    });

    app.get('/api/v1/employees/export', { config: { access: { resource: RES.employees, action: 'export' } }, schema: { summary: 'Employees the user may export (.xlsx), masked unless permitted', tags: ['people'] } }, async (req, reply) => {
      const buf = await ctx.db.tx(async (trx: Trx) => {
        const ids = (await trx.selectFrom('employees as e').select('e.id').where(employeeScope(RES.employees, 'export')).execute()).map((r) => r.id);
        const see = await unmaskedFor(trx, ids);
        await recordAudit(trx, { action: 'create', entityType: 'employee.export', entityId: req.id, entityLabel: `${ids.length} employees exported`, after: { count: ids.length } });
        return exportWorkbook(ctx, trx, ids, see);
      });
      return reply.header('content-type', XLSX).header('content-disposition', `attachment; filename="employees-${todayIst()}.xlsx"`).send(buf);
    });
  },

  jobs: {
    /** Applies future-dated job changes once their day comes. */
    refreshCurrentJobs: defineJob({
      schema: z.object({ day: z.string().optional() }).loose(),
      queue: 'system',
      attempts: 2,
      handler: async (payload, ctx) => {
        const day = payload.day ?? todayIst();
        let n = 0;
        await ctx.forEachTenant(async () => {
          await ctx.db.tx(async (trx: Trx) => {
            const due = await sql<{ id: string }>`SELECT DISTINCT e.id FROM employees e
              JOIN employee_job_events j ON j.employee_id = e.id
             WHERE j.effective_from <= ${day}::date AND (e.job_as_of IS NULL OR j.effective_from > e.job_as_of OR e.job_as_of > ${day}::date)`.execute(trx);
            for (const r of due.rows) await refreshCurrentJob(trx, r.id, day);
            n += due.rows.length;
          });
        });
        ctx.logger.info({ day, employees: n }, 'current jobs refreshed');
        return { day, employees: n };
      },
    }),
  },
  // 00:05 IST (18:35 UTC): future-dated promotions, transfers and new managers take effect.
  schedules: [{ id: 'refresh-current-jobs', job: 'refreshCurrentJobs', cron: '35 18 * * *' }],
});
