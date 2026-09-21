<?php
/**
 * Polling : isi ulang query status transaksi PENDING setelah pembayaran sukses.
 * Digiflazz mengembalikan status terkini; hasil dipakai update order (Sukses+Gagal selesai,
 * Pending tetap menunggu). Jaring pengaman bila webhook telat/hilang.
 * Cron: tiap 2-5 menit (php cli/poll-pending.php). Aman dipanggil paralel (lock).
 */
require_once __DIR__ . '/../includes/functions.php';

$lock = fopen('/tmp/dgf-poll.lock', 'c');
if (!flock($lock, LOCK_EX | LOCK_NB)) {
    echo "SKIP: proses polling lain aktif.\n";
    exit(0);
}

$db = db();
$rows = $db->query("SELECT * FROM orders WHERE order_status='pending' AND payment_status='paid'")
    ->fetchAll();

if (!$rows) {
    echo "Tidak ada order pending.\n";
    exit(0);
}

$dgf = new Digiflazz();
$done = 0;
foreach ($rows as $o) {
    $res = $dgf->topup($o['ref_id'], $o['product_code'], $o['customer_no']);
    $rc  = strval($res['data']['rc'] ?? ($res['error'] ?? '?'));
    $msg = $res['data']['message'] ?? '';

    if ($rc === '00') {
        $db->prepare("UPDATE orders SET order_status='success', sn=?, raw=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
            ->execute([$res['data']['sn'] ?? '', json_encode($res, JSON_UNESCAPED_UNICODE), $o['id']]);
        $done++;
    } elseif (in_array($rc, ['01', '02', '14', '23', '41', '42'])) {
        $db->prepare("UPDATE orders SET order_status='failed', raw=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
            ->execute([json_encode($res, JSON_UNESCAPED_UNICODE), $o['id']]);
        $done++;
    }
    echo "[{$o['ref_id']}] rc=$rc $msg\n";
    usleep(500000); // jeda antar request biar aman
}

echo "Selesai: $done ter-update.\n";
flock($lock, LOCK_UN);