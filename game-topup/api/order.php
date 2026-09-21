<?php
require_once __DIR__ . '/../includes/functions.php';

$in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
$code = trim((string) ($in['code'] ?? ''));
$playerId = trim((string) ($in['player_id'] ?? ''));
$zoneId = trim((string) ($in['zone_id'] ?? ''));
$customerNo = cleanNumber((string) ($in['customer_no'] ?? ''));

if ($code === '') {
    j(['ok' => false, 'message' => 'Kode produk tidak boleh kosong'], 400);
}

$db = db();
$st = $db->prepare("SELECT * FROM products WHERE code=? AND status=1");
$st->execute([$code]);
$product = $st->fetch();
if (!$product) {
    j(['ok' => false, 'message' => 'Produk tidak ditemukan'], 404);
}

$isGame = product_is_game($product);

// Validasi sesuai jenis produk: game butuh ID akun, non-game butuh nomor tujuan (HP).
if ($isGame) {
    if ($playerId === '') {
        j(['ok' => false, 'message' => 'ID akun game wajib diisi'], 400);
    }
    $len = strlen($customerNo);
    if ($len < 8 || $len > 15) {
        j(['ok' => false, 'message' => 'Nomor HP tidak valid (contoh: 081234567890)'], 400);
    }
} else {
    $len = strlen($customerNo);
    if ($len < 9 || $len > 15) {
        j(['ok' => false, 'message' => 'Nomor tujuan tidak valid (contoh: 081234567890)'], 400);
    }
    if ($playerId === '') $playerId = $customerNo; // identitas pembeli untuk riwayat
}

// Harga SELALU dari server. Parameter 'amount' dari klien diabaikan (cegah manipulasi harga).
$amount = (int) $product['price'];
if ($amount <= 0) {
    j(['ok' => false, 'message' => 'Harga produk belum diatur, hubungi admin'], 409);
}

// Idempotensi: klik ganda / retry cepat memakai order + token yang sama (maks 5 menit).
$st = $db->prepare("SELECT * FROM orders
                    WHERE product_code=? AND customer_no=? AND player_id=? AND zone_id=?
                      AND payment_status='pending' AND order_status='waiting'
                      AND snap_token<>'' AND created_at >= datetime('now','-5 minutes')
                    ORDER BY id DESC LIMIT 1");
$st->execute([$product['code'], $customerNo, $playerId, $zoneId]);
$dup = $st->fetch();
if ($dup) {
    j([
        'ok' => true,
        'ref_id' => $dup['ref_id'],
        'token' => $dup['snap_token'],
        'amount' => (int) $dup['amount'],
        'reused' => true,
    ]);
}

// Buat order
$order = createOrder([
    'ref_id' => genRefId(),
    'product_code' => $product['code'],
    'product_name' => $product['name'],
    'customer_no' => $customerNo,
    'player_id' => $playerId,
    'zone_id' => $zoneId,
    'amount' => $amount,
    'payment_method' => 'midtrans',
]);
$refId = $order['ref_id'];

// Buat Snap token Midtrans
$snap = midtransSnap($refId, $amount, $product['name'], [
    'name' => $playerId,
    'phone' => $customerNo,
]);
if ($snap['error']) {
    // gagal snap -> tandai order gagal, catat alasan, & laporkan
    $db->prepare("UPDATE orders SET order_status='failed', last_error=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
       ->execute(['Midtrans: ' . $snap['error'], $order['id']]);
    j(['ok' => false, 'message' => 'Gagal membuat pembayaran: ' . $snap['error']], 502);
}

$db->prepare("UPDATE orders SET snap_token=? WHERE id=?")->execute([$snap['token'], $order['id']]);

j([
    'ok' => true,
    'ref_id' => $refId,
    'token' => $snap['token'],
    'amount' => $amount,
]);
