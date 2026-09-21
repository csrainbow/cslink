<?php
require_once __DIR__ . '/includes/functions.php';
$db = db();
$ref = trim($_GET['ref'] ?? ($_POST['ref'] ?? ''));
$order = null; $queried = false;
if ($ref) {
    $queried = true;
    $st = $db->prepare("SELECT * FROM orders WHERE ref_id=?");
    $st->execute([$ref]);
    $order = $st->fetch();
}
?>
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Cek status order top up, pulsa, dan paket data Anda.">
<title>Cek Status Order - <?= htmlspecialchars(SITE_NAME) ?></title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="<?= BASE_PATH ?>/assets/style-fly.css">
</head>
<body>
<header class="site-header">
  <div class="container header-in">
    <a class="brand" href="<?= BASE_PATH ?>/"><span class="brand-badge">T</span>TopUp<span>Games</span></a>
    <nav class="nav-links">
      <a href="#katalog">Katalog</a>
      <a href="<?= BASE_PATH ?>/cek-status.php">Cek Status</a>
    </nav>
  </div>
</header>

<div class="page">
  <div class="page-slim">
    <a class="back" href="<?= BASE_PATH ?>/">&larr; Beranda</a>
    <h1 class="title">Cek Status Order</h1>
    <p class="subtitle">Masukkan kode order (contoh: <span class="mono">TOPUP-2026090912xxxx-xxxx</span>) yang Anda terima setelah pembayaran.</p>

    <div class="box">
      <form method="post">
        <div class="field">
          <label for="f-ref">Kode Order</label>
          <input class="input mono" id="f-ref" type="text" name="ref" required placeholder="TOPUP-2026090912xxxx-xxxx" value="<?= htmlspecialchars($ref) ?>">
        </div>
        <button type="submit" class="btn btn-primary btn-full">Cek Status</button>
      </form>

      <?php if ($queried && $order): ?>
        <?php $cls = $order['order_status']==='success' ? 'ok' : ($order['order_status']==='failed' ? 'fail' : 'wait'); ?>
        <div class="rowlist" style="margin-top:22px">
          <div class="row"><span class="k">Produk</span><span class="v"><?= htmlspecialchars($order['product_name']) ?></span></div>
          <div class="row"><span class="k">Kode Order</span><span class="v mono"><?= htmlspecialchars($order['ref_id']) ?></span></div>
          <div class="row"><span class="k">Status Order</span><span class="v"><span class="badge <?= $cls ?>"><?= paymentStatusText($order['order_status']) ?></span></span></div>
          <div class="row"><span class="k">Pembayaran</span><span class="v"><span class="badge <?= $order['payment_status']==='paid'?'paid':($order['payment_status']==='expired'?'expired':'wait') ?>"><?= paymentStatusText($order['payment_status']) ?></span></span></div>
          <?php if ($order['sn']): ?>
            <div class="row" style="flex-direction:column;align-items:stretch;gap:8px">
              <span class="k">Serial Number (SN)</span>
              <span class="sn-box" id="sn"><?= htmlspecialchars($order['sn']) ?></span>
              <button type="button" class="btn btn-ghost-dark btn-sm copy-btn" data-copy="sn">Salin SN</button>
            </div>
          <?php endif; ?>
        </div>
        <?php if ($order['order_status']==='pending'): ?>
          <p class="note" style="margin-top:14px">Order sedang diproses. Silakan muat ulang halaman ini sesaat lagi.</p>
        <?php endif; ?>
      <?php elseif ($queried): ?>
        <div class="msg err" style="margin-top:20px">Pesanan tidak ditemukan. Periksa kembali kode order Anda.</div>
      <?php endif; ?>
    </div>
  </div>
</div>

<footer class="site-footer">
  <div class="container">&copy; <?= date('Y') ?> <b><?= htmlspecialchars(SITE_NAME) ?></b> &middot; Transaksi diproses otomatis &amp; dilindungi Midtrans</div>
</footer>

<script>
document.querySelectorAll('.copy-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const el = document.getElementById(btn.dataset.copy);
    if (!el) return;
    try {
      await navigator.clipboard.writeText(el.textContent.trim());
    } catch (e) {}
    const old = btn.textContent;
    btn.textContent = 'Tersalin!';
    setTimeout(() => { btn.textContent = old; }, 1600);
  });
});
</script>
</body>
</html>