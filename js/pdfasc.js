// Importador del PDF «El horario total de las clases / de los profesores» que imprime aSc Horarios.
// Lee las páginas de cada grupo (materia + siglas del profesor/a) y las de cada profesor/a
// (para saber su nombre y sus horas de Apoyo «A», Coordinación «C» y No lectivas «NL»).
// Devuelve { docentes, grupos, tramos, materias, ocupaciones, avisos } como importarAsc().
import { minutos, uid } from './logic.js';

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
const DIAS = ['Lun', 'Mar', 'Mie', 'Mié', 'Jue', 'Vie'];
const MARCAS = { A: 'apoyo', C: 'coordinacion', NL: 'no_lectiva' };

async function cargarPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  await new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = PDFJS + 'pdf.min.js'; s.onload = ok; s.onerror = () => ko(new Error('No se pudo cargar el lector de PDF.'));
    document.head.appendChild(s);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
  return window.pdfjsLib;
}

// Palabras de una página con su posición (y desde arriba) y tamaño de letra.
async function palabras(pagina) {
  const H = pagina.getViewport({ scale: 1 }).height;
  const tc = await pagina.getTextContent();
  return tc.items.filter(it => it.str && it.str.trim()).map(it => {
    const fs = Math.hypot(it.transform[2], it.transform[3]);
    const x0 = it.transform[4];
    return { t: it.str.trim(), fs, x0, x1: x0 + it.width, y: H - it.transform[5] - fs * 0.35 };
  });
}

const titulo = ws => {
  const grandes = ws.filter(w => w.y < 50);
  const max = Math.max(0, ...grandes.map(w => w.fs));
  return grandes.filter(w => w.fs > max * 0.8).sort((a, b) => a.x0 - b.x0).map(w => w.t).join(' ').trim();
};

// Rejilla: columnas a partir de las horas («08:00 - 09:00») y filas a partir de los días.
function rejilla(ws) {
  const horas = ws.filter(w => /^\d{1,2}:\d{2}(\s*-\s*\d{1,2}:\d{2})?$/.test(w.t)).sort((a, b) => a.x0 - b.x0);
  const cols = [];
  for (const w of horas) {
    const c = cols[cols.length - 1];
    if (c && w.x0 - c.x1 < 25) { c.x1 = Math.max(c.x1, w.x1); c.txt += ' ' + w.t; }
    else cols.push({ x0: w.x0, x1: w.x1, txt: w.t });
  }
  for (const c of cols) {
    const m = c.txt.match(/(\d{1,2}:\d{2})\D+(\d{1,2}:\d{2})/);
    c.ini = m ? m[1].padStart(5, '0') : ''; c.fin = m ? m[2].padStart(5, '0') : ''; c.cx = (c.x0 + c.x1) / 2;
  }
  const maxDia = Math.max(0, ...ws.filter(w => DIAS.includes(w.t)).map(w => w.fs));
  const dias = ws.filter(w => DIAS.includes(w.t) && w.fs > maxDia * 0.8).sort((a, b) => a.y - b.y).map(w => w.y);
  return { cols, dias };
}

function celdas(ws, { cols, dias }) {
  const paso = dias.length > 1 ? dias[1] - dias[0] : 100;
  const top = dias[0] - paso / 2;
  const out = {};
  for (const w of ws) {
    if (w.y < top || DIAS.includes(w.t) || /^\d{1,2}:\d{2}/.test(w.t) || w.t === '-') continue;
    const cx = (w.x0 + w.x1) / 2;
    let ci = -1, mejor = 1e9;
    cols.forEach((c, i) => { const d = Math.abs(c.cx - cx); if (d < mejor) { mejor = d; ci = i; } });
    if (ci < 0 || mejor > 45) continue;
    const di = dias.findIndex(y => w.y >= y - paso / 2 && w.y < y + paso / 2);
    if (di < 0) continue;
    (out[`${di},${ci}`] = out[`${di},${ci}`] || []).push(w);
  }
  for (const k in out) {
    const l = out[k].sort((a, b) => Math.round(a.y) - Math.round(b.y) || a.x0 - b.x0);
    // «Grupo» + «1» → «Grupo 1»
    const r = [];
    for (const w of l) {
      const p = r[r.length - 1];
      if (p && p.t === 'Grupo' && /^\d$/.test(w.t) && Math.abs(p.y - w.y) < 3) { r[r.length - 1] = { ...p, t: 'Grupo ' + w.t }; continue; }
      r.push(w);
    }
    out[k] = r;
  }
  return out;
}

const tituloCaso = s => s === s.toUpperCase() ? s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : s;
const nombreGrupo = s => s.replace(/\s+/g, ' ').replace(/BACH\.?/i, 'Bach.').trim();

export async function importarPdfAsc(archivo, progreso = () => {}) {
  const lib = await cargarPdfJs();
  const pdf = await lib.getDocument({ data: await archivo.arrayBuffer() }).promise;
  const avisos = [];
  const clases = {}, profes = {};
  let columnas = null;
  for (let n = 1; n <= pdf.numPages; n++) {
    progreso(`Leyendo página ${n} de ${pdf.numPages}…`);
    const ws = await palabras(await pdf.getPage(n));
    const tit = titulo(ws);
    const esProfe = /^Profesor/i.test(tit);
    if (!esProfe && !/^\d\s*º/.test(tit)) continue; // páginas resumen
    const g = rejilla(ws);
    if (!g.cols.length || g.dias.length < 5) { avisos.push(`Página ${n}: no se ha reconocido la rejilla.`); continue; }
    columnas = columnas || g.cols;
    const c = celdas(ws, g);
    if (esProfe) profes[tit.replace(/^Profesor[a]?\s*/i, '').trim()] = c;
    else clases[nombreGrupo(tit)] = c;
  }
  if (!Object.keys(clases).length) throw new Error('No se han encontrado páginas de horarios de grupos (las que se titulan «1º ESO A», etc.).');

  // Sesiones de cada grupo: [Grupo N] MATERIA siglas
  const sesiones = [];
  for (const [grupo, cs] of Object.entries(clases)) {
    for (const [k, toks] of Object.entries(cs)) {
      const [d, c] = k.split(',').map(Number);
      const big = Math.max(...toks.map(t => t.fs));
      let cur = null, sub = '';
      for (const t of toks) {
        if (/^Grupo \d$/.test(t.t)) { sub = t.t; continue; }
        if (!cur && t.fs >= big * 0.95) { cur = { grupo, d, c, m: t.t, sub, abrev: '' }; continue; }
        if (cur && t.fs < big * 0.95) { cur.abrev = t.t; sesiones.push(cur); cur = null; sub = ''; }
      }
      if (cur) { sesiones.push(cur); avisos.push(`${grupo}: ${cur.m} sin profesor/a.`); }
    }
  }

  // Huecos ocupados de cada página de profesor/a y sus marcas A / C / NL
  const ocupadoProfe = {}, marcas = {};
  for (const [p, cs] of Object.entries(profes)) {
    const tam = Object.values(cs).flat().map(t => t.fs);
    const grande = Math.max(0, ...tam);
    ocupadoProfe[p] = new Set(); marcas[p] = {};
    for (const [k, toks] of Object.entries(cs)) {
      const m = toks.filter(t => MARCAS[t.t] && t.fs < grande * 0.85);
      if (m.length && m.length === toks.length) marcas[p][k] = MARCAS[m[0].t];
      else if (toks.some(t => t.fs >= grande * 0.85)) ocupadoProfe[p].add(k);
    }
  }
  // Siglas → profesor/a: la página cuyos huecos más se parecen
  const porSiglas = {};
  for (const s of sesiones) (porSiglas[s.abrev] = porSiglas[s.abrev] || new Set()).add(`${s.d},${s.c}`);
  const quien = {};
  for (const [a, set] of Object.entries(porSiglas)) {
    let mejor = null, nota = 0;
    for (const [p, ocu] of Object.entries(ocupadoProfe)) {
      const inter = [...set].filter(x => ocu.has(x)).length;
      const j = inter / (new Set([...set, ...ocu]).size || 1);
      if (j > nota) { nota = j; mejor = p; }
    }
    quien[a] = nota >= 0.5 ? mejor : null;
  }

  // Tramos (las columnas con alguna sesión o marca) y recreo si hay hueco entre ellos
  const usadas = new Set([...sesiones.map(s => s.c), ...Object.values(marcas).flatMap(m => Object.keys(m).map(k => +k.split(',')[1]))]);
  const tramos = [], tramoDeCol = {};
  let orden = 1, n = 1, prevFin = null;
  columnas.forEach((col, i) => {
    if (!usadas.has(i)) return;
    if (prevFin && minutos(col.ini) - minutos(prevFin) >= 15) tramos.push({ id: 'tr', orden: orden++, etiqueta: 'Recreo', inicio: prevFin, fin: col.ini, lectivo: false });
    tramoDeCol[i] = 't' + n;
    tramos.push({ id: 't' + n, orden: orden++, etiqueta: `${n}ª`, inicio: col.ini, fin: col.fin, lectivo: true });
    n++; prevFin = col.fin;
  });

  // Docentes: uno por página de profesor/a (+ siglas sin página)
  const docentes = [], docDe = {};
  Object.keys(profes).forEach((p, i) => {
    const nombre = tituloCaso(p);
    const abrev = Object.keys(quien).find(a => quien[a] === p) || '';
    const d = { id: uid('d'), nombre, corto: nombre.split(' ')[0], abrev, activo: true, en_bolsa: true, orden: i + 1, notas: '' };
    docentes.push(d); docDe[p] = d.id;
  });
  for (const a of Object.keys(quien)) if (!quien[a]) {
    const d = { id: uid('d'), nombre: a, corto: a, abrev: a, activo: true, en_bolsa: true, orden: docentes.length + 1, notas: 'Sin página de profesor/a en el PDF' };
    docentes.push(d); avisos.push(`Las siglas «${a}» no corresponden a ninguna página de profesor/a.`);
    quien[a] = '__' + a; docDe['__' + a] = d.id;
  }

  const grupos = Object.keys(clases).map((g, i) => ({ id: uid('g'), nombre: g, etapa: /bach/i.test(g) ? 'Bachillerato' : /eso/i.test(g) ? 'ESO' : '', orden: i + 1, tutor_id: null, aula: '' }));
  const grpDe = Object.fromEntries(grupos.map(g => [g.nombre, g.id]));

  // Ocupaciones: se juntan los grupos que comparten la misma clase (p. ej. 1º Bach. A/B)
  const juntas = new Map();
  for (const s of sesiones) {
    const doc = docDe[quien[s.abrev]]; if (!doc || tramoDeCol[s.c] == null) continue;
    const k = [doc, s.d + 1, tramoDeCol[s.c], s.m, s.sub].join('|');
    if (!juntas.has(k)) juntas.set(k, { id: uid('o'), docente_id: doc, dia: s.d + 1, tramo_id: tramoDeCol[s.c], tipo: /^TUT/i.test(s.m) ? 'tutoria' : 'clase', materia: s.m, grupos: [], subgrupo: s.sub, detalle: '', aula: '' });
    const o = juntas.get(k);
    if (!o.grupos.includes(grpDe[s.grupo])) o.grupos.push(grpDe[s.grupo]);
  }
  const ocupaciones = [...juntas.values()];
  for (const [p, m] of Object.entries(marcas)) for (const [k, tipo] of Object.entries(m)) {
    const [d, c] = k.split(',').map(Number);
    if (tramoDeCol[c] == null) continue;
    ocupaciones.push({ id: uid('o'), docente_id: docDe[p], dia: d + 1, tramo_id: tramoDeCol[c], tipo, materia: '', grupos: [], subgrupo: '', detalle: '', aula: '' });
  }
  for (const o of ocupaciones) if (o.tipo === 'tutoria') { const g = grupos.find(x => x.id === o.grupos[0]); if (g) g.tutor_id = o.docente_id; }

  const materias = [...new Set(sesiones.map(s => s.m))].sort().map(m => ({ id: uid('m'), abrev: m, nombre: m, niveles: [] }));
  return { docentes, grupos, tramos, materias, ocupaciones, avisos };
}
