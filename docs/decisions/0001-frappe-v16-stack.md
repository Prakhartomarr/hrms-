# 0001: Build on Frappe HR + ERPNext + India Compliance, version-16

- Status: accepted
- Date: 2026-11-13

## Context

We are building an HRMS for Indian and Middle East SMBs. An earlier from-scratch TypeScript monorepo was started and then archived on branch `archive/ts-scaffold`. Re-implementing the employee master, leave, attendance, payroll and statutory rules from scratch costs years. Frappe HR already covers most of that ground under GPL-3.0, and our team already runs a Frappe bench for the GAMCS CRM, so the tooling and skills carry over.

We needed one major line on which frappe, erpnext, hrms and india_compliance all have stable releases.

## What GitHub showed on 2026-11-13

| Repo | Branches | Latest stable tag | Requirement on v16 |
| --- | --- | --- | --- |
| frappe/frappe (MIT) | version-15, version-16 | v16.56.0 | Python `>=3.14,<3.15`, Node `>=24` |
| frappe/erpnext (GPL-3.0) | version-15, version-16 | v16.55.0 | frappe `>=16.55.0,<17` |
| frappe/hrms (GPL-3.0) | version-15, version-16 | v16.53.2 | `required_apps = ["frappe/erpnext"]` |
| resilient-tech/india-compliance (GPL-3.0) | version-15, version-16 | v16.11.0 | frappe `>=16.0.0,<17` |

There is no version-17 branch yet. v16 has dozens of patch releases on every repo, so it is the mature, current stable line.

## Decision

- Track the **`version-16`** branch of frappe, erpnext, hrms and india_compliance. These are the upstream release branches, and the tags above are cut from them.
- Runtime: **Python 3.14** and **Node 24**, both provided by the `frappe/bench:latest` image (3.14.7, v24.20). MariaDB 10.11 and Redis 7.
- Our code lives in one custom app, **`gamcs_hr`** (GPL-3.0-only), named to match `gamcs_crm`. Upstream apps are never edited (see CLAUDE.md).
- Dev topology copies the GAMCS CRM: a `frappe/bench` container with the bench bind-mounted from the host (`~/hrms-bench`) and this repo mounted at `apps/gamcs_hr`. The compose project is `hrms-dev`, on ports 8200/9200, with its own volumes.

## Why not version-15

- v15 is in maintenance. New HR features (and fixes to them) land on develop, and from there on v16.
- India Compliance's newer e-invoice and GST work targets v16.
- Starting on v15 would mean a major migration within a year, which is the most expensive kind of upgrade for a custom app.

## Consequences

- Python 3.14 is new. A few transitive pip packages may lag behind it; so far the frappe/bench image handles it.
- The bench follows the moving `version-16` branches. To reproduce a known state, record `git -C ~/hrms-bench/apps/<app> rev-parse HEAD` (see docs/baseline-tests.md). Run `bench update` deliberately, not automatically.
- GPL-3.0 applies to `gamcs_hr` because it links against GPL apps. That is fine for an app we distribute as source.
