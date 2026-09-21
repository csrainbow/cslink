<?php
require __DIR__ . '/../includes/functions.php';
$svg = product_thumb_svg("TRI Paket Data 1GB", "Paket Data", "TRI");
if (strpos($svg, '<image') !== false) {
    echo "HAS <image>\n";
} else {
    echo "TIDAK <image>\n";
}
file_put_contents('/tmp/svg.out', $svg);
echo "wrote /tmp/svg.out " . strlen($svg) . "B\n";
