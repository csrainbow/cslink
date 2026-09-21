<?php
require_once __DIR__ . '/includes/functions.php';
$db = db();
$rows = $db->query("SELECT * FROM products WHERE status=1 ORDER BY game_id, name LIMIT 400")->fetchAll();
$isFallback = false;
if (!$rows) {
    try {
        $dgf = new Digiflazz();
        $res = $dgf->priceListV2('game');
        if (empty($res['error'])) {
            $rows = $res['data']['pricelist'] ?? [];
            $isFallback = true;
        } else {
            $rows = [];
        }
    } catch (Throwable $e) {
        $rows = [];
    }
}

function gdata(array $p): array {
    return [
        'code'  => trim((string)($p['code'] ?? $p['buyer_sku_code'] ?? '')),
        'name'  => trim((string)($p['name'] ?? $p['product_name'] ?? '')),
        'price' => (int)($p['price'] ?? $p['product_seller'] ?? 0),
        'brand' => trim((string)($p['brand'] ?? '')),
    ];
}

$products = array_map('gdata', $rows);
$getCat = function (string $name): string { return product_category($name); };

// Brand populer (paling banyak produk) untuk strip cepat, maks 9.
$brandCounts = [];
foreach ($products as $p) {
    $b = $p['brand'];
    if ($b === '') continue;
    $brandCounts[$b] = ($brandCounts[$b] ?? 0) + 1;
}
arsort($brandCounts);
$brands = array_slice(array_keys($brandCounts), 0, 9);
?>
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Top up game, pulsa, dan paket data termurah & tercepat. Proses otomatis, pembayaran aman via Midtrans.">
<title><?= htmlspecialchars(SITE_NAME) ?> - Pulsa, Data & Top Up Termurah</title>
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

<section class="hero">
  <div class="container">
    <span class="hero-eyebrow">Isi Ulang Digital</span>
    <h1>Top Up Game &amp; Pulsa <span class="grad">Cepat, Aman</span></h1>
    <p class="hero-sub">Voucher game, pulsa, paket data &amp; e-money dengan harga terbaik. Proses otomatis, pembayaran terjamin lewat Midtrans.</p>
    <div class="hero-actions">
      <a class="btn btn-primary" href="#katalog">Lihat Katalog</a>
    </div>
    <div class="hero-stats">
      <span class="stat"><span class="stat-line"></span><b>24/7</b><span>Proses otomatis</span></span>
      <span class="stat"><span class="stat-line"></span><b>100%</b><span>Pembayaran aman</span></span>
      <span class="stat"><span class="stat-line"></span><b>Lengkap</b><span>Game, pulsa &amp; data</span></span>
    </div>
  </div>
</section>

<main class="section" id="katalog">
  <div class="container">
    <div class="section-head">
      <h2>Semua Produk</h2>
      <span class="count" id="count"></span>
    </div>

    <div class="toolbar">
      <div class="search">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="q" type="text" placeholder="Cari game, pulsa, paket data&hellip;" autocomplete="off">
      </div>
      <div class="chips" id="chips"></div>
    </div>

    <?php if (!empty($brands)): ?>
    <div class="brand-strip" id="brandStrip">
      <button type="button" class="brand-chip active" data-brand="Semua">Semua Brand</button>
      <?php foreach ($brands as $b):
          $logo = brand_logo_url($b);
          [$c1, $c2] = array_pad(explode(';', brand_avatar_color($b)), 2, '#6366f1'); ?>
      <button type="button" class="brand-chip" data-brand="<?= htmlspecialchars($b) ?>">
        <?php if ($logo !== ''): ?>
          <img src="<?= htmlspecialchars($logo) ?>" alt="<?= htmlspecialchars($b) ?>" loading="lazy">
        <?php else: ?>
          <span class="brand-avatar" style="background:linear-gradient(135deg,<?= $c1 ?>,<?= $c2 ?>)"><?= htmlspecialchars(brand_initial($b)) ?></span>
        <?php endif; ?>
        <?= htmlspecialchars($b) ?>
      </button>
      <?php endforeach; ?>
    </div>
    <?php endif; ?>

    <?php if (empty($products)): ?>
      <div class="empty"><b>Belum ada produk</b>Sinkronkan pricelist dari halaman admin, atau pricelist Digiflazz sedang kosong / di-limit.</div>
    <?php else: ?>
    <div class="grid" id="grid">
      <?php foreach ($products as $p):
          $cat = $getCat($p['name']);
          $thumb = product_thumb_datauri($p['name'], $cat);
          $logo = $p['brand'] !== '' ? brand_logo_url($p['brand']) : '';
          [$c1, $c2] = array_pad(explode(';', brand_avatar_color($p['brand'])), 2, '#6366f1'); ?>
        <div class="card" data-cat="<?= htmlspecialchars($cat) ?>" data-brand="<?= htmlspecialchars($p['brand']) ?>" data-q="<?= htmlspecialchars(strtolower($p['name'] . ' ' . $p['code'] . ' ' . $cat . ' ' . $p['brand'])) ?>">
          <div class="card-top">
            <?php if ($p['brand'] !== ''): ?>
              <span class="brand-logo">
                <?php if ($logo !== ''): ?>
                  <img src="<?= htmlspecialchars($logo) ?>" alt="<?= htmlspecialchars($p['brand']) ?>" loading="lazy">
                <?php else: ?>
                  <span class="brand-avatar" style="background:linear-gradient(135deg,<?= $c1 ?>,<?= $c2 ?>)"><?= htmlspecialchars(brand_initial($p['brand'])) ?></span>
                <?php endif; ?>
                <?= htmlspecialchars($p['brand']) ?>
              </span>
            <?php else: ?>
              <span class="brand-logo"><span class="brand-avatar" style="background:linear-gradient(135deg,#6366f1,#22d3ee)"><?= htmlspecialchars(brand_initial($cat)) ?></span></span>
            <?php endif; ?>
          </div>
          <div class="card-thumb">
            <span class="card-cat"><?= htmlspecialchars($cat) ?></span>
            <img src="<?= $thumb ?>" alt="<?= htmlspecialchars($p['name']) ?>" loading="lazy">
          </div>
          <div class="card-body">
            <div class="card-name"><?= htmlspecialchars($p['name']) ?></div>
            <div class="card-code"><?= htmlspecialchars($p['code']) ?></div>
            <div class="card-foot">
              <span class="card-price"><small>HARGA</small>Rp <?= number_format($p['price'], 0, ',', '.') ?></span>
              <a class="btn btn-primary card-btn" href="<?= BASE_PATH ?>/order.php?code=<?= urlencode($p['code']) ?>">Beli</a>
            </div>
          </div>
        </div>
      <?php endforeach; ?>
    </div>
    <?php endif; ?>
  </div>
</main>

<footer class="site-footer">
  <div class="container">&copy; <?= date('Y') ?> <b><?= htmlspecialchars(SITE_NAME) ?></b> &middot; Proses otomatis &amp; pembayaran aman via Midtrans</div>
</footer>

<script>
(function () {
  const q = document.getElementById('q');
  const grid = document.getElementById('grid');
  if (!grid) return;
  const chipsBox = document.getElementById('chips');
  const brandStrip = document.getElementById('brandStrip');
  const countEl = document.getElementById('count');
  const cards = Array.from(grid.querySelectorAll('.card'));
  let activeCat = 'Semua';
  let activeBrand = 'Semua';

  const cats = [...new Set(cards.map(c => c.dataset.cat).filter(Boolean))].sort();
  const mkChip = (label, cat) => {
    const el = document.createElement('span');
    el.className = 'chip' + (cat === activeCat ? ' active' : '');
    el.textContent = label;
    el.dataset.cat = cat;
    el.onclick = () => {
      activeCat = cat;
      chipsBox.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.cat === cat));
      apply();
    };
    return el;
  };
  chipsBox.appendChild(mkChip('Semua', 'Semua'));
  cats.forEach(cat => chipsBox.appendChild(mkChip(cat, cat)));

  if (brandStrip) {
    brandStrip.querySelectorAll('.brand-chip').forEach(bc => {
      bc.onclick = () => {
        activeBrand = bc.dataset.brand || 'Semua';
        brandStrip.querySelectorAll('.brand-chip').forEach(b => b.classList.toggle('active', b === bc));
        apply();
      };
    });
  }

  q.addEventListener('input', apply);

  function visible(card) {
    if (activeCat !== 'Semua' && card.dataset.cat !== activeCat) return false;
    if (activeBrand !== 'Semua' && card.dataset.brand !== activeBrand) return false;
    const s = q.value.trim().toLowerCase();
    return !s || (card.dataset.q || '').includes(s);
  }

  function apply() {
    let n = 0;
    cards.forEach(c => { const show = visible(c); c.style.display = show ? '' : 'none'; if (show) n++; });
    if (countEl) countEl.textContent = n + ' produk';
    let emptyEl = grid.parentElement.querySelector('.empty');
    if (n === 0 && !emptyEl) {
      emptyEl = document.createElement('div');
      emptyEl.className = 'empty';
      emptyEl.innerHTML = '<b>Produk tidak ditemukan</b>Coba kata kunci atau kategori lain.';
      grid.after(emptyEl);
    }
    if (emptyEl) emptyEl.style.display = n === 0 ? '' : 'none';
  }
  apply();
})();
</script>
</body>
</html>