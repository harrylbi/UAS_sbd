import db from '../../db/db';
import lockMiddleware from '../../middleware/lockMiddleware';
import { unlockResource } from '../../middleware/lockMiddleware';
import crypto from 'crypto';

// Helper function to generate product ID
function generateProductId() {
  const timestamp = Date.now().toString(36).slice(-4);
  const randomPart = crypto.randomBytes(3).toString('hex');
  return `PRD_${timestamp}_${randomPart}`.toUpperCase();
}

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
          // Auto-unlock if lock is expired (>5 minutes)
          if (product.lock_duration > 300 && product.locked_by) {
            await unlockResource(kode_brg, product.locked_by, 'stok');
            product.locked_by = null;
            product.locked_at = null;
          }
          return res.status(200).json(product);
        }
        return res.status(404).json({ message: 'Barang tidak ditemukan.' });
      }

      const [rows] = await db.query(
        'SELECT * FROM stok ORDER BY nama_brg ASC'
      );
      return res.status(200).json(rows);
    }

    if (method === 'POST') {
      const { nama_brg, satuan, jml_stok } = req.body;

      if (!nama_brg || !satuan || !jml_stok || !sessionId) {
        return res.status(400).json({ message: 'Semua field harus diisi.' });
      }

      // Generate automatic product ID
      const kode_brg = generateProductId();

      try {
        await db.query('START TRANSACTION');

        // Check if product with same name already exists
        const [existing] = await db.query(
          'SELECT kode_brg FROM stok WHERE nama_brg = ?',
          [nama_brg]
        );

        if (existing.length > 0) {
          await db.query('ROLLBACK');
          return res.status(409).json({ 
            message: 'Barang dengan nama yang sama sudah ada.',
            existing_code: existing[0].kode_brg
          });
        }

        // Insert new product
        await db.query(
          'INSERT INTO stok (kode_brg, nama_brg, satuan, jml_stok) VALUES (?, ?, ?, ?)',
          [kode_brg, nama_brg, satuan, jml_stok]
        );

        await db.query('COMMIT');
        return res.status(201).json({ 
          message: 'Barang berhasil disimpan.',
          kode_brg,
          nama_brg,
          jml_stok
        });
      } catch (error) {
        await db.query('ROLLBACK');
        console.error('Create error:', error);
        
        if (error.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ message: 'Kode barang sudah ada.' });
        }
        return res.status(500).json({ 
          message: 'Gagal menyimpan barang',
          error: error.message 
        });
      }
    }

    if (method === 'PUT') {
      const { kode_brg, nama_brg, satuan, jml_stok } = req.body;

      if (!kode_brg || !nama_brg || !satuan || !jml_stok || !sessionId) {
        return res.status(400).json({ message: 'Semua field harus diisi.' });
      }

      try {
        await lockMiddleware(req, res, async () => {
          await db.query('START TRANSACTION');

          // Check if product exists and get current values
          const [current] = await db.query(
            'SELECT * FROM stok WHERE kode_brg = ? FOR UPDATE',
            [kode_brg]
          );

          if (current.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ message: 'Barang tidak ditemukan.' });
          }

          // Check for name conflict with other products
          if (current[0].nama_brg !== nama_brg) {
            const [nameConflict] = await db.query(
              'SELECT kode_brg FROM stok WHERE nama_brg = ? AND kode_brg != ?',
              [nama_brg, kode_brg]
            );

            if (nameConflict.length > 0) {
              await db.query('ROLLBACK');
              return res.status(409).json({ 
                message: 'Nama barang sudah digunakan oleh produk lain.',
                existing_code: nameConflict[0].kode_brg
              });
            }
          }

          // Update the product
          await db.query(
            'UPDATE stok SET nama_brg = ?, satuan = ?, jml_stok = ? WHERE kode_brg = ?',
            [nama_brg, satuan, jml_stok, kode_brg]
          );

          await db.query('COMMIT');
          return res.status(200).json({ 
            message: 'Barang berhasil diperbarui.',
            kode_brg,
            changes: {
              nama_brg: { from: current[0].nama_brg, to: nama_brg },
              satuan: { from: current[0].satuan, to: satuan },
              jml_stok: { from: current[0].jml_stok, to: jml_stok }
            }
          });
        });
      } catch (error) {
        await db.query('ROLLBACK');
        console.error('Update error:', error);
        return res.status(500).json({ 
          message: 'Gagal memperbarui barang',
          error: error.message 
        });
      }
      return;
    }

    if (method === 'DELETE') {
      const { kode_brg } = req.query;

      if (!kode_brg || !sessionId) {
        return res.status(400).json({ message: 'Kode barang dan user ID harus disertakan.' });
      }

      try {
        await lockMiddleware(req, res, async () => {
          await db.query('START TRANSACTION');

          // Check if product exists and is not referenced in sales
          const [salesRef] = await db.query(
            'SELECT kd_trans FROM t_jual WHERE kode_brg = ? LIMIT 1',
            [kode_brg]
          );

          if (salesRef.length > 0) {
            await db.query('ROLLBACK');
            return res.status(400).json({ 
              message: 'Barang tidak dapat dihapus karena terdapat transaksi terkait.',
              reference_transaction: salesRef[0].kd_trans
            });
          }

          // Delete the product
          const [result] = await db.query(
            'DELETE FROM stok WHERE kode_brg = ?',
            [kode_brg]
          );

          if (result.affectedRows === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ message: 'Barang tidak ditemukan.' });
          }

          await db.query('COMMIT');
          return res.status(200).json({ 
            message: 'Barang berhasil dihapus.',
            kode_brg
          });
        });
      } catch (error) {
        await db.query('ROLLBACK');
        console.error('Delete error:', error);
        return res.status(500).json({ 
          message: 'Gagal menghapus barang',
          error: error.message 
        });
      }
      return;
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    return res.status(405).end(`Method ${method} Not Allowed`);
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      message: 'Terjadi kesalahan server',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}