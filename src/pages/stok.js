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
  const [loading, setLoading] = useState({ table: false, form: false });
  const [error, setError] = useState('');
  const [sessionId] = useState(() => 'user_' + Math.random().toString(36).substr(2, 8));

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(prev => ({ ...prev, table: true }));
    try {
      const res = await fetch('/api/stok');
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Gagal memuat data');
      }
      const data = await res.json();
      setStok(Array.isArray(data) ? data : [data]);
      setError('');
    } catch (err) {
      setError(err.message);
      alert('Gagal memuat data: ' + err.message);
    } finally {
      setLoading(prev => ({ ...prev, table: false }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(prev => ({ ...prev, form: true }));
    
    try {
      if (!form.nama_brg || !form.satuan || !form.jml_stok || (isEdit && !form.kode_brg)) {
        throw new Error('Harap isi semua field');
      }

      const method = isEdit ? 'PUT' : 'POST';
      const payload = isEdit ? {
        kode_brg: form.kode_brg,
        nama_brg: form.nama_brg,
        satuan: form.satuan,
        jml_stok: form.jml_stok,
        user_id: sessionId
      } : {
        nama_brg: form.nama_brg,
        satuan: form.satuan,
        jml_stok: form.jml_stok
      };

      const res = await fetch('/api/stok', {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'X-Session-ID': sessionId
        },
        body: JSON.stringify(payload)
      });

      const result = await res.json();

      if (!result.success) {
        throw new Error(result.message || 'Gagal memproses permintaan');
      }

      await fetchData();
      if (isEdit) await handleUnlock(form.kode_brg);
      resetForm();
      alert(result.message);
    } catch (error) {
      console.error('Error:', error);
      alert(error.message);
    } finally {
      setLoading(prev => ({ ...prev, form: false }));
    }
  };

  const handleEdit = async (item) => {
    try {
      // Lock the record first
      const lockRes = await fetch('/api/lock', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Session-ID': sessionId
        },
        body: JSON.stringify({ 
          kode_brg: item.kode_brg, 
          user_id: sessionId,
          resource_type: 'stok'
        })
      });

      if (!lockRes.ok) {
        const errorData = await lockRes.json();
        throw new Error(errorData.message || 'Gagal mengunci data');
      }

      setForm({
        kode_brg: item.kode_brg,
        nama_brg: item.nama_brg,
        satuan: item.satuan,
        jml_stok: item.jml_stok
      });
      setIsEdit(true);
    } catch (error) {
      console.error('Edit error:', error);
      alert(error.message);
    }
  };

  const handleDelete = async (kode_brg) => {
    if (!confirm('Apakah Anda yakin ingin menghapus barang ini?')) return;
    
    try {
      const res = await fetch(`/api/stok?kode_brg=${kode_brg}&user_id=${sessionId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': sessionId
        }
      });

      const result = await res.json();

      if (!result.success) {
        throw new Error(result.message || 'Gagal menghapus');
      }

      await fetchData();
      alert(result.message);
    } catch (error) {
      console.error('Error:', error);
      alert(error.message);
    }
  };

  const handleUnlock = async (kode_brg) => {
    try {
      await fetch('/api/lock', {
        method: 'DELETE',
        headers: { 
          'Content-Type': 'application/json',
          'X-Session-ID': sessionId
        },
        body: JSON.stringify({ 
          kode_brg, 
          user_id: sessionId,
          resource_type: 'stok'
        })
      });
    } catch (error) {
      console.error('Gagal melepas kunci:', error);
    }
  };

  const resetForm = () => {
    if (isEdit && form.kode_brg) {
      handleUnlock(form.kode_brg);
    }
    setForm({ 
      kode_brg: '', 
      nama_brg: '', 
      satuan: '', 
      jml_stok: '' 
    });
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
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Daftar Stok</h1>
        
        {/* {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )} */}

        {loading.table ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            <p className="mt-2">Memuat data stok...</p>
          </div>
        ) : (
          <div className="overflow-x-auto bg-white rounded-lg shadow">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kode</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama Barang</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Satuan</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jumlah</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stok.length > 0 ? (
                  stok.map(item => {
                    const isLocked = item.locked_by && item.locked_by !== sessionId;
                    const isLockedByMe = item.locked_by === sessionId;
                    
                    return (
                      <tr 
                        key={item.kode_brg} 
                        className={isLockedByMe ? 'bg-blue-50' : isLocked ? 'bg-gray-100' : 'hover:bg-gray-50'}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {item.kode_brg}
                            {item.locked_by && (
                              <span className={`ml-2 text-xs px-2 py-1 rounded ${
                                isLockedByMe 
                                  ? 'bg-blue-200 text-blue-800' 
                                  : 'bg-gray-200 text-gray-800'
                              }`}>
                                {isLockedByMe ? 'Anda mengedit' : 'Sedang diedit'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">{item.nama_brg}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{item.satuan}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{item.jml_stok}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => handleEdit(item)}
                            className={`mr-2 ${
                              isLocked 
                                ? 'text-gray-400 cursor-not-allowed' 
                                : 'text-yellow-600 hover:text-yellow-900'
                            }`}
                            disabled={isLocked}
                            title={isLocked ? 'Data sedang dikunci' : 'Edit data'}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(item.kode_brg)}
                            className={`${
                              isLocked 
                                ? 'text-gray-400 cursor-not-allowed' 
                                : 'text-red-600 hover:text-red-900'
                            }`}
                            disabled={isLocked}
                            title={isLocked ? 'Data sedang dikunci' : 'Hapus data'}
                          >
                            Hapus
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="5" className="px-6 py-4 text-center text-gray-500">
                      {loading.table ? 'Memuat...' : 'Tidak ada data stok'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-8 bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">
            {isEdit ? 'Edit Barang' : 'Tambah Barang Baru'}
          </h2>
          
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {isEdit && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Kode Barang
                  </label>
                  <input
                    type="text"
                    value={form.kode_brg}
                    className="w-full p-2 border border-gray-300 rounded-md bg-gray-100"
                    readOnly
                  />
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nama Barang *
                </label>
                <input
                  type="text"
                  value={form.nama_brg}
                  onChange={(e) => setForm({...form, nama_brg: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-md"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Satuan *
                </label>
                <input
                  type="text"
                  value={form.satuan}
                  onChange={(e) => setForm({...form, satuan: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-md"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Jumlah Stok *
                </label>
                <input
                  type="number"
                  value={form.jml_stok}
                  onChange={(e) => setForm({...form, jml_stok: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-md"
                  required
                  min="0"
                />
              </div>
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              {isEdit && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Batal
                </button>
              )}
              <button
                type="submit"
                disabled={loading.form}
                className={`px-4 py-2 rounded-md text-white ${
                  loading.form 
                    ? 'bg-blue-400 cursor-not-allowed' 
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {loading.form ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {isEdit ? 'Menyimpan...' : 'Menyimpan...'}
                  </span>
                ) : isEdit ? 'Simpan Perubahan' : 'Simpan Barang'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
};

export default Stok;