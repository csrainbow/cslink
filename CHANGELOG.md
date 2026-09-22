# Changelog

Semua perubahan penting pada CSLINK dicatat di file ini.

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/), dan proyek mengikuti [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.6] - 2026-09-23

### Diperbaiki
- **Link pembayaran toko/kasir via WA langsung terbuka (tanpa halaman iklan)**: link pendek yang mengarah
  ke halaman internal percetakan (`rainbowprinting.web.id` + path pembayaran: `pay-point.php`,
  `payment/confirm.php`, `payment/finish.php`, `cek-pesanan.php`, `invoice.php`, `n.php`,
  `nota-publik.php`, `checkout.php`, `order-success.php`) kini dijawab **HTTP 302 langsung** ke tujuan —
  tidak lagi ditahan halaman hitung mundur / pemeriksaan AdBlock. Klik tetap dicatat di tabel `clicks`.
  Link non-pembayaran (dan link ke situs lain) tetap melewati halaman iklan seperti biasa.
  Penyebab laporan 2 pelanggan: link WA toko dibuat sebagai `anon` sehingga kena iklan 10 detik +
  tombol lanjut hanya muncul bila lolos deteksi AdBlock + countdown selesai.
- Cara verifikasi: buat short link ke URL `pay-point.php` / `n.php/.../pay/...` lalu buka tanpa login —
  harus 302 ke halaman bayar; buat short link ke halaman lain — harus tetap 200 halaman iklan.

## [1.0.5] - 2026-09-21

### Diperbaiki (lanjutan sesi yang sama)
- **SQLite `database is locked`**: koneksi memakai `busy_timeout=30 dtk` + mode `WAL` sehingga proses web dan cron tulis-paralel tidak saling menjatuhkan; jalan cron yang gagal pada satu order tidak menghentikan order lain (try/catch per order).
- **Probe/tes dashboard Midtrans** (`order_id=payment_notif_test_...`, body kosong, GET/HEAD): callback kini menjawab `200 {"status":"ok"}` tanpa mengubah data, sehingga URL notifikasi lolos uji validasi dashboard.

## [1.0.4] - 2026-09-21

### Diperbaiki (sub-aplikasi TopUp Games `/top-up`)
- **Order lunas tidak lagi nyangkut**: pengiriman produk ke Digiflazz dipusatkan di `topupExecute()` (`includes/functions.php`), dipakai bersama oleh webhook Midtrans dan cron. Status order diklaim (`waiting` → `processing`) sehingga notifikasi berulang tidak mengirim produk dua kali.
- **Order tertunda dicoba ulang otomatis**: `cli/poll-pending.php` kini menangani status `waiting`/`pending`/`processing` yang gagal di level API (mis. IP belum di-whitelist), dibatasi 6 percobaan, dan mencatat alasan gagal.
- **Harga tidak bisa dimanipulasi**: `api/order.php` mengabaikan parameter `amount` dari klien dan selalu memakai harga produk dari server.
- **Target top-up sesuai jenis produk**: produk game memakai ID akun (+ zona, format `id|zona`), produk pulsa/data/e-money/voucher/PLN memakai nomor tujuan. Formulir `order.php` menyesuaikan (ID akun hanya muncul untuk game).
- **Redirect setelah bayar benar**: `finish_redirect_url` Snap memakai `BASE_PATH` (kembali ke `/top-up/status.php`, sebelumnya `/status.php` di root domain → 302 ke beranda).
- **Validasi input**: nomor tujuan 9–15 digit, ID akun wajib untuk produk game, dan klik ganda memakai order + token Snap yang sama (idempotensi 5 menit).
- **Status baru**: `refund`/`chargeback`, `processing`, dan `cancel` ditampilkan dengan label & badge yang tepat di halaman status, admin, dan cek status.

### Keamanan
- Password panel admin tidak lagi hardcoded: wajib `GT_ADMIN_PASS_HASH` (`password_hash`) di `config.local.php`, ditambah token CSRF, regenerasi sesi saat login, cookie HttpOnly + SameSite/Secure, dan jeda anti brute-force. Aksi sync pricelist dan proses ulang order kini POST + CSRF.
- `router.php` memblokir seluruh prefix `/config`, folder `/.git` & `/vendor`, serta berkas backup/sensitif (`*.bak`, `*.db`, `*.md`, `*.env`, `*.log`, dll) agar tidak pernah diserve sebagai teks.
- File sisa/duplikat di akar webroot game-topup (`functions.php`, `style.css`) dihapus.

### Ditambahkan
- `Digiflazz::deposit()` (cek saldo) dan `syncPriceList()` — satu jalur logika untuk panel admin dan `cli/sync-pricelist.php`.
- Panel admin: diagnosa koneksi (mode Digiflazz, saldo, IP keluar server untuk whitelist, mode Midtrans), kolom SN/Error + jumlah percobaan, tombol "Ulang" per order, dan informasi waktu sync pricelist terakhir.
- Kolom `orders.attempts` & `orders.last_error` (migrasi otomatis).
- Nginx: alias `location = /api/midtrans-callback.php` dan `/api/digiflazz-callback.php` ke aplikasi top-up, agar notifikasi Midtrans yang terlanjur didaftarkan tanpa prefix `/top-up` tetap sampai ke handler yang benar.

### Operasional (server)
- Cron baru: `cli/sync-pricelist.php prepaid` tiap 20 menit & `cli/poll-pending.php` tiap 5 menit (sebelumnya belum ada jadwal sama sekali).

## [1.0.3] - 2026-09-11

### Ditambahkan
- Halaman **Analitik** kini menampilkan **semua link** (yang sudah diklik maupun belum) dalam bentuk tabel ringkas — kolom Short URL, Original URL, Total Klik, Mobile, Desktop, Tablet.
- Tombol **Grafik** pada setiap baris untuk membuka detail analitik (grafik klik per hari, browser, OS, dan klik terbaru) di bawah tabel.
- Endpoint baru `GET /api/analytics/summary` — ringkasan klik per link beserta rincian perangkat (mobile/desktop/tablet) dalam satu query.
- Pencarian link pada halaman Analitik (filter cepat tanpa reload).
- **API Key (opsional)**: set `API_KEY` di `.env` → akses API pengelolaan cukup dengan header `x-api-key`, tanpa perlu sesi login (berguna untuk skrip/otomasi).

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