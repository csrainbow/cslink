<?php
require_once __DIR__ . '/../includes/functions.php';

$in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
$code = trim($in['code'] ?? '');
$playerId = trim($in['player_id'] ?? '');
$zoneId = trim($in['zone_id'] ?? '');
$customerNo = cleanNumber($in['customer_no'] ?? '');

if (!$code || !$playerId || !$customerNo) {
    j(['ok' => false, 'message' => 'Lengkapi kode produk, ID game, dan nomor HP'], 400);
}

$db = db();
$st = $db->prepare("SELECT * FROM products WHERE code=? AND status=1");
$st->execute([$code]);
$product = $st->fetch();
if (!$product) {
    j(['ok' => false, 'message' => 'Produk tidak ditemukan'], 404);
}

$amount = (int) $in['amount'];
if ($amount <= 0) $amount = (int) $product['price'];

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
    // gagal snap -> tandai order gagal & laporkan
    $db->prepare("UPDATE orders SET order_status='failed', updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$order['id']]);
    j(['ok' => false, 'message' => 'Gagal membuat pembayaran: ' . $snap['error']], 502);
}

$db->prepare("UPDATE orders SET snap_token=? WHERE id=?")->execute([$snap['token'], $order['id']]);

j([
    'ok' => true,
    'ref_id' => $refId,
    'token' => $snap['token'],
    'amount' => $amount,
]);
