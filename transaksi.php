<?php
include 'config.php';

// Ambil data barang untuk dropdown
$barangResult = $conn->query("SELECT * FROM barang");

// Tambah transaksi
if ($_SERVER['REQUEST_METHOD'] == 'POST') {
    $id_barang = $_POST['id_barang'];
    $jumlah_beli = $_POST['jumlah_beli'];

    // Ambil harga dan stok barang
    $barang = $conn->query("SELECT * FROM barang WHERE id = $id_barang")->fetch_assoc();
    $stok_tersedia = $barang['stok'];
    $harga = $barang['harga'];

    // Cek apakah stok mencukupi
    if ($jumlah_beli > $stok_tersedia) {
        $error_message = "Stok tidak mencukupi. Stok yang tersedia adalah $stok_tersedia.";
    } else {
        // Hitung total harga
        $total_harga = $jumlah_beli * $harga;

        // Masukkan ke tabel transaksi
        $conn->query("INSERT INTO transaksi (id_barang, jumlah_beli, total_harga) VALUES ('$id_barang', '$jumlah_beli', '$total_harga')");

        // Kurangi stok barang
        $stok_baru = $stok_tersedia - $jumlah_beli;
        $conn->query("UPDATE barang SET stok = $stok_baru WHERE id = $id_barang");

        header('Location: transaksi.php');
    }
}

// Ambil data transaksi untuk riwayat
$transaksiResult = $conn->query("SELECT 
    t.id, 
    b.nama AS nama_barang, 
    t.jumlah_beli, 
    t.total_harga, 
    t.waktu 
FROM transaksi t
JOIN barang b ON t.id_barang = b.id
ORDER BY t.waktu DESC");

// Total semua transaksi
$totalSemua = $conn->query("SELECT SUM(total_harga) AS total FROM transaksi")->fetch_assoc()['total'] ?? 0;
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <title>Transaksi</title>
    <link rel="stylesheet" href="transaksi.css">
</head>
<body>
    <h1>Transaksi</h1>

    <!-- Form Tambah Transaksi -->
    <h2>Tambah Transaksi</h2>
    <form method="POST">
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

    <!-- Pesan Error jika stok tidak mencukupi -->
    <?php if (isset($error_message)): ?>
        <p style="color: red;"><?= $error_message; ?></p>
    <?php endif; ?>

    <hr>

    <!-- Riwayat Transaksi -->
    <h2>Riwayat Transaksi</h2>
    <table border="1">
        <tr>
            <th>ID</th>
            <th>Nama Barang</th>
            <th>Jumlah Beli</th>
            <th>Total Harga</th>
            <th>Waktu</th>
        </tr>
        <?php while ($transaksi = $transaksiResult->fetch_assoc()): ?>
        <tr>
            <td><?= $transaksi['id'] ?></td>
            <td><?= $transaksi['nama_barang'] ?></td>
            <td><?= $transaksi['jumlah_beli'] ?></td>
            <td><?= number_format($transaksi['total_harga'], 2) ?></td>
            <td><?= $transaksi['waktu'] ?></td>
        </tr>
        <?php endwhile; ?>
    </table>

    <h3>Total Semua Transaksi: Rp <?= number_format($totalSemua, 2) ?></h3>
</body>
</html>
