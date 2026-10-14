// Lógica de horarios, ausencias y sustituciones (sin dependencias de la interfaz).

export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
export const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
export const TIPOS = {
  clase: 'Clase', tutoria: 'Tutoría', apoyo: 'Apoyo', coordinacion: 'Coordinación',
  no_lectiva: 'No lectiva / pasillo', guardia: 'Guardia', otro: 'Otro'
};
// Lo que se considera «estar dando clase» (necesita sustituto si falta).
export const LECTIVAS = new Set(['clase', 'tutoria']);
export const CATEGORIAS = {
  no_lectiva: 'No lectiva / pasillo', guardia: 'Guardia', apoyo: 'Apoyo', coordinacion: 'Coordinación',
  otro: 'Otro', libre: 'Hueco libre (solo si se ofrece)', fuera: 'Sin horario ese día'
};
export const PRIORIDAD_DEFECTO = ['guardia', 'no_lectiva', 'apoyo', 'coordinacion', 'otro'];

/* ---------- Fechas ---------- */
export const pad = n => String(n).padStart(2, '0');
export const hoyISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fechaDe = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
export function diaSemana(iso) { const w = fechaDe(iso).getDay(); return w >= 1 && w <= 5 ? w : 0; }
export function sumarDias(iso, n) { const d = fechaDe(iso); d.setDate(d.getDate() + n); return hoyISO(d); }
export function fechaLarga(iso) {
  const s = fechaDe(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export function fechaCorta(iso) {
  if (!iso) return '';
  return fechaDe(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' });
}
export const minutos = hhmm => { const [h, m] = (hhmm || '0:0').split(':').map(Number); return h * 60 + m; };
export function diasLectivos(desde, hasta) {
  let n = 0;
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) if (diaSemana(f)) n++;
  return n;
}

/* ---------- Índices ---------- */
export function indices(db) {
  const porId = arr => Object.fromEntries((arr || []).map(x => [x.id, x]));
  const tramos = [...db.tramos].sort((a, b) => a.orden - b.orden);
  return {
    doc: porId(db.docentes), grp: porId(db.grupos), tramo: porId(db.tramos), oc: porId(db.ocupaciones),
    mat: Object.fromEntries(db.materias.map(m => [m.abrev, m])), materias: db.materias, zona: porId(db.zonas_recreo),
    tramos, lectivos: tramos.filter(t => t.lectivo),
    docentes: [...db.docentes].sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999) || a.nombre.localeCompare(b.nombre)),
    grupos: [...db.grupos].sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999)),
    // Para los desplegables: por orden alfabético del nombre
    alfabetico: [...db.docentes].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
  };
}

/* ---------- Ausencias ---------- */
export function ausenciaActiva(a, fecha) {
  return a.desde <= fecha && (!a.hasta || fecha <= a.hasta);
}
export function ausenciasDelDia(db, fecha) {
  return db.ausencias.filter(a => ausenciaActiva(a, fecha));
}
// ¿Está ausente este docente en esa fecha y tramo? Devuelve la ausencia o null.
export function ausenteEn(db, docenteId, fecha, tramoId) {
  return db.ausencias.find(a => a.docente_id === docenteId && ausenciaActiva(a, fecha) &&
    (!a.tramos || !a.tramos.length || a.tramos.includes(tramoId))) || null;
}
// Sustituto de larga duración activo en esa fecha (si lo hay).
export function sustitutoLargo(a, fecha) {
  return a && a.sustituto_id && ausenciaActiva(a, fecha) && (!a.sustituto_desde || a.sustituto_desde <= fecha) ? a.sustituto_id : null;
}

/* ---------- Avisos ---------- */
export function avisosDelDia(db, fecha) {
  return (db.avisos || []).filter(a => (!a.desde || a.desde <= fecha) && (!a.hasta || fecha <= a.hasta))
    .sort((a, b) => (b.importante ? 1 : 0) - (a.importante ? 1 : 0));
}

/* ---------- Horario efectivo ---------- */
// Ocupaciones propias de un docente + las que hereda como sustituto de larga duración en esa fecha.
export function ocupacionesDe(db, docenteId, fecha, dia = null) {
  const propias = db.ocupaciones.filter(o => o.docente_id === docenteId && (dia == null || o.dia === dia))
    .map(o => ({ ...o, titular_id: docenteId, efectivo_id: docenteId }));
  if (!fecha) return propias;
  const heredadas = [];
  for (const a of db.ausencias) {
    if (a.sustituto_id === docenteId && sustitutoLargo(a, fecha) === docenteId) {
      for (const o of db.ocupaciones) {
        if (o.docente_id === a.docente_id && (dia == null || o.dia === dia)) {
          heredadas.push({ ...o, titular_id: a.docente_id, efectivo_id: docenteId, heredada: a.id });
        }
      }
    }
  }
  return [...propias, ...heredadas];
}

// Quién está realmente a cargo de una ocupación en una fecha.
// estado: normal | sustituto_largo | cubierta | sin_cubrir | ausente (no lectiva)
export function estadoOcupacion(db, o, fecha, coberturasDia) {
  const tit = o.docente_id;
  const aus = ausenteEn(db, tit, fecha, o.tramo_id);
  if (!aus) return { estado: 'normal', docente_id: tit };
  const largo = sustitutoLargo(aus, fecha);
  let a_cargo = tit;
  if (largo) {
    // ¿El sustituto también falta?
    const aus2 = ausenteEn(db, largo, fecha, o.tramo_id);
    if (!aus2) return { estado: 'sustituto_largo', docente_id: largo, ausencia: aus };
    a_cargo = largo;
  }
  if (!LECTIVAS.has(o.tipo)) return { estado: 'ausente', docente_id: null, ausencia: aus };
  const cob = (coberturasDia || db.coberturas.filter(c => c.fecha === fecha))
    .find(c => c.ocupacion_id === o.id && c.tramo_id === o.tramo_id);
  if (cob && cob.sustituto_id) return { estado: 'cubierta', docente_id: cob.sustituto_id, cobertura: cob, ausencia: aus, ausente_id: a_cargo };
  return { estado: 'sin_cubrir', docente_id: null, cobertura: cob || null, ausencia: aus, ausente_id: a_cargo };
}

// Lista de huecos que hay que cubrir en una fecha.
export function necesidades(db, fecha) {
  const dia = diaSemana(fecha);
  if (!dia) return [];
  const cobs = db.coberturas.filter(c => c.fecha === fecha);
  const out = [];
  for (const o of db.ocupaciones) {
    if (o.dia !== dia || !LECTIVAS.has(o.tipo)) continue;
    const e = estadoOcupacion(db, o, fecha, cobs);
    if (e.estado === 'cubierta' || e.estado === 'sin_cubrir') out.push({ oc: o, ...e });
  }
  return out;
}

/* ---------- Candidatos para sustituir ---------- */
export function contarCoberturas(db, hasta = null) {
  const n = {};
  for (const c of db.coberturas) {
    if (!c.sustituto_id || (hasta && c.fecha > hasta)) continue;
    n[c.sustituto_id] = (n[c.sustituto_id] || 0) + 1;
  }
  return n;
}

export function candidatos(db, fecha, tramoId, { excluir = [] } = {}) {
  const dia = diaSemana(fecha);
  const prioridad = (db.config.prioridad && db.config.prioridad.length) ? db.config.prioridad : PRIORIDAD_DEFECTO;
  const cuenta = contarCoberturas(db);
  const ocupadosPorCobertura = new Set(db.coberturas.filter(c => c.fecha === fecha && c.tramo_id === tramoId).map(c => c.sustituto_id));
  const out = [];
  for (const d of db.docentes) {
    if (d.activo === false || d.en_bolsa === false || excluir.includes(d.id)) continue;
    // Si está de baja larga con sustituto, no cuenta; si falta ese tramo, tampoco.
    if (ausenteEn(db, d.id, fecha, tramoId)) continue;
    const delDia = ocupacionesDe(db, d.id, fecha, dia);
    const enTramo = delDia.filter(o => o.tramo_id === tramoId);
    if (enTramo.some(o => LECTIVAS.has(o.tipo))) continue;
    let cat, detalle = '';
    if (enTramo.length) {
      const o = [...enTramo].sort((a, b) => idx(prioridad, a.tipo) - idx(prioridad, b.tipo))[0];
      cat = o.tipo; detalle = o.detalle || o.materia || '';
    } else {
      cat = delDia.length ? 'libre' : 'fuera';
    }
    out.push({ docente: d, categoria: cat, detalle, cuenta: cuenta[d.id] || 0, ya: ocupadosPorCobertura.has(d.id) });
  }
  out.sort((a, b) => (a.ya - b.ya) || (idx(prioridad, a.categoria) - idx(prioridad, b.categoria)) ||
    (a.cuenta - b.cuenta) || a.docente.nombre.localeCompare(b.docente.nombre));
  return out;
}
const idx = (arr, x) => { if (x === 'fuera') return 999; if (x === 'libre') return 900; const i = arr.indexOf(x); return i < 0 ? 500 : i; };

// Asignación automática: rellena los huecos sin cubrir con el mejor candidato libre.
export function autoasignar(db, fecha) {
  const nuevas = [];
  const tmp = { ...db, coberturas: [...db.coberturas] };
  const pend = necesidades(tmp, fecha).filter(n => n.estado === 'sin_cubrir')
    .sort((a, b) => (a.oc.tramo_id > b.oc.tramo_id ? 1 : -1));
  for (const n of pend) {
    const c = candidatos(tmp, fecha, n.oc.tramo_id).find(x => !x.ya && x.categoria !== 'fuera' && x.categoria !== 'libre');
    if (!c) continue;
    const cob = {
      id: uid('c'), fecha, tramo_id: n.oc.tramo_id, ocupacion_id: n.oc.id, ausente_id: n.ausente_id,
      sustituto_id: c.docente.id, ausencia_id: n.ausencia.id, nota: ''
    };
    if (n.cobertura) cob.id = n.cobertura.id;
    tmp.coberturas = tmp.coberturas.filter(x => x.id !== cob.id).concat(cob);
    nuevas.push(cob);
  }
  return nuevas;
}

/* ---------- Contador ---------- */
export function estadisticas(db, desde, hasta) {
  const st = {};
  const fila = id => (st[id] = st[id] || { horas_sustituido: 0, horas_cubiertas: 0, ausencias: 0, dias_ausencia: 0 });
  for (const c of db.coberturas) {
    if ((desde && c.fecha < desde) || (hasta && c.fecha > hasta)) continue;
    if (c.ausente_id && c.sustituto_id) fila(c.ausente_id).horas_sustituido++;
    if (c.sustituto_id) fila(c.sustituto_id).horas_cubiertas++;
  }
  const hoy = hoyISO();
  for (const a of db.ausencias) {
    const ini = desde && a.desde < desde ? desde : a.desde;
    let fin = a.hasta || hoy; if (hasta && fin > hasta) fin = hasta;
    if (fin < ini) continue;
    const f = fila(a.docente_id);
    f.ausencias++;
    f.dias_ausencia += diasLectivos(ini, fin);
  }
  return st;
}

/* ---------- Varios ---------- */
export function uid(pref = 'x') {
  const r = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '').slice(0, 12);
  return `${pref}-${r}`;
}
export function hueMateria(abrev) {
  let h = 0; for (const ch of abrev || '') h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
export function tramoActual(tramos, ahora = new Date()) {
  const m = ahora.getHours() * 60 + ahora.getMinutes();
  const lista = [...tramos].sort((a, b) => a.orden - b.orden);
  const act = lista.find(t => minutos(t.inicio) <= m && m < minutos(t.fin));
  if (act) return { tramo: act, estado: 'en_curso' };
  const sig = lista.find(t => minutos(t.inicio) > m);
  if (sig) return { tramo: sig, estado: 'siguiente' };
  return { tramo: lista[lista.length - 1], estado: 'terminado' };
}

// Nombre corto: solo el nombre de pila; si se repite, se añade la inicial del apellido.
export function cortoAuto(nombreCompleto, docentes = []) {
  const partes = nombreCompleto.trim().split(/\s+/);
  const pila = partes[0] || '';
  const repetido = docentes.some(d => (d.corto || '').split(' ')[0] === pila || (d.nombre || '').split(' ')[0] === pila);
  return repetido && partes[1] ? `${pila} ${partes[1][0]}.` : pila;
}
