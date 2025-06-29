import db from '../../db/db';
import lockMiddleware from '../../middleware/lockMiddleware';
import { unlockResource } from '../../middleware/lockMiddleware';

export default async function handler(req, res) {
  const { method, headers } = req;
  const sessionId = headers['x-session-id'] || req.query?.user_id || req.body?.user_id;

  try {
    if (method === 'GET') {
      const { kode_brg } = req.query;

      if (kode_brg) {
        const [rows] = await db.query(
          `SELECT *, 
           TIMESTAMPDIFF(SECOND, locked_at, NOW()) AS lock_duration,
           locked_by = ? AS is_locked_by_me
           FROM stok WHERE kode_brg = ?`,
          [sessionId, kode_brg]
        );
        
        if (rows.length > 0) {
          const product = rows[0];
          if (product.lock_duration > 10 && product.locked_by) {
            await unlockResource(kode_brg, product.locked_by, 'stok');
            product.locked_by = null;
            product.locked_at = null;
          }
          return res.status(200).json(product);
        }
        return res.status(404).json({ message: 'Barang tidak ditemukan.' });
      }

      const [rows] = await db.query('SELECT * FROM stok ORDER BY nama_brg ASC');
      return res.status(200).json(rows);
    }

    if (method === 'POST') {
      const { nama_brg, satuan, jml_stok } = req.body;

      if (!nama_brg || !satuan || !jml_stok) {
        return res.status(400).json({ 
          success: false,
          message: 'Semua field harus diisi.' 
        });
      }

      try {
        // Gunakan stored procedure simpan_barang
        const [result] = await db.query(
          'CALL simpan_barang(?, ?, ?)',
          [nama_brg, satuan, jml_stok]
        );

        // Ambil data terbaru
        const [newProduct] = await db.query(
          'SELECT * FROM stok WHERE nama_brg = ? ORDER BY created_at DESC LIMIT 1',
          [nama_brg]
        );

        return res.status(201).json({ 
          success: true,
          message: 'Barang berhasil disimpan',
          data: newProduct[0] 
        });
      } catch (error) {
        console.error('Error saving product:', error);
        return res.status(500).json({
          success: false,
          message: error.message.includes('ER_DUP_ENTRY') ? 
            'Barang dengan nama yang sama sudah ada' : 
            'Gagal menyimpan barang'
        });
      }
    }

    if (method === 'PUT') {
      const { kode_brg, nama_brg, satuan, jml_stok } = req.body;

      if (!kode_brg || !nama_brg || !satuan || !jml_stok || !sessionId) {
        return res.status(400).json({ 
          success: false,
          message: 'Semua field harus diisi.' 
        });
      }

      try {
        return await new Promise((resolve) => {
          lockMiddleware(req, res, async () => {
            try {
              // Gunakan stored procedure update_barang
              const [result] = await db.query(
                'CALL update_barang(?, ?, ?, ?)',
                [kode_brg, nama_brg, satuan, jml_stok]
              );

              // Ambil data terupdate
              const [updatedProduct] = await db.query(
                'SELECT * FROM stok WHERE kode_brg = ?',
                [kode_brg]
              );

              if (!updatedProduct || updatedProduct.length === 0) {
                return resolve(res.status(404).json({
                  success: false,
                  message: 'Barang tidak ditemukan setelah update'
                }));
              }

              return resolve(res.status(200).json({
                success: true,
                message: 'Barang berhasil diperbarui',
                data: updatedProduct[0]
              }));
            } catch (error) {
              console.error('Update error:', error);
              return resolve(res.status(500).json({
                success: false,
                message: error.message.includes('ER_DUP_ENTRY') ?
                  'Nama barang sudah digunakan' :
                  'Gagal memperbarui barang'
              }));
            }
          });
        });
      } catch (error) {
        console.error('Update outer error:', error);
        return res.status(500).json({
          success: false,
          message: 'Gagal memperbarui barang'
        });
      }
    }

    if (method === 'DELETE') {
      const { kode_brg } = req.query;

      if (!kode_brg || !sessionId) {
        return res.status(400).json({ 
          success: false,
          message: 'Kode barang dan user ID harus disertakan.' 
        });
      }

      try {
        return await new Promise((resolve) => {
          lockMiddleware(req, res, async () => {
            try {
              // Gunakan stored procedure hapus_barang
              const [result] = await db.query(
                'CALL hapus_barang(?)',
                [kode_brg]
              );

              // Verifikasi penghapusan
              const [check] = await db.query(
                'SELECT * FROM stok WHERE kode_brg = ?',
                [kode_brg]
              );

              if (check.length > 0) {
                return resolve(res.status(400).json({
                  success: false,
                  message: 'Barang tidak dapat dihapus karena terdapat transaksi terkait'
                }));
              }

              return resolve(res.status(200).json({
                success: true,
                message: 'Barang berhasil dihapus',
                kode_brg
              }));
            } catch (error) {
              console.error('Delete error:', error);
              return resolve(res.status(500).json({
                success: false,
                message: error.message.includes('foreign key constraint') ?
                  'Barang tidak dapat dihapus karena terdapat transaksi terkait' :
                  'Gagal menghapus barang'
              }));
            }
          });
        });
      } catch (error) {
        console.error('Delete outer error:', error);
        return res.status(500).json({
          success: false,
          message: 'Gagal menghapus barang'
        });
      }
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    return res.status(405).json({
      success: false,
      message: `Method ${method} Not Allowed`
    });
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server'
    });
  }
}