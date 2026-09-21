<?php
require_once __DIR__ . '/includes/functions.php';
$db = db();
$code = $_GET['code'] ?? '';
$product = null;
if ($code) {
    $st = $db->prepare("SELECT * FROM products WHERE code=? AND status=1");
    $st->execute([$code]);
    $product = $st->fetch();
}
if (!$product) {
    $f = function_exists('htmlspecialchars') ? 'htmlspecialchars' : 'htmlspecialchars'; ?>
<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Produk Tidak Ditemukan</title>
<link rel="stylesheet" href="<?= BASE_PATH ?>/assets/style-fly.css">
</head>
<body><div class="page page-slim">
  <div class="notfound">
    <div class="big">404</div>
    <h2>Produk tidak ditemukan</h2>
    <p style="color:var(--muted)">Voucher mungkin sudah tidak tersedia.</p>
    <a class="btn btn-primary" href="<?= BASE_PATH ?>/">Kembali ke Katalog</a>
  </div>
</div></body></html>
<?php exit; }
$price = (int)$product['price'];
$isGame = product_is_game($product);
$brand = trim((string)($product['brand'] ?? ''));
$cat = product_category($product['name']);
$logo = $brand !== '' ? brand_logo_url($brand) : '';
[$c1, $c2] = array_pad(explode(';', brand_avatar_color($brand)), 2, '#6366f1');
?>
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Beli <?= htmlspecialchars($product['name']) ?> - <?= htmlspecialchars(SITE_NAME) ?></title>
<meta name="description" content="Top up <?= htmlspecialchars($product['name']) ?> seharga Rp <?= number_format($price,0,',','.') ?> - proses cepat & aman.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="<?= BASE_PATH ?>/assets/style-fly.css">
</head>
<body>
<header class="site-header">
  <div class="container header-in">
    <a class="brand" href="<?= BASE_PATH ?>/"><span class="brand-badge">T</span>TopUp<span>Games</span></a>
    <nav class="nav-links">
      <a href="<?= BASE_PATH ?>/cek-status.php">Cek Status</a>
    </nav>
  </div>
</header>

<div class="page">
  <div class="page-slim">
    <a class="back" href="<?= BASE_PATH ?>/">&larr; Kembali ke Katalog</a>

    <div class="steps">
      <div class="step on"><span class="step-n">1</span> Isi Data</div>
      <div class="step"><span class="step-n">2</span> Bayar</div>
      <div class="step"><span class="step-n">3</span> Selesai</div>
    </div>

    <div class="box">
      <div class="summary sum-card">
        <div class="sum-thumb"><img src="<?= product_thumb_datauri($product['name'], $cat) ?>" alt="<?= htmlspecialchars($product['name']) ?>"></div>
        <div class="sum-info">
          <div class="sum-brand">
            <?php if ($logo !== ''): ?>
              <img src="<?= htmlspecialchars($logo) ?>" alt="<?= htmlspecialchars($brand) ?>"><b><?= htmlspecialchars($brand) ?></b>
            <?php else: ?>
              <span class="brand-avatar brand-avatar-lg" style="background:linear-gradient(135deg,<?= $c1 ?>,<?= $c2 ?>)"><?= htmlspecialchars(brand_initial($brand !== '' ? $brand : $cat)) ?></span><b><?= htmlspecialchars($brand !== '' ? $brand : $cat) ?></b>
            <?php endif; ?>
          </div>
          <div class="sum-name"><?= htmlspecialchars($product['name']) ?></div>
          <div class="sum-code"><?= htmlspecialchars($product['code']) ?></div>
          <div style="height:10px"></div>
          <span class="price-big">Rp <?= number_format($price,0,',','.') ?></span>
        </div>
      </div>
    </div>

    <div class="box">
      <h3>Lengkapi Data</h3>
      <form id="topup-form">
        <input type="hidden" name="code" value="<?= htmlspecialchars($product['code']) ?>">
        <?php if ($isGame): ?>
          <div class="field">
            <label for="f-pid">ID Akun Game</label>
            <input class="input" id="f-pid" type="text" name="player_id" required placeholder="Masukkan ID akun, mis. 2166515216">
            <div class="note">ID unik akun Anda &mdash; voucher dikirim ke ID ini.</div>
          </div>
          <div class="field">
            <label for="f-zone">Zona / Server <small>&middot; opsional</small></label>
            <input class="input" id="f-zone" type="text" name="zone_id" placeholder="Contoh: 2088 (hanya untuk game yang pakai zona)">
          </div>
        <?php endif; ?>
        <div class="field">
          <label for="f-no"><?= $isGame ? 'Nomor HP' : 'Nomor Tujuan' ?> <small>&middot; <?= $isGame ? 'untuk bukti pembelian' : 'pengiriman produk' ?></small></label>
          <input class="input" id="f-no" type="text" name="customer_no" required minlength="9" maxlength="15" placeholder="08xxxxxxxxxx" inputmode="numeric">
          <div class="note"><?= $isGame
            ? 'Nomor ini dipakai untuk konfirmasi bila ada kendala pengiriman.'
            : 'Produk dikirim ke nomor ini &mdash; pastikan nomor sudah benar.' ?></div>
        </div>
        <div class="err" id="err" style="display:none"></div>
        <button type="submit" class="btn btn-primary btn-full" id="submit-btn">Bayar Rp <?= number_format($price,0,',','.') ?></button>
        <div class="pay-hint">
          <span>QRIS</span><span>Transfer Bank</span><span>Virtual Account</span><span>E-Wallet</span>
        </div>
      </form>

      <div class="pay-hint" id="pay-box" style="display:none;flex-direction:column;align-items:stretch">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span style="width:10px;height:10px;border-radius:50%;background:var(--ok);box-shadow:0 0 12px var(--ok);animation:pulse 1.4s infinite"></span>
          <strong>Order berhasil dibuat!</strong>
        </div>
        <div style="font-size:13px;color:var(--muted)">Jendela pembayaran Midtrans akan terbuka. Pilih QRIS, transfer, VA, atau e-wallet.</div>
        <button type="button" id="pay-btn" class="btn btn-primary btn-full" style="margin-top:14px">Buka Jendela Bayar</button>
        <a class="btn btn-ghost-dark btn-full" style="margin-top:8px" href="<?= BASE_PATH ?>/cek-status.php">Nanti, saya cek dulu</a>
      </div>
    </div>
  </div>
</div>

<footer class="site-footer">
  <div class="container">&copy; <?= date('Y') ?> <b><?= htmlspecialchars(SITE_NAME) ?></b> &middot; Transaksi diproses otomatis &amp; dilindungi Midtrans</div>
</footer>

<script src="<?= MIDTRANS_IS_PRODUCTION ? 'https://app.midtrans.com/snap/snap.js' : 'https://app.sandbox.midtrans.com/snap/snap.js' ?>" data-client-key="<?= MT_CLIENT_KEY ?>"></script>
<script>
const form = document.getElementById('topup-form');
const errEl = document.getElementById('err');
const submitBtn = document.getElementById('submit-btn');
let storedResult = null;

function resetBtn() {
  submitBtn.disabled = false;
  submitBtn.textContent = 'Bayar Rp <?= number_format($price,0,',','.') ?>';
}
function showErr(msg) { errEl.textContent = msg; errEl.style.display = ''; }

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showErr('');
  errEl.style.display = 'none';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Membuat order...';
  const fd = new FormData(form);
  const body = Object.fromEntries(fd.entries());
  try {
    const r = await fetch('<?= BASE_PATH ?>/api/order.php', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const d = await r.json();
    if (!d.ok) { showErr(d.message || 'Gagal membuat order'); resetBtn(); return; }
    storedResult = d;
    document.getElementById('pay-box').style.display = 'flex';
    form.style.display = 'none';
    resetBtn();
    window.snap.pay(d.token, {
      onSuccess: (r)=> window.location.href = '<?= BASE_PATH ?>/status.php?ref='+encodeURIComponent(d.ref_id),
      onPending: (r)=> window.location.href = '<?= BASE_PATH ?>/status.php?ref='+encodeURIComponent(d.ref_id),
      onError: (r)=> showErr('Pembayaran gagal: ' + (r.status_message||'') + '. Coba buka lagi lewat tombol di bawah.'),
      onClose: ()=> {}
    });
  } catch (ex) {
    showErr('Error: '+ex.message);
    resetBtn();
  }
});
document.getElementById('pay-btn').addEventListener('click', () => {
  if (storedResult) window.snap.pay(storedResult.token, {
    onSuccess: (r)=> window.location.href = '<?= BASE_PATH ?>/status.php?ref='+encodeURIComponent(storedResult.ref_id),
    onPending: (r)=> window.location.href = '<?= BASE_PATH ?>/status.php?ref='+encodeURIComponent(storedResult.ref_id),
    onError: (r)=> showErr('Pembayaran gagal: ' + (r.status_message||'')),
  });
});
</script>
</body>
</html>