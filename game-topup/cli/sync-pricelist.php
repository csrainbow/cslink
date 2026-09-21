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

echo "Mengambil pricelist ($type) dari Digiflazz...\n";
$sync = syncPriceList($type);
echo ($sync['ok'] ? '' : 'ERROR: ') . $sync['message'] . "\n";
if (!$sync['ok']) exit(1);

// Daftar brand yang perlu logo (diambil dari DB, hasil sync di atas).
$brands = array_column(db()->query("SELECT DISTINCT brand FROM products WHERE brand<>''")->fetchAll(), 'brand');

// Sinkronisasi produk ditangani syncPriceList() di includes/functions.php
// (dipakai juga oleh panel admin) supaya tidak ada dua jalur logika.

// Tampilkan waktu sync terakhir yang tercatat.

// --- Unduh logo brand (favicon resmi resolusi tinggi), cache ke assets/brands/ ---
$brandDir = __DIR__ . '/../assets/brands';
if (!is_dir($brandDir)) @mkdir($brandDir, 0755, true);

foreach ($brands as $brand) {
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