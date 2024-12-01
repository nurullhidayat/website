<?php
include 'config.php'; // File koneksi database

// Ambil data barang untuk dropdown
$barangResult = $conn->query("SELECT * FROM barang");

if ($_SERVER['REQUEST_METHOD'] == 'POST') {
    $id_barang = $_POST['id_barang'];
    $jumlah_beli = $_POST['jumlah_beli'];

    // Ambil informasi barang
    $barang = $conn->query("SELECT * FROM barang WHERE id = $id_barang")->fetch_assoc();

    // Validasi stok barang
    if ($barang['stok'] < $jumlah_beli) {
        echo "<script>alert('Stok barang tidak mencukupi!'); window.location='tambah_transaksi.php';</script>";
        exit;
    }

    $harga = $barang['harga'];
    $total_harga = $jumlah_beli * $harga;

    // Masukkan transaksi ke database
    $conn->query("INSERT INTO transaksi (id_barang, jumlah_beli, total_harga) VALUES ('$id_barang', '$jumlah_beli', '$total_harga')");

    // Kurangi stok barang
    $stok_baru = $barang['stok'] - $jumlah_beli;
    $conn->query("UPDATE barang SET stok = $stok_baru WHERE id = $id_barang");

    // Redirect ke halaman transaksi.php
    header('Location: transaksi.php');
    exit;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <title>Tambah Transaksi</title>
</head>
<body>
    <h1>Tambah Transaksi</h1>

    <form method="POST" action="tambah_transaksi.php">
        <label>Pilih Barang:</label><br>
        <select name="id_barang" required>
            <option value="">-- Pilih Barang --</option>
            <?php while ($barang = $barangResult->fetch_assoc()): ?>
                <option value="<?= $barang['id'] ?>"><?= $barang['nama'] ?> (Stok: <?= $barang['stok'] ?>)</option>
            <?php endwhile; ?>
        </select><br>

        <label>Jumlah Beli:</label><br>
        <input type="number" name="jumlah_beli" min="1" required><br>

        <button type="submit">Tambah Transaksi</button>
    </form>
</body>
</html>   