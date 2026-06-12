# SmartWork Agent Phase 5ZF — Public API HTTPS/CORS Readiness Pack

## Goal

Prepare SmartWork Agent for Android/WebView/TWA/Play Store path by documenting the required public API shape and the HTTPS/CORS production route.

## Current proven chain

- Phase 5ZC: browser app proof to DewaVPS API and worker completed 100%.
- Phase 5ZD: phone-like public app proof to DewaVPS API and worker completed 100%.
- Phase 5ZE: PWA installability pack passed.

## Play Store readiness concern

The current dry-run API base is a raw HTTP IP:

`http://103.152.242.193:3107`

For Android/WebView/TWA production, SmartWork should use a real HTTPS domain such as:

`https://api.smartwork-agent.id`

## Required API routes

- `GET /api/smartwork/jobs/health`
- `POST /api/smartwork/jobs`
- `GET /api/smartwork/jobs/:id`

## Required CORS

Allowed methods:

- `GET`
- `POST`
- `OPTIONS`

Allowed headers:

- `Content-Type`
- `X-SmartWork-Dry-Run`
- `Authorization`

Allowed origins:

- `https://smartwork-agent.id`
- `http://127.0.0.1:5197`
- `http://127.0.0.1:5217`

## Safety invariant

This phase only prepares API readiness files. It performs no SIAGA input, no browser automation against SIAGA, no real save, and no real send.
