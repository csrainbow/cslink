<?php
function _dbg_thumb(string $brand): void {
    $file = '/var/www/game-topup/includes/../assets/brands/' . strtolower(preg_replace('/[^A-Z0-9]/', '', $brand)) . '.png';
    echo "exact-func-path [{$file}] is=" . (is_file($file) ? 'Y' : 'N') . " sz=" . (is_file($file) ? filesize($file) : 0) . "\n";
    echo "cond=" . ((is_file($file) && filesize($file) > 2000) ? 'TRUE' : 'FALSE') . "\n";
}
_dbg_thumb('TRI');
_dbg_thumb('TELKOMSEL');
