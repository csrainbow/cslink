<?php
/**
 * SALIN file ini menjadi config.local.php lalu isi kredensial Anda.
 * config.local.php TIDAK di-commit ke git (lihat .gitignore).
 */
define('DGF_USERNAME', 'username_digiflazz_anda');
define('DGF_APIKEY', 'apikey_digiflazz_anda');
define('DGF_TESTING', true); // wajib true saat memakai Development Key; false untuk transaksi riil (Production Key)
define('MT_SERVER_KEY', 'Mid-server-xxxx');
define('MT_CLIENT_KEY', 'Mid-client-xxxx');
// define('MIDTRANS_IS_PRODUCTION', false); // opsional, default false

// ==================== PANEL ADMIN (/top-up/admin/) ====================
// WAJIB diisi: hash password admin (password polos TIDAK disimpan).
// Generate di server:
//   php -r "echo password_hash('password-pilihan-anda', PASSWORD_DEFAULT), PHP_EOL;"
// Lalu tempel hasilnya (mulai dengan $2y$...) di bawah ini.
// define('GT_ADMIN_PASS_HASH', '$2y$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');