import type { Metadata, Viewport } from 'next';
import './globals.css';
import RegistrarServiceWorker from '@/components/RegistrarServiceWorker';

/**
 * Sin fuentes de Google.
 *
 * La plantilla de create-next-app traía Geist desde Google Fonts. En una red degradada
 * —que es el escenario del enunciado— eso son dos peticiones extra a un tercero antes de
 * poder leer nada. La pila de fuentes del sistema se dibuja al instante y no cuesta un
 * solo byte de descarga.
 */
export const metadata: Metadata = {
  title: 'Gestión de Emergencias · Chocó, Pereira, Cali y Manizales',
  description:
    'Reporte y despacho de emergencias tras el sismo. Funciona sin conexión y sincroniza al recuperar la señal.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Emergencias CO',
  appleWebApp: { capable: true, title: 'Emergencias', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#b91c1c',
  width: 'device-width',
  initialScale: 1,
  // Sin bloquear el zoom: limitarlo perjudica a quien tiene baja visión, y este es
  // justo el tipo de aplicación en la que nadie debería quedarse sin poder leer.
  maximumScale: 5,
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        {children}
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
