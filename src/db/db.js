import mysql from 'mysql2/promise';

const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'lbi',
  database: 'toko_barang',
});

export default db;
