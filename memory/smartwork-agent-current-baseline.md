# SmartWork Agent Brain — Current Known Good Baseline

## Current baseline

Branch: `test/ui-request-next-20260611-004522`

Latest known good commit:

- `50e5e20` — `Show verified SIAGA request result in progress UI`

Backend/artifact stabilization commit:

- `08004c5` — `Stabilize request range execution and app artifacts`

## Verified request

Request source: SmartWork user request form  
Teacher: `guru-001 / Nazrin`  
Range: `2026-06-01..2026-06-06`

Verified result:

- Total inside request: `6`
- Already filled: `6`
- Needs plan: `0`
- PDF ready: `reports/downloads/Presensi_Nazrin_Juni_2026.pdf`
- Proof ready: `reports/proof/smartwork-siaga-proof-report.json`
- App artifacts ready: `reports/smartwork-app-artifacts-report.json`
- Progress UI title: `Hasil Siap`

## Warning rules

Before any future SmartWork Agent change, the Brain/Commander must warn if a proposed action would:

1. Reset the Progress UI back to empty while report artifacts are ready.
2. Ignore `reports/smartwork-app-artifacts-report.json` or `reports/smartwork-final-progress-report.json`.
3. Jump directly to full-month SIAGA test without passing short staged range tests.
4. Rerun heavy/browser/SIAGA pipeline only to check UI.
5. Delete/clear real SIAGA data without explicit user instruction.
6. Move backward before commit `50e5e20`.

## Next safe direction

Do staged testing only.

Recommended next range: small range after the proven baseline, not full month.

Flow:

1. Submit short request from UI.
2. Diagnose request sync.
3. Time-plan preview first.
4. Save only explicit requested dates.
5. Verify inside request.
6. Download PDF.
7. Generate proof report.
8. Finalize app artifacts.
9. Check Progress UI.
10. Commit checkpoint.
