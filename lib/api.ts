/**
 * Cliente del API Gateway.
 *
 * Todo lo que escribe pasa por aquí, nunca directo a Supabase: las reglas de negocio
 * (triage, idempotencia, despacho) viven en los microservicios. El frontend habla con
 * Supabase solo para LEER en tiempo real, y ahí manda RLS.
 */

import type { Ciudad, Prioridad } from './dominio';
import {
  encolar,
  descartar,
  marcarFallo,
  listarPendientes,
  nuevaClave,
  type ReportePendiente,
} from './outbox';

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

export interface NuevaEmergencia {
  tipo: string;
  ciudad: Ciudad;
  descripcion: string;
  coordenadas: { lon: number; lat: number };
  datos: Record<string, unknown>;
  contacto?: string;
}

export interface RespuestaEmergencia {
  id: string;
  prioridad: Prioridad;
  triage_score: number;
  creado_en: string;
  duplicado: boolean;
}

export type ResultadoEnvio =
  | { estado: 'enviado'; emergencia: RespuestaEmergencia }
  | { estado: 'encolado'; motivo: string };

/** Errores del servidor que no se arreglan reintentando: el reporte es inválido. */
class ErrorValidacion extends Error {
  constructor(mensaje: string, readonly detalles?: unknown) {
    super(mensaje);
    this.name = 'ErrorValidacion';
  }
}

async function enviarAlServidor(
  carga: NuevaEmergencia | Record<string, unknown>,
  idempotencyKey: string,
): Promise<RespuestaEmergencia> {
  const respuesta = await fetch(`${BASE}/v1/emergencias`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(carga),
  });

  if (respuesta.status >= 400 && respuesta.status < 500) {
    const cuerpo = await respuesta.json().catch(() => ({}));
    throw new ErrorValidacion(
      cuerpo.mensaje ?? cuerpo.message ?? 'El reporte no pasó la validación',
      cuerpo.detalles,
    );
  }
  if (!respuesta.ok) {
    throw new Error(`El servidor respondió ${respuesta.status}`);
  }
  return (await respuesta.json()) as RespuestaEmergencia;
}

/**
 * Envía un reporte, y si no se puede, lo encola.
 *
 * La distinción importa: un 4xx significa que el reporte está mal y encolarlo solo
 * repetiría el error para siempre, así que se avisa a la persona. Un fallo de red o un
 * 5xx sí se encola, porque el reporte es válido y el problema es del otro lado.
 */
export async function enviarEmergencia(carga: NuevaEmergencia): Promise<ResultadoEnvio> {
  const idempotencyKey = nuevaClave();

  try {
    const emergencia = await enviarAlServidor(carga, idempotencyKey);
    return { estado: 'enviado', emergencia };
  } catch (err) {
    if (err instanceof ErrorValidacion) throw err;

    await encolar({
      idempotencyKey,
      creadoEn: Date.now(),
      intentos: 1,
      ultimoError: err instanceof Error ? err.message : String(err),
      carga: carga as unknown as Record<string, unknown>,
    });

    return {
      estado: 'encolado',
      motivo: err instanceof Error ? err.message : 'Sin conexión',
    };
  }
}

export interface ResultadoSincronizacion {
  enviados: number;
  fallidos: number;
  descartados: number;
}

/**
 * Vacía la cola de pendientes.
 *
 * Un reporte que acumula demasiados intentos y sigue siendo rechazado por validación se
 * descarta: reintentarlo eternamente no lo va a arreglar y mantiene ocupada la cola.
 */
export async function sincronizarPendientes(): Promise<ResultadoSincronizacion> {
  const pendientes = await listarPendientes();
  let enviados = 0;
  let fallidos = 0;
  let descartados = 0;

  for (const reporte of pendientes) {
    try {
      await enviarAlServidor(reporte.carga, reporte.idempotencyKey);
      await descartar(reporte.idempotencyKey);
      enviados++;
    } catch (err) {
      if (err instanceof ErrorValidacion) {
        await descartar(reporte.idempotencyKey);
        descartados++;
      } else {
        await marcarFallo(reporte, err instanceof Error ? err.message : String(err));
        fallidos++;
      }
    }
  }

  return { enviados, fallidos, descartados };
}

export type { ReportePendiente };

// -----------------------------------------------------------------------------------
// Lecturas del panel de comando
// -----------------------------------------------------------------------------------
export interface Cluster {
  centroide: { lon: number; lat: number };
  densidad: number;
  prioridad_max: Prioridad;
  radio_m: number;
}

export async function obtenerClusters(ciudad: Ciudad): Promise<Cluster[]> {
  const r = await fetch(`${BASE}/v1/zonas/${ciudad}/clusters`);
  if (!r.ok) throw new Error(`No se pudieron cargar los puntos calientes (${r.status})`);
  const cuerpo = await r.json();
  return cuerpo.clusters ?? [];
}

export interface Despacho {
  id: string;
  emergencia_id: string;
  estado: string;
  distancia_m: string | null;
  unidad: string | null;
  organismo: string | null;
  creado_en: string;
}

export async function obtenerDespachos(ciudad?: Ciudad): Promise<Despacho[]> {
  const url = ciudad ? `${BASE}/v1/despachos?ciudad=${ciudad}` : `${BASE}/v1/despachos`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`No se pudieron cargar los despachos (${r.status})`);
  const cuerpo = await r.json();
  return cuerpo.despachos ?? [];
}
