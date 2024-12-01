<?php
include 'config.php';
$id = $_GET['id'];
$result = $conn->query("SELECT * FROM barang WHERE id = $id");
$data = $result->fetch_assoc();

if ($_SERVER['REQUEST_METHOD'] == 'POST') {
    $nama = $_POST['nama'];
    $harga = $_POST['harga'];
    $stok = $_POST['stok'];
    $conn->query("UPDATE barang SET nama = '$nama', harga = '$harga', stok = '$stok' WHERE id = $id");
    header('Location: daftar_barang.php');
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Edit Barang</title>
    <link rel="stylesheet" href="edit.css"> <!-- Menghubungkan ke file CSS -->
</head>
<body>
    <div class="container">
        <h1>Edit Barang</h1>
        <form method="POST">
            <label>Nama Barang:</label>
            <input type="text" name="nama" value="<?= $data['nama'] ?>" required>

            <label>Harga Barang:</label>
            <input type="number" name="harga" min="0" value="<?= $data['harga'] ?>" required>

            <label>Stok Barang:</label>
            <input type="number" name="stok" min="0" value="<?= $data['stok'] ?>" required>

            <button type="submit">Simpan</button>
        </form>
    </div>
</body>
</html>
