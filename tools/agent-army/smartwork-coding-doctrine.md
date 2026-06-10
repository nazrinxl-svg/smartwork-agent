# SmartWork Agent Army - Coding Control Doctrine

Tujuan:
Menjadikan Agent Army sebagai sistem kontrol kerja saat mengembangkan SmartWork Agent, agar setiap patch punya arah, aman, dan bisa diaudit.

Aturan utama:
1. Jangan ubah app utama sebelum ada backup.
2. Jangan patch banyak file tanpa diagnosis.
3. Jangan save/delete/send data nyata tanpa izin eksplisit.
4. Jangan bikin gambar kalau user minta edit code/UI.
5. Setelah patch wajib ada check, doctor, dan ringkasan.

Urutan kerja wajib:
1. SmartBrain    : tentukan tujuan dan rencana kecil.
2. SmartGuard    : backup, cek status git, cegah perubahan berbahaya.
3. SmartDiagnose : baca file/error/alur sebelum patch.
4. SmartPaste    : apply patch kecil.
5. SmartCompile  : jalankan build/check bila tersedia.
6. SmartUI       : screenshot/cek tampilan bila UI berubah.
7. SmartDoctor   : audit hasil dan report.
8. SmartBuddy    : ringkas hasil ke user.
9. SmartDeploy   : commit/push hanya kalau user setuju.
