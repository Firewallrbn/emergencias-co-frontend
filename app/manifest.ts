import type { MetadataRoute } from 'next';

/**
 * Manifiesto de la PWA.
 *
 * `start_url` apunta a /reportar y no a la portada: quien instala esta aplicación en su
 * teléfono durante una emergencia la abre para pedir ayuda, no para navegar un menú.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sistema de Gestión de Emergencias',
    short_name: 'Emergencias',
    description:
      'Reporte de emergencias para Chocó, Pereira, Cali y Manizales. Funciona sin conexión.',
    start_url: '/reportar',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#b91c1c',
    lang: 'es-CO',
    orientation: 'portrait',
    icons: [
      {
        // SVG en línea: un solo recurso, escala a cualquier tamaño y no añade descargas
        // binarias en una red degradada.
        src: '/icono.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
    shortcuts: [
      {
        name: 'Reportar emergencia',
        short_name: 'Reportar',
        url: '/reportar',
      },
      {
        name: 'Panel de comando',
        short_name: 'Comando',
        url: '/comando',
      },
    ],
  };
}
