<?php
/**
 * Sync pricelist Digiflazz ke tabel products.
 * Jalankan: php cli/sync-pricelist.php [game|prepaid]
 *   - default: prepaid (semua produk: pulsa, data, game, e-money)
 *   - opsi:    game    (hanya produk game)
 * Setiap run juga mengunduh logo brand (favicon resolusi tinggi) ke assets/brands/
 * bila belum tersedia, agar thumbnail produk tampil dengan logo asli.
 * Cron disarankan tiap >= 15 menit (batas API pricelist 1x/5 menit).
 */
require_once __DIR__ . '/../includes/functions.php';

$type = $argv[1] ?? 'prepaid';
if (!in_array($type, ['prepaid', 'game'], true)) {
    echo "Penggunaan: php cli/sync-pricelist.php [game|prepaid]\n";
    exit(1);
}

$lock = fopen('/tmp/dgf-pricelist.lock', 'c');
if (!flock($lock, LOCK_EX | LOCK_NB)) {
    echo "SKIP: proses sync lain sedang berjalan.\n";
    exit(0);
}

$db = db();
$dgf = new Digiflazz();

echo "Mengambil pricelist ($type) dari Digiflazz...\n";
$res = $dgf->priceListV2($type);

if (!empty($res['error'])) {
    echo "ERROR: {$res['error']}\n";
    exit(1);
}

$d = $res['data'] ?? [];
if (is_string($d['rc'] ?? null)) {
    echo "ERROR Digiflazz rc={$d['rc']}: {$d['message']}\n";
    exit(1);
}
$list = $d['pricelist'] ?? $d['data'] ?? (isset($d[0]) ? $d : []);
echo "Mendapat " . count($list) . " item.\n";
if (empty($list)) exit(0);

$inserted = 0;
$updated = 0;
$brands = [];
$st = $db->prepare("INSERT INTO products (game_id, code, name, price, buy_price, stock, brand, category, status)
                    VALUES (1,?,?,?,?,1,?,?,1)
                    ON CONFLICT(code) DO UPDATE SET
                      name=excluded.name,
                      buy_price=excluded.buy_price,
                      price=excluded.price,
                      stock=excluded.stock,
                      brand=excluded.brand,
                      category=excluded.category,
                      status=1");

foreach ($list as $p) {
    $code = $p['buyer_sku_code'] ?? '';
    if (!$code) continue;
    $name = $p['product_name'] ?? $code;
    $buy = (int) ($p['product_price'] ?? $p['price'] ?? 0); // modal (jarang tersedia sbg product_price)
    $sell = (int) ($p['price'] ?? 0);                        // harga di katalog (sama dgn modal bila tanpa margin)
    if ($sell <= 0) $sell = (int) floor($buy * 1.1);
    $brand = strtoupper((string) ($p['brand'] ?? ''));
    $cat = (string) ($p['category'] ?? '');
    $rows = $st->execute([$code, $name, $sell, $buy, $brand, $cat]);
    if ($rows === 1) $inserted++;
    else $updated++;
    if ($brand !== '') $brands[$brand] = true;
}

$db->exec("INSERT OR REPLACE INTO settings (key,value) VALUES ('pricelist_updated', '" . date('Y-m-d H:i:s') . "')");
echo "Selesai. Insert: $inserted, Update: $updated di " . date('H:i:s') . "\n";

// --- Unduh logo brand (favicon resmi resolusi tinggi), cache ke assets/brands/ ---
$brandDir = __DIR__ . '/../assets/brands';
if (!is_dir($brandDir)) @mkdir($brandDir, 0755, true);

foreach (array_keys($brands) as $brand) {
    $domain = brand_domain($brand);
    if (!$domain) continue;
    $slug = strtolower(preg_replace('/[^A-Z0-9]/', '', $brand));
    if ($slug === '') continue;
    $file = $brandDir . '/' . $slug . '.png';
    if (file_exists($file) && filesize($file) > 500) continue;

    $url = 'https://www.google.com/s2/favicons?domain=' . urlencode($domain) . '&sz=128';
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => 1,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_FOLLOWLOCATION => 1,
        CURLOPT_SSL_VERIFYPEER => 1,
    ]);
    $png = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($png !== false && $code === 200 && strlen($png) > 500) {
        file_put_contents($file, $png);
        echo "Logo: $brand -> $slug.png (" . strlen($png) . " B)\n";
    } else {
        echo "Logo: $brand SKIP (http=$code)\n";
    }
}

flock($lock, LOCK_UN);

/**
 * Pemetaan brand -> domain resmi untuk favicon logo.
 */
function brand_domain(string $brand): string {
    $b = strtolower(preg_replace('/[^A-Za-z]/', '', $brand));
    $map = [
        'telkomsel' => 'telkomsel.com', 'tsel' => 'telkomsel.com',
        'xl' => 'xl.co.id', 'xldata' => 'xl.co.id', 'axis' => 'axis.co.id',
        'smartfren' => 'smartfren.com',
        'indosat' => 'io.co.id', 'im3' => 'io.co.id', 'ims' => 'io.co.id',
        'three' => 'tri.co.id', 'tri' => 'tri.co.id',
        'byu' => 'byu.id',
    ];
    return $map[$b] ?? '';
}