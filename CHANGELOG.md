# Changelog

Semua perubahan penting pada CSLINK dicatat di file ini.

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/), dan proyek mengikuti [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.3] - 2026-09-11

### Ditambahkan
- Halaman **Analitik** kini menampilkan **semua link** (yang sudah diklik maupun belum) dalam bentuk tabel ringkas — kolom Short URL, Original URL, Total Klik, Mobile, Desktop, Tablet.
- Tombol **Grafik** pada setiap baris untuk membuka detail analitik (grafik klik per hari, browser, OS, dan klik terbaru) di bawah tabel.
- Endpoint baru `GET /api/analytics/summary` — ringkasan klik per link beserta rincian perangkat (mobile/desktop/tablet) dalam satu query.
- Pencarian link pada halaman Analitik (filter cepat tanpa reload).

## [1.0.2] - 2026-09-11

### Ditambahkan
- Tampilan analitik compact: stat ringkas (Total Klik, Mobile, Desktop, Tablet), grafik klik per hari sederhana, breakdown Browser & OS berdampingan, tabel "Klik Terbaru" bergaya halaman Link Saya (kolom Detail, Device, IP, Waktu).
- Chip perangkat berwarna (mobile/desktop/tablet) pada tabel klik terbaru.

## [1.0.1] - 2026-09-11

### Diperbaiki
- Tombol **Keluar** tidak berfungsi: klik tombol memicu `navigateTo(undefined)` (TypeError) karena tombol berkelas `nav-link` tanpa `data-section`. Handler navigasi kini mengabaikan elemen tanpa `data-section`.

## [1.0.0] - 2026-09-11

### Ditambahkan
- **Mode privat**: dashboard dan semua API pengelolaan wajib login (sesi cookie `cslink_session`, HttpOnly, SameSite=Lax, berlaku 7 hari, tersimpan di database sehingga tetap aktif setelah restart).
- Halaman **Login / Setup Admin** (`/login`): pembuatan akun admin pertama kali (username 3-30 karakter, password min. 6), login, logout.
- Password admin di-hash `scrypt` (salt 16 byte) disimpan di tabel `config`.
- Gunakan `POST /api/setup` hanya sekali; selanjutnya `POST /api/login`.
- Ganti kata sandi di Pengaturan (`POST /api/auth/change-password`) yang mematikan sesi perangkat lain.
- Redirect link pendek (`/:code`) tetap publik — link yang dibagikan terbuka tanpa login.
- Proteksi **same-origin**: API memblokir permintaan lintas-origin (pengganti middleware `cors`).
- Tabel `config` dan `sessions` di database (migrasi aman untuk data lama).

## [0.2.0] - 2026-09-09

### Ditambahkan
- **One-click installer** (`install.sh`): `curl -fsSL ... | bash` — clone repo, instal dependency, buat service systemd, tentukan port otomatis.
- **Auto-pilih port** pada installer: mencoba port kosong pertama dari daftar kandidat (`CSLINK_PORT_CANDIDATES=(3000 4000 5000 8080 8111 9000)`); bisa di-override dengan `CSLINK_PORT=8080`.

## [0.1.0] - 2026-09-08

### Ditambahkan
- CSLINK URL shortener: server Express + sql.js (SQLite).
- Fitur dasar: perpendek URL (kode acak/kustom), QR Code (SVG/PNG), analitik klik (per hari, browser, OS, perangkat, IP), pagination & pencarian link.
- Frontend modern (single-page): dashboard statistik, daftar link, analitik, pengaturan QR, halaman Tentang.
- Deploy via Cloudflare Tunnel untuk akses publik tanpa IP publik.