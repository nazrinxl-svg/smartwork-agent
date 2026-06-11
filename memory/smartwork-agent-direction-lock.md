# SmartWork Agent Direction Lock

## Core Goal
SmartWork Agent must stay focused on the end-to-end product flow:

request/intake → promote active request → reset progress → SIAGA runner → save attendance when allowed → download PDF → proof report → app progress/result.

## Hard Rules

1. Do not restart from zero when the workflow has already succeeded before.
2. Do not repeatedly ask for login/profile/CDP testing unless the main runner path fails with a concrete error.
3. Use known-good evidence first:
   - latest stable commit
   - old successful reports
   - old successful screenshots
   - PDF/proof artifacts
   - runner command that previously worked
4. When user says "lanjut testing", use the existing successful runner path first.
5. If an error appears, diagnose only that exact error point.
6. Do not open multiple branches of diagnosis at once.
7. Do not stack random patches.
8. Do not make the user repeat the same test/login if prior evidence already proves it worked.
9. Keep one clear next action, not many competing options.
10. Preserve safety:
    - no save/submit/delete unless user explicitly allows or the active test stage is save-confirmed.
    - no real email/WhatsApp send without confirmation.

## Current Direction
The correct direction is not to rebuild login/profile/CDP from scratch.

Continue from:
- branch: test/ui-request-next-20260611-004522
- checkpoint commit: db388e4
- known fixed state: UI request promotion + progress pending 0%
- known product goal: continue testing next date range through the runner path that already succeeded before.

## Failure Handling
If a test fails:
1. Read the exact report/error.
2. Compare with the last successful report.
3. Identify the delta.
4. Patch only that delta.
5. Continue the same main path.

No repeat loop.
No direction drift.
No random diagnosis branch.
