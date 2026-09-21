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
$rows = $db->query("SELECT * FROM orders
    WHERE payment_status='paid'
      AND attempts < 6
      AND (
            (order_status IN ('waiting','pending') AND updated_at <= datetime('now','-2 minutes'))
         OR (order_status='processing'             AND updated_at <= datetime('now','-10 minutes'))
      )
    ORDER BY id LIMIT 20")->fetchAll();

if (!$rows) {
    echo "Tidak ada order yang perlu dicek.\n";
    exit(0);
}

$final = 0;
foreach ($rows as $o) {
    try {
        $r = topupExecute((int) $o['id']);
    } catch (Throwable $e) {
        // Satu order gagal (mis. database sibuk sesaat) tidak boleh mematikan seluruh loop.
        error_log('DGF poll order#' . $o['id'] . ' error: ' . $e->getMessage());
        $r = ['status' => '', 'rc' => '', 'message' => 'error: ' . $e->getMessage()];
    }
    printf(
        "[%s] coba ke-%d status=%s rc=%s %s\n",
        $o['ref_id'],
        (int) $o['attempts'] + 1,
        $r['status'] !== '' ? $r['status'] : '-',
        $r['rc'] !== '' ? $r['rc'] : '-',
        substr((string) $r['message'], 0, 140)
    );
    if (in_array($r['status'], ['success', 'failed'], true)) $final++;
    usleep(500000); // jeda antar request biar aman
}

echo "Selesai: $final order final, sisanya menunggu percobaan berikutnya.\n";
flock($lock, LOCK_UN);