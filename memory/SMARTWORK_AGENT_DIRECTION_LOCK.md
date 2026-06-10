# SMARTWORK AGENT — PRODUCT DIRECTION LOCK

## Arah Utama
SmartWork Agent adalah aplikasi otomatisasi kerja.

Flow final wajib:

User isi request
→ SmartWork menyimpan request
→ Agent membaca request otomatis
→ Agent login SIAGA
→ Agent scan tanggal kosong sesuai request
→ Agent input semua tanggal kosong
→ Agent verifikasi semua tanggal sudah terisi
→ Agent download PDF
→ Agent buat proof report
→ Agent siapkan delivery email + WhatsApp preview
→ Job status COMPLETED

## Aturan Penting
Admin/user TIDAK BOLEH diminta:
- patch JSON manual
- klik konfirmasi eksekusi
- jalankan runner manual
- isi detailUrl manual
- mengatur autoSave manual
- monitor satu-satu tanggal

Semua wajib diproses oleh agent setelah request masuk.

## SIAGA Scope
Untuk SIAGA, fokus hanya:
1. input absensi sesuai request
2. skip Minggu
3. verifikasi hasil
4. download PDF presensi
5. proof report
6. delivery preview email + WhatsApp

## Status Saat Ini
Request sudah bisa masuk.
Agent sudah bisa save satu tanggal.
Masalah utama: pipeline belum menyelesaikan seluruh range otomatis sampai PDF + delivery.

## Target Patch Berikutnya
Perbaiki Request Runner agar:
- autoSave true dari server untuk request SIAGA
- detailUrl resolved otomatis dari target month/detail
- loop semua emptyDates sampai habis
- jika emptyDates = 0, lanjut download PDF
- lanjut proof report
- lanjut delivery preview
- update job COMPLETED

## Larangan
Jangan bilang berhasil sebelum:
- scan akhir menunjukkan emptyCanAdd = 0
- filled sesuai target
- PDF baru dibuat
- delivery preview baru dibuat
- job COMPLETED
