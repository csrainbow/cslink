# TopUp Games (`/top-up`)

Sub-aplikasi PHP untuk jual pulsa, paket data, voucher & top-up game di `https://cslink.web.id/top-up`.
Pembayaran lewat **Midtrans Snap**, pengiriman produk lewat **Digiflazz**.

## Alur transaksi

```
1. Katalog     GET  /top-up/                     index.php  (produk status=1 dari data/topup.db)
2. Pilih       GET  /top-up/order.php?code=SKU   order.php  (form: ID akun [khusus game], zona, nomor tujuan)
3. Buat order  POST /top-up/api/order.php        api/order.php
                  - harga SELALU dari server (parameter amount klien diabaikan)
                  - idempotent: klik ganda memakai order + token Snap yang sama (5 menit)
                  - INSERT orders(ref_id=TOPUP-YYYYMMDDHHMMSS-xxxx, status waiting/pending)
                  - Midtrans Snap -> simpan snap_token
4. Bayar       Snap (snap.js) -> QRIS/VA/e-wallet/transfer
5. Notifikasi  POST /top-up/api/midtrans-callback.php   (juga /api/midtrans-callback.php via alias nginx)
                  - verifikasi sha512(order_id+status_code+gross_amount+MT_SERVER_KEY)
                  - settlement/capture -> payment_status=paid -> topupExecute()
6. Kirim       topupExecute() -> Digiflazz /v1/transaction
                  - target: game = "ID_AKUN|ZONA" (bila ada zona), lainnya = nomor tujuan
                  - status: Sukses=success (+SN), Gagal=failed, Pending=pending
                  - gagal level API (mis. rc 45 IP belum di-whitelist) -> kembali 'waiting' + last_error
7. Webhook     POST /top-up/api/digiflazz-callback.php  (HMAC-SHA1 X-Hub-Signature + IP 52.74.250.133)
8. Cek status  /top-up/status.php?ref=REF  &  /top-up/cek-status.php
```

## Konfigurasi (`config.local.php`, tidak di-commit)

| Konstanta | Keterangan |
|---|---|
| `DGF_USERNAME`, `DGF_APIKEY` | kredensial API Digiflazz |
| `DGF_TESTING` | `true` = simulasi (Development Key), `false` = transaksi riil |
| `DGF_WEBHOOK_SECRET` | secret webhook Digiflazz (dipakai `api/digiflazz-callback.php`) |
| `MT_SERVER_KEY`, `MT_CLIENT_KEY` | kredensial Midtrans (server & client key) |
| `MIDTRANS_IS_PRODUCTION` | `false` (default) = sandbox, `true` = produksi |
| `GT_ADMIN_PASS_HASH` | **wajib**: hash password panel admin |

Generate hash password admin:

```bash
php -r "echo password_hash('password-pilihan-anda', PASSWORD_DEFAULT), PHP_EOL;"
```

## Wajib dipenuhi di dashboard vendor

1. **Digiflazz → Atur Koneksi → API**: daftarkan **IP publik keluar server** pada IP whitelist
   (lihat nilainya di panel admin → tombol *Cek Koneksi*). Tanpa ini semua order gagal
   `rc 45 "IP Anda tidak kami kenali"`.
2. **Digiflazz → Webhook**: payload URL `https://cslink.web.id/top-up/api/digiflazz-callback.php`,
   content type `application/json`, secret = `DGF_WEBHOOK_SECRET`.
3. **Midtrans → Settings → Payment Settings → Notification URL**:
   `https://cslink.web.id/top-up/api/midtrans-callback.php`.
   (nginx juga menyediakan alias `/api/midtrans-callback.php` → aplikasi ini, agar konfigurasi lama tetap jalan.)

## Cron (jaring pengaman)

```cron
*/5  * * * * /usr/bin/php /var/www/game-topup/cli/poll-pending.php        >> /var/log/game-topup-poll.log 2>&1
*/20 * * * * /usr/bin/php /var/www/game-topup/cli/sync-pricelist.php prepaid >> /var/log/game-topup-sync.log 2>&1
```

- `poll-pending.php` — kirim ulang order `waiting`/`pending`/`processing` (maks 6 percobaan) dan catat `last_error`.
- `sync-pricelist.php` — tarik pricelist Digiflazz → tabel `products` (harga & kategori) + unduh logo brand.

## Panel admin

`https://cslink.web.id/top-up/admin/` — login dengan `GT_ADMIN_PASS_HASH`, dilengkapi CSRF,
diagnosa koneksi (mode Digiflazz, saldo, IP keluar, mode Midtrans), sync pricelist, dan tombol
**Ulang** untuk mengirim ulang produk pada order yang sudah dibayar.

## Menjalankan lokal

```bash
php -S 0.0.0.0:8090 -t . router.php     # buka http://localhost:8090
php cli/poll-pending.php                # cek order tertunda
php cli/sync-pricelist.php prepaid      # sync pricelist
```

`router.php` memblokir akses web ke `/config*`, `/data`, `/cli`, `/includes`, `/.git`, `/vendor`,
serta berkas backup/sensitif (`*.bak`, `*.db`, `*.md`, dst).

## Tabel database (`data/topup.db`)

| Tabel | Isi |
|---|---|
| `products` | katalog: `code` (buyer_sku_code), `name`, `price` (jual), `buy_price` (modal), `brand`, `category`, `status` |
| `orders` | transaksi: `ref_id`, `product_code`, `customer_no`, `player_id`, `zone_id`, `amount`, `payment_status`, `order_status`, `sn`, `attempts`, `last_error`, `raw` |
| `settings` | `pricelist_updated`, `games_json` |
