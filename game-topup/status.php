<?php
require_once __DIR__ . '/includes/functions.php';
$db = db();
$ref = $_GET['ref'] ?? '';
$order = null;
if ($ref) {
    $st = $db->prepare("SELECT * FROM orders WHERE ref_id=?");
    $st->execute([$ref]);
    $order = $st->fetch();
}
?>
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Hasil transaksi top up Anda di <?= htmlspecialchars(SITE_NAME) ?>.">
<title>Status Pesanan - <?= htmlspecialchars(SITE_NAME) ?></title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="<?= BASE_PATH ?>/assets/style-fly.css">
</head>
<body>
<header class="site-header">
  <div class="container header-in">
    <a class="brand" href="<?= BASE_PATH ?>/"><span class="brand-badge">T</span>TopUp<span>Games</span></a>
    <nav class="nav-links">
      <a href="<?= BASE_PATH ?>/">Katalog</a>
      <a href="<?= BASE_PATH ?>/cek-status.php">Cek Status</a>
    </nav>
  </div>
</header>

<div class="page">
  <div class="page-slim">
    <a class="back" href="<?= BASE_PATH ?>/">&larr; Beranda</a>

    <?php if (!$order): ?>
      <div class="box">
        <div class="notfound">
          <div class="big">?</div>
          <h2>Pesanan tidak ditemukan</h2>
          <p style="font-size:13.5px">Mungkin kode ref salah, atau transaksi belum tercatat.</p>
          <a class="btn btn-primary" href="<?= BASE_PATH ?>/cek-status.php">Cek Status Lain</a>
        </div>
      </div>
    <?php else:
        $cls = $order['order_status']==='success' ? 'ok' : ($order['order_status']==='failed' ? 'fail' : 'wait');
        $payCls = $order['payment_status']==='paid' ? 'paid' : (in_array($order['payment_status'], ['expired','refund','failed','cancel'], true) ? 'expired' : 'wait'); ?>

      <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">
        <h1 style="font-size:24px;font-weight:900;letter-spacing:-.6px;flex:1">Status Pesanan</h1>
        <span class="badge big <?= $cls ?>"><?= paymentStatusText($order['order_status']) ?></span>
      </div>

      <div class="box">
        <div class="rowlist">
          <div class="row"><span class="k">Kode Order</span><span class="v mono"><?= htmlspecialchars($order['ref_id']) ?></span></div>
          <div class="row"><span class="k">Produk</span><span class="v"><?= htmlspecialchars($order['product_name']) ?> <span class="mono">(<?= htmlspecialchars($order['product_code']) ?>)</span></span></div>
          <div class="row"><span class="k">ID Game</span><span class="v"><?= htmlspecialchars($order['player_id']) ?><?= $order['zone_id'] ? ' - '.htmlspecialchars($order['zone_id']) : '' ?></span></div>
          <div class="row"><span class="k">Jumlah Bayar</span><span class="v">Rp <?= number_format((int)$order['amount'],0,',','.') ?></span></div>
          <div class="row"><span class="k">Pembayaran</span><span class="v"><span class="badge <?= $payCls ?>"><?= paymentStatusText($order['payment_status']) ?></span></span></div>
        </div>
        <?php if ($order['sn']): ?>
          <div style="margin-top:18px;padding-top:16px;border-top:1px dashed var(--border)">
            <div class="field" style="margin-bottom:8px">
              <label for="sn">Serial Number (SN) / Voucher</label>
              <span class="sn-box" id="sn"><?= htmlspecialchars($order['sn']) ?></span>
            </div>
            <button type="button" class="btn btn-ghost-dark btn-sm copy-btn" data-copy="sn">Salin SN</button>
          </div>
        <?php endif; ?>
      </div>

      <div class="box" style="background:var(--panel-soft)">
        <div style="display:flex;gap:10px;align-items:flex-start">
          <span style="font-size:18px"><?= $order['order_status']==='success' ? '✓' : ($order['order_status']==='failed' ? '✕' : '⏳') ?></span>
          <p style="font-size:13.5px;color:var(--muted)">
            <?php if ($order['order_status']==='success'): ?>
              Voucher berhasil dikirim. Simpan SN di atas. Butuh bantuan? Hubungi admin dengan kode order <b class="mono"><?= htmlspecialchars($order['ref_id']) ?></b>.
            <?php elseif ($order['order_status']==='failed'): ?>
              Pengiriman voucher gagal. Dana otomatis dikembalikan sesuai kebijakan. Hubungi admin bila masih ada masalah.
            <?php elseif ($order['payment_status']==='paid'): ?>
              Pembayaran sudah kami terima. Produk sedang dikirim otomatis oleh sistem &mdash; muat ulang halaman ini sesaat lagi (biasanya dalam beberapa menit). Kode order: <b class="mono"><?= htmlspecialchars($order['ref_id']) ?></b>.
            <?php else: ?>
              Order sedang diproses otomatis. Muat ulang halaman ini sesaat lagi &mdash; biasanya selesai dalam beberapa menit.
            <?php endif; ?>
          </p>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:6px">
          <a class="btn btn-primary btn-sm" href="<?= BASE_PATH ?>/">Top Up Lagi</a>
          <button type="button" class="btn btn-ghost-dark btn-sm" id="refresh-btn">Perbarui Status</button>
        </div>
      </div>
    <?php endif; ?>
  </div>
</div>

<footer class="site-footer">
  <div class="container">&copy; <?= date('Y') ?> <b><?= htmlspecialchars(SITE_NAME) ?></b> &middot; Transaksi diproses otomatis &amp; dilindungi Midtrans</div>
</footer>

<script>
const refreshBtn = document.getElementById('refresh-btn');
if (refreshBtn) refreshBtn.addEventListener('click', () => location.reload());
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