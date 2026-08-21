/**
 * Vocabulario del dominio.
 *
 * Duplica a proposito las constantes del backend (`packages/shared/src/dominio.ts`).
 * Compartir un paquete entre los dos repositorios acoplaria su despliegue: el frontend
 * vive en Vercel y el backend en AWS, con ciclos independientes. El contrato real es el
 * JSON Schema del API Gateway, que rechaza cualquier valor fuera de estas listas; si
 * alguna vez divergen, el gateway devuelve 400 y el error salta enseguida.
 */

export const CIUDADES = ['choco', 'pereira', 'cali', 'manizales'] as const;
export type Ciudad = (typeof CIUDADES)[number];

export const TIPOS = ['usar_medica', 'albergue', 'suministros', 'danos'] as const;
export type TipoSolicitud = (typeof TIPOS)[number];

export type Prioridad = 'P1' | 'P2' | 'P3' | 'P4';

export const NOMBRE_CIUDAD: Record<Ciudad, string> = {
  choco: 'Chocó (Quibdó)',
  pereira: 'Pereira',
  cali: 'Cali',
  manizales: 'Manizales',
};

export const CENTRO_CIUDAD: Record<Ciudad, [number, number]> = {
  choco: [-76.6612, 5.6947],
  pereira: [-75.6906, 4.8133],
  cali: [-76.5225, 3.4516],
  manizales: [-75.5138, 5.0703],
};

export interface DefinicionTipo {
  id: TipoSolicitud;
  titulo: string;
  descripcion: string;
  prioridadBase: Prioridad;
  /** Campos críticos que el enunciado exige para este tipo de solicitud. */
  campos: CampoCritico[];
}

export interface CampoCritico {
  nombre: string;
  etiqueta: string;
  tipo: 'numero' | 'texto' | 'seleccion' | 'multiple' | 'booleano';
  opciones?: { valor: string; etiqueta: string }[];
  ayuda?: string;
  /** Permite elegir "desconocido" en campos numéricos donde la persona no puede saber el dato. */
  permitirDesconocido?: boolean;
  /** Si la opción seleccionada es 'otro', muestra un campo de texto libre. */
  permitirOtro?: boolean;
}

/** Etiquetas legibles por tipo de solicitud, para mostrar en popups y listas. */
export const ETIQUETA_TIPO: Record<TipoSolicitud, string> = {
  usar_medica: 'Rescate / Emergencia médica',
  albergue: 'Albergue y refugio',
  suministros: 'Suministros y asistencia',
  danos: 'Evaluación de daños',
};

/**
 * Los cuatro tipos de solicitud con sus datos críticos, tomados literalmente de la tabla
 * de la sección 3 del enunciado. Que el formulario cambie según el tipo no es un adorno:
 * pedirle a alguien que reporta un derrumbe los mismos campos que a quien pide agua
 * potable retrasa la respuesta cuando más cuesta el retraso.
 */
export const TIPOS_SOLICITUD: DefinicionTipo[] = [
  {
    id: 'usar_medica',
    titulo: 'Rescate urbano o emergencia médica',
    descripcion: 'Personas atrapadas, heridas o en peligro inmediato',
    prioridadBase: 'P1',
    campos: [
      { nombre: 'personas_atrapadas', etiqueta: 'Personas atrapadas', tipo: 'numero', permitirDesconocido: true },
      { nombre: 'heridos', etiqueta: 'Personas heridas', tipo: 'numero', permitirDesconocido: true },
      {
        nombre: 'riesgo_inminente',
        etiqueta: 'Riesgos presentes',
        tipo: 'multiple',
        ayuda: 'Marca todo lo que apliquen. Determina la urgencia del despacho.',
        permitirOtro: true,
        opciones: [
          { valor: 'fuga_gas', etiqueta: 'Olor a gas' },
          { valor: 'fuego', etiqueta: 'Fuego' },
          { valor: 'colapso', etiqueta: 'Riesgo de derrumbe' },
          { valor: 'deslizamiento', etiqueta: 'Deslizamiento de tierra' },
          { valor: 'otro', etiqueta: 'Otro riesgo' },
        ],
      },
    ],
  },
  {
    id: 'albergue',
    titulo: 'Albergue y refugio temporal',
    descripcion: 'Personas sin vivienda habitable tras el sismo',
    prioridadBase: 'P2',
    campos: [
      { nombre: 'adultos', etiqueta: 'Adultos', tipo: 'numero' },
      { nombre: 'ninos', etiqueta: 'Niñas y niños', tipo: 'numero' },
      { nombre: 'tercera_edad', etiqueta: 'Personas mayores', tipo: 'numero' },
      {
        nombre: 'accesibilidad',
        etiqueta: 'Hay personas con movilidad reducida',
        tipo: 'booleano',
      },
    ],
  },
  {
    id: 'suministros',
    titulo: 'Suministros y asistencia humanitaria',
    descripcion: 'Agua, alimentos, medicamentos o kits de primeros auxilios',
    prioridadBase: 'P3',
    campos: [
      {
        nombre: 'categoria',
        etiqueta: 'Qué se necesita',
        tipo: 'seleccion',
        permitirOtro: true,
        opciones: [
          { valor: 'agua_potable', etiqueta: 'Agua potable' },
          { valor: 'raciones_campana', etiqueta: 'Alimentos' },
          { valor: 'kits_primeros_auxilios', etiqueta: 'Kits de primeros auxilios' },
          { valor: 'medicamentos_cronicos', etiqueta: 'Medicamentos crónicos' },
          { valor: 'otro', etiqueta: 'Otro' },
        ],
      },
      { nombre: 'personas', etiqueta: 'Personas afectadas', tipo: 'numero' },
    ],
  },
  {
    id: 'danos',
    titulo: 'Evaluación de daños estructurales',
    descripcion: 'Grietas, hundimientos o riesgo de colapso sobre vías',
    prioridadBase: 'P4',
    campos: [
      {
        nombre: 'tipo_edificacion',
        etiqueta: 'Tipo de edificación',
        tipo: 'seleccion',
        permitirOtro: true,
        opciones: [
          { valor: 'residencial', etiqueta: 'Vivienda' },
          { valor: 'comercial', etiqueta: 'Local comercial' },
          { valor: 'infraestructura', etiqueta: 'Infraestructura pública' },
          { valor: 'otro', etiqueta: 'Otro' },
        ],
      },
      {
        nombre: 'agrietamiento',
        etiqueta: 'Nivel de agrietamiento',
        tipo: 'seleccion',
        opciones: [
          { valor: 'leve', etiqueta: 'Leve' },
          { valor: 'moderado', etiqueta: 'Moderado' },
          { valor: 'severo', etiqueta: 'Severo' },
        ],
      },
      {
        nombre: 'riesgo_via',
        etiqueta: 'Amenaza con caer sobre una vía',
        tipo: 'booleano',
        ayuda: 'Una vía bloqueada impide llegar a las demás emergencias.',
      },
    ],
  },
];

/**
 * Colores por prioridad.
 *
 * Se distinguen por luminosidad además de por tono: en un mapa, con luz de día y en una
 * pantalla barata, el tono solo no basta, y quien tiene daltonismo rojo-verde no debería
 * confundir un P1 con un P3.
 */
export const COLOR_PRIORIDAD: Record<Prioridad, string> = {
  P1: '#b91c1c',
  P2: '#c2410c',
  P3: '#a16207',
  P4: '#3f6212',
};

export const ETIQUETA_PRIORIDAD: Record<Prioridad, string> = {
  P1: 'P1 · Crítica',
  P2: 'P2 · Alta',
  P3: 'P3 · Media',
  P4: 'P4 · Preventiva',
};
