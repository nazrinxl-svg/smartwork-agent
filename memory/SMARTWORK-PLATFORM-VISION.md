# SmartWork Agent Platform Vision

SmartWork Agent is not only a SIAGA helper. SmartWork Agent is a private-first multi-application work automation platform for school/admin workflows.

## Main direction

SmartWork Agent should support multiple web systems/modules, including:

- SIAGA Pendis
- e-Kinerja
- PMM / GTK
- Dapodik / school admin systems
- Custom web systems added later

Each application must have its own guarded workflow, browser profile, logs, screenshots, reports, and confirmation rules.

## Intake flow

Teacher/account data should not be typed manually into the agent dashboard forever.

Target intake sources:

1. Google Form
2. Custom SmartWork Web Form
3. WhatsApp-assisted intake later

Flow:

Teacher fills form / web form / WhatsApp-assisted request
→ SmartWork reads teacher account and task data
→ SmartWork maps the task to an application module
→ SmartWork starts parallel workers
→ Each worker uses a separate browser profile/session
→ Each worker logs progress and captures screenshots
→ Final save/submit/delete still requires confirmation

## Parallel worker rule

Parallel execution means multiple accounts can be processed at the same time.

Correct model:

- 1 teacher account = 1 worker
- 1 worker = 1 isolated browser profile
- 1 application session must not be shared across accounts
- Each worker writes its own log and screenshot/report

Do not run many teacher accounts in the same tab/profile/session.

## Guard doctrine

SmartWork Agent may:

- open pages
- log in when credentials are provided through the approved vault/intake system
- navigate menus
- fill forms
- check values
- capture screenshots
- create reports
- notify status

SmartWork Agent must not automatically do final actions without explicit confirmation:

- save
- submit
- delete
- send final
- irreversible actions

If a workflow reaches a final action, the agent must stop or request approval.

## Credential doctrine

Sensitive credentials should not be pasted into ChatGPT.

Credentials must eventually be stored in an encrypted vault. Early prototypes may use dummy data or local-only test files, but the final platform should avoid plain-text storage.

Google Form/Sheet may be used first for intake prototyping, but long-term storage should move to an encrypted vault.

WhatsApp should be used for notifications and confirmations, not as an unsafe password storage channel.

## Dashboard direction

SmartWork Web dashboard should evolve into:

- Dashboard
- Applications
  - SIAGA Pendis
  - e-Kinerja
  - PMM / GTK
  - Dapodik / Admin
  - Custom Web
- Teacher Accounts
- Parallel Jobs
- Reports
- Settings

## Current development priority

1. Keep current local web control panel stable.
2. Add multi-app platform language to the UI.
3. Add application cards for SIAGA and e-Kinerja.
4. Add local dummy intake data before real credentials.
5. Build safe parallel runner with dummy accounts.
6. Connect Google Sheet intake later.
7. Add WhatsApp notification later.
