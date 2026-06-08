# Multi-App Parallel Flow

## Goal

SmartWork Agent will handle many teacher/admin workflows across multiple systems, not only SIAGA.

## Flow

1. Teacher submits data through Google Form, SmartWork Web Form, or WhatsApp-assisted intake.
2. SmartWork imports/reads the account and task list.
3. SmartWork maps each task to an application module.
4. SmartWork starts isolated workers in parallel.
5. Each worker uses a dedicated browser profile.
6. Each worker logs progress and takes screenshots.
7. Reports are saved per teacher, per app, per task.
8. Save/submit/delete actions remain locked until confirmation.

## Example

Teacher A:
- SIAGA absensi
- e-Kinerja report

Teacher B:
- SIAGA absensi

Teacher C:
- e-Kinerja report

Parallel execution:

- Worker A1 handles Teacher A SIAGA
- Worker A2 handles Teacher A e-Kinerja only if allowed and safe
- Worker B1 handles Teacher B SIAGA
- Worker C1 handles Teacher C e-Kinerja

Initial implementation should limit parallelism to 2 workers until stable.

## Safety

Never reuse the same browser session for multiple teacher accounts.
Never store real credentials in plain text for final use.
Never save/submit/delete without explicit user confirmation.
