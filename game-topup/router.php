<?php
/**
 * Router untuk `php -S` (mode dev/cepat).
 * Blokir akses ke folder data & file sensitif.
 * Jalankan: php -S 0.0.0.0:8082 -t game-topup game-topup/router.php
 */
$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));

$block = ['/data', '/cli', '/config.php', '/includes/'];
foreach ($block as $b) {
    if ($b === $uri || ($b !== '/' && str_starts_with($uri, $b))) {
        http_response_code(404);
        return true;
    }
}

// File statis -> biarkan server melayani
$ext = pathinfo($uri, PATHINFO_EXTENSION);
if (in_array($ext, ['css','js','png','jpg','jpeg','svg','gif','ico','webp','woff','woff2','ttf'])) {
    return false;
}

// Semua request non-ekstensi: jadikan .php
$file = __DIR__ . $uri;
if ($uri === '/') {
    require __DIR__ . '/index.php';
    return true;
}
// Direktori dengan trailing slash -> cari index.php
if (substr($uri, -1) === '/' && is_file($file . 'index.php')) {
    require $file . 'index.php';
    return true;
}
if ($uri !== '/' && is_file($file . '.php')) {
    require $file . '.php';
    return true;
}
if (is_file($file)) {
    return false;
}
http_response_code(404);
return true;
