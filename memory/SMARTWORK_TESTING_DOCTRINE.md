# SmartWork Agent Testing Doctrine

Wajib dipatuhi setiap testing, debugging, watcher, runner, finalizer, dan UI progress.

1. Jangan ulang input tanggal yang sudah selesai.
   - Kalau tanggal sudah `already_filled_verified`, `Ubah`, atau `hapus`, jangan input SIAGA lagi.
   - Gunakan bukti existing report untuk finalize, bukan re-run input.

2. Request baru boleh, tapi watcher harus mulai dari clean profile lock.
   - Sebelum watcher/runner jalan, bersihkan lock browser profile.
   - Jika run gagal karena profile terkunci, jangan simpulkan SIAGA gagal.
   - Retry harus melewati profile lock cleanup dulu.

3. Setelah runner selesai, finalizer harus filter range aktif saja.
   - Jangan hitung semua tanggal bulan berjalan.
   - Final report wajib memakai active request range.

4. UI progress harus baca `reports/smartwork-app-artifacts-report.json`.
   - App artifacts adalah source of truth untuk status user-facing.
   - Kalau final artifacts sudah `ok:true`, `percent:100`, `verifyComplete:true`, UI tidak boleh tampil 0%.
   - UI harus kompatibel dengan schema finalizer: `app.progress`, `app.artifacts`, dan `finalProgress.verification`.

5. Tombol “Lihat PDF” harus selalu menuju:
   `/reports/downloads/<file>.pdf`
   - Tidak boleh href `/`.
   - Tidak boleh balik ke login/index.
   - Server harus serve PDF sebagai `application/pdf`.

Doctrine lock:
- Jangan restart dari nol.
- Jangan ulang loop login/input untuk request yang sudah terbukti selesai.
- Diagnosis dulu dari report, state, DOM, dan static route.
- Patch kecil sesuai bukti.
- Commit hanya setelah final progress 100%, PDF/proof ready, dan UI link benar.
