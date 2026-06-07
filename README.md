# SmartWork Agent

SmartWork Agent adalah project mandiri untuk membantu pekerjaan UI berulang di aplikasi web secara aman.

## Misi

Login -> navigasi -> pilih data -> input form/tabel -> validasi -> screenshot -> simpan hanya kalau diizinkan.

## Prinsip Aman

- Default tidak menyimpan data.
- Tidak bypass login.
- Tidak berjalan di domain publik tanpa izin.
- Tidak mengarang data asli.
- Untuk nilai asli wajib dari sumber resmi seperti Excel/JSON.
- Setiap aksi membuat report dan screenshot.

## Command

npm install
npm run agent
npm run login
npm run nilai
npm run shot

## Mode Simpan

Default aman tanpa simpan.

Untuk mengaktifkan simpan:

$env:SMARTWORK_SAVE="1"
npm run nilai

## Target Latihan Awal

SmartLearn Pro lokal:

http://localhost:5173

Akun testing:

tes.guru.pai02@gmail.com
