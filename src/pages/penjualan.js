import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import crypto from 'crypto';

const Penjualan = () => {
  const [penjualan, setPenjualan] = useState([]);
  const [stokBarang, setStokBarang] = useState([]);
  const [form, setForm] = useState({
    tgl_trans: '',
    kode_brg: '',
    jml_jual: ''
  });
  const [isEdit, setIsEdit] = useState(false);
  const [loading, setLoading] = useState({ table: false, form: false });
  const [error, setError] = useState('');
  const [sessionId] = useState(() => 'user_' + crypto.randomBytes(4).toString('hex'));
  const [selectedProduct, setSelectedProduct] = useState(null);

  useEffect(() => {
    fetchData();
    fetchStokData();
  }, []);

  const fetchData = async () => {
    setLoading(prev => ({ ...prev, table: true }));
    try {
      const res = await fetch('/api/penjualan', {
        headers: {
          'X-Session-ID': sessionId
        }
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPenjualan(Array.isArray(data) ? data : [data]);
      setError('');
    } catch (err) {
      setError(err.message);
      console.error('Fetch error:', err);
    } finally {
      setLoading(prev => ({ ...prev, table: false }));
    }
  };

  const fetchStokData = async () => {
    try {
      const res = await fetch('/api/stok');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setStokBarang(Array.isArray(data) ? data : [data]);
    } catch (err) {
      console.error('Error fetching stok:', err);
    }
  };

const handleSubmit = async (e) => {
  e.preventDefault();
  setLoading(prev => ({ ...prev, form: true }));
  
  try {
    const { tgl_trans, kode_brg, jml_jual, kd_trans } = form;
    if (!tgl_trans || !kode_brg || !jml_jual) {
      throw new Error('Harap isi semua field');
    }

    // Validate quantity
    const selectedProduct = stokBarang.find(p => p.kode_brg === kode_brg);
    if (selectedProduct && jml_jual > selectedProduct.jml_stok) {
      throw new Error(`Jumlah melebihi stok tersedia (Stok: ${selectedProduct.jml_stok})`);
    }

    const headers = {
      'Content-Type': 'application/json',
      'X-Session-ID': sessionId
    };

    const body = {
      ...form, // Include all form fields (including kd_trans for edit)
      user_id: sessionId
    };

    const url = '/api/penjualan';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.message || 'Gagal memproses permintaan');
    }

    const result = await res.json();
    
    fetchData();
    fetchStokData(); // Refresh stock data
    
    if (isEdit) {
      await handleUnlock(form.kd_trans);
      alert(`Transaksi berhasil diperbarui: ${result.data?.kd_trans || form.kd_trans}`);
    } else {
      alert(`Transaksi berhasil dibuat: ${result.data?.kd_trans || 'ID tidak diketahui'}`);
    }
    
    resetForm();
  } catch (error) {
    console.error('Submit error:', error);
    alert(`Error: ${error.message}`);
  } finally {
    setLoading(prev => ({ ...prev, form: false }));
  }
};

const handleEdit = async (transaction) => {
  try {
    // Lock the record first
    const lockRes = await fetch('/api/lock', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Session-ID': sessionId
      },
      body: JSON.stringify({ 
        kd_trans: transaction.kd_trans, 
        user_id: sessionId,
        resource_type: 'penjualan'
      })
    });

    if (!lockRes.ok) {
      const error = await lockRes.json();
      throw new Error(error.message || 'Gagal mengunci data');
    }

    setForm({
      kd_trans: transaction.kd_trans,
      tgl_trans: transaction.tgl_trans.split('T')[0], // Format date for input
      kode_brg: transaction.kode_brg,
      jml_jual: transaction.jml_jual
    });
    setIsEdit(true);
    
    // Set the selected product
    const product = stokBarang.find(p => p.kode_brg === transaction.kode_brg);
    setSelectedProduct(product);
  } catch (error) {
    console.error('Edit error:', error);
    alert(error.message);
  }
};

  const handleDelete = async (kd_trans) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus transaksi ${kd_trans}?`)) return;
    
    try {
      const res = await fetch(`/api/penjualan`, {
        method: 'DELETE',
        headers: { 
          'Content-Type': 'application/json',
          'X-Session-ID': sessionId
        },
        body: JSON.stringify({ kd_trans, user_id: sessionId })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Gagal menghapus');
      }

      const result = await res.json();
      alert(result.message || 'Transaksi berhasil dihapus');
      setPenjualan(penjualan.filter(item => item.kd_trans !== kd_trans));
    } catch (error) {
      console.error('Delete error:', error);
      alert(error.message);
    }
  };

  const handleUnlock = async (kd_trans) => {
    try {
      await fetch('/api/lock', {
        method: 'DELETE',
        headers: { 
          'Content-Type': 'application/json',
          'X-Session-ID': sessionId
        },
        body: JSON.stringify({ kd_trans, user_id: sessionId })
      });
    } catch (error) {
      console.error('Unlock error:', error);
    }
  };

  const resetForm = () => {
    if (isEdit && form.kd_trans) {
      handleUnlock(form.kd_trans);
    }
    setForm({ 
      kd_trans: '',
      tgl_trans: '',
      kode_brg: '',
      jml_jual: '' 
    });
    setIsEdit(false);
    setSelectedProduct(null);
  };

  const handleProductSelect = (kode_brg) => {
    const product = stokBarang.find(p => p.kode_brg === kode_brg);
    setSelectedProduct(product);
    setForm(prev => ({ ...prev, kode_brg }));
  };

  // Clean up locks when component unmounts
  useEffect(() => {
    return () => {
      if (isEdit && form.kd_trans) {
        handleUnlock(form.kd_trans);
      }
    };
  }, [isEdit, form.kd_trans]);

  return (
    <Layout>
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-6">Daftar Penjualan</h1>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {loading.table ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            <p className="mt-2">Memuat data penjualan...</p>
          </div>
        ) : (
          <div className="overflow-x-auto bg-white rounded-lg shadow">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Kode Transaksi
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tanggal
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Barang
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Jumlah
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {penjualan.length > 0 ? (
                  penjualan.map(item => {
                    const isLocked = item.locked_by && item.locked_by !== sessionId;
                    const isLockedByMe = item.locked_by === sessionId;
                    
                    return (
                      <tr 
                        key={item.kd_trans} 
                        className={isLockedByMe ? 'bg-blue-50' : isLocked ? 'bg-gray-100' : 'hover:bg-gray-50'}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <span className="font-medium">{item.kd_trans}</span>
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
                        <td className="px-6 py-4 whitespace-nowrap">
                          {new Date(item.tgl_trans).toLocaleDateString('id-ID')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <span className="font-medium">{item.kode_brg}</span>
                            <div className="text-sm text-gray-500">
                              {stokBarang.find(p => p.kode_brg === item.kode_brg)?.nama_brg || 'Unknown'}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {item.jml_jual}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => handleEdit(item)}
                            className={`mr-2 ${
                              item.locked_by && item.locked_by !== sessionId
                                ? 'text-gray-400 cursor-not-allowed' 
                                : 'text-yellow-600 hover:text-yellow-900'
                            }`}
                            disabled={item.locked_by && item.locked_by !== sessionId}
                            title={item.locked_by && item.locked_by !== sessionId 
                              ? 'Data sedang dikunci oleh pengguna lain' 
                              : 'Edit data'}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(item.kd_trans)}
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
                      {loading.table ? 'Memuat...' : 'Tidak ada data penjualan'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-8 bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">
            {isEdit ? 'Edit Transaksi' : 'Tambah Transaksi Baru'}
          </h2>
          
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {isEdit && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Kode Transaksi
                  </label>
                  <input
                    type="text"
                    value={form.kd_trans}
                    className="w-full p-2 border border-gray-300 rounded-md bg-gray-100"
                    readOnly
                  />
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tanggal Transaksi *
                </label>
                <input
                  type="date"
                  value={form.tgl_trans}
                  onChange={(e) => setForm({...form, tgl_trans: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-md"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pilih Barang *
                </label>
                <select
                  value={form.kode_brg}
                  onChange={(e) => handleProductSelect(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md"
                  required
                >
                  <option value="">-- Pilih Barang --</option>
                  {stokBarang.map(barang => (
                    <option 
                      key={barang.kode_brg} 
                      value={barang.kode_brg}
                      disabled={barang.jml_stok <= 0}
                    >
                      {barang.kode_brg} - {barang.nama_brg} 
                      {barang.jml_stok <= 0 ? ' (Stok Habis)' : ` (Stok: ${barang.jml_stok})`}
                    </option>
                  ))}
                </select>
                {selectedProduct && (
                  <div className="mt-2 text-sm text-gray-600">
                    Satuan: {selectedProduct.satuan} | 
                    Stok Tersedia: {selectedProduct.jml_stok}
                  </div>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Jumlah *
                </label>
                <input
                  type="number"
                  value={form.jml_jual}
                  onChange={(e) => setForm({...form, jml_jual: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-md"
                  required
                  min="1"
                  max={selectedProduct?.jml_stok || ''}
                />
                {selectedProduct && (
                  <div className="mt-1 text-xs text-gray-500">
                    Maksimal: {selectedProduct.jml_stok}
                  </div>
                )}
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
                    {isEdit ? 'Menyimpan...' : 'Membuat...'}
                  </span>
                ) : isEdit ? 'Simpan Perubahan' : 'Buat Transaksi'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
};

export default Penjualan;