import Link from 'next/link';

export default function Portada() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Sistema de Gestión de Emergencias</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Respuesta al sismo · Chocó, Pereira, Cali y Manizales
        </p>
      </header>

      <nav className="space-y-4" aria-label="Accesos principales">
        {/* La entrada del ciudadano va primera y es la más grande: en una emergencia,
            quien necesita ayuda no debería tener que buscar dónde pedirla. */}
        <Link
          href="/reportar"
          className="block rounded-lg bg-red-700 p-6 text-white transition hover:bg-red-800"
        >
          <span className="block text-2xl font-bold">Necesito ayuda</span>
          <span className="mt-1 block text-red-100">
            Reportar una emergencia. Funciona sin conexión.
          </span>
        </Link>

        <Link
          href="/comando"
          className="block rounded-lg border-2 border-neutral-300 p-6 transition hover:border-neutral-900 dark:border-neutral-700 dark:hover:border-white"
        >
          <span className="block text-xl font-semibold">Panel de comando</span>
          <span className="mt-1 block text-sm text-neutral-600 dark:text-neutral-400">
            Para organismos de socorro. Mapa, puntos calientes y despachos en vivo.
          </span>
        </Link>
      </nav>

      <footer className="mt-10 text-xs text-neutral-500 dark:text-neutral-500">
        <p>
          Parcial 1 · Patrones Arquitectónicos Avanzados. Sistema de demostración académica;
          no corresponde a un servicio de emergencias real.
        </p>
      </footer>
    </main>
  );
}
