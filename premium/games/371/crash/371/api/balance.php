<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST');
header('Access-Control-Allow-Headers: Content-Type');

$firebase_url = "https://giper-8fd92-default-rtdb.firebaseio.com";
$input = json_decode(file_get_contents("php://input"), true);

// accountNumber GET yoki POST orqali keladi
$accountNumber = $_GET['accountNumber'] ?? ($input['accountNumber'] ?? null);

if (!$accountNumber) {
    echo json_encode(['success' => false, 'error' => 'accountNumber required']);
    exit;
}

$path = "/users/$accountNumber.json";

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $firebase_url . $path);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$response = curl_exec($ch);
curl_close($ch);

if (!$response) {
    echo json_encode(['success' => false, 'error' => 'Firebase connection error']);
    exit;
}

$data = json_decode($response, true);

if (!$data) {
    echo json_encode(['success' => false, 'error' => 'Account not found']);
    exit;
}

echo json_encode([
    'success' => true,
    'account' => $accountNumber,
    'balance' => floatval($data['balance'] ?? 0),
    'currency' => $data['currency'] ?? 'USD'
]);
?>
