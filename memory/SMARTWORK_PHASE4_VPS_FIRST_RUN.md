# SMARTWORK PHASE 4 - VPS FIRST RUN ENVIRONMENT GUARD

Goal:
Prepare SmartWork Agent for first dry-run execution on VPS.

This phase adds:
- production environment guard
- VPS first-run validator
- VPS target example config
- first-run command document
- Brain integration

Safety:
- no SIAGA input
- no browser open
- no real save
- no real send
- no real credentials committed

Rule:
First VPS run must stay dry-run:
SMARTWORK_DRY_RUN=true
SMARTWORK_REAL_SAVE_ENABLED=false
SMARTWORK_REAL_SEND_ENABLED=false
