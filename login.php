<?php
// Cek jika pengguna sudah login
session_start();
if (isset($_SESSION['username'])) {
    header("Location: daftar_barang.php");
    exit();
}

// Tentukan username dan password yang benar
$correct_username = "hamid"; // Ganti dengan username yang diinginkan
$correct_password = "sale"; // Ganti dengan password yang diinginkan

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $username = $_POST['username'];
    $password = $_POST['password'];

    // Verifikasi username dan password
    if ($username == $correct_username && $password == $correct_password) {
        // Set session login
        $_SESSION['username'] = $username;
        header("Location: daftar_barang.php");
        exit();
    } else {
        $error = "Username atau password salah!";
    }
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login</title>
    <link rel="stylesheet" href="login.css">
</head>
<body>
    <div class="login-container">
        <h1>Login</h1>
        <?php if (isset($error)): ?>
            <p style="color: red;"><?php echo $error; ?></p>
        <?php endif; ?>
        <form action="login.php" method="POST">
            <label for="username">Username:</label>
            <input type="text" id="username" name="username" required>

            <label for="password">Password:</label>
            <input type="password" id="password" name="password" required>

            <button type="submit">Login</button>
        </form>
    </div>
</body>
</html>
