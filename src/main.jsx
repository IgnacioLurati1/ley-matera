import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/global.css';
import App from './App';
import { DataProvider } from './context/DataContext';
import { CartProvider } from './context/CartContext';
import { AuthProvider } from './context/AuthContext';
import { UIProvider } from './context/UIContext';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AuthProvider>
        <DataProvider>
          <UIProvider>
            <CartProvider>
              <App />
            </CartProvider>
          </UIProvider>
        </DataProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
