# CSLINK - URL Shortener

URL shortener modern dan lengkap, Powered By **Percetakan Rainbow**. Dibangun dengan Node.js, Express, SQLite, dan vanilla JavaScript.

## Fitur

- 🚀 **Perpendek URL** dengan cepat tanpa registrasi
- ✏️ **Kode kustom** untuk URL pendek yang mudah diingat
- ⏰ **Kedaluwarsa link** (1 jam, 24 jam, 7 hari, 30 hari)
- 📊 **Analitik lengkap** - klik per hari, browser, OS, perangkat
- 📱 **QR Code** untuk setiap link
- 🔄 **Toggle aktif/nonaktif** link
- 🗑️ **Hapus link** yang tidak diperlukan
- 🔍 **Pencarian** dan **pagination** untuk daftar link
- 📈 **Dashboard statistik** keseluruhan

## Teknologi

- **Backend**: Node.js, Express
- **Database**: SQLite (sql.js — pure JavaScript/WASM, tanpa kompilasi native)
- **Frontend**: HTML, CSS, Vanilla JavaScript
- **Library**: nanoid (generate kode), qrcode (QR Code PNG/SVG), ua-parser-js (deteksi browser/OS)

## Instalasi

### 🚀 One-Click Install (via curl)

Mendukung **Ubuntu / Debian / Rocky Linux / AlmaLinux / Fedora / Arch/Alpine**, arsitektur x86_64, ARM64 (armv7l juga didukung).

```bash
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/csrainbow/cslink/main/install.sh)"
```

Atau dengan direktori kustom:

```bash
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/csrainbow/cslink/main/install.sh)" install.sh /opt/cslink
```

Script otomatis melakukan:
1. Install package dasar (`git`, `curl`)
2. Install **Node.js v20** bila belum ada
3. Kloning repo CSLINK
4. Membuat `.env` (deteksi IP LAN otomatis)
5. Install dependency (`npm install`)
6. Registrasi **systemd service** `cslink` (auto-restart + auto-start saat boot)

Setelah selesai, akses via `http://IP-LAN:3000`.

### Instalasi Manual

```bash
# 1. Clone repo
git clone https://github.com/csrainbow/cslink.git
cd cslink

# 2. Konfigurasi
cp .env.example .env   # lalu edit PORT / BASE_URL jika perlu

# 3. Install dependencies
npm install

# 4. Jalankan server
npm start
```

Server akan berjalan di `http://localhost:3000`

### Menjadikan systemd service (opsional)

```bash
sudo tee /etc/systemd/system/cslink.service > /dev/null <<'EOF'
[Unit]
Description=CSLINK - URL Shortener
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/cslink
ExecStart=$(which node) /path/to/cslink/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now cslink
```

## Konfigurasi

Edit file `.env`:

```env
PORT=3000              # Port server
BASE_URL=http://localhost:3000   # URL dasar untuk redirect
DB_PATH=./data/urls.db # Lokasi database
```

## Akses Publik (Cloudflare Tunnel)

Tanpa IP publik / port forwarding — memakai [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/):

```bash
# 1. Install cloudflared
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloudflare.gpg
echo "deb [signed-by=/usr/share/keyrings/cloudflare.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update && sudo apt-get install -y cloudflared

# 2. Authorize & buat tunnel
cloudflared tunnel login
cloudflared tunnel create cslink

# 3. Konfigurasi ingress
#    Edit ~/.cloudflared/config.yml:
#    tunnel: <TUNNEL_ID>
#    credentials-file: /root/.cloudflared/<TUNNEL_ID>.json
#    ingress:
#      - hostname: cslink.web.id
#        service: http://localhost:3000
#      - service: http_status:404

# 4. Jalankan
cloudflared tunnel run cslink
```

Lalu di dashboard Cloudflare tambahkan DNS record:
`cslink.web.id` → CNAME → `<TUNNEL_ID>.cfargotunnel.com` (Proxy: ON)

## API Endpoints

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | `/api/shorten` | Memperpendek URL |
| GET | `/:code` | Redirect ke URL asli |
| GET | `/api/url/:code` | Info URL tertentu |
| GET | `/api/urls` | Daftar semua URL (dengan pagination & search) |
| DELETE | `/api/url/:code` | Hapus URL |
| PATCH | `/api/url/:code/toggle` | Toggle aktif/nonaktif |
| GET | `/api/analytics/:code` | Analitik URL tertentu |
| GET | `/api/qr/:code` | Generate QR Code |
| GET | `/api/stats` | Statistik keseluruhan |

## Cara Penggunaan

1. **Perpendek URL**: Tempel URL panjang di kolom input, klik "Perpendek"
2. **Kode kustom**: Opsional, masukkan kode sendiri (min 3 karakter)
3. **Kedaluwarsa**: Pilih durasi link aktif sebelum kedaluwarsa
4. **Lihat analitik**: Klik ikon chart pada daftar link
5. **QR Code**: Klik ikon QR untuk melihat atau unduh QR code

## Struktur Proyek

```
├── server.js          # Server utama & API
├── database.js        # Setup SQLite database
├── install.sh         # One-click installer (curl | bash)
├── package.json       # Konfigurasi proyek
├── .env.example       # Template environment variables
├── public/            # Frontend files
│   ├── index.html     # HTML utama
│   ├── styles.css     # CSS styles
│   └── script.js      # JavaScript frontend
└── data/              # Database files (auto-generated)
```

## Lisensi

MIT
