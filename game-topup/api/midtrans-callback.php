<?php
/**
 * Webhook Midtrans (payment notifikasi)
 * Dipanggil Midtrans: setelah pembayaran -> kita cek signature -> update status -> trigger topup Digiflazz
 */
require_once __DIR__ . '/../includes/functions.php';

$raw = file_get_contents('php://input');
$n = json_decode($raw, true) ?: [];
$orderId = (string) ($n['order_id'] ?? '');
$statusCode = (string) ($n['status_code'] ?? '');
$grossAmount = (string) ($n['gross_amount'] ?? '');
$transactionStatus = (string) ($n['transaction_status'] ?? '');
$signatureKey = (string) ($n['signature_key'] ?? '');

// Verifikasi signature Midtrans
$expected = hash('sha512', $orderId . $statusCode . $grossAmount . MT_SERVER_KEY);
if ($signatureKey === '' || !hash_equals($expected, $signatureKey)) {
    error_log("MIDTRANS: signature invalid order=$orderId");
    j(['status' => 'error', 'msg' => 'invalid signature'], 400);
}

$db = db();
$st = $db->prepare("SELECT * FROM orders WHERE ref_id=?");
$st->execute([$orderId]);
$order = $st->fetch();
if (!$order) {
    error_log("MIDTRANS: order tidak dikenal ref=$orderId");
    j(['status' => 'error', 'msg' => 'order not found'], 404);
}

// Lapis kedua: nominal notifikasi harus sama dengan nominal order.
if ($grossAmount !== '' && abs((float) $grossAmount - (float) $order['amount']) > 0.01) {
    error_log("MIDTRANS: nominal TIDAK COCOK ref=$orderId notif=$grossAmount order={$order['amount']}");
}

$paid = in_array($transactionStatus, ['capture', 'settlement'], true);
$failed = in_array($transactionStatus, ['deny', 'cancel', 'expire', 'failure'], true);
$refunded = in_array($transactionStatus, ['refund', 'partial_refund', 'chargeback', 'partial_chargeback'], true);

if ($paid) {
    if ($order['payment_status'] !== 'paid') {
        $db->prepare("UPDATE orders SET payment_status='paid', order_status='waiting', updated_at=CURRENT_TIMESTAMP WHERE id=?")
           ->execute([$order['id']]);
    }
    // Kirim produk ke Digiflazz. topupExecute() idempotent -> notifikasi berulang aman.
    $r = topupExecute((int) $order['id']);
    j(['status' => 'ok', 'order' => $r['status'] ?: $order['order_status'], 'rc' => $r['rc']]);
}

if ($failed) {
    $db->prepare("UPDATE orders SET payment_status='expired', order_status='failed', raw=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
       ->execute([substr($raw, 0, 2000), $order['id']]);
    j(['status' => 'ok', 'order' => 'failed']);
}

if ($refunded) {
    $db->prepare("UPDATE orders SET payment_status='refund', raw=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
       ->execute([substr($raw, 0, 2000), $order['id']]);
    error_log("MIDTRANS: refund/chargeback ref=$orderId status=$transactionStatus");
}

j(['status' => 'ok']);

/**
 * CATATAN: logika pengiriman ke Digiflazz kini terpusat di topupExecute()
 * (includes/functions.php). Dengan begitu webhook Midtrans dan cron
 * poll-pending memakai jalur yang sama: idempotent (klaim status),
 * tercatat di kolom attempts & last_error, dan bisa dicoba ulang otomatis.
 */
