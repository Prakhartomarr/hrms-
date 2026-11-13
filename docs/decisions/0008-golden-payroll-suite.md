# 0008: Golden payroll suite

Status: accepted, 13 Nov 2026 (T55)

## Context

Payroll and statutory work (T56 onwards) needs a fixed set of named scenarios with known answers to the paisa. Most of those scenarios rely on features that don't exist yet: labour-code wages, the ₹25,000 PF ceiling, ESI from packs, state PT, tax under the 2025 Act, arrears, gratuity, loans and full and final. They have to be recorded now without failing the suite, and they must never show as passing before the feature exists.

## Decision

- The 56 cases (G01 to G56) live as YAML in `gamcs_hr/tests/golden/cases/`, one file per area. Shared assumptions are in `_defaults.yaml`. All money is integer paise.
- A case has variants (one scenario each), and a variant has named checks. Each check becomes one test, `test_<case>_<variant>_<check>`. Part of a case (for example G10's earnings) can run today while its PF, ESI, PT and TDS checks wait.
- Pending is marked by hand in the fixture as `pending: {feature: T57, reason: ...}`. It shows as a skip with `pending(feature="T57"): ...`. The owning task removes the mark once its feature lands. We chose an explicit mark over automatic detection so that a check can only become active through a reviewed fixture change.
- The fixture test rejects an active check that has no executor, or that names a value today's engine cannot produce. A missing component is never read as zero. A deduction row whose condition is false does read as zero.
- The engine adapter (`engine.py`) builds a structure for each case. The earnings are the fixture's monthly amounts. The deductions are the demo structure's statutory rows, taken unchanged from `gamcs_hr.seed.demo.COMPONENTS`. T56 replaces this adapter when the demo structure moves to the India payroll app.
- Before building slips, the runner switches Payroll Settings to calendar-day proration (`include_holidays_in_total_working_days = 1`), as the cases assume, and restores the old setting afterwards.
- `hr.sh golden probe` runs the pending slip checks too and prints each gap. A pending check can match by coincidence (for example, today's flat ₹200 PT gives the right Maharashtra value above ₹25,000), so a match alone is not a reason to remove a mark.
- CI runs the golden suite as its own step before the full suite, so any change to `docker/ci/versions.env` passes through it.
- The CA review checklist stays outside the repo. Cases that need CA sign-off carry `ca_signoff: true`.

## State at T55

There are 118 checks. 11 are active and pass: the earnings and paid days of G10, G11, G12 (both variants), G23, G24 and G26 (joiner, LOP); the G15 employee ESI share; the G19 Karnataka November threshold; and the G22 Karnataka row. The other 107 are pending.
