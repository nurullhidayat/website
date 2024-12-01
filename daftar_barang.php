<?php

session_start();

// Cek apakah pengguna sudah login
if (!isset($_SESSION['username'])) {
    header("Location: login.php");
    exit();
}

include 'config.php';

$result = $conn->query("SELECT * FROM barang");

if (!$result) {
    die("Query gagal: " . $conn->error);
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Daftar Barang</title>
    <link rel="stylesheet" href="daftar_barang.css"> <!-- Hubungkan file CSS -->
</head>
<body>
    <!-- Header -->
    <header>
        <h1>Selamat Datang, Admin!</h1>
        <p>Kelola data barang dan transaksi dengan mudah di dashboard ini.</p>
    </header>

    <!-- Navigasi -->
    <nav class="nav">
        <a href="daftar_barang.php">Beranda</a>
        <a href="tambah_barang.php">Tambah Barang</a>
        <a href="transaksi.php">Tambah Transaksi</a>
        <a href="logout.php" onclick="return confirm('Anda yakin ingin keluar?')">Logout</a>
    </nav>

    <!-- Konten Utama -->
    <main>
        <h2>Daftar Barang</h2>
        <table>
            <tr>
                <th>ID</th>
                <th>Nama</th>
                <th>Harga</th>
                <th>Stok</th>
                <th>Aksi</th>
            </tr>
            <?php while ($row = $result->fetch_assoc()): ?>
            <tr>
                <td><?= $row['id'] ?></td>
                <td><?= $row['nama'] ?></td>
                <td><?= number_format($row['harga'], 2) ?></td>
                <td><?= $row['stok'] ?></td>
                <td>
                    <a href="edit_barang.php?id=<?= $row['id'] ?>">Edit</a>
                    <a href="hapus_barang.php?id=<?= $row['id'] ?>" onclick="return confirm('Hapus barang ini?')">Hapus</a>
                </td>
            </tr>
            <?php endwhile; ?>
        </table>
    </main>

    <!-- Footer -->
    <footer>
        <p>&copy; 2024 Manajemen Barang - Dibuat oleh Sale bin Hamid</p>
    </footer>
</body>
</html>
