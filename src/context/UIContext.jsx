import { createContext, useContext, useMemo, useState } from 'react';

// Modales globales (contacto, cómo pedir, ficha de un producto) y avisos tipo toast.
const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [modal, setModal] = useState(null);
  // Producto abierto en la ficha: { product, promoId, promoPrice }.
  const [productView, setProductView] = useState(null);
  const [toasts, setToasts] = useState([]);

  const value = useMemo(() => {
    const toast = (text, tone = 'ok') => {
      const id = Math.random().toString(36).slice(2);
      setToasts((t) => [...t, { id, text, tone }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 5000 : 2800);
    };
    return {
      modal,
      openModal: setModal,
      closeModal: () => setModal(null),
      productView,
      openProduct: (product, promoId = null, promoPrice = null) => setProductView({ product, promoId, promoPrice }),
      closeProduct: () => setProductView(null),
      toasts,
      toast,
      // Ejecuta una acción que guarda en la base y avisa el resultado.
      run: async (fn, okText) => {
        try {
          const result = await fn();
          const text = typeof okText === 'function' ? okText(result) : okText;
          if (text) toast(text);
          return result ?? true;
        } catch (e) {
          toast(`No se pudo guardar: ${e.message ?? e}`, 'error');
          return null;
        }
      },
    };
  }, [modal, toasts, productView]);

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export const useUI = () => useContext(UIContext);
