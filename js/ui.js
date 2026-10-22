// Utilidades de interfaz compartidas por la parte pública y la de administración.
import { DIAS, DIAS_CORTOS, TIPOS, LECTIVAS, hueMateria, ocupacionesDe, sustitutoLargo, diaSemana, hoyISO, ausenteEn, ausenciasDelDia, fechaLarga, TIPOS_EXTRA, ocExtra } from './logic.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const ICON = {
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  luna: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  candado: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  casa: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  imprimir: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
  salir: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  rayo: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  descargar: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  subir: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  lapiz: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  enviar: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>'
};
export const svg = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;

/* ---------- Tema claro/oscuro ---------- */
export function iniciarTema(boton) {
  const KEY = 'horarios-tema';
  let t = null; try { t = localStorage.getItem(KEY); } catch {}
  if (t) document.documentElement.dataset.theme = t;
  const pinta = () => {
    const oscuro = document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    boton.innerHTML = svg(oscuro ? 'sol' : 'luna');
    boton.title = oscuro ? 'Modo claro' : 'Modo oscuro';
    return oscuro;
  };
  pinta();
  boton.addEventListener('click', () => {
    const oscuro = pinta();
    const nuevo = oscuro ? 'light' : 'dark';
    document.documentElement.dataset.theme = nuevo;
    try { localStorage.setItem(KEY, nuevo); } catch {}
    pinta();
  });
}

/* ---------- Avisos y diálogos ---------- */
export function toast(msg, error = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (error ? ' error' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), error ? 5000 : 2600);
}

// Abre un diálogo. contenido: HTML. Devuelve una promesa con el valor del botón pulsado (o null).
export function modal({ titulo, contenido, botones = [{ id: 'ok', texto: 'Guardar', pri: true }], alAbrir, validar, cancelar = 'Cancelar' }) {
  return new Promise(resolve => {
    const d = document.createElement('dialog');
    d.innerHTML = `<form method="dialog">
      <div class="modal-cab"><h3>${esc(titulo)}</h3><button class="icon-btn" value="__x" aria-label="Cerrar">${svg('x')}</button></div>
      <div class="modal-cuerpo">${contenido}</div>
      <div class="modal-pie">${[{ id: '__x', texto: cancelar }, ...botones].map(b =>
        `<button class="btn ${b.pri ? 'pri' : ''} ${b.peligro ? 'peligro' : ''}" value="${b.id}">${esc(b.texto)}</button>`).join('')}</div>
    </form>`;
    document.body.appendChild(d);
    const form = d.querySelector('form');
    form.addEventListener('submit', e => {
      const v = e.submitter?.value;
      if (v && v !== '__x' && validar) {
        const err = validar(v, d);
        if (err) { e.preventDefault(); toast(err, true); return; }
      }
    });
    d.addEventListener('close', () => {
      const v = d.returnValue;
      resolve(!v || v === '__x' ? null : { boton: v, form: d });
      setTimeout(() => d.remove(), 0);
    });
    alAbrir && alAbrir(d);
    d.showModal();
  });
}
export async function confirmar(texto, ok = 'Aceptar', peligro = false) {
  const r = await modal({ titulo: 'Confirmar', contenido: `<p style="margin:0">${esc(texto)}</p>`, botones: [{ id: 'ok', texto: ok, pri: !peligro, peligro }] });
  return !!r;
}

/* ---------- Nombres ---------- */
export function nombreGrupos(ix, ids) {
  return (ids || []).map(id => ix.grp[id]?.nombre || id).join(' / ')
    .replace(/(\dº) (ESO|Bach\.) ([AB]) \/ (\dº) \2 ([AB])/g, (m, a, e, x, b, y) => a === b ? `${a} ${e} ${x}/${y}` : m);
}
export const corto = (ix, id) => ix.doc[id]?.corto || ix.doc[id]?.nombre || '—';
export const nombre = (ix, id) => ix.doc[id]?.nombre || '—';
// Grupo (o lugar escrito a mano, en las otras necesidades) de una ocupación.
export const lugarDe = (ix, o) => (o?.grupos || []).length ? nombreGrupos(ix, o.grupos) : (o?.lugar || '');
// A quién se sustituye: la persona del listado o, en las otras necesidades, lo que se haya escrito.
export const quienFalta = (ix, n, largo = false) => n.extra ? (n.extra.quien || TIPOS_EXTRA[n.extra.tipo] || '—') : (largo ? nombre : corto)(ix, n.ausente_id);
export const quienFaltaCob = (ix, c, largo = false) => quienFalta(ix, { extra: c.extra, ausente_id: c.ausente_id }, largo);
// Nivel de un grupo: «1º ESO A» → «1º ESO», «2º Bach. B» → «2º Bach.».
export const nivelGrupo = nombreGrupo => (nombreGrupo || '').replace(/\s+[A-Z]$/, '');
// Nombre completo de una materia según el curso del grupo (la misma sigla puede variar de un curso a otro).
export function nombreMateria(ix, abrev, grupos = []) {
  const filas = ix.materias.filter(m => m.abrev === abrev);
  if (!filas.length) return abrev;
  const niv = nivelGrupo(ix.grp[(grupos || [])[0]]?.nombre);
  const m = filas.find(f => (f.niveles || []).includes(niv)) || filas.find(f => !(f.niveles || []).length) || filas[0];
  return m.nombre || abrev;
}

/* ---------- Bloque de una ocupación ---------- */
export function bloqueOcupacion(ix, o, { vista = 'docente', extra = '', tachada = false } = {}) {
  const lect = LECTIVAS.has(o.tipo);
  const cls = `oc t-${o.tipo} ${lect && o.tipo === 'clase' ? 'mat' : ''} ${tachada ? 'tachada' : ''}`;
  const style = lect && o.tipo === 'clase' ? `style="--h:${hueMateria(o.materia)}"` : '';
  let titulo, linea = '';
  if (lect) {
    // En el horario de un grupo se ve el nombre completo de la materia; en el del profesorado, la abreviatura.
    const etiqueta = vista === 'grupo' ? nombreMateria(ix, o.materia || 'TUT', o.grupos) : (o.tipo === 'tutoria' && !o.materia ? 'TUT' : o.materia);
    titulo = `<span class="m" title="${esc(nombreMateria(ix, o.materia, o.grupos))}">${esc(etiqueta)}</span>`;
    if (vista === 'docente') linea = esc(nombreGrupos(ix, o.grupos));
    else linea = esc(corto(ix, o.efectivo_id || o.docente_id));
    if (o.subgrupo) linea += ` · ${esc(o.subgrupo)}`;
  } else {
    titulo = `<span class="m">${esc(TIPOS[o.tipo] || o.tipo)}</span>`;
    linea = o.detalle && o.detalle !== TIPOS[o.tipo] ? esc(o.detalle) : '';
    if (vista !== 'docente') linea = esc(corto(ix, o.docente_id)) + (linea ? ' · ' + linea : '');
  }
  return `<div class="${cls}" ${style}>${titulo}${linea ? `<div class="g">${linea}</div>` : ''}${extra}</div>`;
}

/* ---------- Horario semanal ---------- */
// tipo: 'docente' | 'grupo'. fecha: para aplicar sustituciones de larga duración (opcional).
export function horarioSemanal(db, ix, { tipo, id, fecha = null, editable = false, resaltarHoy = true }) {
  let occs;
  if (tipo === 'docente') {
    occs = ocupacionesDe(db, id, fecha);
  } else {
    occs = db.ocupaciones.filter(o => (o.grupos || []).includes(id)).map(o => {
      let ef = o.docente_id;
      if (fecha) {
        const a = db.ausencias.find(x => x.docente_id === o.docente_id && sustitutoLargo(x, fecha));
        if (a) ef = a.sustituto_id;
      }
      return { ...o, efectivo_id: ef };
    });
  }
  const hoy = resaltarHoy ? diaSemana(fecha || hoyISO()) : 0;
  let html = `<div class="scroll"><table class="horario"><thead><tr><th class="tramo"></th>${DIAS.map((d, i) =>
    `<th class="${i + 1 === hoy ? 'hoy' : ''}"><span class="hide-m">${d}</span></th>`).join('')}</tr></thead><tbody>`;
  for (const t of ix.tramos) {
    html += `<tr class="${t.lectivo ? '' : 'recreo'}"><th class="tramo"><b>${esc(t.etiqueta)}</b>${esc(t.inicio)}–${esc(t.fin)}</th>`;
    for (let dia = 1; dia <= 5; dia++) {
      const aqui = occs.filter(o => o.dia === dia && o.tramo_id === t.id);
      const contenido = aqui.map(o => {
        let extra = '';
        if (o.heredada) extra = `<span class="d">(de ${esc(corto(ix, o.titular_id))})</span>`;
        return bloqueOcupacion(ix, o, { vista: tipo, extra });
      }).join('');
      const vacia = !aqui.length;
      if (!t.lectivo && vacia && !editable) { html += '<td></td>'; continue; }
      html += `<td><div class="celda ${vacia ? 'vacia' : ''} ${editable ? 'editable' : ''}" data-dia="${dia}" data-tramo="${t.id}">${contenido}</div></td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  html += `<div class="leyenda">${['clase', 'tutoria', 'apoyo', 'coordinacion', 'no_lectiva'].map(k =>
    `<span class="t-${k}"><i></i>${TIPOS[k]}</span>`).join('')}</div>`;
  return html;
}

export function opcionesDocentes(ix, sel = '', { vacio = 'Elige…', soloActivos = false } = {}) {
  return `<option value="">${esc(vacio)}</option>` + ix.alfabetico.filter(d => !soloActivos || d.activo !== false)
    .map(d => `<option value="${d.id}" ${d.id === sel ? 'selected' : ''}>${esc(d.nombre)}</option>`).join('');
}
export function opcionesGrupos(ix, sel = '') {
  return ix.grupos.map(g => `<option value="${g.id}" ${g.id === sel ? 'selected' : ''}>${esc(g.nombre)}</option>`).join('');
}
export { DIAS, DIAS_CORTOS };

/* ---------- Tabla de sustituciones: una columna por ausente, una fila por tramo ---------- */
export function tablaSustituciones(db, ix, fecha, { columnas = 0 } = {}) {
  const aulaDe = o => o.aula || ix.grp[(o.grupos || [])[0]]?.aula || '';
  const dia = diaSemana(fecha);
  const aus = ausenciasDelDia(db, fecha);
  // Primero quienes hay que cubrir hoy; después las bajas que ya tienen sustituto/a.
  const largo = id => aus.find(a => a.docente_id === id && sustitutoLargo(a, fecha));
  const ids = [...new Set(aus.map(a => a.docente_id))].filter(id => !largo(id));
  const conSustituto = aus.filter(a => sustitutoLargo(a, fecha));
  const bajas = conSustituto.length ? `<h3>Ausencias con profesor/a sustituto</h3><ul class="lista">${conSustituto.map(a =>
    `<li><span><b>${esc(nombre(ix, a.docente_id))}</b>${a.hasta ? ` <span class="d">hasta el ${esc(fechaLarga(a.hasta).replace(/^\S+ /, ''))}</span>` : ''}</span>
      <span class="chip morado">Le sustituye ${esc(nombre(ix, sustitutoLargo(a, fecha)))}</span></li>`).join('')}</ul>` : '';
  const cobs = db.coberturas.filter(c => c.fecha === fecha);
  // Otras necesidades (otra etapa o evento): una columna por cada una, después de las ausencias del listado.
  const extras = dia ? cobs.filter(c => c.extra) : [];
  const claveExtra = c => 'x:' + (c.extra.quien || TIPOS_EXTRA[c.extra.tipo] || '');
  const cols = [...ids, ...new Set(extras.map(claveExtra))];
  if (!cols.length) return '<p class="muted small" style="margin:0">Hoy no hay ausencias que cubrir.</p>' + bajas;
  const celdaCob = (c, datos) => `<div class="sust-celda ${c?.sustituto_id ? 'ok' : 'pend'}">${datos}
          ${c?.sustituto_id ? `<span class="chip verde">Sustituye: ${esc(corto(ix, c.sustituto_id))}</span>` : '<span class="chip naranja">Pendiente</span>'}
          ${c?.nota ? `<div class="nota-hora">${esc(c.nota)}</div>` : ''}
          ${(c?.adjuntos || []).map(x => `<a class="adjunto" href="${esc(x.url)}" target="_blank" rel="noopener" download="${esc(x.nombre)}">📎 ${esc(x.nombre)}</a>`).join('')}</div>`;
  const celdaExtra = (k, t) => {
    const aqui = extras.filter(c => claveExtra(c) === k && c.tramo_id === t.id);
    if (!aqui.length) return '<td><span class="muted small">—</span></td>';
    return '<td>' + aqui.map(c => {
      const o = ocExtra(c), aula = aulaDe(o), lugar = lugarDe(ix, o);
      return celdaCob(c, `${o.materia ? `<div class="mat-n">${esc(nombreMateria(ix, o.materia, o.grupos))}</div>` : ''}
          <div class="small">${esc(lugar || 'Sin indicar')}${aula ? ` · <b>Aula ${esc(aula)}</b>` : ''}</div>`);
    }).join('') + '</td>';
  };
  const celda = (id, t) => {
    if (id.startsWith('x:')) return celdaExtra(id, t);
    const l = largo(id);
    if (!ausenteEn(db, id, fecha, t.id)) return '<td><span class="muted small">Presente</span></td>';
    const ocs = ocupacionesDe(db, id, fecha, dia).filter(o => o.tramo_id === t.id);
    if (!ocs.length) return '<td><span class="muted small">—</span></td>';
    return '<td>' + ocs.map(o => {
      if (!LECTIVAS.has(o.tipo)) return `<div class="muted small">${esc(TIPOS[o.tipo])}${o.detalle && o.detalle !== TIPOS[o.tipo] ? ' · ' + esc(o.detalle) : ''}${l ? '' : ' <i>(no se cubre)</i>'}</div>`;
      const aula = aulaDe(o);
      const datos = `<div class="mat-n">${esc(nombreMateria(ix, o.materia, o.grupos))}</div>
          <div class="small">${esc(nombreGrupos(ix, o.grupos))}${o.subgrupo ? ' · ' + esc(o.subgrupo) : ''}${aula ? ` · <b>Aula ${esc(aula)}</b>` : ''}</div>`;
      if (l) return `<div class="sust-celda larga">${datos}<span class="chip morado">${esc(corto(ix, sustitutoLargo(l, fecha)))} (baja)</span></div>`;
      return celdaCob(cobs.find(x => x.ocupacion_id === o.id && x.tramo_id === t.id), datos);
    }).join('') + '</td>';
  };
  const notasDe = id => id.startsWith('x:')
    ? [...new Set(extras.filter(c => claveExtra(c) === id).map(c => c.extra.nota).filter(Boolean))]
    : aus.filter(a => a.docente_id === id).map(a => a.nota).filter(Boolean);
  // Una tabla para un grupo de ausentes: nombres (todos a la misma altura), anotaciones en su propia fila y una fila por tramo.
  const tabla = grupo => {
    const cab = grupo.map(id => {
      if (id.startsWith('x:')) {
        const x = extras.find(c => claveExtra(c) === id).extra;
        return `<th><span class="aus-nombre">${esc(id.slice(2))}</span><span class="muted small">${esc(TIPOS_EXTRA[x.tipo] || '')}</span></th>`;
      }
      const parcial = aus.filter(a => a.docente_id === id).every(a => a.tramos && a.tramos.length);
      return `<th><span class="aus-nombre">${esc(nombre(ix, id))}</span><span class="muted small">${parcial ? 'Algunas horas' : 'Todo el día'}</span></th>`;
    }).join('');
    const notas = grupo.some(id => notasDe(id).length)
      ? `<tr class="fila-notas"><th class="tramo"><b>Anotaciones</b></th>${grupo.map(id => notasDe(id).length
        ? `<td><div class="nota-ausencia">${esc(notasDe(id).join(' · '))}</div></td>` : '<td></td>').join('')}</tr>` : '';
    const filas = ix.lectivos.map(t => `<tr><th class="tramo"><b>${esc(t.etiqueta)}</b>${esc(t.inicio)}–${esc(t.fin)}</th>${grupo.map(id => celda(id, t)).join('')}</tr>`).join('');
    return `<div class="scroll"><table class="tabla-sust" style="width:${84 + grupo.length * 240}px"><colgroup><col style="width:84px">${grupo.map(() => '<col style="width:240px">').join('')}</colgroup>
    <thead><tr><th class="tramo"></th>${cab}</tr></thead><tbody>${notas}${filas}</tbody></table></div>`;
  };
  // columnas: como mucho tantos ausentes por tabla (en la imagen para Teams, para que no salga demasiado ancha)
  const grupos = [];
  for (let k = 0; k < cols.length; k += columnas || cols.length) grupos.push(cols.slice(k, k + (columnas || cols.length)));
  return grupos.map(tabla).join('<div class="sep-tablas"></div>') + bajas;
}

/* ---------- Impresión con plantilla corporativa ---------- */
// Cualquier botón con data-imprimir imprime el bloque (panel o apartado) en el que está, con cabecera
// (logo, título, fecha y curso) y pie del colegio, ajustado a una página completa (o dos si no cabe).
const MM = 96 / 25.4;
const MARGEN = { arriba: 12, lados: 12, abajo: 16 };
const CENTRO = 'Escuelas Salesianas María Auxiliadora · Nervión (Sevilla)';

export function activarImpresion(datosCurso = () => '') {
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-imprimir]');
    if (!b) return;
    e.preventDefault();
    const bloque = b.closest('details.plegable, .panel');
    if (!bloque) return print();
    const cuerpo = bloque.matches('details') ? bloque.querySelector('.plegable-cuerpo') : bloque;
    const h2 = bloque.querySelector('summary h2, h2');
    imprimirBloque(cuerpo, {
      titulo: b.dataset.titulo || h2?.textContent.trim() || document.title,
      subtitulo: b.dataset.sub || '',
      curso: datosCurso()
    });
  });
}

export function imprimirBloque(origen, { titulo, subtitulo = '', curso = '' }) {
  document.getElementById('impresion')?.remove();
  document.getElementById('impresion-css')?.remove();

  // Copia limpia del contenido: sin botones ni barras, y con los desplegables convertidos en texto.
  const copia = origen.cloneNode(true);
  copia.querySelectorAll('select').forEach((s, i) => {
    const real = origen.querySelectorAll('select')[i];
    const t = document.createElement('span'); t.className = 'imp-valor';
    t.textContent = real && real.value ? real.selectedOptions[0]?.textContent.split(' · ')[0] : '—';
    s.replaceWith(t);
  });
  copia.querySelectorAll('input[type=text], input[type=date], input[type=email], input[type=time]').forEach(inp => {
    const t = document.createElement('span'); t.textContent = inp.value; inp.replaceWith(t);
  });
  copia.querySelectorAll('.barra, .no-imprimir, button:not(.chip):not(.oc), .info-btn, .migas, summary').forEach(x => x.remove());
  copia.querySelectorAll('h2').forEach((h, i) => { if (i === 0 && h.textContent.trim() === titulo) h.remove(); });
  copia.querySelectorAll('details').forEach(d => d.open = true);

  const hoy = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  const cont = document.createElement('div');
  cont.id = 'impresion';
  cont.innerHTML = `<header class="imp-cab">
      <img src="logo.svg" alt="">
      <div class="imp-tit"><b>${esc(titulo)}</b>${subtitulo ? `<span>${esc(subtitulo)}</span>` : ''}</div>
      <div class="imp-cen">${esc(CENTRO)}<br>${curso ? esc(curso) + ' · ' : ''}${esc(hoy)}</div>
    </header>`;
  const cuerpo = document.createElement('div'); cuerpo.className = 'imp-cuerpo';
  cuerpo.appendChild(copia);
  cont.appendChild(cuerpo);
  document.body.appendChild(cont);

  // Se busca la escala con la que el contenido llena la página (ampliando o reduciendo, hasta ×1,8),
  // probando en vertical y en horizontal, y nos quedamos con la que mejor aprovecha la hoja.
  const ancho = o => ((o === 'landscape' ? 297 : 210) - 2 * MARGEN.lados) * MM;
  const alto = o => ((o === 'landscape' ? 210 : 297) - MARGEN.arriba - MARGEN.abajo) * MM * 0.97;
  cont.classList.add('midiendo');
  const cab = cont.querySelector('.imp-cab');
  const cabe = (o, s, paginas) => {
    cont.style.width = ancho(o) + 'px';
    cuerpo.style.zoom = 1; cuerpo.style.width = (ancho(o) / s) + 'px';
    const hCab = cab.offsetHeight + 12;
    return cuerpo.scrollHeight * s + hCab <= alto(o) * paginas && cuerpo.scrollWidth <= ancho(o) / s + 2;
  };
  const ajustar = (o, paginas) => {
    let lo = 0.3, hi = 1.8;
    if (cabe(o, hi, paginas)) return hi;
    if (!cabe(o, lo, paginas)) return lo;
    for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (cabe(o, m, paginas)) lo = m; else hi = m; }
    return lo;
  };
  let orient = 'portrait', paginas = 1;
  let s = ajustar('portrait', 1);
  const sH = ajustar('landscape', 1);
  if (sH > s * 1.05) { orient = 'landscape'; s = sH; }
  if (s < 0.62) { // no cabe bien en una: dos páginas
    paginas = 2;
    const sV2 = ajustar('portrait', 2), sH2 = ajustar('landscape', 2);
    if (sH2 > sV2 * 1.05) { orient = 'landscape'; s = sH2; } else { orient = 'portrait'; s = sV2; }
  }
  s = Math.max(0.45, s); // con muchísimo contenido se deja seguir en más páginas
  cont.style.width = ancho(orient) + 'px';
  cuerpo.style.width = (ancho(orient) / s) + 'px';
  cuerpo.style.zoom = s;
  cont.classList.remove('midiendo');
  cont.dataset.paginas = paginas;
  cont.dataset.escala = s.toFixed(2);

  const css = document.createElement('style');
  css.id = 'impresion-css';
  css.textContent = `@page { size: A4 ${orient}; margin: ${MARGEN.arriba}mm ${MARGEN.lados}mm ${MARGEN.abajo}mm;
      @bottom-left { content: "${CENTRO}"; font: 8pt "Fira Sans", sans-serif; color: #64748B; }
      @bottom-right { content: "Página " counter(page) " de " counter(pages); font: 8pt "Fira Sans", sans-serif; color: #64748B; } }`;
  document.head.appendChild(css);
  const limpiar = () => { cont.remove(); css.remove(); window.removeEventListener('afterprint', limpiar); };
  window.addEventListener('afterprint', limpiar);
  // Esperar a que cargue el logo antes de abrir el diálogo de impresión
  const logo = cont.querySelector('img');
  const ir = () => setTimeout(() => print(), 50);
  if (logo.complete) ir(); else { logo.onload = ir; logo.onerror = ir; }
}

/* ---------- Imagen del parte (para mandarla a Teams) ---------- */
// Misma plantilla corporativa que al imprimir, pero como imagen PNG: siempre en colores claros y al ancho de la tabla.
const HTML_A_IMAGEN = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm';
export async function imagenParte(html, { titulo, subtitulo = '', curso = '' }) {
  const { toBlob } = await import(HTML_A_IMAGEN);
  const hoy = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  const cont = document.createElement('div');
  cont.className = 'captura-parte';
  cont.innerHTML = `<header class="imp-cab">
      <img src="logo.svg" alt="">
      <div class="imp-tit"><b>${esc(titulo)}</b>${subtitulo ? `<span>${esc(subtitulo)}</span>` : ''}</div>
      <div class="imp-cen">${esc(CENTRO)}<br>${curso ? esc(curso) + ' · ' : ''}${esc(hoy)}</div>
    </header><div class="imp-cuerpo">${html}</div>`;
  // Se pinta fuera de la pantalla dentro de un contenedor (si no, la imagen copiaría también esa posición y saldría vacía)
  const fuera = document.createElement('div');
  fuera.className = 'captura-fuera';
  fuera.appendChild(cont);
  document.body.appendChild(fuera);
  try {
    const logo = cont.querySelector('img');
    if (!logo.complete) await new Promise(ok => { logo.onload = logo.onerror = ok; });
    await document.fonts?.ready;
    return await toBlob(cont, { pixelRatio: 2, backgroundColor: '#ffffff' });
  } finally { fuera.remove(); }
}
