'use client';

import { useEffect } from 'react';

/**
 * Registra el service worker que hace la aplicación utilizable sin conexión.
 *
 * Se registra tras `load` para no competir por ancho de banda con el primer render, que
 * es lo que la persona está esperando ver.
 */
export default function RegistrarServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    const registrar = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Que falle el registro no debe romper nada: la aplicación sigue funcionando
        // con conexión, simplemente pierde el modo offline.
      });
    };

    if (document.readyState === 'complete') registrar();
    else window.addEventListener('load', registrar, { once: true });
  }, []);

  return null;
}
