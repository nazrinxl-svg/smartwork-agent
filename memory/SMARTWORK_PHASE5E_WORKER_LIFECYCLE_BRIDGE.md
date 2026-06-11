# SmartWork Phase 5E — Worker Lifecycle Bridge

Purpose:
- Add a worker actor bridge for production queue lifecycle.
- In smoke mode, it starts local control server, creates a dry-run job, lets worker bridge pick it, ack it to running, and complete it.
- This proves the worker side can use the backend queue API.
- No SIAGA input, no browser open, no real save/send.
