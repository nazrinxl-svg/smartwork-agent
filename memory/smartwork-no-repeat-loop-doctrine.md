# SmartWork Agent Doctrine: NO REPEAT LOOP

When a workflow has already succeeded before, do not restart from zero.

Rules:
1. Reuse known-good checkpoints first:
   - latest stable commit
   - successful reports
   - successful screenshots
   - working browser profile/session
   - working detailUrl
   - PDF/proof artifacts
   - prior runner script path

2. Before asking the user to repeat login/testing, compare:
   - old successful profile vs current profile
   - old successful report vs current report
   - old successful command vs current command
   - active request vs latest intake request
   - progress source files vs UI renderer

3. Diagnose exact delta before patching:
   - what changed?
   - which file/script/profile is different?
   - why did it work before but not now?

4. Never stack random patches.
5. Never keep asking manual login/test repeatedly without checking old evidence.
6. For SIAGA runner:
   - if table rows are 0, first check whether current runner uses the same known-good browser profile/session from the previous successful save/download.
   - do not proceed to save-confirmed unless preview reads rows > 0.
7. Preserve checkpoints after each stable fix.

Current known checkpoint:
- Branch: test/ui-request-next-20260611-004522
- Commit: db388e4 Fix pending request progress UI and guarded promotion tools
- Active request after promotion: 2026-06-08..2026-06-13
- UI pending state fixed: progress 0%, needsPlan 6, no false Hasil Siap
- Previous workflow had succeeded before through save, download PDF, proof/progress.
- Next diagnosis must locate the known-good successful runner profile/report, not restart blindly.
