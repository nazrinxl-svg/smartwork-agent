# SmartWork SIAGA Safe Attendance Flow

## Purpose

This workflow defines how SmartWork Agent handles SIAGA attendance automation safely for one or many user accounts.

SIAGA is only one module in SmartWork Agent. The platform must stay modular so other work/admin systems can be added later.

## Core Principle

The user provides account data, target month/year, and exception days.  
The system owns the attendance time rules.

The user must not manually define jam masuk or jam pulang for SIAGA. SmartWork generates safe randomized times from the system rules.

## User Intake

The user fills:

- Teacher/account name
- SIAGA username
- SIAGA password
- Target month
- Target year
- Holidays
- Leave/cuti/izin/sakit days

Credentials must only be stored locally or in a secure vault. Credentials must never be sent to chat and must never be committed to Git.

## System-Owned Time Rules

SmartWork generates time values:

- Normal jam masuk: random 06:50–07:00
- Normal jam pulang Senin–Kamis: random 14:15–14:30
- Jumat jam pulang: random 11:30–11:35
- Sabtu jam pulang: random 15:15–15:30
- Minggu: skipped
- Holidays/cuti: skipped by default unless a later confirmed rule says otherwise

## Required Safety Stages

### 1. Intake Validation

Validate local intake file:

- JSON valid
- Account exists
- Target month/year exists
- Credential fields exist locally
- Holidays/leave dates are valid dates
- No credential printed to terminal/chat/report

### 2. Login Check

Run login check:

- Can login
- Can reach dashboard
- Screenshot/report
- No attendance input

### 3. Absensi Open Preview

Open SIAGA Absensi page:

- Preview visible during testing
- Headless during large execution
- Screenshot/report
- No month select
- No detail edit
- No input
- No save

### 4. Target Month Detail Finder

Find target month/year strictly:

- Must match target month and target year
- Never fallback to first detail row
- If target month/year is not found, return needs_check
- Never open wrong month such as January when target is June
- Screenshot/report

### 5. Form Diagnosis

Before input:

- Diagnose buttons and fields
- Confirm selectors for jam_masuk and jam_pulang
- Confirm target date
- No input
- No save

### 6. Dry Run Plan

Generate plan:

- List all target dates
- Skip Sundays
- Skip holidays/cuti
- Generate randomized times from system rules
- Show preview report
- No browser save

### 7. Preview Fill

Optional training stage:

- Fill one date or limited date range
- Screenshot before and after
- Stop before save unless explicit permission is given

### 8. Save Requires Explicit Permission

The agent must never click:

- Simpan
- Submit
- Delete
- Hapus
- Finalize

unless the user explicitly says a clear instruction such as:

- "izin save"
- "lanjut simpan"
- "izin hapus tanggal ..."
- "submit sekarang"

## Multi-Account Rule

For testing:

- Use visible preview only when user wants to watch.
- One account or multi-account visible preview is allowed.
- Multi-account preview opens multiple windows.

For real execution:

- Use headless/server mode.
- Use parallelLimit from local intake.
- Keep per-account browser profile/session.
- Produce per-account report and screenshots.

## Wrong Month Guard

Target month/year must be strict.

If target is Juni 2026:

- Detail page must contain "Juni 2026"
- Finder must match row containing "Juni" and "2026"
- Never use generic detail fallback
- If no strict match, stop with needs_check

## Current SIAGA Known Facts

Known stable SIAGA fields in detail form:

- `input[name="jam_masuk"]`
- `input[name="jam_pulang"]`
- button text: `Simpan Detail Absensi`

Known stable detail example from prior single-account test:

- `/guru/absensi/detail/8860825`
- This ID must not be hardcoded for multi-account production.
- Multi-account mode must discover detail ID per account and per target month/year.

## Agent Behavior

Always prefer this order:

1. Diagnose
2. Preview
3. Report
4. Confirm
5. Execute only when allowed

Never guess selectors when diagnosis is possible.
Never broaden into unrelated systems.
Keep security defensive and protective only.
