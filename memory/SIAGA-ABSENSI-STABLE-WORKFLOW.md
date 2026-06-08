# SIAGA Absensi Stable Workflow

Updated: 20260608-091031

## Status
Workflow SIAGA Absensi sudah stabil sampai klik Simpan.

## Aturan Wajib
- Micro-agent satu-satu.
- Jangan ulang login/dashboard/tambah kalau sudah di form.
- Jangan pakai agent zoom.
- Jangan pakai page.setViewportSize.
- Jangan pakai Emulation.setPageScaleFactor.
- Jangan pakai CSS zoom.
- Screenshot tidak boleh mengubah ukuran browser.
- Klik Simpan hanya kalau user mengizinkan.

## Alur Stabil
1. Pastikan Chrome debug SIAGA aktif.
2. Jika berada di \/index/beranda\, masuk ke \/guru\.
3. Buka \/guru/absensi/create\.
4. Isi hanya field yang kurang.
5. Sekolah = SDN 4 DWI TUNGGAL.
6. Bulan = Juni.
7. Tahun = 2026.
8. Status Cuti = Tidak ada cuti.
9. Screenshot final.
10. Simpan hanya jika user izinkan.

## Nilai Field
- Sekolah:
  - selector: \select[name="sekolah_id"]\
  - value: \16870\
  - text: \SDN 4 DWI TUNGGAL\
  - catatan: Select2/native select; jangan cuma klik teks visual.
- Bulan:
  - selector: \select[name="bulan"]\
  - value: \6\
  - text: \Juni\
- Tahun:
  - selector: \select[name="tahun"]\
  - value: \2026\
- Status Cuti:
  - selector: \input[name="status_cuti"][value="0"]\
  - text: \Tidak ada cuti\

## Script Stabil
- \scripts/smartwork-siaga-beranda-to-tambah-only.mjs\
- \scripts/smartwork-siaga-smart-fill-current-form-no-save.mjs\
- \scripts/smartwork-siaga-smart-fill-and-save.mjs\
- \scripts/smartwork-siaga-set-sekolah-select2-value-only.mjs\
- \scripts/smartwork-siaga-tahun-2026-native-only.mjs\
- \scripts/smartwork-siaga-bulan-juni.mjs\

## Catatan
Pesan duplicate:
\Data absensi di bulan, tahun dan sekolah ini sudah ada!\

Itu wajar untuk Juni 2026 karena data sudah pernah tersimpan.
