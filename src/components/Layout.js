import Link from "next/link";
import "../app/globals.css";

const Layout = ({ children }) => {
  return (
    <div className="min-h-screen bg-white text-black">
      {/* Navbar */}
      <nav className="bg-white px-6 py-4 border-b-2 border-black shadow-md">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-black tracking-wider">$Inverse</h1>
          <div className="flex space-x-4">
            <Link
              href="/stok"
              className="text-lg font-bold border-2 border-black px-4 py-2 bg-yellow-300 hover:bg-yellow-400 transition-all"
            >
              Stok
            </Link>
            <Link
              href="/penjualan"
              className="text-lg font-bold border-2 border-black px-4 py-2 bg-red-300 hover:bg-red-400 transition-all"
            >
              Penjualan
            </Link>
          </div>
        </div>
      </nav>

      {/* Konten Utama */}
      <main className="container mx-auto p-6 border-t-2 border-black bg-white">
        {children}
      </main>

      {/* Footer */}
      <footer className="text-center text-sm border-t-2 border-black mt-8 py-4">
        <p className="font-mono">© 2025 $Inverse. Brutalist design inspired.</p>
      </footer>
    </div>
  );
};

export default Layout;
