# SmartWork Production Worker 24/7 - DewaVPS Candidate

## Target

SmartWork harus berjalan tanpa laptop lokal:

1. User submit request dari app/web.
2. Backend menerima intake request.
3. Queue/job dibuat.
4. Production worker berjalan 24/7 di VPS.
5. Worker memproses job.
6. Progress bisa dibaca dari app.
7. PDF/proof siap diunduh dari app.
8. Email/WhatsApp tetap disabled sampai provider real dan guard siap.

## VPS Candidate

DewaVPS self-managed cocok untuk fase ini karena:
- VPS hidup 24/7.
- Bisa pakai Node.js service.
- Bisa pakai systemd atau PM2.
- Biaya mengikuti top-up/pay-per-use sesuai model DewaVPS.

Catatan: harga/spec terbaru harus dicek langsung di kalkulator DewaVPS sebelum pembelian.

## First-run policy

First VPS boot wajib dry-run:

```env
SMARTWORK_DRY_RUN=true
SMARTWORK_NO_SIAGA_INPUT=true
SMARTWORK_NO_BROWSER_OPEN=true
SMARTWORK_NO_REAL_SAVE=true
SMARTWORK_NO_REAL_SEND=true
SMARTWORK_REAL_SAVE_ENABLED=false
SMARTWORK_APP_ARTIFACTS_ONLY=true
SMARTWORK_EMAIL_ENABLED=false
SMARTWORK_WHATSAPP_ENABLED=false
```

## Suggested VPS path

```bash
/opt/smartwork-agent
```

## Services

Systemd files:

- `deploy/dewavps/smartwork-control-server.service`
- `deploy/dewavps/smartwork-production-worker.service`

PM2 fallback:

- `deploy/dewavps/ecosystem.config.cjs`

## First VPS commands

```bash
sudo adduser --system --group --home /opt/smartwork-agent smartwork
sudo mkdir -p /opt/smartwork-agent
sudo chown -R smartwork:smartwork /opt/smartwork-agent

cd /opt/smartwork-agent
bash deploy/dewavps/first-run-dry-run.sh
```

## Promote later to guarded real mode

Only after dry-run health, queue, progress, artifact report, PDF/proof path, and app download are confirmed.

Do not enable real save/send/delete until explicit guarded phase.
