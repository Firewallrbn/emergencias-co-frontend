'use client';

/**
 * Mapa operativo del panel de comando.
 *
 * MapLibre en lugar de Mapbox por una razón concreta: Mapbox exige un token de acceso en
 * el cliente, y el enunciado prohíbe credenciales fuera del panel de Vercel. MapLibre con
 * teselas de CARTO no necesita ninguna.
 *
 * El estilo es el claro "positron", deliberadamente desaturado: en un mapa operativo el
 * color debe reservarse para la información —las prioridades— y no gastarse en el fondo.
 */

import { useEffect, useRef } from 'react';
// El build ESM de maplibre-gl no expone un export por defecto, solo nombrados.
// `Map` se renombra para no tapar el Map global de JavaScript.
import {
  Map as MapaLibre,
  Marker,
  Popup,
  NavigationControl,
  type GeoJSONSource,
  type StyleSpecification,
} from 'maplibre-gl';
// El CSS NO se importa aquí: al cargarse este componente con next/dynamic, su hoja
// acababa en un chunk aparte que no siempre llegaba a tiempo y el mapa salía en blanco.
// Vive en app/globals.css.
import { CENTRO_CIUDAD, COLOR_PRIORIDAD, type Ciudad, type Prioridad } from '@/lib/dominio';

export interface PuntoEmergencia {
  id: string;
  lon: number;
  lat: number;
  prioridad: Prioridad;
  tipo: string;
  descripcion: string;
}

export interface PuntoCaliente {
  lon: number;
  lat: number;
  densidad: number;
  radio_m: number;
  prioridad_max: Prioridad;
}

interface Props {
  ciudad: Ciudad;
  emergencias: PuntoEmergencia[];
  clusters: PuntoCaliente[];
}

/**
 * Estilo ráster declarado en línea, en vez del `style.json` vectorial de CARTO.
 *
 * El estilo vectorial cargaba —la atribución aparecía y los marcadores se posicionaban
 * bien— pero el lienzo salía completamente en blanco. La pista está en QUÉ se dibujaba:
 * marcadores, controles y atribución son elementos del DOM, y todos funcionaban; lo único
 * vacío era el canvas de WebGL. MapLibre descarga las teselas vectoriales y las convierte
 * a geometría en un Web Worker, y ese worker es lo que suele romperse en silencio al
 * empaquetar con Turbopack: las teselas se descargan y nunca se pintan.
 *
 * Con teselas ráster no hay nada que parsear: son imágenes que el navegador dibuja
 * directamente. Se pierde el zoom infinito y la rotación de etiquetas, que a un panel de
 * despacho no le hacen falta, y se gana que funcione. Además pesa menos en la red
 * degradada del escenario del enunciado.
 */
const ESTILO: StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>, &copy; OpenStreetMap',
    },
  },
  layers: [
    // Un fondo explícito: sin él, las zonas sin tesela quedan transparentes y se ve el
    // color de la página, que en modo oscuro produce huecos negros en mitad del mapa.
    { id: 'fondo', type: 'background', paint: { 'background-color': '#f2f2f0' } },
    { id: 'carto', type: 'raster', source: 'carto' },
  ],
};

export default function MapaEmergencias({ ciudad, emergencias, clusters }: Props) {
  const contenedor = useRef<HTMLDivElement | null>(null);
  const mapa = useRef<MapaLibre | null>(null);
  const marcadores = useRef<Marker[]>([]);

  // --- Creación del mapa (una sola vez) -------------------------------------------
  useEffect(() => {
    if (!contenedor.current || mapa.current) return;

    mapa.current = new MapaLibre({
      container: contenedor.current,
      style: ESTILO,
      center: CENTRO_CIUDAD[ciudad],
      zoom: 12,
      attributionControl: { compact: true },
    });
    mapa.current.addControl(new NavigationControl({ showCompass: false }), 'top-right');

    // Sin esto, un fallo de teselas o de estilo no deja rastro: el mapa simplemente sale
    // en blanco y la consola queda limpia. Ya pasó una vez; que no vuelva a pasar en
    // silencio.
    mapa.current.on('error', (e) => {
      console.error('[mapa] fallo de MapLibre:', e.error?.message ?? e);
    });

    return () => {
      mapa.current?.remove();
      mapa.current = null;
    };
    // Sin dependencias: recrear el mapa al cambiar de ciudad perdería el estado de
    // navegación del operador. El cambio de ciudad se maneja abajo con flyTo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Cambio de ciudad --------------------------------------------------------------
  useEffect(() => {
    mapa.current?.flyTo({ center: CENTRO_CIUDAD[ciudad], zoom: 12, duration: 800 });
  }, [ciudad]);

  // --- Marcadores de emergencias ------------------------------------------------------
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;

    // Se recrean en bloque en lugar de hacer diff. Con decenas de puntos el coste es
    // irrelevante y el diff manual seria una fuente de fugas de marcadores huerfanos.
    marcadores.current.forEach((marcador) => marcador.remove());
    marcadores.current = [];

    for (const e of emergencias) {
      const nodo = document.createElement('div');
      nodo.style.cssText = `
        width:18px;height:18px;border-radius:9999px;
        background:${COLOR_PRIORIDAD[e.prioridad]};
        border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4);cursor:pointer;`;
      nodo.setAttribute('role', 'img');
      nodo.setAttribute('aria-label', `Emergencia ${e.prioridad}: ${e.descripcion}`);

      const popup = new Popup({ offset: 14, closeButton: false }).setHTML(
        `<strong>${e.prioridad}</strong> · ${escapar(e.tipo)}<br/><span style="font-size:12px">${escapar(
          e.descripcion.slice(0, 140),
        )}</span>`,
      );

      marcadores.current.push(
        new Marker({ element: nodo }).setLngLat([e.lon, e.lat]).setPopup(popup).addTo(m),
      );
    }
  }, [emergencias]);

  // --- Capa de puntos calientes --------------------------------------------------------
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;

    const pintar = () => {
      const datos = {
        type: 'FeatureCollection' as const,
        features: clusters.map((c) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] },
          properties: { densidad: c.densidad, radio: c.radio_m, prioridad: c.prioridad_max },
        })),
      };

      const fuente = m.getSource('clusters') as GeoJSONSource | undefined;
      if (fuente) {
        fuente.setData(datos);
        return;
      }

      m.addSource('clusters', { type: 'geojson', data: datos });
      m.addLayer(
        {
          id: 'clusters-area',
          type: 'circle',
          source: 'clusters',
          paint: {
            // El radio crece con la densidad, no de forma lineal: la raiz evita que un
            // punto caliente muy grande tape media ciudad.
            'circle-radius': ['*', 6, ['sqrt', ['get', 'densidad']]],
            'circle-color': '#b91c1c',
            'circle-opacity': 0.18,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#b91c1c',
            'circle-stroke-opacity': 0.5,
          },
        },
        // Debajo de los marcadores: el area es contexto, no el dato principal.
        undefined,
      );
    };

    if (m.isStyleLoaded()) pintar();
    else m.once('load', pintar);
  }, [clusters]);

  return (
    <div
      ref={contenedor}
      className="h-[420px] w-full rounded-lg border border-neutral-300 dark:border-neutral-700"
      aria-label="Mapa de emergencias"
    />
  );
}

/** Evita inyección de HTML en los popups: la descripción la escribe un ciudadano. */
function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}
