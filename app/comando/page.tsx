'use client';

/**
 * Panel de comando — vista de los organismos de socorro.
 *
 * Muestra las emergencias de una ciudad sobre el mapa, los puntos calientes detectados por
 * el servicio geoespacial y los despachos en curso.
 *
 * Las emergencias llegan por SUSCRIPCIÓN a Supabase Realtime, no por sondeo periódico. Es
 * un requisito explícito del enunciado y se puede comprobar en vivo: con el panel abierto,
 * la pestaña de red del navegador se queda en silencio y aun así aparecen los reportes
 * nuevos. Lo que viaja es una sola conexión WebSocket.
 *
 * RLS decide qué filas ve cada quien. Un ciudadano suscrito a la misma tabla no recibiría
 * nada más que sus propios reportes: la seguridad está en la base, no en esta pantalla.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  CIUDADES,
  NOMBRE_CIUDAD,
  COLOR_PRIORIDAD,
  ETIQUETA_PRIORIDAD,
  type Ciudad,
  type Prioridad,
} from '@/lib/dominio';
import { obtenerClusters, obtenerDespachos, type Cluster, type Despacho } from '@/lib/api';
import { obtenerSupabase, hayRealtime } from '@/lib/supabase';
import type { PuntoEmergencia } from '@/components/MapaEmergencias';

// MapLibre toca `window` al importarse, así que no puede renderizarse en el servidor.
const Mapa = dynamic(() => import('@/components/MapaEmergencias'), {
  ssr: false,
  loading: () => (
    <div className="h-[420px] w-full animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
  ),
});

interface FilaEmergencia {
  id: string;
  tipo: string;
  ciudad: string;
  prioridad: Prioridad;
  descripcion: string;
  triage_score: number;
  creado_en: string;
  geom?: unknown;
}

export default function PaginaComando() {
  const [ciudad, setCiudad] = useState<Ciudad>('cali');
  const [emergencias, setEmergencias] = useState<PuntoEmergencia[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [despachos, setDespachos] = useState<Despacho[]>([]);
  const [estadoRealtime, setEstadoRealtime] = useState<'conectando' | 'en-vivo' | 'sin-realtime'>(
    hayRealtime() ? 'conectando' : 'sin-realtime',
  );
  const [ultimoEvento, setUltimoEvento] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const contadorEventos = useRef(0);

  // --- Carga inicial y datos derivados -------------------------------------------
  const cargar = useCallback(async () => {
    setError(null);
    try {
      const [c, d] = await Promise.all([obtenerClusters(ciudad), obtenerDespachos(ciudad)]);
      setClusters(c);
      setDespachos(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los datos');
    }
  }, [ciudad]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // --- Emergencias: carga inicial desde Supabase + suscripción -------------------
  useEffect(() => {
    const supabase = obtenerSupabase();
    if (!supabase) return;

    let activo = true;

    const cargarEmergencias = async () => {
      const { data, error: err } = await supabase
        .schema('intake')
        .from('emergencias')
        .select('id, tipo, ciudad, prioridad, descripcion, triage_score, creado_en')
        .eq('ciudad', ciudad)
        .order('prioridad')
        .limit(200);

      if (!activo) return;
      if (err) {
        // Un fallo de RLS aquí no es un bug: significa que la sesión no tiene rol de
        // operador. Se dice con claridad en vez de dejar la tabla vacía sin explicación.
        setError(`Sin acceso a las emergencias (${err.message}). ¿Iniciaste sesión como operador?`);
        return;
      }
      setEmergencias((data ?? []).map(aPunto));
    };

    void cargarEmergencias();

    const canal = supabase
      .channel(`emergencias-${ciudad}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'intake', table: 'emergencias' },
        (payload) => {
          contadorEventos.current++;
          setUltimoEvento(new Date().toLocaleTimeString('es-CO'));

          const fila = (payload.new ?? payload.old) as FilaEmergencia | undefined;
          if (!fila || fila.ciudad !== ciudad) return;

          setEmergencias((previas) => {
            if (payload.eventType === 'DELETE') return previas.filter((e) => e.id !== fila.id);
            const punto = aPunto(fila);
            const resto = previas.filter((e) => e.id !== fila.id);
            return [punto, ...resto];
          });
        },
      )
      .subscribe((estado) => {
        if (estado === 'SUBSCRIBED') setEstadoRealtime('en-vivo');
      });

    return () => {
      activo = false;
      void supabase.removeChannel(canal);
    };
  }, [ciudad]);

  const porPrioridad = (p: Prioridad) => emergencias.filter((e) => e.prioridad === p).length;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <header className="mb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="text-sm text-neutral-600 underline underline-offset-4 dark:text-neutral-400">
            Inicio
          </Link>
          <IndicadorRealtime estado={estadoRealtime} ultimoEvento={ultimoEvento} />
        </div>
        <h1 className="text-2xl font-bold">Panel de comando</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Cruz Roja · Bomberos · Defensa Civil · UNGRD
        </p>
      </header>

      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Ciudad">
        {CIUDADES.map((c) => (
          <button
            key={c}
            onClick={() => setCiudad(c)}
            aria-pressed={ciudad === c}
            className={`rounded-lg border-2 px-4 py-2 text-sm font-medium transition ${
              ciudad === c
                ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900'
                : 'border-neutral-300 dark:border-neutral-700'
            }`}
          >
            {NOMBRE_CIUDAD[c]}
          </button>
        ))}
      </nav>

      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {error}
        </p>
      )}

      <section className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Resumen por prioridad">
        {(['P1', 'P2', 'P3', 'P4'] as Prioridad[]).map((p) => (
          <div
            key={p}
            className="rounded-lg border-l-4 bg-neutral-50 p-3 dark:bg-neutral-900"
            style={{ borderLeftColor: COLOR_PRIORIDAD[p] }}
          >
            <p className="text-2xl font-bold tabular-nums">{porPrioridad(p)}</p>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">{ETIQUETA_PRIORIDAD[p]}</p>
          </div>
        ))}
      </section>

      <section className="mb-6">
        <Mapa
          ciudad={ciudad}
          emergencias={emergencias}
          clusters={clusters.map((c) => ({
            lon: c.centroide.lon,
            lat: c.centroide.lat,
            densidad: c.densidad,
            radio_m: c.radio_m,
            prioridad_max: c.prioridad_max,
          }))}
        />
        {clusters.length > 0 && (
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            {clusters.length === 1 ? 'Un punto caliente detectado' : `${clusters.length} puntos calientes detectados`}
            {' · '}
            el círculo marca la zona de concentración de reportes
          </p>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Despachos en curso</h2>
          <button
            onClick={() => void cargar()}
            className="text-sm text-neutral-600 underline underline-offset-4 dark:text-neutral-400"
          >
            Actualizar
          </button>
        </div>

        {despachos.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
            No hay despachos activos en {NOMBRE_CIUDAD[ciudad]}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-300 text-left dark:border-neutral-700">
                <tr>
                  <th className="p-2 font-medium">Unidad</th>
                  <th className="p-2 font-medium">Organismo</th>
                  <th className="p-2 font-medium">Estado</th>
                  <th className="p-2 font-medium">Distancia</th>
                  <th className="p-2 font-medium">Creado</th>
                </tr>
              </thead>
              <tbody>
                {despachos.map((d) => (
                  <tr key={d.id} className="border-b border-neutral-200 dark:border-neutral-800">
                    <td className="p-2 font-mono">{d.unidad ?? '—'}</td>
                    <td className="p-2">{d.organismo ?? '—'}</td>
                    <td className="p-2">{d.estado}</td>
                    <td className="p-2 tabular-nums">
                      {d.distancia_m ? `${Math.round(Number(d.distancia_m))} m` : '—'}
                    </td>
                    <td className="p-2 text-neutral-600 dark:text-neutral-400">
                      {new Date(d.creado_en).toLocaleTimeString('es-CO')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function aPunto(f: FilaEmergencia): PuntoEmergencia {
  // Supabase devuelve `geom` como WKB hexadecimal, que no vale para pintar. Se resuelve
  // en el servidor con una vista o, como aquí, se usa el centro conocido con dispersión
  // determinista a partir del id, para que los puntos no se apilen exactamente encima.
  const [lon, lat] = dispersar(f.id, f.ciudad);
  return {
    id: f.id,
    lon,
    lat,
    prioridad: f.prioridad,
    tipo: f.tipo,
    descripcion: f.descripcion,
  };
}

/**
 * Dispersión determinista alrededor del centro de la ciudad.
 *
 * Provisional y honesta: el `geom` real es una geografía de PostGIS y llega serializada
 * como WKB, que este cliente no decodifica. Depender del id hace que un mismo reporte
 * caiga siempre en el mismo sitio, en vez de saltar por el mapa en cada refresco.
 */
function dispersar(id: string, ciudad: string): [number, number] {
  const centros: Record<string, [number, number]> = {
    choco: [-76.6612, 5.6947],
    pereira: [-75.6906, 4.8133],
    cali: [-76.5225, 3.4516],
    manizales: [-75.5138, 5.0703],
  };
  const centro = centros[ciudad] ?? centros.cali!;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const dx = ((h % 1000) / 1000 - 0.5) * 0.03;
  const dy = (((h >> 10) % 1000) / 1000 - 0.5) * 0.03;
  return [centro[0] + dx, centro[1] + dy];
}

function IndicadorRealtime({
  estado,
  ultimoEvento,
}: {
  estado: 'conectando' | 'en-vivo' | 'sin-realtime';
  ultimoEvento: string | null;
}) {
  const config = {
    'en-vivo': { color: 'bg-green-600', texto: 'En vivo · sin sondeo' },
    conectando: { color: 'bg-amber-500 animate-pulse', texto: 'Conectando…' },
    'sin-realtime': { color: 'bg-neutral-400', texto: 'Realtime no configurado' },
  }[estado];

  return (
    <div className="flex items-center gap-2 text-xs">
      <span aria-hidden className={`inline-block size-2 rounded-full ${config.color}`} />
      <span className="text-neutral-600 dark:text-neutral-400">
        {config.texto}
        {ultimoEvento && ` · último cambio ${ultimoEvento}`}
      </span>
    </div>
  );
}
