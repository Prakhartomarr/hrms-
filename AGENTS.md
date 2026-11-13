# AGENTS.md

All agent instructions for this repo live in [CLAUDE.md](CLAUDE.md). Read it before changing anything.

The short version:

- Customise only in `gamcs_hr`. Never edit frappe, erpnext, hrms or india_compliance. Use hooks, `doc_events`, `override_doctype_class`, fixtures for custom fields, and client scripts kept as files in the app.
- Never touch `~/gamcs-crm` or its containers.
- Use ports 8200 (web) and 9200 (socketio), and compose project `hrms-dev`.
- Don't push unless the user asks. End every commit with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never copy HROne's text, branding or product names.
- Money and statutory logic needs tests that assert exact values.
- Run tests with `infra/dev/hr.sh test`, or `infra/dev/hr.sh bench --site hr.localhost run-tests --module <module>`.
