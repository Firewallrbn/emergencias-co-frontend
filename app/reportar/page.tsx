'use client';

/**
 * Radicación de emergencias — vista del ciudadano.
 *
 * Se diseña para el peor escenario del enunciado: alguien asustado, con una mano libre,
 * en una red degradada y con la batería justa. De ahí las decisiones:
 *
 *   - Objetivos táctiles grandes y un solo paso visible a la vez.
 *   - El GPS se pide al entrar, no al enviar: si falla, hay tiempo de corregirlo a mano.
 *   - Nunca se pierde un reporte. Si no hay red, se encola y se reintenta solo.
 *   - Los campos cambian según el tipo: a quien reporta un derrumbe no se le piden los
 *     mismos datos que a quien pide agua potable.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  TIPOS_SOLICITUD,
  CIUDADES,
  NOMBRE_CIUDAD,
  ETIQUETA_PRIORIDAD,
  COLOR_PRIORIDAD,
  type Ciudad,
  type DefinicionTipo,
} from '@/lib/dominio';
import { enviarEmergencia, sincronizarPendientes, type RespuestaEmergencia } from '@/lib/api';
import { contarPendientes } from '@/lib/outbox';

type Fase = 'tipo' | 'detalle' | 'enviado';

interface Ubicacion {
  lon: number;
  lat: number;
  precision?: number;
  origen: 'gps' | 'manual' | 'ciudad';
}

export default function PaginaReportar() {
  const [fase, setFase] = useState<Fase>('tipo');
  const [tipo, setTipo] = useState<DefinicionTipo | null>(null);
  const [ciudad, setCiudad] = useState<Ciudad>('manizales');
  const [descripcion, setDescripcion] = useState('');
  const [contacto, setContacto] = useState('');
  const [datos, setDatos] = useState<Record<string, unknown>>({});
  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<RespuestaEmergencia | null>(null);
  const [encolado, setEncolado] = useState(false);
  const [enLinea, setEnLinea] = useState(true);
  const [pendientes, setPendientes] = useState(0);

  // --- Conexión y cola -----------------------------------------------------------
  const refrescarPendientes = useCallback(() => {
    void contarPendientes().then(setPendientes);
  }, []);

  useEffect(() => {
    setEnLinea(navigator.onLine);
    refrescarPendientes();

    const alConectar = async () => {
      setEnLinea(true);
      // Al recuperar la red se vacía la cola sola. Sin esto, el reporte encolado se
      // quedaría esperando a que la persona vuelva a abrir la página.
      const r = await sincronizarPendientes();
      if (r.enviados > 0 || r.descartados > 0) refrescarPendientes();
    };
    const alDesconectar = () => setEnLinea(false);

    window.addEventListener('online', alConectar);
    window.addEventListener('offline', alDesconectar);
    return () => {
      window.removeEventListener('online', alConectar);
      window.removeEventListener('offline', alDesconectar);
    };
  }, [refrescarPendientes]);

  // --- Ubicación -----------------------------------------------------------------
  const pedirUbicacion = useCallback(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setUbicacion({
          lon: pos.coords.longitude,
          lat: pos.coords.latitude,
          precision: pos.coords.accuracy,
          origen: 'gps',
        }),
      // Si el GPS falla no se bloquea el reporte: se cae al centro de la ciudad y se
      // avisa. Un reporte con ubicación aproximada vale infinitamente más que ninguno.
      () => setUbicacion((u) => u ?? null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  useEffect(() => {
    if (fase === 'detalle') pedirUbicacion();
  }, [fase, pedirUbicacion]);

  // --- Envío ----------------------------------------------------------------------
  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!tipo) return;

    setError(null);
    setEnviando(true);

    const coords = ubicacion ?? {
      lon: CENTROS[ciudad][0],
      lat: CENTROS[ciudad][1],
      origen: 'ciudad' as const,
    };

    try {
      const r = await enviarEmergencia({
        tipo: tipo.id,
        ciudad,
        descripcion: descripcion.trim(),
        coordenadas: { lon: coords.lon, lat: coords.lat },
        datos,
        ...(contacto.trim() ? { contacto: contacto.trim() } : {}),
      });

      if (r.estado === 'enviado') {
        setResultado(r.emergencia);
        setEncolado(false);
      } else {
        setResultado(null);
        setEncolado(true);
        refrescarPendientes();
      }
      setFase('enviado');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el reporte');
    } finally {
      setEnviando(false);
    }
  }

  function reiniciar() {
    setFase('tipo');
    setTipo(null);
    setDescripcion('');
    setContacto('');
    setDatos({});
    setResultado(null);
    setEncolado(false);
    setError(null);
  }

  // --- Interfaz --------------------------------------------------------------------
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <Cabecera enLinea={enLinea} pendientes={pendientes} />

      {fase === 'tipo' && <SelectorTipo alElegir={(t) => { setTipo(t); setFase('detalle'); }} />}

      {fase === 'detalle' && tipo && (
        <form onSubmit={enviar} className="space-y-6">
          <button
            type="button"
            onClick={() => setFase('tipo')}
            className="text-sm text-neutral-600 underline underline-offset-4 dark:text-neutral-400"
          >
            ← Cambiar tipo de solicitud
          </button>

          <div className="rounded-lg border-2 p-4" style={{ borderColor: COLOR_PRIORIDAD[tipo.prioridadBase] }}>
            <p className="font-semibold">{tipo.titulo}</p>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Prioridad mínima {ETIQUETA_PRIORIDAD[tipo.prioridadBase]}
            </p>
          </div>

          <Campo etiqueta="¿En qué ciudad estás?">
            <div className="grid grid-cols-2 gap-2">
              {CIUDADES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCiudad(c)}
                  aria-pressed={ciudad === c}
                  className={`rounded-lg border-2 p-3 text-left text-sm font-medium transition ${
                    ciudad === c
                      ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900'
                      : 'border-neutral-300 dark:border-neutral-700'
                  }`}
                >
                  {NOMBRE_CIUDAD[c]}
                </button>
              ))}
            </div>
          </Campo>

          <Campo etiqueta="¿Qué está pasando?" ayuda="Describe lo que ves. Sé concreto.">
            <textarea
              required
              maxLength={2000}
              rows={4}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ejemplo: se cayó el muro de una casa de dos pisos y se oyen voces adentro"
              className="w-full rounded-lg border-2 border-neutral-300 p-3 text-base dark:border-neutral-700 dark:bg-neutral-900"
            />
          </Campo>

          {tipo.campos.map((campo) => (
            <CampoCriticoEntrada
              key={campo.nombre}
              campo={campo}
              valor={datos[campo.nombre]}
              alCambiar={(v) => setDatos((d) => ({ ...d, [campo.nombre]: v }))}
            />
          ))}

          <Campo etiqueta="Ubicación">
            <EstadoUbicacion ubicacion={ubicacion} ciudad={ciudad} alReintentar={pedirUbicacion} />
          </Campo>

          <Campo etiqueta="Teléfono de contacto" ayuda="Opcional. Ayuda a la cuadrilla a ubicarte.">
            <input
              type="tel"
              inputMode="tel"
              value={contacto}
              onChange={(e) => setContacto(e.target.value)}
              className="w-full rounded-lg border-2 border-neutral-300 p-3 text-base dark:border-neutral-700 dark:bg-neutral-900"
            />
          </Campo>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando || descripcion.trim().length === 0}
            className="w-full rounded-lg bg-red-700 p-4 text-lg font-bold text-white disabled:opacity-50"
          >
            {enviando ? 'Enviando…' : 'Enviar reporte'}
          </button>

          {!enLinea && (
            <p className="text-center text-sm text-amber-700 dark:text-amber-400">
              Sin conexión. El reporte se guardará y se enviará solo cuando vuelva la señal.
            </p>
          )}
        </form>
      )}

      {fase === 'enviado' && (
        <Confirmacion resultado={resultado} encolado={encolado} alVolver={reiniciar} />
      )}
    </main>
  );
}

// Centros por ciudad, para cuando el GPS no responde.
const CENTROS: Record<Ciudad, [number, number]> = {
  choco: [-76.6612, 5.6947],
  pereira: [-75.6906, 4.8133],
  cali: [-76.5225, 3.4516],
  manizales: [-75.5138, 5.0703],
};

function Cabecera({ enLinea, pendientes }: { enLinea: boolean; pendientes: number }) {
  return (
    <header className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Link href="/" className="text-sm text-neutral-600 underline underline-offset-4 dark:text-neutral-400">
          Inicio
        </Link>
        <div className="flex items-center gap-2 text-xs">
          <span
            aria-hidden
            className={`inline-block size-2 rounded-full ${enLinea ? 'bg-green-600' : 'bg-amber-500'}`}
          />
          <span className="text-neutral-600 dark:text-neutral-400">
            {enLinea ? 'Con conexión' : 'Sin conexión'}
          </span>
        </div>
      </div>
      <h1 className="text-2xl font-bold">Reportar una emergencia</h1>
      {pendientes > 0 && (
        <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Tienes {pendientes} {pendientes === 1 ? 'reporte guardado' : 'reportes guardados'} sin
          enviar. Se enviarán solos en cuanto haya señal.
        </p>
      )}
    </header>
  );
}

function SelectorTipo({ alElegir }: { alElegir: (t: DefinicionTipo) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-neutral-700 dark:text-neutral-300">¿Qué necesitas reportar?</p>
      {TIPOS_SOLICITUD.map((t) => (
        <button
          key={t.id}
          onClick={() => alElegir(t)}
          className="flex w-full items-start gap-3 rounded-lg border-2 border-neutral-300 p-4 text-left transition hover:border-neutral-900 dark:border-neutral-700 dark:hover:border-white"
        >
          <span
            aria-hidden
            className="mt-1 inline-block size-4 shrink-0 rounded-full"
            style={{ backgroundColor: COLOR_PRIORIDAD[t.prioridadBase] }}
          />
          <span>
            <span className="block font-semibold">{t.titulo}</span>
            <span className="block text-sm text-neutral-600 dark:text-neutral-400">{t.descripcion}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function Campo({
  etiqueta,
  ayuda,
  children,
}: {
  etiqueta: string;
  ayuda?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block font-medium">{etiqueta}</label>
      {ayuda && <p className="mb-2 text-sm text-neutral-600 dark:text-neutral-400">{ayuda}</p>}
      {children}
    </div>
  );
}

function CampoCriticoEntrada({
  campo,
  valor,
  alCambiar,
}: {
  campo: import('@/lib/dominio').CampoCritico;
  valor: unknown;
  alCambiar: (v: unknown) => void;
}) {
  const clase =
    'w-full rounded-lg border-2 border-neutral-300 p-3 text-base dark:border-neutral-700 dark:bg-neutral-900';

  if (campo.tipo === 'numero') {
    return (
      <Campo etiqueta={campo.etiqueta} ayuda={campo.ayuda}>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={(valor as number) ?? ''}
          onChange={(e) => alCambiar(e.target.value === '' ? undefined : Number(e.target.value))}
          className={clase}
        />
      </Campo>
    );
  }

  if (campo.tipo === 'booleano') {
    return (
      <label className="flex items-start gap-3 rounded-lg border-2 border-neutral-300 p-3 dark:border-neutral-700">
        <input
          type="checkbox"
          checked={Boolean(valor)}
          onChange={(e) => alCambiar(e.target.checked)}
          className="mt-1 size-5"
        />
        <span>
          <span className="block font-medium">{campo.etiqueta}</span>
          {campo.ayuda && (
            <span className="block text-sm text-neutral-600 dark:text-neutral-400">{campo.ayuda}</span>
          )}
        </span>
      </label>
    );
  }

  if (campo.tipo === 'seleccion') {
    return (
      <Campo etiqueta={campo.etiqueta} ayuda={campo.ayuda}>
        <select
          value={(valor as string) ?? ''}
          onChange={(e) => alCambiar(e.target.value || undefined)}
          className={clase}
        >
          <option value="">Selecciona…</option>
          {campo.opciones?.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      </Campo>
    );
  }

  // multiple
  const seleccionados = (valor as string[]) ?? [];
  return (
    <Campo etiqueta={campo.etiqueta} ayuda={campo.ayuda}>
      <div className="space-y-2">
        {campo.opciones?.map((o) => (
          <label
            key={o.valor}
            className="flex items-center gap-3 rounded-lg border-2 border-neutral-300 p-3 dark:border-neutral-700"
          >
            <input
              type="checkbox"
              checked={seleccionados.includes(o.valor)}
              onChange={(e) =>
                alCambiar(
                  e.target.checked
                    ? [...seleccionados, o.valor]
                    : seleccionados.filter((v) => v !== o.valor),
                )
              }
              className="size-5"
            />
            <span>{o.etiqueta}</span>
          </label>
        ))}
      </div>
    </Campo>
  );
}

function EstadoUbicacion({
  ubicacion,
  ciudad,
  alReintentar,
}: {
  ubicacion: Ubicacion | null;
  ciudad: Ciudad;
  alReintentar: () => void;
}) {
  if (!ubicacion) {
    return (
      <div className="rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-950">
        <p className="text-amber-900 dark:text-amber-200">
          No se pudo obtener tu ubicación. Se usará el centro de {NOMBRE_CIUDAD[ciudad]}, y la
          cuadrilla se guiará por tu descripción.
        </p>
        <button
          type="button"
          onClick={alReintentar}
          className="mt-2 underline underline-offset-4 text-amber-900 dark:text-amber-200"
        >
          Reintentar ubicación
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-green-50 p-3 text-sm text-green-900 dark:bg-green-950 dark:text-green-200">
      Ubicación obtenida
      {ubicacion.precision ? ` con precisión de ${Math.round(ubicacion.precision)} m` : ''}.
      <span className="ml-1 font-mono text-xs opacity-70">
        {ubicacion.lat.toFixed(5)}, {ubicacion.lon.toFixed(5)}
      </span>
    </div>
  );
}

function Confirmacion({
  resultado,
  encolado,
  alVolver,
}: {
  resultado: RespuestaEmergencia | null;
  encolado: boolean;
  alVolver: () => void;
}) {
  if (encolado) {
    return (
      <div className="space-y-4 text-center">
        <div className="rounded-lg bg-amber-50 p-6 dark:bg-amber-950">
          <h2 className="text-xl font-bold text-amber-900 dark:text-amber-200">Reporte guardado</h2>
          <p className="mt-2 text-amber-900 dark:text-amber-200">
            No hay conexión ahora mismo. Tu reporte quedó guardado en este dispositivo y se enviará
            solo en cuanto vuelva la señal. No lo vuelvas a escribir.
          </p>
        </div>
        <button onClick={alVolver} className="w-full rounded-lg border-2 border-neutral-300 p-4 font-medium dark:border-neutral-700">
          Reportar otra emergencia
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-center">
      <div className="rounded-lg bg-green-50 p-6 dark:bg-green-950">
        <h2 className="text-xl font-bold text-green-900 dark:text-green-200">Reporte recibido</h2>
        {resultado && (
          <>
            <p
              className="mt-3 inline-block rounded-full px-4 py-1 text-sm font-bold text-white"
              style={{ backgroundColor: COLOR_PRIORIDAD[resultado.prioridad] }}
            >
              {ETIQUETA_PRIORIDAD[resultado.prioridad]}
            </p>
            <p className="mt-3 text-sm text-green-900 dark:text-green-200">
              {resultado.duplicado
                ? 'Este reporte ya estaba registrado; no se duplicó.'
                : 'Una cuadrilla será asignada según la prioridad y la cercanía.'}
            </p>
            <p className="mt-3 font-mono text-xs text-green-800 dark:text-green-300">
              Número de caso: {resultado.id.slice(0, 8)}
            </p>
          </>
        )}
      </div>
      <button onClick={alVolver} className="w-full rounded-lg border-2 border-neutral-300 p-4 font-medium dark:border-neutral-700">
        Reportar otra emergencia
      </button>
    </div>
  );
}
