'use client';

/**
 * Inicio de sesión.
 *
 * Solo hace falta para el panel de comando. Reportar una emergencia NO requiere cuenta:
 * exigirle registrarse a alguien que está pidiendo auxilio sería absurdo.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { obtenerSupabase } from '@/lib/supabase';

export default function PaginaEntrar() {
  const router = useRouter();
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const supabase = obtenerSupabase();
    if (!supabase) {
      setError('La autenticación no está configurada en este despliegue.');
      return;
    }

    setCargando(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: correo.trim(),
      password: clave,
    });
    setCargando(false);

    if (err) {
      // Mensaje genérico a propósito: distinguir "no existe" de "clave incorrecta"
      // permitiría enumerar qué correos tienen cuenta en el sistema.
      setError('No se pudo iniciar sesión. Revisa el correo y la contraseña.');
      return;
    }
    router.push('/comando');
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-6 text-sm text-neutral-600 underline underline-offset-4 dark:text-neutral-400">
        Inicio
      </Link>

      <h1 className="text-2xl font-bold">Acceso de organismos</h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        Cruz Roja, Bomberos, Defensa Civil y UNGRD. Para reportar una emergencia no
        necesitas cuenta.
      </p>

      <form onSubmit={entrar} className="mt-6 space-y-4">
        <div>
          <label htmlFor="correo" className="mb-2 block font-medium">
            Correo institucional
          </label>
          <input
            id="correo"
            type="email"
            required
            autoComplete="username"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            className="w-full rounded-lg border-2 border-neutral-300 p-3 text-base dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>

        <div>
          <label htmlFor="clave" className="mb-2 block font-medium">
            Contraseña
          </label>
          <input
            id="clave"
            type="password"
            required
            autoComplete="current-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            className="w-full rounded-lg border-2 border-neutral-300 p-3 text-base dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={cargando}
          className="w-full rounded-lg bg-neutral-900 p-4 font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {cargando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm">
        <Link href="/reportar" className="underline underline-offset-4">
          ¿Necesitas reportar una emergencia?
        </Link>
      </p>
    </main>
  );
}
