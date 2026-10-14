// Utilidades de interfaz compartidas por la parte pública y la de administración.
import { DIAS, DIAS_CORTOS, TIPOS, LECTIVAS, hueMateria, ocupacionesDe, sustitutoLargo, diaSemana, hoyISO } from './logic.js';

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
  lapiz: '<path d="M4 20h4L19 9l-4-4L4 16z"/>'
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
