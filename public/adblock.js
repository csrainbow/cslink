(function () {
  'use strict';
  var CSS = [
    '#cs-ab-banner{position:fixed;top:0;left:0;right:0;z-index:2147483000;display:flex;align-items:center;gap:12px;padding:12px 16px;background:#1c1030;color:#fff;border-bottom:1px solid rgba(236,72,153,.45);font:600 13.5px Inter,Segoe UI,Arial,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.35)}',
    '#cs-ab-banner .cs-ab-x{margin-left:auto;border:0;background:rgba(255,255,255,.14);color:#fff;font-size:13px;border-radius:8px;padding:6px 12px;cursor:pointer}',
    '.cs-ab-card h3{margin:0 0 6px;font-size:15px;color:#fff}',
    '.cs-ab-card p{margin:0 0 14px;color:#c9c4dd;line-height:1.5}',
    '.cs-ab-card button{display:inline-block;padding:10px 18px;border:0;border-radius:10px;font-weight:700;font-size:13.5px;cursor:pointer;color:#fff;background:linear-gradient(90deg,#7c3aed,#ec4899)}'
  ].join('');
  function ensureStyle() {
    var st = document.getElementById('cs-ab-style');
    if (!st) { st = document.createElement('style'); st.id = 'cs-ab-style'; st.textContent = CSS; (document.head || document.documentElement).appendChild(st); }
  }

  function detect(cb, timeout) {
    var bait = document.createElement('div');
    bait.className = 'adsbox pub-300x250 pub_300x250 ad-banner ad-placeholder banner-ad ad-unit adslot_7 sq_186x90 text-ad sidebar-ad';
    bait.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;pointer-events:none;';
    bait.setAttribute('aria-hidden', 'true');
    bait.innerHTML = '&nbsp;';
    (document.documentElement || document.body).appendChild(bait);
    var done = false;
    setTimeout(function () {
      if (done) return; done = true;
      var blocked = true;
      try {
        var cs = getComputedStyle(bait);
        var removed = !document.documentElement.contains(bait);
        var displayNone = cs.display === 'none';
        var visHidden = cs.visibility === 'hidden';
        var zero = bait.offsetWidth === 0 || bait.offsetHeight === 0 || bait.getClientRects().length === 0 || bait.offsetParent === null;
        blocked = removed || displayNone || visHidden || zero;
      } catch (e) { blocked = true; }
      try { if (bait.parentNode) bait.parentNode.removeChild(bait); } catch (e) {}
      if (cb) cb(blocked);
    }, timeout || 600);
    return function cancel() { if (done) return; done = true; try { if (bait.parentNode) bait.parentNode.removeChild(bait); } catch (e) {} };
  }

  function banner() {
    ensureStyle();
    if (document.getElementById('cs-ab-banner')) return;
    var b = document.createElement('div'); b.id = 'cs-ab-banner';
    b.innerHTML = '<span>⚠️</span><span>AdBlock terdeteksi. Nonaktifkan untuk situs ini agar halaman tetap gratis dan iklan tampil dengan benar.</span><button type="button" class="cs-ab-x">Tutup</button>';
    document.body.appendChild(b);
    b.querySelector('.cs-ab-x').addEventListener('click', function () { b.remove(); });
  }

  function blocker(onRetry) {
    ensureStyle();
    if (document.getElementById('cs-ab-block')) return;
    var o = document.createElement('div');
    o.id = 'cs-ab-block';
    o.style.cssText = 'position:fixed;inset:0;z-index:2147483001;background:rgba(7,10,22,.94);display:flex;align-items:center;justify-content:center;padding:20px';
    o.innerHTML = '<div class="cs-ab-card" style="max-width:430px;text-align:center;background:#141b33;border:1px solid #243056;border-radius:18px;padding:30px">' +
      '<div style="font-size:36px;margin-bottom:10px">🛡️</div>' +
      '<h3>AdBlock terdeteksi</h3>' +
      '<p>Tautan tujuan hanya tersedia setelah iklan ditampilkan. Matikan AdBlock/ekstensi pemblokir iklan untuk situs ini, lalu tekan tombol di bawah untuk memeriksa ulang. Premium bebas dari iklan — <b>tanpa perlu mematikan AdBlock</b>.</p>' +
      '<button type="button" data-ab-retry>Periksa Ulang</button></div>';
    document.body.appendChild(o);
    o.querySelector('[data-ab-retry]').addEventListener('click', onRetry);
    return o;
  }
  function unblock() { var o = document.getElementById('cs-ab-block'); if (o) o.remove(); }

  window.__csAdblock = { detect: detect, banner: banner, blocker: blocker, unblock: unblock };
})();