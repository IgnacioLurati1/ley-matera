import { Outlet, Route, Routes, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import SocialFab from './components/SocialFab';
import GlobalModals from './components/GlobalModals';
import SeasonalLayer from './components/Seasonal';
import { PrivateRoute, ScrollToTop, Toasts } from './components/Misc';
import Home from './pages/Home';
import Catalog from './pages/Catalog';
import About from './pages/About';
import PromoPage from './pages/PromoPage';
import CartPage from './pages/CartPage';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import PageMeta from './components/PageMeta';
import AdminLayout from './pages/admin/AdminLayout';
import AdminHome from './pages/admin/AdminHome';
import ProductsAdmin from './pages/admin/ProductsAdmin';
import FeaturedAdmin from './pages/admin/FeaturedAdmin';
import PromosAdmin from './pages/admin/PromosAdmin';
import PromoEditor from './pages/admin/PromoEditor';
import SeasonsAdmin from './pages/admin/SeasonsAdmin';
import OrderReader from './pages/admin/OrderReader';
import DataAdmin from './pages/admin/DataAdmin';
import AnnouncementAdmin from './pages/admin/AnnouncementAdmin';

function SiteLayout() {
  // En el panel el botón de redes no sirve y tapa los botones de las listas.
  const inAdmin = useLocation().pathname.startsWith('/admin');
  return (
    <>
      <Navbar />
      <main className="page-enter">
        <Outlet />
      </main>
      <Footer />
      {!inAdmin && <SocialFab />}
    </>
  );
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <PageMeta />
      <SeasonalLayer />
      <Routes>
        <Route element={<SiteLayout />}>
          <Route index element={<Home />} />
          <Route path="catalogo" element={<Catalog />} />
          <Route path="conocenos" element={<About />} />
          <Route path="promo/:id" element={<PromoPage />} />
          <Route path="carrito" element={<CartPage />} />
          <Route path="login" element={<Login />} />
          <Route
            path="admin"
            element={
              <PrivateRoute>
                <AdminLayout />
              </PrivateRoute>
            }
          >
            <Route index element={<AdminHome />} />
            <Route path="productos" element={<ProductsAdmin />} />
            <Route path="destacados" element={<FeaturedAdmin />} />
            <Route path="promos" element={<PromosAdmin />} />
            <Route path="promos/:id" element={<PromoEditor />} />
            <Route path="temporadas" element={<SeasonsAdmin />} />
            <Route path="anuncio" element={<AnnouncementAdmin />} />
            <Route path="lector" element={<OrderReader />} />
            <Route path="datos" element={<DataAdmin />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      <GlobalModals />
      <Toasts />
    </>
  );
}
