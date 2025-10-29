<?php

// 1. HTTP Headerlarni olish funksiyasi
// Ba'zi server konfiguratsiyalarida getallheaders() ishlamaydi, shuning uchun qo'shimcha tekshirish zarur
if (!function_exists('getallheaders')) {
    function getallheaders() {
        $headers = [];
        foreach ($_SERVER as $name => $value) {
            if (substr($name, 0, 5) == 'HTTP_') {
                $headers[str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($name, 5)))))] = $value;
            }
        }
        return $headers;
    }
}

// Barcha headerlarni olish
$headers = getallheaders();

// Kerakli Headerlarni ajratib olish
$x_auth = $headers['X-Auth'] ?? null;
$language = $headers['Language'] ?? null;
$partner = $headers['Partner'] ?? null;
$group = $headers['Group'] ?? null;
$whence = $headers['Whence'] ?? null;

// JSON formatida natija yuborilishini belgilash
header('Content-Type: application/json');

// 2. Avtorizatsiya tekshiruvi (Oddiy misol)
if (empty($x_auth)) {
    http_response_code(401); // Unauthorized (Ruxsatsiz)
    echo json_encode(['success' => false, 'message' => 'X-Auth header topilmadi.']);
    exit;
}

// Haqiqiy ilovada X-Auth tokeni ma'lumotlar bazasi orqali tekshiriladi.
$user_id = check_auth_token($x_auth); // <--- Haqiqiy funksiya bo'lishi kerak

if (!$user_id) {
    http_response_code(403); // Forbidden (Taqiqlangan)
    echo json_encode(['success' => false, 'message' => 'Noto‘g‘ri yoki muddati o‘tgan X-Auth token.']);
    exit;
}

// 3. Balans va Valyutani olish (Ma'lumotlar bazasi chaqiruvi simulyatsiyasi)

// Bu yerda foydalanuvchining ID si bo'yicha balans va belgilangan valyuta (currency) bazadan olinadi.
// Sizning holatingizda, valyuta odatda foydalanuvchi sozlamalarida saqlangan bo'lishi kerak.

$balance_data = get_user_balance_from_db($user_id, $partner, $group); // <--- Haqiqiy funksiya bo'lishi kerak

if (!$balance_data) {
    $balance_data = ['balance' => 4000, 'currency' => 'USD']; // Standart qiymat
}

// 4. Natijani qaytarish (Ll6/b ga mos format)
$response = [
    'success' => true,
    'message' => 'Foydalanuvchi balansi muvaffaqiyatli olindi.',
    'user_id' => $user_id,
    'balance_details' => [
        'amount' => $balance_data['balance'],
        'currency' => $balance_data['currency'], // Masala manbai shu yerda bo'lishi mumkin
        'language' => $language,
    ],
    // Boshqa ma'lumotlar (agar kerak bo'lsa)
];

echo json_encode($response, JSON_PRETTY_PRINT);

// --- Yordamchi Funksiyalar (Simulyatsiya) ---

function check_auth_token($token) {
    // DB orqali token tekshiruvi simulyatsiyasi.
    // Haqiqiy kodda: SELECT user_id FROM tokens WHERE token = :token AND expiration_time > NOW()
    if (!empty($token) && $token !== 'NOT_VALID') {
        return 12345678910; // Test foydalanuvchi ID
    }
    return null;
}

function get_user_balance_from_db($user_id, $partner, $group) {
    // DB orqali balansni olish simulyatsiyasi
    // Haqiqiy kodda: SELECT balance, currency FROM user_accounts WHERE user_id = :id
    if ($user_id === 12345678910) {
        // Balansni qaytarish.
        return ['balance' => 750.50, 'currency' => 'BDT']; 
        // Valyuta muammosini ko‘rsatish uchun "BDT" ni qo‘ydim.
    }
    return null;
}

?>
