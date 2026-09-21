<?php
/**
 * Digiflazz API wrapper
 * https://developer.digiflazz.com/api/buyer/topup/
 */
require_once __DIR__ . '/../config.php';

class Digiflazz {
    private string $username;
    private string $apiKey;
    private string $base;

    public function __construct() {
        $this->username = DGF_USERNAME;
        $this->apiKey   = DGF_APIKEY;
        $this->base     = DGF_BASE;
    }

    /** md5 signature per dokumentasi */
    private function sign(string $payload): string {
        return md5($this->username . $this->apiKey . $payload);
    }

    private function http(string $endpoint, array $body): array {
        $ch = curl_init($this->base . $endpoint);
        curl_setopt_array($ch, [
            CURLOPT_POST => 1,
            CURLOPT_POSTFIELDS => json_encode($body),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
            CURLOPT_RETURNTRANSFER => 1,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_FOLLOWLOCATION => 1,
            CURLOPT_SSL_VERIFYPEER => 1,
        ]);
        $response = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        if ($response === false) {
            return ['http' => $code, 'error' => 'CURL: ' . $err, 'data' => null];
        }
        $data = json_decode($response, true);
        return ['http' => $code, 'error' => $code >= 400 ? ($data['data']['message'] ?? 'HTTP ' . $code) : null, 'data' => $data['data'] ?? $data];
    }

    /** Daftar harga / pricelist */
    public function priceList(): array {
        return $this->http('/price-list', [
            'cmd' => 'prepaid',           // khusus diminta oleh sebagian endpoint; aman diabaikan bila ditolak
            'username' => $this->username,
            'sign' => $this->sign('pricelist'),
        ]);
    }

    /** Cek harga & stok produk per kategori */
    public function priceListV2(string $type = 'prepaid'): array {
        $body = [
            'cmd' => 'prepaid',   // cmd: prepaid / pasca (bukan filter "type")
            'username' => $this->username,
            'sign' => $this->sign('pricelist'),
        ];
        if ($type === 'game') {
            $body['type'] = 'game'; // filter opsional: hanya produk game
        }
        return $this->http('/price-list', $body);
    }

    /** Transaksi top-up / isi ulang */
    public function topup(string $refId, string $buyerSkuCode, string $customerNo): array {
        $body = [
            'username' => $this->username,
            'buyer_sku_code' => $buyerSkuCode,
            'customer_no' => $customerNo,
            'ref_id' => $refId,
            'sign' => $this->sign($refId),
        ];
        if (defined('DGF_TESTING') && DGF_TESTING) {
            $body['testing'] = true;
        }
        return $this->http('/transaction', $body);
    }

    /** Cek status transaksi berdasarkan ref_id */
    public function status(string $refId): array {
        return $this->http('/transaction', [
            'username' => $this->username,
            'ref_id' => $refId,
            'sign' => $this->sign($refId),
        ]);
    }

    /** Webhook callback verifikasi (dipanggil Digiflazz ke server anda) */
    public function handleCallback(string $payload): array {
        $p = json_decode($payload, true);
        // Webhook mengirim "data" sebagai object; API list mengirim sebagai array.
        $data = $p['data'][0] ?? $p['data'] ?? [];
        return [
            'ref_id' => $data['ref_id'] ?? '',
            'status' => $data['status'] ?? '',     // Sukses / Gagal / Pending
            'product_code' => $data['buyer_sku_code'] ?? '',
            'customer_no' => $data['customer_no'] ?? '',
            'sn' => $data['sn'] ?? '',
            'price' => $data['price'] ?? 0,
            'raw' => $payload,
        ];
    }
}
