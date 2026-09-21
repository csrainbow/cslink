<?php
require __DIR__ . '/../includes/functions.php';
$svg = product_thumb_svg("Axis 10.000", "Voucher", "AXIS");
echo "has png: " . (strpos($svg, "image/png") !== false ? "YES" : "NO") . PHP_EOL;
if (preg_match('/<image[^>]*>/', $svg, $m)) { echo "tag: " . substr($m[0], 0, 80) . "...\n"; } else { echo "tag: (none)\n"; }

function probe(string $brand): void {
    $slug = strtolower(preg_replace('/[^A-Z0-9]/', '', $brand));
    $p = __DIR__ . '/../assets/brands/' . $slug . '.png';
    echo "brand=$brand slug=$slug p=[$p] is_file=" . (is_file($p) ? 'Y' : 'N') . " size=" . (is_file($p) ? filesize($p) : 0) . PHP_EOL;
}
probe('AXIS'); probe('TRI'); probe('TELKOMSEL');
echo "brands dir: " . dirname(__DIR__) . "/assets/brands\n";
