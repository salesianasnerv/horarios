// Importador del XML que exporta aSc Horarios (Archivo → Exportar → «aSc Horarios XML»).
// Devuelve { docentes, grupos, tramos, materias, ocupaciones, avisos } con el mismo formato que data/seed.json.
import { minutos, uid } from './logic.js';

const ESPECIALES = [
  { re: /^(c|coord.*)$/i, tipo: 'coordinacion' },
  { re: /^(nl|no lectiv.*|guardia.*|pasillo.*)$/i, tipo: 'no_lectiva' },
  { re: /^(a|ap|apoyo.*|refuerzo.*|pt)$/i, tipo: 'apoyo' }
];

export function importarAsc(texto) {
  const xml = new DOMParser().parseFromString(texto, 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('El archivo no es un XML válido.');
  if (!xml.querySelector('timetable')) throw new Error('No parece un XML de aSc Horarios (falta <timetable>).');
  const avisos = [];
  const all = sel => [...xml.querySelectorAll(sel)];
  const at = (el, k) => (el.getAttribute(k) || '').trim();
  const lista = v => (v || '').split(',').map(s => s.trim()).filter(Boolean);
  const hhmm = s => { const [h, m] = (s || '0:00').split(':'); return `${String(h).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`; };

  // Tramos (se añade el recreo si hay un hueco de 15 min o más entre dos sesiones)
  const periods = all('periods > period').map(p => ({ num: at(p, 'period') || at(p, 'name'), ini: hhmm(at(p, 'starttime')), fin: hhmm(at(p, 'endtime')) }))
    .sort((a, b) => minutos(a.ini) - minutos(b.ini));
  const tramos = []; const tramoDe = {};
  let orden = 1, n = 1;
  periods.forEach((p, i) => {
    const prev = periods[i - 1];
    if (prev && minutos(p.ini) - minutos(prev.fin) >= 15) {
      tramos.push({ id: 'tr' + orden, orden: orden++, etiqueta: 'Recreo', inicio: prev.fin, fin: p.ini, lectivo: false });
    }
    const id = 't' + n;
    tramos.push({ id, orden: orden++, etiqueta: `${n}ª`, inicio: p.ini, fin: p.fin, lectivo: true });
    tramoDe[p.num] = id; n++;
  });
  const listaTramos = periods.map(p => tramoDe[p.num]);

  const subjects = {};
  for (const s of all('subjects > subject')) subjects[at(s, 'id')] = { short: at(s, 'short') || at(s, 'name'), name: at(s, 'name') };

  const docentes = []; const docDe = {};
  all('teachers > teacher').forEach((t, i) => {
    const nombre = at(t, 'name') || `${at(t, 'firstname')} ${at(t, 'lastname')}`.trim() || at(t, 'short');
    const d = { id: uid('d'), nombre, corto: nombre.split(' ')[0], abrev: at(t, 'short'), activo: true, en_bolsa: true, orden: i + 1, notas: '' };
    docentes.push(d); docDe[at(t, 'id')] = d.id;
  });

  const grupos = []; const grpDe = {};
  all('classes > class').forEach((c, i) => {
    const nombre = at(c, 'name') || at(c, 'short');
    const g = { id: uid('g'), nombre, etapa: /bach/i.test(nombre) ? 'Bachillerato' : /eso/i.test(nombre) ? 'ESO' : '', orden: i + 1, tutor_id: docDe[at(c, 'teacherid')] || null };
    grupos.push(g); grpDe[at(c, 'id')] = g.id;
  });

  const subgrupoDe = {};
  for (const g of all('groups > group')) {
    if (at(g, 'entireclass') === '1') continue;
    subgrupoDe[at(g, 'id')] = at(g, 'name');
  }

  const daysdefs = {};
  for (const d of all('daysdefs > daysdef')) daysdefs[at(d, 'id')] = at(d, 'days');

  const lessons = {};
  for (const l of all('lessons > lesson')) lessons[at(l, 'id')] = l;

  const ocupaciones = []; const materias = new Map();
  for (const card of all('cards > card')) {
    const l = lessons[at(card, 'lessonid')];
    if (!l) continue;
    let dias = at(card, 'days') || daysdefs[at(l, 'daysdefid')] || '';
    const sesiones = Math.max(1, parseInt(at(l, 'periodspercard') || '1', 10));
    const tramoIni = tramoDe[at(card, 'period')];
    if (!tramoIni) { avisos.push(`Sesión con periodo desconocido (${at(card, 'period')}).`); continue; }
    const subj = subjects[at(l, 'subjectid')] || { short: '?', name: '' };
    const gIds = lista(at(l, 'classids')).map(id => grpDe[id]).filter(Boolean);
    const subs = [...new Set(lista(at(l, 'groupids')).map(id => subgrupoDe[id]).filter(Boolean))];
    const profes = lista(at(l, 'teacherids')).map(id => docDe[id]).filter(Boolean);
    let tipo = 'clase', detalle = '', materia = subj.short;
    if (!gIds.length) {
      const esp = ESPECIALES.find(e => e.re.test(subj.short) || e.re.test(subj.name));
      tipo = esp ? esp.tipo : 'otro'; detalle = subj.name || subj.short; materia = '';
    } else {
      if (/^tut/i.test(subj.short) || /tutor/i.test(subj.name)) tipo = 'tutoria';
      materias.set(subj.short, subj.name || subj.short);
    }
    const pos = listaTramos.indexOf(tramoIni);
    for (let k = 0; k < dias.length; k++) {
      if (dias[k] !== '1' || k > 4) continue;
      for (let s = 0; s < sesiones; s++) {
        const tramo_id = listaTramos[pos + s];
        if (!tramo_id) continue;
        for (const doc of profes) {
          ocupaciones.push({ id: uid('o'), docente_id: doc, dia: k + 1, tramo_id, tipo, materia, grupos: gIds, subgrupo: subs.join(' / '), detalle });
        }
      }
    }
  }
  if (!ocupaciones.length) avisos.push('No se ha encontrado ninguna sesión colocada (¿el horario estaba sin generar?).');
  return {
    docentes, grupos, tramos, ocupaciones, avisos,
    materias: [...materias].map(([abrev, nombre]) => ({ id: uid('m'), abrev, nombre, niveles: [] }))
  };
}
