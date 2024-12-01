<?php
include 'config.php';
if ($_SERVER['REQUEST_METHOD'] == 'POST') {
    $nama = $_POST['nama'];
    $harga = $_POST['harga'];
    $stok = $_POST['stok'];

    // Validasi untuk memastikan harga dan stok tidak kurang dari 1
    if ($harga < 0) {
        $error_message = "Harga tidak bisa kurang dari 0.";
    } elseif ($stok < 1) {
        $error_message = "Stok tidak bisa kurang dari 1.";
    } else {
        // Menyimpan data barang ke database
        $conn->query("INSERT INTO barang (nama, harga, stok) VALUES ('$nama', '$harga', '$stok')");
        header('Location: daftar_barang.php');
        exit();
    }
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tambah Barang</title>
    <link rel="stylesheet" href="tambah_barang.css"> <!-- File CSS -->
    <script>
        function validateForm() {
            var harga = document.getElementById('harga').value;
            var stok = document.getElementById('stok').value;

            // Validasi harga
            if (harga < 0) {
                alert("Harga tidak bisa kurang dari 0. Silakan masukkan harga yang valid.");
                return false; // Menghentikan form untuk submit
            }

            // Validasi stok
            if (stok < 1) {
                alert("Stok tidak bisa kurang dari 1. Silakan masukkan stok yang valid.");
                return false; // Menghentikan form untuk submit
            }

            return true; // Form akan disubmit jika harga dan stok valid
        }
    </script>
</head>
<body>
    <form method="POST" onsubmit="return validateForm()">
        <h1>Tambah Barang</h1>
        <label for="nama">Nama Barang:</label>
        <input type="text" id="nama" name="nama" required>

        <label for="harga">Harga Barang:</label>
        <input type="number" id="harga" name="harga" min="1" required>

        <label for="stok">Stok Barang:</label>
        <input type="number" id="stok" name="stok" min="1" required>

        <button type="submit">Simpan</button>
    </form>

    <?php
    // Menampilkan pesan error jika ada
    if (isset($error_message)) {
        echo "<p style='color: red;'>$error_message</p>";
    }
    ?>
</body>
</html>
