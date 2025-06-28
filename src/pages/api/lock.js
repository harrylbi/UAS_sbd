import db from '../../db/db';
import { unlockResource } from '../../middleware/lockMiddleware';

export default async function handler(req, res) {
  const { method } = req;
  
  try {
    // Validate method
    if (!['POST', 'DELETE'].includes(method)) {
      res.setHeader('Allow', ['POST', 'DELETE']);
      return res.status(405).json({ error: `Method ${method} Not Allowed` });
    }

    // Validate required parameters
    const { kd_trans, kode_brg, user_id } = req.body;
    
    if (!user_id) {
      return res.status(400).json({ error: 'User ID harus disertakan' });
    }
    
    const resourceId = kd_trans || kode_brg;
    if (!resourceId) {
      return res.status(400).json({ 
        error: 'Kode transaksi atau kode barang harus disertakan' 
      });
    }

    const resourceType = kd_trans ? 'penjualan' : 'stok';
    const idField = resourceType === 'penjualan' ? 'kd_trans' : 'kode_brg';
    const tableName = resourceType === 'penjualan' ? 't_jual' : 'stok';

    if (method === 'POST') {
      // Lock resource with transaction
      await db.query('START TRANSACTION');
      
      try {
        // 1. Check existing lock first
        const [existing] = await db.query(
          `SELECT locked_by, TIMESTAMPDIFF(SECOND, locked_at, NOW()) as lock_age 
           FROM ${tableName} WHERE ${idField} = ? FOR UPDATE`,
          [resourceId]
        );

        // 2. Validate if can lock
        if (existing.length > 0) {
          const { locked_by, lock_age } = existing[0];
          
          if (locked_by && locked_by !== user_id && lock_age < 300) {
            await db.query('ROLLBACK');
            return res.status(423).json({ 
              error: 'Data sedang dikunci oleh pengguna lain',
              locked_by,
              locked_at: existing[0].locked_at
            });
          }
        }

        // 3. Apply lock
        const [result] = await db.query(
          `UPDATE ${tableName} 
           SET locked_by = ?, locked_at = NOW() 
           WHERE ${idField} = ?`,
          [user_id, resourceId]
        );

        await db.query('COMMIT');
        
        if (result.affectedRows === 0) {
          return res.status(404).json({ error: 'Data tidak ditemukan' });
        }

        return res.status(200).json({ 
          success: true,
          message: 'Lock berhasil diperoleh'
        });

      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }
    }

    if (method === 'DELETE') {
      // Unlock resource
      try {
        const unlocked = await unlockResource(resourceId, user_id, resourceType);
        
        if (!unlocked) {
          return res.status(404).json({ 
            error: 'Gagal melepas lock - data tidak ditemukan atau tidak dikunci oleh user ini'
          });
        }

        return res.status(200).json({ 
          success: true,
          message: 'Lock berhasil dilepas'
        });
      } catch (error) {
        return res.status(500).json({ 
          error: 'Gagal melepas lock',
          details: error.message
        });
      }
    }

  } catch (error) {
    console.error('Error in lock API:', error);
    return res.status(500).json({ 
      error: 'Terjadi kesalahan server',
      details: error.message 
    });
  }
}