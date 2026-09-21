<?php
/**
 * Panel admin TopUp Games.
 * Password TIDAK disimpan polos: isi GT_ADMIN_PASS_HASH di config.local.php.
 * Generate: php -r "echo password_hash('rahasia-anda', PASSWORD_DEFAULT), PHP_EOL;"
 */
require_once __DIR__ . '/../includes/functions.php';

// Cookie sesi admin: HttpOnly + SameSite (Secure otomatis saat diakses via HTTPS).
$__https = (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') || (($_SERVER['HTTPS'] ?? '') === 'on');
session_set_cookie_params([
    'httponly' => true,
    'samesite' => 'Lax',
    'secure'   => $__https,
    'path'     => BASE_PATH . '/admin',
]);
session_start();

$db     = db();
$hash   = (string) GT_ADMIN_PASS_HASH;
$alerts = [];

$authed = !empty($_SESSION['gt_admin']);
if (empty($_SESSION['gt_csrf'])) $_SESSION['gt_csrf'] = bin2hex(random_bytes(16));
$csrf   = (string) $_SESSION['gt_csrf'];
$csrfOk = isset($_POST['csrf']) && hash_equals($csrf, (string) $_POST['csrf']);

// ---- Login / logout ----
if (isset($_POST['admin_login'])) {
    usleep(400000); // perlambat percobaan berulang
    if (!$csrfOk) {
        $alerts[] = ['Sesi kedaluwarsa, silakan coba lagi.', false];
    } elseif ($hash === '') {
        $alerts[] = ['Panel admin belum dikonfigurasi: isi GT_ADMIN_PASS_HASH di config.local.php.', false];
    } elseif (password_verify((string) ($_POST['password'] ?? ''), $hash)) {
        session_regenerate_id(true);
        $_SESSION['gt_admin'] = true;
        $authed = true;
    } else {
        $alerts[] = ['Password salah.', false];
        error_log('GT admin: login gagal dari ' . ($_SERVER['REMOTE_ADDR'] ?? '?'));
    }
}
if (isset($_GET['logout'])) {
    $_SESSION = [];
    session_destroy();
    $authed = false;
}

if (!$authed) { ?>
<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Login Admin - <?= htmlspecialchars(SITE_NAME) ?></title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="<?= BASE_PATH ?>/assets/style-fly.css">
</head>
<body>
<div class="login-wrap">
  <div class="login-card">
    <div class="login-logo">T</div>
    <h1>Login Admin</h1>
    <p>Masuk untuk mengelola <?= htmlspecialchars(SITE_NAME) ?></p>
    <?php if ($hash === ''): ?>
      <div class="msg err" style="margin-bottom:14px">Panel belum dikonfigurasi: isi <b>GT_ADMIN_PASS_HASH</b> di <span class="mono">config.local.php</span>.</div>
    <?php endif; ?>
    <?php foreach ($alerts as [$msg, $ok]): ?>
      <div class="msg <?= $ok ? 'ok' : 'err' ?>" style="margin-bottom:14px"><?= htmlspecialchars($msg) ?></div>
    <?php endforeach; ?>
    <form method="post">
      <input type="hidden" name="admin_login" value="1">
      <input type="hidden" name="csrf" value="<?= htmlspecialchars($csrf) ?>">
      <div class="field" style="margin-bottom:16px">
        <input class="input" type="password" name="password" placeholder="Password" required autocomplete="current-password">
      </div>
      <button type="submit" class="btn btn-primary btn-full">Masuk</button>
    </form>
  </div>
</div>
</body></html>
<?php exit; }

// ---- Aksi setelah login: sync pricelist / diagnosa / proses ulang order ----
$diag = null;
if ($authed && isset($_POST['do_sync'])) {
    if (!$csrfOk) {
        $alerts[] = ['Sesi kedaluwarsa, sync dibatalkan.', false];
    } else {
        $sync = syncPriceList('prepaid');
        $alerts[] = [$sync['message'], (bool) $sync['ok']];
    }
}
if ($authed && isset($_POST['do_retry']) && $csrfOk) {
    $retryId = (int) ($_POST['order_id'] ?? 0);
    if ($retryId > 0) {
        // Reset penghitung percobaan lalu kirim ulang lewat jalur yang sama dengan webhook.
        $db->prepare("UPDATE orders SET attempts=0, order_status='waiting', updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$retryId]);
        $r = topupExecute($retryId);
        $alerts[] = ["Order #$retryId diproses ulang: status={$r['status']} rc={$r['rc']} {$r['message']}", in_array($r['status'], ['success', 'pending'], true)];
    }
}
if ($authed && isset($_POST['do_diag']) && $csrfOk) {
    $dgf = new Digiflazz();
    $saldo = $dgf->deposit();
    $ip = '';
    $ctx = stream_context_create(['http' => ['timeout' => 6]]);
    $got = @file_get_contents('https://api.ipify.org', false, $ctx);
    if (is_string($got) && $got !== '') $ip = trim($got);
    $diag = [
        'mode'     => DGF_TESTING ? 'TESTING (simulasi)' : 'LIVE (transaksi riil)',
        'http'     => $saldo['http'] ?? 0,
        'rc'       => (string) ($saldo['data']['rc'] ?? ''),
        'message'  => (string) ($saldo['data']['message'] ?? ($saldo['error'] ?? '')),
        'deposit'  => $saldo['data']['deposit'] ?? null,
        'ip'       => $ip,
        'midtrans' => MIDTRANS_IS_PRODUCTION ? 'Production' : 'Sandbox',
    ];
}

$orders    = $db->query("SELECT * FROM orders ORDER BY id DESC LIMIT 30")->fetchAll();
$count     = (int) $db->query("SELECT COUNT(*) c FROM products")->fetch()['c'];
$stPending = (int) $db->query("SELECT COUNT(*) c FROM orders WHERE payment_status='pending'")->fetch()['c'];
$stSuccess = (int) $db->query("SELECT COUNT(*) c FROM orders WHERE order_status='success' OR payment_status='paid'")->fetch()['c'];
$stNeed    = (int) $db->query("SELECT COUNT(*) c FROM orders WHERE payment_status='paid' AND order_status NOT IN ('success','failed')")->fetch()['c'];
$plUpdated = (string) ($db->query("SELECT value FROM settings WHERE key='pricelist_updated'")->fetch()['value'] ?? '');
?>
<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Admin TopUp - <?= htmlspecialchars(SITE_NAME) ?></title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="<?= BASE_PATH ?>/assets/style-fly.css">
</head>
<body>
<header class="site-header">
  <div class="container header-in">
    <a class="brand" href="<?= BASE_PATH ?>/admin/"><span class="brand-badge">T</span>Admin<span>TopUp</span></a>
    <nav class="nav-links">
      <a href="<?= BASE_PATH ?>/">Lihat Toko</a>
      <a href="?logout=1">Logout</a>
    </nav>
  </div>
</header>

<div class="page">
  <div class="page-wide">
    <div class="admin-top">
      <h1 class="title" style="margin:0">Dashboard</h1>
      <div class="spacer"></div>
      <form method="post" style="display:inline">
        <input type="hidden" name="csrf" value="<?= htmlspecialchars($csrf) ?>">
        <button type="submit" name="do_sync" value="1" class="btn btn-primary btn-sm">Sync Pricelist</button>
      </form>
      <form method="post" style="display:inline">
        <input type="hidden" name="csrf" value="<?= htmlspecialchars($csrf) ?>">
        <button type="submit" name="do_diag" value="1" class="btn btn-ghost-dark btn-sm">Cek Koneksi</button>
      </form>
    </div>

    <?php foreach ($alerts as [$msg, $ok]): ?>
      <div class="msg <?= $ok ? 'ok' : 'err' ?>"><?= htmlspecialchars($msg) ?></div>
    <?php endforeach; ?>

    <?php if ($diag): ?>
      <div class="box">
        <h3>Diagnosa Koneksi</h3>
        <div class="rowlist">
          <div class="row"><span class="k">Mode Digiflazz</span><span class="v"><?= htmlspecialchars($diag['mode']) ?></span></div>
          <div class="row"><span class="k">IP keluar server</span><span class="v mono"><?= htmlspecialchars($diag['ip'] !== '' ? $diag['ip'] : '?') ?></span></div>
          <div class="row"><span class="k">Saldo Digiflazz</span><span class="v"><?= $diag['deposit'] !== null ? 'Rp ' . number_format((float) $diag['deposit'], 0, ',', '.') : '&mdash;' ?></span></div>
          <div class="row"><span class="k">Respons cek saldo</span><span class="v">http <?= (int) $diag['http'] ?><?= $diag['rc'] !== '' ? ' &middot; rc ' . htmlspecialchars($diag['rc']) : '' ?><?= $diag['message'] !== '' ? ' &middot; ' . htmlspecialchars($diag['message']) : '' ?></span></div>
          <div class="row"><span class="k">Midtrans</span><span class="v"><?= htmlspecialchars($diag['midtrans']) ?></span></div>
        </div>
        <p style="font-size:13px;color:var(--muted);margin-top:10px">
          Bila order gagal dengan <b>rc 45 &ldquo;IP Anda tidak kami kenali&rdquo;</b>, daftarkan IP di atas pada
          dashboard Digiflazz &rarr; <b>Atur Koneksi &rarr; API</b> (IP whitelist).
        </p>
      </div>
    <?php endif; ?>

    <div class="grid-mini">
      <div class="mini-card"><div class="lbl">Produk Tersimpan</div><div class="val"><?= $count ?></div></div>
      <div class="mini-card"><div class="lbl">Order Menunggu Bayar</div><div class="val"><?= $stPending ?></div></div>
      <div class="mini-card"><div class="lbl">Order Berhasil</div><div class="val"><?= $stSuccess ?></div></div>
      <div class="mini-card"><div class="lbl">Perlu Perhatian</div><div class="val"><?= $stNeed ?></div></div>
    </div>
    <p style="font-size:12.5px;color:var(--muted);margin:-6px 0 16px">
      Pricelist terakhir disinkronkan: <b><?= htmlspecialchars($plUpdated !== '' ? $plUpdated : 'belum pernah') ?></b>
      &middot; cron: sync tiap 20 menit, cek ulang order tertunda tiap 5 menit.
    </p>

    <h2 class="section-head" style="margin-bottom:14px">Order Terbaru</h2>
    <div class="tbl-wrap">
      <table class="tbl">
        <tr>
          <th>ID</th><th>Ref</th><th>Produk</th><th>ID Game</th><th>Nomor</th>
          <th>Jumlah</th><th>Bayar</th><th>Order</th><th>SN / Error</th><th>Tgl</th><th>Coba</th>
        </tr>
        <?php foreach ($orders as $o):
            $cls = $o['order_status']==='success'?'ok':($o['order_status']==='failed'?'fail':'wait');
            $pc = $o['payment_status']==='paid'?'paid':(in_array($o['payment_status'], ['expired','refund','failed','cancel'], true)?'expired':'wait'); ?>
        <tr>
          <td><?= $o['id'] ?></td>
          <td class="mono"><?= htmlspecialchars($o['ref_id']) ?></td>
          <td><?= htmlspecialchars($o['product_name']) ?></td>
          <td><?= htmlspecialchars($o['player_id']) ?><?= $o['zone_id']?' / '.htmlspecialchars($o['zone_id']):'' ?></td>
          <td class="mono"><?= htmlspecialchars($o['customer_no']) ?></td>
          <td>Rp <?= number_format((int)$o['amount'],0,',','.') ?></td>
          <td><span class="badge <?= $pc ?>"><?= htmlspecialchars(paymentStatusText($o['payment_status'])) ?></span></td>
          <td><span class="badge <?= $cls ?>"><?= htmlspecialchars(paymentStatusText($o['order_status'])) ?></span></td>
          <td class="mono"><?= htmlspecialchars($o['sn']) ?><?php if (!empty($o['last_error'])): ?><div style="font-size:11.5px;color:#f87171;max-width:220px"><?= htmlspecialchars($o['last_error']) ?></div><?php endif; ?></td>
          <td><?= htmlspecialchars($o['created_at']) ?></td>
          <td>
            <span class="mono"><?= (int) ($o['attempts'] ?? 0) ?></span>
            <?php if ($o['payment_status'] === 'paid' && $o['order_status'] !== 'success'): ?>
              <form method="post" style="margin-top:4px">
                <input type="hidden" name="csrf" value="<?= htmlspecialchars($csrf) ?>">
                <input type="hidden" name="order_id" value="<?= (int) $o['id'] ?>">
                <button type="submit" name="do_retry" value="1" class="btn btn-ghost-dark btn-sm">Ulang</button>
              </form>
            <?php endif; ?>
          </td>
        </tr>
        <?php endforeach; ?>
      </table>
    </div>
  </div>
</div>
</body></html>