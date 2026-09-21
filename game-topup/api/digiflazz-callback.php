<?php
/**
 * Webhook / callback dari Digiflazz
 * Digiflazz memanggil URL ini setelah transaksi diproses: Sukses / Gagal / Pending.
 * Konfigurasi di dashboard Digiflazz -> Atur Koneksi > API > Webhook:
 *   Payload URL : https://cslink.web.id/top-up/api/digiflazz-callback.php
 *   Content type: application/json
 *   Secret      : DGF_WEBHOOK_SECRET di config.local.php
 * Verifikasi: X-Hub-Signature (sha1=HMAC-SHA1(body, secret)) + whitelist IP Digiflazz.
 */
require_once __DIR__ . '/../includes/functions.php';

$raw = file_get_contents('php://input');

// --- Whitelist IP pengirim (Digiflazz) ---
$ip = trim($_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '');
$ip = explode(',', $ip)[0];
$ipOk = in_array(trim($ip), ['52.74.250.133'], true);

$event = $_SERVER['HTTP_X_DIGIFLAZZ_EVENT'] ?? '';
$ua    = $_SERVER['HTTP_USER_AGENT'] ?? '';

// --- Verifikasi signature bila secret diset ---
// Catatan: event ping dari Digiflazz TIDAK membawa header X-Hub-Signature,
// sehingga ping cukup diverifikasi via whitelist IP (payload ping tidak berisi
// data transaksi). Payload transaksi (create/update) wajib signature valid.
$sig = $_SERVER['HTTP_X_HUB_SIGNATURE'] ?? '';
$isPing = $event === 'ping' || strpos($raw, 'hook_id') !== false || strpos($raw, '"sed"') !== false;
$sigOk = false;
$expected = '';
if ($isPing) {
    $sigOk = true;
} elseif (DGF_WEBHOOK_SECRET !== '') {
    $expected = 'sha1=' . hash_hmac('sha1', $raw, DGF_WEBHOOK_SECRET);
    $sigOk = $sig !== '' && hash_equals($expected, $sig);
} else {
    $sigOk = $ipOk; // tanpa secret, wajib IP Digiflazz
}

if (!$sigOk || !$ipOk) {
    error_log("DGF callback DITOLAK: ip=$ip sig=" . ($sigOk ? 'OK' : 'BAD')
        . " secret=" . (DGF_WEBHOOK_SECRET !== '' ? 'set' : 'empty')
        . " event=$event ua=$ua"
        . " got=[$sig] exp=[$expected] body=[" . substr($raw, 0, 400) . ']');
    j(['data' => ['rc' => '403', 'message' => 'forbidden']], 403);
}

// Delta event ping (dikirim saat webhook didaftarkan/di-ping); tanpa data transaksi.
if ($event === 'ping' || $raw === '' || strpos($raw, 'ref_id') === false) {
    j(['data' => ['rc' => '00', 'message' => 'success']]);
}

// Resend hanya berlaku transaksi hotel; abaikan untuk topup prepaid.
if ($event === 'resend') {
    j(['data' => ['rc' => '00', 'message' => 'success']]);
}

$dgf = new Digiflazz();
$cb  = $dgf->handleCallback($raw);

$db = db();
if (!$cb['ref_id']) {
    j(['data' => ['rc' => '99', 'message' => 'invalid payload']], 400);
}

$st = $db->prepare("SELECT * FROM orders WHERE ref_id=?");
$st->execute([$cb['ref_id']]);
$order = $st->fetch();

if ($order) {
    $status = 'pending';
    $s = strtolower($cb['status']);
    if (in_array($s, ['sukses', 'success'])) $status = 'success';
    elseif (in_array($s, ['gagal', 'failed'])) $status = 'failed';

    $db->prepare("UPDATE orders SET order_status=?, sn=?, raw=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
        ->execute([$status, $cb['sn'], $raw, $order['id']]);

    error_log("DGF callback: ref={$cb['ref_id']} status={$cb['status']} sn={$cb['sn']} event={$event} ua={$ua}");
}

// Balasan yang diminta Digiflazz
j(['data' => ['rc' => '00', 'message' => 'success']]);