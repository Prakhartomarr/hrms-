# AGENTS.md

All agent instructions for this repo live in [CLAUDE.md](CLAUDE.md). Read it before changing anything.

The short version:

- Customise only in `gamcs_hr`. Never edit frappe, erpnext, hrms or india_compliance. Put hooks in `gamcs_hr/<module>/hooks_part.py`, custom fields and property setters in `gamcs_hr/<module>/setup.py`, and client scripts as files in the app. See [docs/conventions.md](docs/conventions.md).
- Never touch `~/gamcs-crm` or its containers.
- Use ports 8200 (web) and 9200 (socketio), and compose project `hrms-dev`.
- Don't push unless the user asks. End every commit with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never copy HROne's text, branding or product names.
- Money and statutory logic needs tests that assert exact values.
- Run tests with `infra/dev/hr.sh test`, or `infra/dev/hr.sh bench --site hr.localhost run-tests --module <module>`.
