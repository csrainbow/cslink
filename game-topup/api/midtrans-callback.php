<?php
/**
 * Webhook Midtrans (payment notifikasi)
 * Dipanggil Midtrans: setelah pembayaran -> kita cek signature -> update status -> trigger topup Digiflazz
 */
require_once __DIR__ . '/../includes/functions.php';

$raw = file_get_contents('php://input');
$n = json_decode($raw, true) ?: [];
$orderId = $n['order_id'] ?? '';
$statusCode = $n['status_code'] ?? '';
$grossAmount = $n['gross_amount'] ?? '';
$transactionStatus = $n['transaction_status'] ?? '';
$signatureKey = $n['signature_key'] ?? '';

// Verifikasi signature Midtrans
$expected = hash('sha512', $orderId . $statusCode . $grossAmount . MT_SERVER_KEY);
if (!hash_equals($expected, $signatureKey)) {
    error_log("MIDTRANS: signature invalid order=$orderId");
    j(['status' => 'error', 'msg' => 'invalid signature'], 400);
}

$db = db();
$st = $db->prepare("SELECT * FROM orders WHERE ref_id=?");
$st->execute([$orderId]);
$order = $st->fetch();
if (!$order) {
    j(['status' => 'error', 'msg' => 'order not found'], 404);
}

$paid = in_array($transactionStatus, ['capture', 'settlement']);
$failed = in_array($transactionStatus, ['deny', 'cancel', 'expire']);

if ($paid) {
    $db->prepare("UPDATE orders SET payment_status='paid', order_status='waiting', updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$order['id']]);
    // Trigger top-up ke Digiflazz (sync untuk keandalan; bisa juga dipanggil dari cron)
    triggerTopup($order['id']);
}

if ($failed) {
    $db->prepare("UPDATE orders SET payment_status='expired', order_status='failed', updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$order['id']]);
}

j(['status' => 'ok']);

/**
 * Panggil API Digiflazz untuk eksekusi top-up.
 * Dipanggil setelah pembayaran LUNAS.
 */
function triggerTopup(int $orderId): void {
    $db = db();
    $st = $db->prepare("SELECT * FROM orders WHERE id=?");
    $st->execute([$orderId]);
    $o = $st->fetch();
    if (!$o || $o['order_status'] !== 'waiting') return;

    // Cegah double-process
    $db->prepare("UPDATE orders SET order_status='processing', updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$orderId]);

    $dgf = new Digiflazz();
    $res = $dgf->topup($o['ref_id'], $o['product_code'], cleanNumber($o['customer_no']));

    $status = $o['order_status'];
    if (empty($res['error'])) {
        $d = $res['data'] ?? [];
        $trxStatus = strtolower($d['status'] ?? 'pending');
        if (in_array($trxStatus, ['sukses', 'success'])) {
            $status = 'success';
        } elseif (in_array($trxStatus, ['gagal', 'failed'])) {
            $status = 'failed';
        } else {
            $status = 'pending'; // Pending -> tunggu callback
        }
        $sn = $d['sn'] ?? '';
        $db->prepare("UPDATE orders SET order_status=?, sn=?, raw=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
            ->execute([$status, $sn, json_encode($res), $orderId]);
    } else {
        error_log("DGF topup error order#$orderId ref={$o['ref_id']}: {$res['error']}");
        // Back to waiting (akan diproses ulang cron)
        $db->prepare("UPDATE orders SET order_status='waiting', updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$orderId]);
    }
}
