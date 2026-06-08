# SmartWork Agent Doctrine

Updated: 20260608-091203

This doctrine imports the working style from SmartLearn Pro Agent Army into SmartWork Agent.

## Core Rule
SmartWork Agent must work like a disciplined agent army, not like a random browser bot.

## Mandatory Workflow
1. Brain first.
2. Diagnose current file/browser/page state first.
3. Guard before risky action.
4. Backup before editing scripts.
5. Use micro-agent one step at a time.
6. Do not repeat login/dashboard/tambah if already on the target form.
7. Fill only missing fields.
8. Screenshot/report after important action.
9. Save/click/submit only when user explicitly permits.

## Forbidden
- Do not use page.setViewportSize.
- Do not use Emulation.setPageScaleFactor.
- Do not use CSS zoom.
- Do not use zoom agent.
- Do not change browser size for screenshots.
- Do not use long flow while unstable.
- Do not guess selector before diagnosis.
- Do not click Simpan without permission.

## SIAGA Absensi Stable Values
- Sekolah: SDN 4 DWI TUNGGAL
  - selector: select[name="sekolah_id"]
  - value: 16870
  - method: native select value + input/change + jQuery change trigger
- Bulan: Juni
  - selector: select[name="bulan"]
  - value: 6
- Tahun: 2026
  - selector: select[name="tahun"]
  - value: 2026
- Status Cuti: Tidak ada cuti
  - selector: input[name="status_cuti"][value="0"]
  - value: 0

## Stable SIAGA Scripts
- scripts/smartwork-siaga-beranda-to-tambah-only.mjs
- scripts/smartwork-siaga-smart-fill-current-form-no-save.mjs
- scripts/smartwork-siaga-smart-fill-and-save.mjs
- scripts/smartwork-siaga-set-sekolah-select2-value-only.mjs
- scripts/smartwork-siaga-tahun-2026-native-only.mjs
- scripts/smartwork-siaga-bulan-juni.mjs

## Important
Duplicate message is expected for Juni 2026:
Data absensi di bulan, tahun dan sekolah ini sudah ada!
