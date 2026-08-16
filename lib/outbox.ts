/**
 * Cola de salida para reportes hechos sin conexión.
 *
 * El caso que resuelve es el que describe el enunciado: una víctima con conectividad
 * intermitente. Si el envío falla, el reporte no se pierde — se guarda en IndexedDB y se
 * reintenta al recuperar la red.
 *
 * Se usa IndexedDB y no localStorage porque localStorage es síncrono (bloquea el hilo de
 * la interfaz) y tiene un límite de unos 5 MB que una foto de daños agota enseguida.
 *
 * Cada reporte conserva SU PROPIA clave de idempotencia, generada al crearlo y no al
 * enviarlo. Es la pieza que hace segura toda la cola: si el envío llega al servidor pero
 * la respuesta se pierde, el reintento trae la misma clave y el backend reconoce el
 * duplicado en vez de despachar dos veces la misma emergencia.
 */

import { get, set, del, keys } from 'idb-keyval';

const PREFIJO = 'reporte-pendiente:';

export interface ReportePendiente {
  idempotencyKey: string;
  creadoEn: number;
  intentos: number;
  ultimoError?: string;
  carga: Record<string, unknown>;
}

/** Genera una clave de idempotencia. `randomUUID` no existe en contextos no seguros. */
export function nuevaClave(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export async function encolar(reporte: ReportePendiente): Promise<void> {
  await set(PREFIJO + reporte.idempotencyKey, reporte);
}

export async function listarPendientes(): Promise<ReportePendiente[]> {
  const todas = await keys();
  const propias = todas.filter((k): k is string => typeof k === 'string' && k.startsWith(PREFIJO));
  const reportes = await Promise.all(propias.map((k) => get<ReportePendiente>(k)));
  return reportes
    .filter((r): r is ReportePendiente => Boolean(r))
    .sort((a, b) => a.creadoEn - b.creadoEn);
}

export async function descartar(idempotencyKey: string): Promise<void> {
  await del(PREFIJO + idempotencyKey);
}

export async function marcarFallo(reporte: ReportePendiente, error: string): Promise<void> {
  await encolar({ ...reporte, intentos: reporte.intentos + 1, ultimoError: error });
}

export async function contarPendientes(): Promise<number> {
  const todas = await keys();
  return todas.filter((k) => typeof k === 'string' && k.startsWith(PREFIJO)).length;
}
