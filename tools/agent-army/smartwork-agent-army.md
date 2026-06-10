# SmartLearn Agent Army

Generated: 2026-06-06T23:20:05.283Z
Project: D:\1. myapps\smartlearn\smartlearn-pro-app-1.9
Total agents: **38**

## Ringkasan Pasukan

- Komandan otomatis: SmartAutoForge
- Pabrik agent: SmartForge
- Polisi agent: SmartPolice
- Agent baru AutoForge: auth, route, supabase, vercel

## Daftar Seluruh Agent

| No | Agent | Peran | Command | File |
|---:|---|---|---|---|
| 1 | agent army report | Agent pendukung SmartLearn | `npm run agent:army` | `scripts/smartagent-army-report.mjs` |
| 2 | agent builder | Pengecek UI / screenshot | `npm run agent:make` | `scripts/smartagent-builder.mjs` |
| 3 | roster | Pencatat daftar pasukan agent | `npm run agent:list` | `scripts/smartagent-roster.mjs` |
| 4 | auth | Pengecek login/register/session | `npm run check:auth` | `scripts/smartauth-agent.mjs` |
| 5 | autoforge | Komandan otomatis pembuat agent | `npm run forge:auto` | `scripts/smartautoforge-agent.mjs` |
| 6 | clean | Agent pendukung SmartLearn | `npm run smartclean` | `scripts/smartclean-assistant.mjs` |
| 7 | clip | Clipboard/helper input | `npm run smartclip` | `scripts/smartclip-agent.mjs` |
| 8 | clip register | Clipboard/helper input | `-` | `scripts/smartclip-register.mjs` |
| 9 | deploy | Pengecek kesiapan deploy | `npm run deploy:check` | `scripts/smartdeploy-agent.mjs` |
| 10 | dev brain | Komandan workflow | `npm run smartdev:brain` | `scripts/smartdev-brain.mjs` |
| 11 | dev guard bg | Penjaga keamanan defensif | `-` | `scripts/smartdev-guard-bg.mjs` |
| 12 | diagnose file | Pembaca file / diagnosis target | `npm run diagnose:file` | `scripts/smartdiagnose-file-agent.mjs` |
| 13 | doctor | Dokter build dan validasi akhir | `npm run doctor` | `scripts/smartdoctor-agent.mjs` |
| 14 | feature commander | Agent pendukung SmartLearn | `npm run feature:plan` | `scripts/smartfeature-commander-agent.mjs` |
| 15 | flow | Agent pendukung SmartLearn | `npm run smartflow` | `scripts/smartflow-assistant.mjs` |
| 16 | forge | Pabrik agent manual | `npm run forge:agent` | `scripts/smartforge-agent.mjs` |
| 17 | guard security | Penjaga keamanan defensif | `npm run security:check` | `scripts/smartguard-security-agent.mjs` |
| 18 | mission guard | Penjaga keamanan defensif | `npm run mission:guard` | `scripts/smartmission-guard-agent.mjs` |
| 19 | mission runner | Agent pendukung SmartLearn | `npm run mission:run` | `scripts/smartmission-runner-agent.mjs` |
| 20 | paste auto | Agent pendukung SmartLearn | `npm run agent:smartpaste-auto` | `scripts/smartpaste-auto-agent.mjs` |
| 21 | paste replace | Agent pendukung SmartLearn | `npm run smartpaste:replace` | `scripts/smartpaste-replace-agent.mjs` |
| 22 | paste ui | Pengecek UI / screenshot | `npm run smartpaste:ui` | `scripts/smartpaste-ui-agent.mjs` |
| 23 | patch guard | Penjaga keamanan defensif | `npm run smartpatch:guard` | `scripts/smartpatch-guard.mjs` |
| 24 | police | Polisi / pengawas arah kerja | `npm run police` | `scripts/smartpolice-agent.mjs` |
| 25 | reset | Pengecek reset password | `npm run check:reset` | `scripts/smartreset-agent.mjs` |
| 26 | route | Pengecek route publik | `npm run check:routes` | `scripts/smartroute-agent.mjs` |
| 27 | supabase | Pengecek konfigurasi Supabase | `npm run check:supabase` | `scripts/smartsupabase-agent.mjs` |
| 28 | test | Agent pendukung SmartLearn | `npm run smarttest` | `scripts/smarttest-assistant.mjs` |
| 29 | trainer | Agent pendukung SmartLearn | `npm run agent:trainer` | `scripts/smarttrainer-agent.mjs` |
| 30 | ui audit | Pengecek UI / screenshot | `npm run smartui:audit` | `scripts/smartui-audit.mjs` |
| 31 | ui control | Pengecek UI / screenshot | `-` | `scripts/smartui-control.mjs` |
| 32 | ui designer | Pengecek UI / screenshot | `-` | `scripts/smartui-designer.mjs` |
| 33 | ui fast | Pengecek UI / screenshot | `npm run smartui:fast` | `scripts/smartui-fast-agent.mjs` |
| 34 | ui register judge | Pengecek UI / screenshot | `npm run smartui:register-judge` | `scripts/smartui-register-judge.mjs` |
| 35 | ui screenshot | Pengecek UI / screenshot | `-` | `scripts/smartui-screenshot.mjs` |
| 36 | ui shot preset | Pengecek reset password | `npm run smartui:shot` | `scripts/smartui-shot-preset.mjs` |
| 37 | ui webcheck | Pengecek UI / screenshot | `npm run smartui:webcheck` | `scripts/smartui-webcheck.mjs` |
| 38 | vercel | Pengecek kesiapan deploy | `npm run check:vercel` | `scripts/smartvercel-agent.mjs` |

## Detail Agent

### agent army report

- Peran: Agent pendukung SmartLearn
- Command: `npm run agent:army`
- File: `scripts/smartagent-army-report.mjs`
- Purpose: Agent pendukung SmartLearn
- Source: filesystem
- Size: 32443 bytes
- Modified: 2026-06-06T18:30:05.841Z

### agent builder

- Peran: Pengecek UI / screenshot
- Command: `npm run agent:make`
- File: `scripts/smartagent-builder.mjs`
- Purpose: Pengecek UI / screenshot
- Source: filesystem
- Size: 9530 bytes
- Modified: 2026-06-06T10:57:33.660Z

### roster

- Peran: Pencatat daftar pasukan agent
- Command: `npm run agent:list`
- File: `scripts/smartagent-roster.mjs`
- Purpose: Menampilkan daftar agent SmartLearn yang sudah dibuat
- Source: existingAgents
- Size: 5478 bytes
- Modified: 2026-06-06T10:07:17.284Z

### auth

- Peran: Pengecek login/register/session
- Command: `npm run check:auth`
- File: `scripts/smartauth-agent.mjs`
- Purpose: Cek login, register, session, dan reset password tanpa patch dulu
- Source: createdAgents, plannedAgents
- Size: 1591 bytes
- Modified: 2026-06-06T09:57:11.221Z

### autoforge

- Peran: Komandan otomatis pembuat agent
- Command: `npm run forge:auto`
- File: `scripts/smartautoforge-agent.mjs`
- Purpose: Komandan otomatis pembuat agent
- Source: filesystem
- Size: 8272 bytes
- Modified: 2026-06-06T10:14:04.227Z

### clean

- Peran: Agent pendukung SmartLearn
- Command: `npm run smartclean`
- File: `scripts/smartclean-assistant.mjs`
- Purpose: Agent pendukung SmartLearn
- Source: filesystem
- Size: 6544 bytes
- Modified: 2026-06-05T04:55:03.132Z

### clip

- Peran: Clipboard/helper input
- Command: `npm run smartclip`
- File: `scripts/smartclip-agent.mjs`
- Purpose: Clipboard/helper input
- Source: filesystem
- Size: 10209 bytes
- Modified: 2026-06-05T16:26:56.107Z

### clip register

- Peran: Clipboard/helper input
- Command: `-`
- File: `scripts/smartclip-register.mjs`
- Purpose: Clipboard/helper input
- Source: filesystem
- Size: 3671 bytes
- Modified: 2026-06-05T15:27:44.014Z

### deploy

- Peran: Pengecek kesiapan deploy
- Command: `npm run deploy:check`
- File: `scripts/smartdeploy-agent.mjs`
- Purpose: Pengecek kesiapan deploy
- Source: filesystem
- Size: 1341 bytes
- Modified: 2026-06-06T09:43:55.808Z

### dev brain

- Peran: Komandan workflow
- Command: `npm run smartdev:brain`
- File: `scripts/smartdev-brain.mjs`
- Purpose: Komandan workflow
- Source: filesystem
- Size: 9450 bytes
- Modified: 2026-06-06T18:26:13.224Z

### dev guard bg

- Peran: Penjaga keamanan defensif
- Command: `-`
- File: `scripts/smartdev-guard-bg.mjs`
- Purpose: Penjaga keamanan defensif
- Source: filesystem
- Size: 2668 bytes
- Modified: 2026-06-05T15:15:40.500Z

### diagnose file

- Peran: Pembaca file / diagnosis target
- Command: `npm run diagnose:file`
- File: `scripts/smartdiagnose-file-agent.mjs`
- Purpose: Pembaca file / diagnosis target
- Source: filesystem
- Size: 6604 bytes
- Modified: 2026-06-06T08:51:16.831Z

### doctor

- Peran: Dokter build dan validasi akhir
- Command: `npm run doctor`
- File: `scripts/smartdoctor-agent.mjs`
- Purpose: Dokter build dan validasi akhir
- Source: filesystem
- Size: 6139 bytes
- Modified: 2026-06-06T06:14:47.471Z

### feature commander

- Peran: Agent pendukung SmartLearn
- Command: `npm run feature:plan`
- File: `scripts/smartfeature-commander-agent.mjs`
- Purpose: Agent pendukung SmartLearn
- Source: filesystem
- Size: 14038 bytes
- Modified: 2026-06-06T18:39:16.710Z

### flow

- Peran: Agent pendukung SmartLearn
- Command: `npm run smartflow`
- File: `scripts/smartflow-assistant.mjs`
- Purpose: Agent pendukung SmartLearn
- Source: filesystem
- Size: 6798 bytes
- Modified: 2026-06-05T05:57:23.582Z

### forge

- Peran: Pabrik agent manual
- Command: `npm run forge:agent`
- File: `scripts/smartforge-agent.mjs`
- Purpose: Pabrik agent manual
- Source: filesystem
- Size: 6799 bytes
- Modified: 2026-06-06T10:14:04.213Z

### guard security

- Peran: Penjaga keamanan defensif
- Command: `npm run security:check`
- File: `scripts/smartguard-security-agent.mjs`
- Purpose: Penjaga keamanan defensif
- Source: filesystem
- Size: 14390 bytes
- Modified: 2026-06-06T09:36:31.341Z

### mission guard

- Peran: Penjaga keamanan defensif
- Command: `npm run mission:guard`
- File: `scripts/smartmission-guard-agent.mjs`
- Purpose: Penjaga keamanan defensif
- Source: filesystem
- Size: 9953 bytes
- Modified: 2026-06-06T18:54:48.725Z

### mission runner

- Peran: Agent pendukung SmartLearn
- Command: `npm run mission:run`
- File: `scripts/smartmission-runner-agent.mjs`
- Purpose: Agent pendukung SmartLearn
- Source: filesystem
- Size: 9886 bytes
- Modified: 2026-06-06T23:19:51.945Z

### paste auto

- Peran: Agent pendukung SmartLearn
- Command: `npm run agent:smartpaste-auto`
- File: `scripts/smartpaste-auto-agent.mjs`
- Purpose: Agent pendukung SmartLearn
- Source: filesystem
- Size: 4784 bytes
- Modified: 2026-06-06T10:57:33.676Z

### paste replace

- Peran: Agent pendukung SmartLearn
- Command: `npm run smartpaste:replace`
- File: `scripts/smartpaste-replace-agent.mjs`
- Purpose: Agent pendukung SmartLearn
- Source: filesystem
- Size: 5486 bytes
- Modified: 2026-06-06T10:41:42.005Z

### paste ui

- Peran: Pengecek UI / screenshot
- Command: `npm run smartpaste:ui`
- File: `scripts/smartpaste-ui-agent.mjs`
- Purpose: Pengecek UI / screenshot
- Source: filesystem
- Size: 7638 bytes
- Modified: 2026-06-06T04:46:42.762Z

### patch guard

- Peran: Penjaga keamanan defensif
- Command: `npm run smartpatch:guard`
- File: `scripts/smartpatch-guard.mjs`
- Purpose: Penjaga keamanan defensif
- Source: filesystem
- Size: 3710 bytes
- Modified: 2026-06-06T08:24:20.463Z

### police

- Peran: Polisi / pengawas arah kerja
- Command: `npm run police`
- File: `scripts/smartpolice-agent.mjs`
- Purpose: Polisi / pengawas arah kerja
- Source: filesystem
- Size: 5794 bytes
- Modified: 2026-06-06T09:28:15.916Z

### reset

- Peran: Pengecek reset password
- Command: `npm run check:reset`
- File: `scripts/smartreset-agent.mjs`
- Purpose: Pengecek reset password
- Source: filesystem
- Size: 1327 bytes
- Modified: 2026-06-06T09:42:05.597Z

### route

- Peran: Pengecek route publik
- Command: `npm run check:routes`
- File: `scripts/smartroute-agent.mjs`
- Purpose: Cek route publik dan halaman penting sebelum deploy
- Source: createdAgents, plannedAgents
- Size: 1522 bytes
- Modified: 2026-06-06T09:57:11.221Z

### supabase

- Peran: Pengecek konfigurasi Supabase
- Command: `npm run check:supabase`
- File: `scripts/smartsupabase-agent.mjs`
- Purpose: Cek konfigurasi Supabase defensif tanpa membaca secret sensitif
- Source: createdAgents, plannedAgents
- Size: 1582 bytes
- Modified: 2026-06-06T09:57:11.221Z

### test

- Peran: Agent pendukung SmartLearn
- Command: `npm run smarttest`
- File: `scripts/smarttest-assistant.mjs`
- Purpose: Agent pendukung SmartLearn
- Source: filesystem
- Size: 7025 bytes
- Modified: 2026-06-05T06:00:18.541Z

### trainer

- Peran: Agent pendukung SmartLearn
- Command: `npm run agent:trainer`
- File: `scripts/smarttrainer-agent.mjs`
- Purpose: Agent pendukung SmartLearn
- Source: filesystem
- Size: 15118 bytes
- Modified: 2026-06-06T18:23:01.795Z

### ui audit

- Peran: Pengecek UI / screenshot
- Command: `npm run smartui:audit`
- File: `scripts/smartui-audit.mjs`
- Purpose: Pengecek UI / screenshot
- Source: filesystem
- Size: 24744 bytes
- Modified: 2026-06-05T16:21:52.947Z

### ui control

- Peran: Pengecek UI / screenshot
- Command: `-`
- File: `scripts/smartui-control.mjs`
- Purpose: Pengecek UI / screenshot
- Source: filesystem
- Size: 2496 bytes
- Modified: 2026-06-05T15:15:40.494Z

### ui designer

- Peran: Pengecek UI / screenshot
- Command: `-`
- File: `scripts/smartui-designer.mjs`
- Purpose: Pengecek UI / screenshot
- Source: filesystem
- Size: 12416 bytes
- Modified: 2026-06-05T14:18:39.092Z

### ui fast

- Peran: Pengecek UI / screenshot
- Command: `npm run smartui:fast`
- File: `scripts/smartui-fast-agent.mjs`
- Purpose: Pengecek UI / screenshot
- Source: filesystem
- Size: 6474 bytes
- Modified: 2026-06-06T04:37:48.674Z

### ui register judge

- Peran: Pengecek UI / screenshot
- Command: `npm run smartui:register-judge`
- File: `scripts/smartui-register-judge.mjs`
- Purpose: Pengecek UI / screenshot
- Source: filesystem
- Size: 7142 bytes
- Modified: 2026-06-05T18:14:54.785Z

### ui screenshot

- Peran: Pengecek UI / screenshot
- Command: `-`
- File: `scripts/smartui-screenshot.mjs`
- Purpose: Pengecek UI / screenshot
- Source: filesystem
- Size: 11091 bytes
- Modified: 2026-06-05T14:47:36.777Z

### ui shot preset

- Peran: Pengecek reset password
- Command: `npm run smartui:shot`
- File: `scripts/smartui-shot-preset.mjs`
- Purpose: Pengecek reset password
- Source: filesystem
- Size: 3223 bytes
- Modified: 2026-06-06T08:29:15.754Z

### ui webcheck

- Peran: Pengecek UI / screenshot
- Command: `npm run smartui:webcheck`
- File: `scripts/smartui-webcheck.mjs`
- Purpose: Pengecek UI / screenshot
- Source: filesystem
- Size: 8904 bytes
- Modified: 2026-06-06T08:21:22.131Z

### vercel

- Peran: Pengecek kesiapan deploy
- Command: `npm run check:vercel`
- File: `scripts/smartvercel-agent.mjs`
- Purpose: Cek kesiapan konfigurasi Vercel tanpa menjalankan deploy
- Source: createdAgents, plannedAgents
- Size: 1576 bytes
- Modified: 2026-06-06T09:57:11.236Z

## Commit Terakhir

```txt
9480dd1 Polish login role icons and button sizing
9828e08 Allow manual login for app profiles
bbc2725 Fix Vercel build dependency conflict
3387086 Fix Vercel rewrite for SPA deploy
4f2a0f2 Add Vercel SPA fallback and Supabase env example
ca469e3 Checkpoint safe build and doctor before Vercel auth testing
bb84ff8 Guard reset password session from auto login
c56d1a2 Add dedicated reset password page
bc56e7d Return to normal login after password reset
e20f37d Prevent auto login during password reset
```

## Status Git Ringkas

```txt
M package.json
 M scripts/smartagent-army-report.mjs
 M scripts/smartdev-brain.mjs
?? feature-reports/
?? mission-guard-reports/
?? mission-reports/
?? scripts/smartfeature-commander-agent.mjs
?? scripts/smartmission-guard-agent.mjs
?? scripts/smartmission-runner-agent.mjs
?? scripts/smarttrainer-agent.mjs
```
