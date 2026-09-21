<?php
require_once __DIR__ . '/../includes/functions.php';
$db = db();

session_start();
$ADMIN_PASS = 'admin123';
if (isset($_POST['admin_login'])) {
    if ($_POST['password'] === $ADMIN_PASS) $_SESSION['gt_admin'] = true;
}
if (isset($_GET['logout'])) unset($_SESSION['gt_admin']);
$authed = !empty($_SESSION['gt_admin']);

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
    <form method="post">
      <input type="hidden" name="admin_login" value="1">
      <div class="field" style="margin-bottom:16px">
        <input class="input" type="password" name="password" placeholder="Password" required>
      </div>
      <button type="submit" class="btn btn-primary btn-full">Masuk</button>
    </form>
  </div>
</div>
</body></html>
<?php exit; }

$syncMsg = ['', false];
if (isset($_GET['sync'])) {
    $dgf = new Digiflazz();
    $res = $dgf->priceListV2('game');
    if (empty($res['error']) && isset($res['data']['pricelist'])) {
        $st = $db->prepare("INSERT INTO products (game_id, code, name, price, buy_price, status) VALUES (1,?,?,?,?,1)
                            ON CONFLICT(code) DO UPDATE SET name=excluded.name, buy_price=excluded.buy_price, price=excluded.price");
        $n = 0;
        foreach ($res['data']['pricelist'] as $p) {
            $code = $p['buyer_sku_code'] ?? ''; if (!$code) continue;
            $buy = (int)($p['product_price'] ?? 0); $sell = (int)($p['price'] ?? 0);
            if ($sell <= 0) $sell = (int) floor($buy * 1.1);
            $st->execute([$code, $p['product_name'] ?? $code, $sell, $buy]); $n++;
        }
        $syncMsg = ["Sync selesai: $n produk.", true];
    } else {
        $syncMsg = ['Sync gagal: ' . ($res['error'] ?? 'kredensial/limit'), false];
    }
}

$orders = $db->query("SELECT * FROM orders ORDER BY id DESC LIMIT 30")->fetchAll();
$count = (int) $db->query("SELECT COUNT(*) c FROM products")->fetch()['c'];
$stPending = (int) $db->query("SELECT COUNT(*) c FROM orders WHERE payment_status='pending'")->fetch()['c'];
$stSuccess = (int) $db->query("SELECT COUNT(*) c FROM orders WHERE order_status='success' OR payment_status='paid'")->fetch()['c'];
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
      <a class="btn btn-primary btn-sm" href="?sync=1">Sync Pricelist</a>
    </div>

    <?php if ($syncMsg[0]): ?>
      <div class="msg <?= $syncMsg[1] ? 'ok' : 'err' ?>"><?= htmlspecialchars($syncMsg[0]) ?></div>
    <?php endif; ?>

    <div class="grid-mini">
      <div class="mini-card"><div class="lbl">Produk Tersimpan</div><div class="val"><?= $count ?></div></div>
      <div class="mini-card"><div class="lbl">Order Menunggu</div><div class="val"><?= $stPending ?></div></div>
      <div class="mini-card"><div class="lbl">Order Berhasil</div><div class="val"><?= $stSuccess ?></div></div>
    </div>

    <h2 class="section-head" style="margin-bottom:14px">Order Terbaru</h2>
    <div class="tbl-wrap">
      <table class="tbl">
        <tr>
          <th>ID</th><th>Ref</th><th>Produk</th><th>ID Game</th><th>Nomor</th>
          <th>Jumlah</th><th>Bayar</th><th>Order</th><th>SN</th><th>Tgl</th>
        </tr>
        <?php foreach ($orders as $o):
            $cls = $o['order_status']==='success'?'ok':($o['order_status']==='failed'?'fail':'wait');
            $pc = $o['payment_status']==='paid'?'paid':($o['payment_status']==='expired'?'expired':'wait'); ?>
        <tr>
          <td><?= $o['id'] ?></td>
          <td class="mono"><?= htmlspecialchars($o['ref_id']) ?></td>
          <td><?= htmlspecialchars($o['product_name']) ?></td>
          <td><?= htmlspecialchars($o['player_id']) ?><?= $o['zone_id']?' / '.htmlspecialchars($o['zone_id']):'' ?></td>
          <td class="mono"><?= htmlspecialchars($o['customer_no']) ?></td>
          <td>Rp <?= number_format((int)$o['amount'],0,',','.') ?></td>
          <td><span class="badge <?= $pc ?>"><?= htmlspecialchars($o['payment_status']) ?></span></td>
          <td><span class="badge <?= $cls ?>"><?= htmlspecialchars($o['order_status']) ?></span></td>
          <td class="mono"><?= htmlspecialchars($o['sn']) ?></td>
          <td><?= $o['created_at'] ?></td>
        </tr>
        <?php endforeach; ?>
      </table>
    </div>
  </div>
</div>
</body></html>