# SmartWork Phase 5F — App Progress Bridge

Purpose:
- Let `progress.html` read production job status from `/api/smartwork/jobs/:jobId`.
- Preserve existing app artifact progress flow.
- Use job ID saved by `request.html` bridge in `localStorage.smartwork_production_job`.
- Write production status back to `smartwork_production_progress_state` and `smartwork_progress_live_state`.
- No SIAGA input, no browser open, no real save/send.
