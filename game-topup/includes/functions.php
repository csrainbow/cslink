<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/Digiflazz.php';

/** Bersihkan nomor tujuan (hilangkan spasi/karakter aneh) */
function cleanNumber(string $n): string {
    return preg_replace('/[^0-9]/', '', $n);
}

/** Generate ref_id unik: TOPUP-YYYYMMDDHHMMSS-xxxx */
function genRefId(): string {
    return 'TOPUP-' . date('YmdHis') . '-' . substr(str_shuffle('abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'), 0, 4);
}

/** Simpan order baru */
function createOrder(array $data): array {
    $db = db();
    $ref = $data['ref_id'] ?? genRefId();
    $st = $db->prepare("INSERT INTO orders
        (ref_id, product_code, product_name, customer_no, player_id, zone_id, amount, payment_method)
        VALUES (?,?,?,?,?,?,?,?)");
    $st->execute([
        $ref,
        $data['product_code'],
        $data['product_name'] ?? '',
        cleanNumber($data['customer_no']),
        $data['player_id'] ?? '',
        $data['zone_id'] ?? '',
        (int) $data['amount'],
        $data['payment_method'] ?? 'midtrans',
    ]);
    return ['id' => (int) $db->lastInsertId(), 'ref_id' => $ref];
}

/** Buat Snap token Midtrans untuk pembayaran */
function midtransSnap(string $orderId, int $amount, string $itemName, array $customer = []): array {
    $serverKey = MT_SERVER_KEY;
    $base = MIDTRANS_IS_PRODUCTION ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com';

    $customer = [
        'first_name' => substr($customer['name'] ?? 'TopUp', 0, 20),
        'phone' => $customer['phone'] ?? '',
    ];
    if (!empty($customer['email'] ?? '') && filter_var($customer['email'], FILTER_VALIDATE_EMAIL)) {
        $customer['email'] = $customer['email'];
    }
    $params = [
        'transaction_details' => [
            'order_id' => $orderId,
            'gross_amount' => $amount,
        ],
        'item_details' => [
            ['id' => 'TOPUP', 'price' => $amount, 'quantity' => 1, 'name' => substr($itemName, 0, 50)],
        ],
        'customer_details' => $customer,
        // Wajib pakai BASE_PATH: sub-aplikasi ini hidup di /top-up (bukan di root domain).
        'finish_redirect_url' => BASE_URL . BASE_PATH . '/status.php?ref=' . urlencode($orderId),
    ];

    $ch = curl_init($base . '/snap/v1/transactions');
    curl_setopt_array($ch, [
        CURLOPT_POST => 1,
        CURLOPT_POSTFIELDS => json_encode($params),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
        CURLOPT_USERPWD => $serverKey . ':',
        CURLOPT_RETURNTRANSFER => 1,
        CURLOPT_TIMEOUT => 30,
    ]);
    $resp = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $data = json_decode($resp, true);
    if ($code >= 400 || !isset($data['token'])) {
        return ['error' => $data['status_message'] ?? 'Midtrans HTTP ' . $code, 'token' => null];
    }
    return ['error' => null, 'token' => $data['token'], 'redirect_url' => $data['redirect_url'] ?? ''];
}

/** Rekap status pembayaran (untuk halaman cursor) */
function paymentStatusText(string $s): string {
    return match ($s) {
        'pending' => 'Menunggu Pembayaran',
        'waiting' => 'Menunggu Penjadwalan',
        'processing' => 'Sedang Diproses',
        'paid' => 'Dibayar',
        'success' => 'Sukses',
        'failed' => 'Gagal',
        'expired' => 'Kedaluwarsa',
        'cancel' => 'Dibatalkan',
        'refund' => 'Dana Dikembalikan',
        default => ucfirst($s),
    };
}

/**
 * Produk game atau bukan.
 * Target top-up Digiflazz: game = ID akun (game tertentu pakai "id|zona"),
 * non-game (pulsa/data/e-money/voucher/PLN/dll) = nomor HP tujuan.
 */
function product_is_game(array $p): bool {
    $cat = strtolower(trim((string) ($p['category'] ?? '')));
    if ($cat !== '') {
        if (strpos($cat, 'game') !== false) return true;
        // Kategori Digiflazz non-game yang sudah dikenal -> pasti pakai nomor HP.
        if (preg_match('/pulsa|data|voucher|e-?money|pln|tv|gas|sms|telpon|telepon|masa aktif|aktivasi/i', $cat)) {
            return false;
        }
    }
    // Fallback: tebak dari nama produk (sama dengan chip kategori di katalog).
    $byName = product_category((string) ($p['name'] ?? ''));
    return $byName !== 'Paket Data' && $byName !== 'Voucher';
}

/** Nomor tujuan yang dikirim ke Digiflazz untuk sebuah order. */
function topupTarget(array $order): string {
    $st = db()->prepare("SELECT * FROM products WHERE code=?");
    $st->execute([$order['product_code']]);
    $product = $st->fetch();

    if ($product && product_is_game($product)) {
        $target = trim((string) $order['player_id']);
        if ($target === '') $target = cleanNumber((string) $order['customer_no']);
        $zone = trim((string) ($order['zone_id'] ?? ''));
        if ($zone !== '') $target .= '|' . $zone; // format Digiflazz untuk game ber-zona
        return $target;
    }
    return cleanNumber((string) $order['customer_no']);
}

/** Buang field sensitif dari respons Digiflazz sebelum disimpan/ditampilkan. */
function dgf_safe(array $res): array {
    $out = ['http' => $res['http'] ?? 0];
    if (!empty($res['error'])) $out['error'] = $res['error'];
    $data = is_array($res['data'] ?? null) ? $res['data'] : [];
    foreach (['api_key', 'sign', 'username'] as $k) unset($data[$k]);
    $out['data'] = $data;
    return $out;
}

/** Kategorikan produk dari nama (game / paket data / voucher) */
function product_category(string $name): string {
    $n = strtolower($name ?? '');
    $games = [
        ['mobile legend', 'Mobile Legends'], ['free fire', 'Free Fire'], ['pubg', 'PUBG'],
        ['genshin', 'Genshin Impact'], ['honkai', 'Honkai'], ['roblox', 'Roblox'],
        ['minecraft', 'Minecraft'], ['valorant', 'Valorant'], ['call of duty', 'CoD'],
        ['cod', 'CoD'], ['hok', 'Honor of Kings'], ['lol', 'League of Legends'],
        ['ff diamond', 'Free Fire'], ['ml diamond', 'Mobile Legends'], ['diamond', 'Mobile Legends'],
    ];
    foreach ($games as $g) {
        if (strpos($n, $g[0]) !== false) return $g[1];
    }
    $toks = preg_split('/[\s\-]+/', $n);
    if (array_intersect($toks, ['data', 'xl', 'axis', 'three', 'tri', 'indosat', 'ims', 'smartfren', 'telkomsel', 'tsel', 'byu', 'sbyu', 'unlimited', 'kuota'])) {
        return 'Paket Data';
    }
    return 'Voucher';
}

/**
 * Eksekusi top-up ke Digiflazz untuk satu order.
 * Idempotent: status diklaim (waiting/pending -> processing) lebih dulu, jadi aman
 * dipanggil berulang dari notifikasi Midtrans maupun dari cron poll-pending.
 *
 * @return array{status:string,rc:string,message:string,sn:string}
 */
function topupExecute(int $orderId): array {
    $db = db();
    $st = $db->prepare("SELECT * FROM orders WHERE id=?");
    $st->execute([$orderId]);
    $o = $st->fetch();
    if (!$o) {
        return ['status' => '', 'rc' => '', 'message' => 'order tidak ditemukan', 'sn' => ''];
    }
    if (!in_array($o['order_status'], ['waiting', 'pending'], true)) {
        return ['status' => (string) $o['order_status'], 'rc' => '', 'message' => 'tidak perlu diproses', 'sn' => (string) $o['sn']];
    }

    // Klaim (kunci) order: notifikasi Midtrans bisa datang berulang/paralel.
    $claim = $db->prepare("UPDATE orders SET order_status='processing', attempts=attempts+1, updated_at=CURRENT_TIMESTAMP
                           WHERE id=? AND order_status IN ('waiting','pending')");
    $claim->execute([$orderId]);
    if ($claim->rowCount() === 0) {
        return ['status' => 'processing', 'rc' => '', 'message' => 'order sedang diproses proses lain', 'sn' => ''];
    }

    $target = topupTarget($o);
    $dgf = new Digiflazz();
    $res = $dgf->topup((string) $o['ref_id'], (string) $o['product_code'], $target);
    $d = is_array($res['data'] ?? null) ? $res['data'] : [];
    $rc = (string) ($d['rc'] ?? '');
    $message = trim((string) ($d['message'] ?? ($res['error'] ?? '')));

    // Gagal di level API (mis. rc 45 IP belum di-whitelist, kredensial, timeout)
    // -> kembalikan ke 'waiting' supaya cron mencoba lagi, plus catat alasannya.
    if (!empty($res['error'])) {
        $db->prepare("UPDATE orders SET order_status='waiting', last_error=?, raw=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
           ->execute([$message, json_encode(dgf_safe($res), JSON_UNESCAPED_UNICODE), $orderId]);
        error_log("DGF topup GAGAL order#$orderId ref={$o['ref_id']} target=$target http=" . ($res['http'] ?? 0) . " rc=$rc $message");
        return ['status' => 'waiting', 'rc' => $rc, 'message' => $message, 'sn' => ''];
    }

    $s = strtolower(trim((string) ($d['status'] ?? '')));
    if (in_array($s, ['sukses', 'success'], true) || $rc === '00') {
        $status = 'success';
    } elseif (in_array($s, ['gagal', 'failed'], true) || in_array($rc, ['01', '02', '14', '23', '41', '42', '43', '44'], true)) {
        $status = 'failed';
    } else {
        $status = 'pending'; // rc 03 / status Pending -> tunggu webhook & cron
    }

    $sn = (string) ($d['sn'] ?? '');
    $db->prepare("UPDATE orders SET order_status=?, sn=?, last_error=?, raw=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
       ->execute([$status, $sn, $status === 'failed' ? $message : '', json_encode(dgf_safe($res), JSON_UNESCAPED_UNICODE), $orderId]);
    error_log("DGF topup order#$orderId ref={$o['ref_id']} target=$target status=$status rc=$rc");
    return ['status' => $status, 'rc' => $rc, 'message' => $message, 'sn' => $sn];
}

/**
 * Tarik pricelist Digiflazz lalu sinkronkan ke tabel products.
 * Dipakai panel admin dan cli/sync-pricelist.php (satu implementasi, tidak bercabang).
 *
 * @return array{ok:bool,message:string,inserted:int,updated:int,total:int}
 */
function syncPriceList(string $type = 'prepaid'): array {
    $db  = db();
    $dgf = new Digiflazz();
    $res = $dgf->priceListV2($type);
    if (!empty($res['error'])) {
        return ['ok' => false, 'message' => 'Gagal ambil pricelist: ' . $res['error'], 'inserted' => 0, 'updated' => 0, 'total' => 0];
    }
    $d = $res['data'] ?? [];
    if (is_string($d['rc'] ?? null)) {
        return ['ok' => false, 'message' => "Digiflazz rc={$d['rc']}: " . ($d['message'] ?? ''), 'inserted' => 0, 'updated' => 0, 'total' => 0];
    }
    $list = $d['pricelist'] ?? $d['data'] ?? (isset($d[0]) ? $d : []);
    if (!$list) {
        return ['ok' => false, 'message' => 'Pricelist kosong (tidak ada produk).', 'inserted' => 0, 'updated' => 0, 'total' => 0];
    }

    $before = (int) $db->query("SELECT COUNT(*) c FROM products")->fetch()['c'];
    $st = $db->prepare("INSERT INTO products (game_id, code, name, price, buy_price, stock, brand, category, status)
                        VALUES (1,?,?,?,?,1,?,?,1)
                        ON CONFLICT(code) DO UPDATE SET
                          name=excluded.name,
                          price=excluded.price,
                          buy_price=excluded.buy_price,
                          stock=excluded.stock,
                          brand=excluded.brand,
                          category=excluded.category,
                          status=1");
    $processed = 0;
    foreach ($list as $p) {
        $code = trim((string) ($p['buyer_sku_code'] ?? ''));
        if ($code === '') continue;
        $name = (string) ($p['product_name'] ?? $code);
        $buy  = (int) ($p['product_price'] ?? $p['price'] ?? 0); // modal
        $sell = (int) ($p['price'] ?? 0);                        // harga jual
        if ($sell <= 0) $sell = (int) floor($buy * 1.1);
        if ($sell <= 0) continue;
        $st->execute([$code, $name, $sell, $buy, strtoupper((string) ($p['brand'] ?? '')), (string) ($p['category'] ?? '')]);
        $processed++;
    }
    $after = (int) $db->query("SELECT COUNT(*) c FROM products")->fetch()['c'];
    $inserted = max(0, $after - $before);
    $updated = max(0, $processed - $inserted);
    $db->prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('pricelist_updated', ?)")->execute([date('Y-m-d H:i:s')]);

    return [
        'ok' => true,
        'message' => "Sync pricelist ($type) selesai: $inserted produk baru, $updated diperbarui.",
        'inserted' => $inserted,
        'updated' => $updated,
        'total' => $processed,
    ];
}

/** Gambar produk: SVG data-uri (gradien + ikon kategori + nama produk) */
function product_thumb_svg(string $name, string $cat = ''): string {
    $cat = $cat !== '' ? $cat : product_category($name);
    $grads = [
        ['#22d3ee', '#3b82f6'], ['#8b5cf6', '#d946ef'], ['#f59e0b', '#ef4444'],
        ['#34d399', '#0ea5e9'], ['#f472b6', '#8b5cf6'], ['#14b8a6', '#6366f1'],
    ];
    [$c1, $c2] = $grads[abs(crc32($name)) % count($grads)];

    $icons = [
        'Pulsa' => '<path d="M10 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M14 3v2"/><path d="M12 17h.01"/>',
        'Paket Data' => '<path d="M6 13.5a10 10 0 0 1 12 0"/><path d="M9 16.5a6.5 6.5 0 0 1 6 0"/><path d="M12 19.5h.01"/>',
        'Voucher' => '<path d="M5 5h14v14H5z"/><path d="M5 12.5h14"/><path d="M12 5v7"/><path d="M9.5 5 8 9.5l1.5 3"/><path d="M14.5 5 16 9.5l-1.5 3"/>',
    ];
    $gameIcon = '<path d="M7 10.5A2.5 2.5 0 0 0 4.5 13v3a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 1 5 0 2.5 2.5 0 0 0 5 0v-3a2.5 2.5 0 0 0-2.5-2.5z"/><path d="M8 13h.01M11 14.5h.01"/><circle cx="16" cy="12" r=".5"/><circle cx="17.5" cy="13.5" r=".5"/>';
    $icon = $icons[$cat] ?? $gameIcon;

    $e = function (string $s): string {
        return htmlspecialchars($s, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    };
    // Bungkus nama jadi maks 2 baris (16 karakter/baris).
    $words = preg_split('/\s+/', trim($name));
    $short = [];
    $len = 0;
    foreach ($words as $w) {
        if ($len + mb_strlen($w) > 16 && $short) break;
        $short[] = $w;
        $len += mb_strlen($w) + 1;
    }
    $line1 = $short ? implode(' ', $short) : trim($name);
    $rest = array_slice($words, count($short));
    $line2 = '';
    foreach ($rest as $w) {
        if (mb_strlen($line2 . $w) > 14) break;
        $line2 .= ($line2 ? ' ' : '') . $w;
    }
    $text = '<text x="170" y="188" font-family="Plus Jakarta Sans, Inter, Arial, sans-serif" font-size="24" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing=".3">' . $e($line1) . '</text>' .
            ($line2 !== '' ? '<text x="170" y="216" font-family="Plus Jakarta Sans, Inter, Arial, sans-serif" font-size="17" font-weight="600" fill="rgba(255,255,255,.72)" text-anchor="middle">' . $e($line2) . '</text>' : '');

    return '<svg xmlns="http://www.w3.org/2000/svg" width="340" height="240" viewBox="0 0 340 240">'
        . '<defs>'
        . '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        . '<stop offset="0" stop-color="' . $c1 . '"/>'
        . '<stop offset="1" stop-color="' . $c2 . '"/>'
        . '</linearGradient>'
        . '<radialGradient id="glow" cx=".85" cy=".15" r=".8">'
        . '<stop offset="0" stop-color="rgba(255,255,255,.5)"/>'
        . '<stop offset="1" stop-color="rgba(255,255,255,0)"/>'
        . '</radialGradient>'
        . '</defs>'
        . '<rect width="340" height="240" rx="26" fill="url(#g)"/>'
        . '<rect width="340" height="240" rx="26" fill="url(#glow)"/>'
        . '<g fill="rgba(255,255,255,.14)">'
        . '<circle cx="60" cy="210" r="2"/><circle cx="104" cy="228" r="1.6"/><circle cx="268" cy="36" r="2.2"/>'
        . '<circle cx="318" cy="196" r="1.8"/><circle cx="24" cy="120" r="1.6"/>'
        . '</g>'
        . '<g transform="translate(170,86)" opacity=".95">'
        . '<g transform="scale(3.1) translate(-12.5,-12)">'
        . '<g fill="none" stroke="#ffffff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' . $icon . '</g>'
        . '</g></g>'
        . '<g transform="translate(14,14)">'
        . '<rect width="0" height="0" rx="999" fill="rgba(0,0,0,.22)"/>'
        . '<text x="10" y="24" font-family="Plus Jakarta Sans, Inter, Arial, sans-serif" font-size="12" font-weight="700" fill="rgba(255,255,255,.92)" letter-spacing=".8">' . $e(strtoupper($cat)) . '</text>'
        . '</g>'
        . $text
        . '</svg>';
}

function product_thumb_datauri(string $name, string $cat = ''): string {
    return 'data:image/svg+xml;base64,' . base64_encode(product_thumb_svg($name, $cat));
}

/** URL file logo brand (favicon resmi 128px) bila tersedia; '' bila tidak ada. */
function brand_logo_url(string $brand): string {
    $brand = strtoupper(trim($brand));
    if ($brand === '') return '';
    $slug = strtolower(preg_replace('/[^A-Z0-9]/', '', $brand));
    if ($slug === '') return '';
    $file = __DIR__ . '/../assets/brands/' . $slug . '.png';
    if (!is_file($file)) return '';
    $info = @getimagesize($file);
    if ($info === false || $info[0] < 64 || $info[1] < 64) return '';
    return BASE_PATH . '/assets/brands/' . $slug . '.png';
}

/** Warna avatar yang stabil per brand (dipakai saat logo file tidak ada). */
function brand_avatar_color(string $brand): string {
    $palette = [
        ['#6366f1', '#22d3ee'], ['#8b5cf6', '#d946ef'], ['#f59e0b', '#ef4444'],
        ['#10b981', '#0ea5e9'], ['#f43f5e', '#f59e0b'], ['#14b8a6', '#6366f1'],
        ['#a855f7', '#ec4899'], ['#06b6d4', '#3b82f6'], ['#f97316', '#e11d48'],
        ['#7c3aed', '#06b6d4'],
    ];
    [$c1, $c2] = $palette[abs(crc32(strtoupper($brand))) % count($palette)];
    return "$c1;$c2";
}

/** Initial singkat untuk avatar brand (mis. "MOBILE LEGENDS" -> "ML"). */
function brand_initial(string $brand): string {
    $b = trim($brand);
    if ($b === '') return '#';
    $parts = preg_split('/[\s\-\.\/]+/', strtoupper($b));
    $init = '';
    foreach ($parts as $p) {
        if ($p === '' || $p === 'BY') continue;
        $init .= $p[0];
        if (mb_strlen($init) >= 2) break;
    }
    return mb_strlen($init) >= 2 ? $init : substr($b, 0, 2);
}
