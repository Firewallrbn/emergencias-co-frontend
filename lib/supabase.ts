/**
 * Cliente de Supabase para el navegador.
 *
 * Se usa EXCLUSIVAMENTE para leer en tiempo real. Las escrituras van por el API Gateway,
 * donde viven el triage, la idempotencia y el despacho.
 *
 * La clave que se usa aquí es la anónima, que es pública por diseño: viaja en el bundle
 * de cualquier visitante. Lo que impide que alguien lea lo que no debe no es esa clave,
 * sino las políticas RLS de la base. La clave `service_role` no existe en este proyecto:
 * los microservicios se conectan con sus propios roles de Postgres.
 *
 * Las variables se inyectan desde el panel de Vercel, nunca desde un archivo del repo.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let cliente: SupabaseClient | null = null;

/**
 * Devuelve el cliente, o `null` si falta configuración.
 *
 * Devolver null en vez de lanzar es deliberado: si Realtime no está configurado, el panel
 * debe seguir siendo utilizable con los datos que trae del API. En una emergencia, una
 * pantalla en blanco por una variable de entorno es un fallo peor que perder el "en vivo".
 */
export function obtenerSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  cliente ??= createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
    realtime: {
      // Suficiente para un panel de comando; evita saturar la conexión en un pico.
      params: { eventsPerSecond: 5 },
    },
  });
  return cliente;
}

export const hayRealtime = (): boolean => Boolean(url && anonKey);
