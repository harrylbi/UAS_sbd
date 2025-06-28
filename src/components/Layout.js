import Link from 'next/link';

const Layout = ({ children }) => {
  return (
    <div className="min-h-screen bg-yellow-200 text-black">
      <nav className="bg-pink-400 p-6 border-b-4 border-black">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-3xl font-extrabold border-4 border-black p-2 bg-white">
            Sistem Inventori
          </h1>
          <div className="flex gap-4">
            <Link href="/stok" className="text-xl font-bold border-4 border-black px-4 py-2 bg-blue-300 hover:bg-blue-400 transition-all">
              Stok
            </Link>
            <Link href="/penjualan" className="text-xl font-bold border-4 border-black px-4 py-2 bg-green-300 hover:bg-green-400 transition-all">
              Penjualan
            </Link>
          </div>
        </div>
      </nav>
      <main className="container mx-auto p-6 border-t-4 border-black bg-white">
        {children}
      </main>
    </div>
  );
};

export default Layout;
