import { useState, useEffect } from 'react';
import Layout from '../components/Layout';

const Stok = () => {
  const [stok, setStok] = useState([]);
  const [form, setForm] = useState({
    kode_brg: '',
    nama_brg: '',
    satuan: '',
    jml_stok: ''
  });
  const [isEdit, setIsEdit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sessionId] = useState(() => 'user_' + Math.random().toString(36).substr(2, 8));

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/stok');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setStok(Array.isArray(data) ? data : [data]);
    } catch (err) {
      setError(err.message);
      alert('Gagal memuat data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (!form.kode_brg || !form.nama_brg || !form.satuan || !form.jml_stok) {
        throw new Error('Harap isi semua field');
      }

      const method = isEdit ? 'PUT' : 'POST';
      const payload = {
        ...form,
        user_id: sessionId
      };

      const res = await fetch('/api/stok', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Gagal memproses permintaan');
      }

      fetchData();
      if (isEdit) await handleUnlock(form.kode_brg);
      resetForm();
    } catch (error) {
      console.error('Error:', error);
      alert(error.message);
    }
  };

  const handleEdit = async (item) => {
    try {
      // Lock the record first
      const lockRes = await fetch('/api/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          kode_brg: item.kode_brg, 
          user_id: sessionId 
        })
      });

      if (!lockRes.ok) {
        const error = await lockRes.json();
        throw new Error(error.message || 'Gagal mengunci data');
      }

      setForm(item);
      setIsEdit(true);
    } catch (error) {
      alert(error.message);
    }
  };

  const handleDelete = async (kode_brg) => {
    if (!confirm('Apakah Anda yakin ingin menghapus barang ini?')) return;
    
    try {
      const res = await fetch(`/api/stok?kode_brg=${kode_brg}&user_id=${sessionId}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Gagal menghapus');
      }

      fetchData();
    } catch (error) {
      console.error('Error:', error);
      alert(error.message);
    }
  };

  const handleUnlock = async (kode_brg) => {
    try {
      await fetch('/api/lock', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kode_brg, user_id: sessionId })
      });
    } catch (error) {
      console.error('Gagal melepas kunci:', error);
    }
  };

  const resetForm = () => {
    if (isEdit && form.kode_brg) {
      handleUnlock(form.kode_brg);
    }
    setForm({ kode_brg: '', nama_brg: '', satuan: '', jml_stok: '' });
    setIsEdit(false);
  };

  // Clean up locks when component unmounts
  useEffect(() => {
    return () => {
      if (isEdit && form.kode_brg) {
        handleUnlock(form.kode_brg);
      }
    };
  }, [isEdit, form.kode_brg]);

  return (
    <Layout>
      <h1 className="text-2xl font-bold mb-4">Daftar Stok</h1>
      {error && <p className="text-red-500">{error}</p>}
      {loading && <p className="text-gray-500">Memuat data...</p>}

      <table className="table-auto w-full border-collapse border border-gray-300">
        <thead>
          <tr className="bg-gray-200">
            <th className="border px-4 py-2">Kode</th>
            <th className="border px-4 py-2">Nama Barang</th>
            <th className="border px-4 py-2">Satuan</th>
            <th className="border px-4 py-2">Jumlah</th>
            <th className="border px-4 py-2">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {stok.length > 0 ? (
            stok.map(item => (
              <tr key={item.kode_brg} className={item.locked_by ? 'bg-yellow-50' : 'hover:bg-gray-50'}>
                <td className="border px-4 py-2">
                  {item.kode_brg}
                  {item.locked_by && (
                    <span className="ml-2 text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded">
                      {item.locked_by === sessionId ? 'Anda mengedit' : 'Sedang diedit'}
                    </span>
                  )}
                </td>
                <td className="border px-4 py-2">{item.nama_brg}</td>
                <td className="border px-4 py-2">{item.satuan}</td>
                <td className="border px-4 py-2">{item.jml_stok}</td>
                <td className="border px-4 py-2">
                  <button
                    onClick={() => handleEdit(item)}
                    className="bg-yellow-500 text-white p-1 rounded mr-2 disabled:opacity-50"
                    disabled={item.locked_by && item.locked_by !== sessionId}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(item.kode_brg)}
                    className="bg-red-500 text-white p-1 rounded disabled:opacity-50"
                    disabled={item.locked_by && item.locked_by !== sessionId}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="5" className="border px-4 py-2 text-center">
                {loading ? 'Memuat...' : 'Tidak ada data stok'}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <form onSubmit={handleSubmit} className="mt-6">
        <h2 className="text-xl font-semibold mb-2">
          {isEdit ? 'Edit Barang' : 'Tambah Barang'}
        </h2>
        <div className="grid grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="Kode Barang"
            value={form.kode_brg}
            onChange={(e) => setForm({...form, kode_brg: e.target.value})}
            className="border p-2"
            required
            disabled={isEdit}
          />
          <input
            type="text"
            placeholder="Nama Barang"
            value={form.nama_brg}
            onChange={(e) => setForm({...form, nama_brg: e.target.value})}
            className="border p-2"
            required
          />
          <input
            type="text"
            placeholder="Satuan"
            value={form.satuan}
            onChange={(e) => setForm({...form, satuan: e.target.value})}
            className="border p-2"
            required
          />
          <input
            type="number"
            placeholder="Jumlah Stok"
            value={form.jml_stok}
            onChange={(e) => setForm({...form, jml_stok: e.target.value})}
            className="border p-2"
            required
            min="0"
          />
        </div>
        <button type="submit" className="bg-blue-500 text-white p-2 mt-4 rounded">
          {isEdit ? 'Update' : 'Tambah'}
        </button>
        {isEdit && (
          <button
            type="button"
            onClick={resetForm}
            className="bg-gray-500 text-white p-2 mt-4 rounded ml-2"
          >
            Batal
          </button>
        )}
      </form>
    </Layout>
  );
};

export default Stok;