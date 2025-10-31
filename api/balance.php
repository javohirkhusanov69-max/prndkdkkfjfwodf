<?php
// হেডার সেট করা
header('Content-Type: application/json');

// এরর রিপোর্টিং
error_reporting(E_ALL);
ini_set('display_errors', 1);

// ডাটাবেজ কানেকশন ফাইল ইম্পোর্ট করা
$conn = require_once 'connection.php';

// রেসপন্স অ্যারে
$response = array();

// POST রিকোয়েস্ট আসলে প্রসেস করা
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // পোস্ট ডাটা গ্রহণ করা
    $post_data = json_decode(file_get_contents('php://input'), true);
    
    // যদি JSON ডাটা পার্স ব্যর্থ হয়
    if (json_last_error() !== JSON_ERROR_NONE) {
        // ফলব্যাক: সরাসরি POST ডাটা ব্যবহার করে
        $email = isset($_POST['email']) ? $_POST['email'] : '';
        $password = isset($_POST['password']) ? $_POST['password'] : '';
        $first_name = isset($_POST['first_name']) ? $_POST['first_name'] : '';
        $last_name = isset($_POST['last_name']) ? $_POST['last_name'] : '';
        $country = isset($_POST['country']) ? $_POST['country'] : 'Bangladesh';
        $currency = isset($_POST['currency']) ? $_POST['currency'] : 'BDT';
        $balance = isset($_POST['balance']) ? floatval($_POST['balance']) : 10000.0;
    } else {
        // JSON ডাটা থেকে পার্স করে নেয়া
        $email = isset($post_data['email']) ? $post_data['email'] : '';
        $password = isset($post_data['password']) ? $post_data['password'] : '';
        $first_name = isset($post_data['first_name']) ? $post_data['first_name'] : '';
        $last_name = isset($post_data['last_name']) ? $post_data['last_name'] : '';
        $country = isset($post_data['country']) ? $post_data['country'] : 'Uzbekistan';
        $currency = isset($post_data['currency']) ? $post_data['currency'] : 'USF';
        $balance = isset($post_data['balance']) ? floatval($post_data['balance']) : 1000.0;
    }
    
    // ভ্যালিডেশন
    if (empty($email) || empty($password)) {
        $response = array(
            'status' => 'error',
            'message' => 'ইমেইল এবং পাসওয়ার্ড অবশ্যই দিতে হবে'
        );
    } else {
        try {
            // ইমেইল ইতিমধ্যে ব্যবহৃত কিনা চেক করা
            $check_stmt = $conn->prepare("SELECT * FROM users WHERE email = :email LIMIT 1");
            $check_stmt->bindParam(':email', $email);
            $check_stmt->execute();
            
            $existing_user = $check_stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($existing_user) {
                // ইতিমধ্যে রেজিস্টার্ড
                $response = array(
                    'status' => 'error',
                    'message' => 'এই ইমেইল ইতিমধ্যে ব্যবহৃত'
                );
            } else {
                // অ্যাকাউন্ট নম্বর জেনারেট করা (XB + র‍্যান্ডম 8 ডিজিট)
                $account_number = 'XB' . mt_rand(10000000, 99999999);
                
                // ফুল নেম জেনারেট
                $full_name = $first_name . ' ' . $last_name;
                
                // পাসওয়ার্ড হ্যাশ করা
                $hashed_password = password_hash($password, PASSWORD_DEFAULT);
                
                // SQL টেবিল যদি না থাকে তবে তৈরি করা
                $create_table_sql = "CREATE TABLE IF NOT EXISTS `users` (
                    `id` int(11) NOT NULL AUTO_INCREMENT,
                    `email` varchar(255) NOT NULL,
                    `password` varchar(255) NOT NULL,
                    `account_number` varchar(50) NOT NULL,
                    `first_name` varchar(100) DEFAULT NULL,
                    `last_name` varchar(100) DEFAULT NULL,
                    `full_name` varchar(200) DEFAULT NULL,
                    `country` varchar(100) DEFAULT 'Uzbekistan',
                    `currency` varchar(10) DEFAULT 'USD',
                    `balance` decimal(10,2) DEFAULT '1000.00',
                    `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (`id`),
                    UNIQUE KEY `email` (`email`),
                    UNIQUE KEY `account_number` (`account_number`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";
                
                $conn->exec($create_table_sql);
                
                // নতুন ইউজার তৈরি করি
                $stmt = $conn->prepare("INSERT INTO users (email, password, account_number, first_name, last_name, full_name, country, currency, balance, created_at) VALUES (:email, :password, :account_number, :first_name, :last_name, :full_name, :country, :currency, :balance, NOW())");
                
                $stmt->bindParam(':email', $email);
                $stmt->bindParam(':password', $hashed_password);
                $stmt->bindParam(':account_number', $account_number);
                $stmt->bindParam(':first_name', $first_name);
                $stmt->bindParam(':last_name', $last_name);
                $stmt->bindParam(':full_name', $full_name);
                $stmt->bindParam(':country', $country);
                $stmt->bindParam(':currency', $currency);
                $stmt->bindParam(':balance', $balance);
                
                $stmt->execute();
                
                // ইনসার্টকৃত ইউজার আইডি নিয়ে আসা
                $userId = $conn->lastInsertId();
                
                // সাক্সেস রেসপন্স
                $response = array(
                    'status' => 'success',
                    'message' => 'রেজিস্ট্রেশন সফল হয়েছে',
                    'data' => array(
                        'id' => $userId,
                        'email' => $email,
                        'account_number' => $account_number,
                        'password' => $password, // খালি পাসওয়ার্ড ফিরত দিচ্ছি ক্লায়েন্টকে
                        'first_name' => $first_name,
                        'last_name' => $last_name,
                        'full_name' => $full_name,
                        'country' => $country,
                        'currency' => $currency,
                        'balance' => $balance
                    )
                );
            }
        } catch (PDOException $e) {
            // ডাটাবেজ এরর
            $response = array(
                'status' => 'error',
                'message' => 'ডাটাবেজ এরর: ' . $e->getMessage()
            );
        }
    }
} else {
    // অবৈধ রিকোয়েস্ট মেথড
    $response = array(
        'status' => 'error',
        'message' => 'অবৈধ রিকোয়েস্ট মেথড। শুধুমাত্র POST রিকোয়েস্ট সমর্থিত।'
    );
}

// জেসন রেসপন্স দেয়া
echo json_encode($response);
?> 
