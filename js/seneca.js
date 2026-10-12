// Importador del XML de Séneca (Utilidades → Importación/Exportación → «Exportación de horarios»).
// Basado en el formato que usa el proyecto organizacion-escolar de maestroSeb.
// Séneca envía: tramos horarios, unidades (grupos), empleados (con nombre completo), materias,
// dependencias (aulas) y actividades. Si el archivo trae también las sesiones del horario
// (bloques con día, tramo y empleado), se importan; si no, solo se completan los catálogos.
import { uid, minutos } from './logic.js';

export async function leerArchivoSeneca(archivo) {
  // Séneca guarda el XML en ISO-8859-1.
  const buf = await archivo.arrayBuffer();
  let txt = new TextDecoder('iso-8859-1').decode(buf);
  if (/encoding=["']utf-8["']/i.test(txt.slice(0, 200))) txt = new TextDecoder('utf-8').decode(buf);
  return importarSeneca(txt);
}

export function importarSeneca(texto) {
  const xml = new DOMParser().parseFromString(texto.replace(/encoding\s*=\s*["'][^"']+["']/i, 'encoding="UTF-8"'), 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('El archivo no es un XML válido.');
  const bloque = xml.querySelector('BLOQUE_DATOS');
  if (!bloque) throw new Error('No parece un XML de Séneca (falta BLOQUE_DATOS).');
  const avisos = [];
  const hijos = el => [...el.children].filter(c => c.tagName === 'grupo_datos');
  const datos = el => Object.fromEntries([...el.children].filter(c => c.tagName === 'dato').map(c => [c.getAttribute('nombre_dato'), c.textContent.trim()]));
  const seccion = seq => hijos(bloque).find(g => g.getAttribute('seq') === seq);
  const filas = seq => { const s = seccion(seq); return s ? hijos(s).map(datos) : []; };
  const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  // Tramos (N_INICIO/N_FIN en minutos desde las 0:00)
  const tramosSen = filas('TRAMOS_HORARIOS').map(d => ({ x: d.X_TRAMO, nombre: d.T_HORCEN || '', ini: parseInt(d.N_INICIO, 10), fin: parseInt(d.N_FIN, 10) }))
    .filter(t => !isNaN(t.ini) && !isNaN(t.fin)).sort((a, b) => a.ini - b.ini);
  const tramos = [], tramoDe = {};
  let n = 1;
  tramosSen.forEach((t, i) => {
    const recreo = /recreo|patio/i.test(t.nombre);
    const id = recreo ? 'tr' : 't' + n;
    tramos.push({ id, orden: i + 1, etiqueta: recreo ? 'Recreo' : `${n}ª`, inicio: hhmm(t.ini), fin: hhmm(t.fin), lectivo: !recreo });
    if (!recreo) n++;
    tramoDe[t.x] = id;
  });

  const cursos = Object.fromEntries(filas('CURSOS_DEL_CENTRO').map(d => [d.X_OFERTAMATRIG, d.D_OFERTAMATRIG || '']));
  const grupos = [], grpDe = {};
  filas('UNIDADES').forEach((d, i) => {
    const nombre = d.T_NOMBRE || '';
    const curso = cursos[d.X_OFERTAMATRIG] || '';
    const g = { id: uid('g'), nombre, etapa: /bach/i.test(curso + nombre) ? 'Bachillerato' : /secundaria|eso/i.test(curso + nombre) ? 'ESO' : '', orden: i + 1, tutor_id: null, aula: '', curso_seneca: curso };
    grupos.push(g); grpDe[d.X_UNIDAD] = g.id;
  });

  const docentes = [], docDe = {};
  filas('EMPLEADOS').forEach((d, i) => {
    const nombre = [d.NOMBRE, d.APELLIDO1, d.APELLIDO2].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    if (!nombre) return;
    const doc = { id: uid('d'), nombre, corto: (d.NOMBRE || nombre).split(' ')[0], abrev: '', activo: true, en_bolsa: true, orden: i + 1, notas: d.D_PUESTO || '' };
    docentes.push(doc); docDe[d.X_EMPLEADO] = doc.id;
  });

  const materiasSen = {};
  for (const d of filas('MATERIAS')) if (d.D_MATERIAC) materiasSen[d.X_MATERIAC] = d.D_MATERIAC;
  const aulas = {};
  for (const d of filas('DEPENDENCIAS')) if (d.D_DEPENDENCIA) aulas[d.X_DEPENDENCIA] = d.D_DEPENDENCIA;
  const actividades = {};
  for (const d of filas('ACTIVIDADES')) if (d.D_ACTIVIDAD) actividades[d.X_ACTIVIDAD] = d.D_ACTIVIDAD;

  // Sesiones: cualquier bloque que tenga día de la semana, tramo y empleado.
  const sesiones = [];
  const recorrer = (el, empleado) => {
    for (const g of hijos(el)) {
      const d = datos(g);
      const emp = d.X_EMPLEADO || empleado;
      if (d.N_DIASEMANA && d.X_TRAMO && emp) sesiones.push({ ...d, X_EMPLEADO: emp });
      recorrer(g, emp);
    }
  };
  recorrer(bloque, null);

  const ocupaciones = [], abrevDe = {};
  const sigla = nombre => {
    if (abrevDe[nombre]) return abrevDe[nombre];
    const s = nombre.split(/\s+/).filter(w => w.length > 2 || /^[A-ZÁÉÍÓÚ]/.test(w)).map(w => w[0].toUpperCase()).join('').slice(0, 6) || nombre.slice(0, 4);
    let k = s, i = 2; while (Object.values(abrevDe).includes(k)) k = s + i++;
    return (abrevDe[nombre] = k);
  };
  const juntas = new Map();
  for (const s of sesiones) {
    const doc = docDe[s.X_EMPLEADO], tramo = tramoDe[s.X_TRAMO], dia = parseInt(s.N_DIASEMANA, 10);
    if (!doc || !tramo || !(dia >= 1 && dia <= 5)) continue;
    const mat = materiasSen[s.X_MATERIAC];
    const act = actividades[s.X_ACTIVIDAD] || '';
    const g = grpDe[s.X_UNIDAD];
    let tipo = 'clase', materia = '', detalle = '';
    if (mat && g) { materia = sigla(mat); if (/tutor/i.test(mat)) tipo = 'tutoria'; }
    else if (/guardia/i.test(act)) { tipo = 'guardia'; detalle = act; }
    else if (/coordin|jefatura|direcci|secretar/i.test(act)) { tipo = 'coordinacion'; detalle = act; }
    else if (/apoyo|refuerzo|pedagog|audici/i.test(act)) { tipo = 'apoyo'; detalle = act; }
    else if (/tutor/i.test(act) && g) { tipo = 'tutoria'; materia = 'TUT'; }
    else { tipo = 'no_lectiva'; detalle = act || 'Horario no lectivo'; }
    const k = [doc, dia, tramo, tipo, materia, detalle].join('|');
    if (!juntas.has(k)) juntas.set(k, { id: uid('o'), docente_id: doc, dia, tramo_id: tramo, tipo, materia, grupos: [], subgrupo: '', detalle, aula: aulas[s.X_DEPENDENCIA] || '' });
    if (g && !juntas.get(k).grupos.includes(g)) juntas.get(k).grupos.push(g);
  }
  ocupaciones.push(...juntas.values());
  // Para materias sin sesiones solo se conserva el nombre (sin siglas)
  const materias = Object.entries(abrevDe).map(([nombre, abrev]) => ({ id: uid('m'), abrev, nombre, niveles: [] }));
  if (!sesiones.length) avisos.push('El archivo no trae las sesiones del horario: solo se completarán profesorado (nombres completos), grupos y tramos.');
  return { docentes, grupos, tramos, materias, ocupaciones, avisos, soloCatalogos: !sesiones.length,
    nombresMaterias: Object.values(materiasSen), curso: (filas('ANNO_ACADEMICO')[0] || {}).C_ANNO };
}
