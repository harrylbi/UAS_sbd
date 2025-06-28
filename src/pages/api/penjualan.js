import db from '../../db/db';
import lockMiddleware from '../../middleware/lockMiddleware';
import { unlockResource } from '../../middleware/lockMiddleware';
import crypto from 'crypto';

// Helper function to generate shorter transaction ID (max 10 chars)
function generateTransactionId(sessionId) {
  const timestamp = Date.now().toString(36).slice(-3); // Last 3 chars of timestamp
  const randomPart = crypto.randomBytes(1).toString('hex'); // 2 chars random
  const userPart = sessionId ? sessionId.slice(-2) : 'XX'; // Last 2 chars of session
  return `T${userPart}${timestamp}${randomPart}`.toUpperCase().slice(0, 10); // Ensure max 10 chars
}

export default async function handler(req, res) {
  const { method, headers } = req;
  const sessionId = headers['x-session-id'] || req.body?.user_id;

  try {
    if (method === 'GET') {
      const { kd_trans } = req.query;

      if (kd_trans) {
        const [rows] = await db.query(
          `SELECT *, 
           TIMESTAMPDIFF(SECOND, locked_at, NOW()) AS lock_duration,
           locked_by = ? AS is_locked_by_me
           FROM t_jual WHERE kd_trans = ?`,
          [sessionId, kd_trans]
        );
        
        if (rows.length > 0) {
          const record = rows[0];
          // Auto-unlock if lock is expired (> 5 minutes)
          if (record.lock_duration > 300 && record.locked_by) {
            await unlockResource(kd_trans, record.locked_by, 'penjualan');
            record.locked_by = null;
            record.locked_at = null;
          }
          return res.status(200).json(record);
        }
        return res.status(404).json({ message: 'Penjualan tidak ditemukan.' });
      }

      const [rows] = await db.query(
        'SELECT * FROM t_jual ORDER BY tgl_trans DESC, kd_trans DESC'
      );
      return res.status(200).json(rows);
    }

    if (method === 'POST') {
      const { tgl_trans, kode_brg, jml_jual } = req.body;

      if (!tgl_trans || !kode_brg || !jml_jual || !sessionId) {
        return res.status(400).json({ message: 'Semua field harus diisi.' });
      }

      // Validate input lengths
      if (kode_brg.length > 10) {
        return res.status(400).json({ message: 'Kode barang terlalu panjang (maksimal 10 karakter)' });
      }

      if (parseInt(jml_jual) <= 0) {
        return res.status(400).json({ message: 'Jumlah jual harus lebih dari 0' });
      }

      let kd_trans;
      let attempts = 0;
      const maxAttempts = 5;

      // Generate unique transaction ID with retry mechanism
      while (attempts < maxAttempts) {
        kd_trans = generateTransactionId(sessionId);
        
        try {
          // Check if ID already exists
          const [existing] = await db.query(
            'SELECT kd_trans FROM t_jual WHERE kd_trans = ?',
            [kd_trans]
          );
          
          if (existing.length === 0) {
            break; // ID is unique, use it
          }
          
          attempts++;
        } catch (error) {
          console.error('Error checking transaction ID:', error);
          attempts++;
        }
      }

      if (attempts >= maxAttempts) {
        return res.status(500).json({ message: 'Gagal generate kode transaksi unik' });
      }

      try {
        // Use the stored procedure instead of direct queries
        const [result] = await db.query(
          'CALL simpan_penjualan(?, ?, ?, ?)',
          [kd_trans, tgl_trans, kode_brg, parseInt(jml_jual)]
        );

        // Get the created record
        const [newRecord] = await db.query(
          'SELECT * FROM t_jual WHERE kd_trans = ?',
          [kd_trans]
        );

        return res.status(201).json({
          success: true,
          data: newRecord[0]
        });

      } catch (error) {
        console.error('Transaction error:', {
          error: error.message,
          stack: error.stack,
          body: req.body,
          generated_id: kd_trans,
          id_length: kd_trans?.length
        });

        let errorMessage = 'Gagal menyimpan transaksi';
        if (error.code === 'ER_DUP_ENTRY') {
          errorMessage = 'Kode transaksi sudah ada, coba lagi';
        } else if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_NO_REFERENCED_ROW') {
          errorMessage = 'Kode barang tidak valid';
        } else if (error.code === 'ER_DATA_TOO_LONG') {
          errorMessage = 'Data terlalu panjang untuk database';
        } else if (error.message.includes('jml_jual')) {
          errorMessage = 'Format jumlah jual tidak valid';
        } else if (error.message.includes('stok tidak cukup')) {
          errorMessage = 'Stok tidak mencukupi';
        }

        return res.status(500).json({
          message: errorMessage,
          error: process.env.NODE_ENV === 'development' ? error.message : undefined,
          code: error.code
        });
      }
    }

    if (method === 'PUT') {
      const { kd_trans, tgl_trans, kode_brg, jml_jual } = req.body;

      if (!kd_trans || !tgl_trans || !kode_brg || !jml_jual || !sessionId) {
        return res.status(400).json({ message: 'Semua field harus diisi.' });
      } 

      if (parseInt(jml_jual) <= 0) {
        return res.status(400).json({ message: 'Jumlah jual harus lebih dari 0' });
      }

      try {
        // Use lockMiddleware properly
        return await new Promise((resolve) => {
          lockMiddleware(req, res, async () => {
            try {
              // Use the stored procedure for update
              const [result] = await db.query(
                'CALL update_penjualan(?, ?, ?, ?)',
                [kd_trans, tgl_trans, kode_brg, parseInt(jml_jual)]
              );

              // Get updated record
              const [updatedRecord] = await db.query(
                'SELECT * FROM t_jual WHERE kd_trans = ?',
                [kd_trans]
              );

              return resolve(res.status(200).json({
                success: true,
                data: updatedRecord[0]
              }));
              
            } catch (error) {
              console.error('Update error:', error);
              let errorMessage = 'Gagal memperbarui transaksi';
              
              if (error.message.includes('stok tidak cukup')) {
                errorMessage = 'Stok tidak mencukupi untuk update transaksi';
              } else if (error.message.includes('transaksi tidak ditemukan')) {
                errorMessage = 'Transaksi tidak ditemukan';
              }

              return resolve(res.status(500).json({ 
                message: errorMessage,
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
              }));
            }
          });
        });
      } catch (error) {
        console.error('Update outer error:', error);
        return res.status(500).json({ 
          message: 'Gagal memperbarui transaksi',
          error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }
    }

    if (method === 'DELETE') {
      const { kd_trans } = req.body;

      if (!kd_trans || !sessionId) {
        return res.status(400).json({ message: 'Kode transaksi dan user ID harus disertakan.' });
      }

      try {
        // Use lockMiddleware properly
        return await new Promise((resolve) => {
          lockMiddleware(req, res, async () => {
            try {
              // Use the stored procedure for deletion
              const [result] = await db.query(
                'CALL hapus_penjualan(?)',
                [kd_trans]
              );

              return resolve(res.status(200).json({ 
                success: true,
                message: 'Transaksi berhasil dihapus.'
              }));
            } catch (error) {
              console.error('Delete error:', error);
              let errorMessage = 'Gagal menghapus transaksi';
              
              if (error.message.includes('transaksi tidak ditemukan')) {
                errorMessage = 'Transaksi tidak ditemukan';
              }

              return resolve(res.status(500).json({ 
                message: errorMessage,
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
              }));
            }
          });
        });
      } catch (error) {
        console.error('Delete outer error:', error);
        return res.status(500).json({ 
          message: 'Gagal menghapus transaksi',
          error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    return res.status(405).end(`Method ${method} Not Allowed`);
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      message: 'Terjadi kesalahan server',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}