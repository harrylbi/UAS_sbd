import db from '../db/db';

const LOCK_TIMEOUT_SECONDS = 300; // 5 menit timeout

export const lockResource = async (resourceId, userId, resourceType = 'stok') => {
  const table = resourceType === 'penjualan' ? 't_jual' : 'stok';
  const idField = resourceType === 'penjualan' ? 'kd_trans' : 'kode_brg';

  await db.query('START TRANSACTION');
  
  try {
    // Check existing lock
    const [rows] = await db.query(
      `SELECT locked_by, TIMESTAMPDIFF(SECOND, locked_at, NOW()) AS lock_duration 
       FROM ${table} WHERE ${idField} = ? FOR UPDATE`,
      [resourceId]
    );

    if (rows.length > 0) {
      const { locked_by, lock_duration } = rows[0];
      
      // Reject if locked by another user and not expired
      if (locked_by && locked_by !== userId && lock_duration < LOCK_TIMEOUT_SECONDS) {
        await db.query('ROLLBACK');
        return { success: false, message: 'Data sedang dikunci oleh pengguna lain' };
      }
    }

    // Apply lock
    await db.query(
      `UPDATE ${table} SET locked_by = ?, locked_at = NOW() 
       WHERE ${idField} = ?`,
      [userId, resourceId]
    );

    await db.query('COMMIT');
    return { success: true };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
};

export const unlockResource = async (resourceId, userId, resourceType = 'stok') => {
  const table = resourceType === 'penjualan' ? 't_jual' : 'stok';
  const idField = resourceType === 'penjualan' ? 'kd_trans' : 'kode_brg';

  try {
    const [result] = await db.query(
      `UPDATE ${table} SET locked_by = NULL, locked_at = NULL 
       WHERE ${idField} = ? AND locked_by = ?`,
      [resourceId, userId]
    );
    return result.affectedRows > 0;
  } catch (error) {
    console.error('Error unlocking:', error);
    return false;
  }
};

const lockMiddleware = async (req, res, next) => {
  const resourceId = req.body.kd_trans || req.body.kode_brg || req.query.id;
  const userId = req.headers['x-session-id'];
  const resourceType = req.body.kd_trans ? 'penjualan' : 'stok';

  if (!resourceId || !userId) {
    return res.status(400).json({ error: 'Resource ID dan User ID diperlukan' });
  }

  try {
    const lockResult = await lockResource(resourceId, userId, resourceType);
    if (!lockResult.success) {
      return res.status(423).json({ error: lockResult.message });
    }
    next();
  } catch (error) {
    console.error('Lock middleware error:', error);
    res.status(500).json({ error: 'Gagal mengunci resource' });
  }
};

export default lockMiddleware;