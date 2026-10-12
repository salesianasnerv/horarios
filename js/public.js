// Parte pública: Hoy (avisos, sustituciones, ahora y recreos), Horarios, Sábana, Sustituciones y Recreos.
import * as D from './data.js';
import {
  DIAS, TIPOS, LECTIVAS, CATEGORIAS, indices, hoyISO, diaSemana, sumarDias, fechaLarga, tramoActual,
  estadoOcupacion, ocupacionesDe, ausenteEn, ausenciasDelDia, sustitutoLargo, avisosDelDia
} from './logic.js';
import { $, $$, esc, svg, activarImpresion, horarioSemanal, bloqueOcupacion, nombreGrupos, corto, nombre, nombreMateria, opcionesDocentes, opcionesGrupos, modal } from './ui.js';

let db, ix;
const estado = { vista: 'hoy', fecha: hoyISO(), tramo: '', tipo: 'docente', id: '', sabDia: 0, sabModo: 'docentes', susFecha: hoyISO() };
const VISTAS = ['hoy', 'horarios', 'sabana', 'sustituciones', 'recreos'];

async function cargar() {
  db = await D.cargarCurso();
  ix = indices(db);
  $('#curso').textContent = db.curso ? `Curso ${db.curso.nombre}` : '';
}

/* ---------- Navegación ---------- */
function leerHash() {
  let [v, a, b] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  if (v === 'ahora') v = 'hoy';
  if (VISTAS.includes(v)) estado.vista = v;
  if (v === 'horarios' && a) { estado.tipo = a === 'grupo' ? 'grupo' : 'docente'; estado.id = b || ''; }
}
function irA(v, extra = '') {
  const h = '#/' + v + (extra ? '/' + extra : '');
  if (location.hash !== h) history.replaceState(null, '', h);
  estado.vista = v; pintar();
}
function pintar() {
  $$('#tabs button').forEach(b => b.classList.toggle('activa', b.dataset.v === estado.vista));
  if (!db.curso || !ix.tramos.length) { $('#vista').innerHTML = '<p class="vacio">Todavía no se han publicado los horarios de este curso.</p>'; return; }
  ({ hoy: vHoy, horarios: vHorarios, sabana: vSabana, sustituciones: vSustituciones, recreos: vRecreos })[estado.vista]();
}

const hue = m => { let h = 0; for (const ch of m || '') h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
const aulaDe = o => o.aula || ix.grp[(o.grupos || [])[0]]?.aula || '';

/* =====================================================================
   HOY
   ===================================================================== */
let reloj = null;
function vHoy() {
  const v = $('#vista');
  const fecha = estado.fecha, dia = diaSemana(fecha);
  const esHoy = fecha === hoyISO();
  const avisos = avisosDelDia(db, fecha);
  const nAus = new Set(ausenciasDelDia(db, fecha).filter(a => !sustitutoLargo(a, fecha)).map(a => a.docente_id)).size;
  const nLargas = ausenciasDelDia(db, fecha).filter(a => sustitutoLargo(a, fecha)).length;

  let html = `<div class="panel hoy-cab">
    <div class="reloj"><span class="hora" id="hora"></span><span class="tramo-act">${esc(fechaLarga(fecha))}</span>
      ${esHoy ? '' : '<span class="chip naranja">No es hoy</span>'}</div>
    <div class="barra" style="margin:10px 0 0">
      <button class="btn" id="h-ant" aria-label="Día anterior">‹</button>
      <input type="date" id="h-fecha" value="${fecha}" aria-label="Fecha">
      <button class="btn" id="h-sig" aria-label="Día siguiente">›</button>
      ${esHoy ? '' : '<button class="btn" id="h-hoy">Volver a hoy</button>'}
      <span class="sep"></span>
      <nav class="saltos" aria-label="Ir a">
        <a href="#s-avisos" class="chip ${avisos.length ? 'rojo' : ''}">Avisos${avisos.length ? ` (${avisos.length})` : ''}</a>
        <a href="#s-sust" class="chip ${nAus ? 'naranja' : ''}">Sustituciones${nAus ? ` (${nAus})` : ''}</a>
        <a href="#s-ahora" class="chip azul">Ahora</a>
        <a href="#s-recreos" class="chip verde">Recreos</a>
      </nav>
    </div></div>`;

  if (!dia) {
    v.innerHTML = html + `<div class="panel"><p class="vacio">Ese día es fin de semana: no hay clases.</p></div>`;
    enlazarHoy(); return;
  }

  // Cada apartado es plegable y empieza cerrado; lo que se abra a mano se respeta mientras se navega.
  const cobs = db.coberturas.filter(c => c.fecha === fecha);
  const pendientes = nAus ? contarPendientes(fecha) : 0;
  const tr = tramoActual(ix.tramos);
  const enRecreo = esHoy && tr.estado === 'en_curso' && !tr.tramo.lectivo;

  html += plegable('s-avisos', 'Avisos', 'rojo',
    avisos.length ? `<span class="chip rojo">${avisos.length} ${avisos.length === 1 ? 'aviso' : 'avisos'}</span>` : '<span class="chip">Sin avisos</span>',
    avisos.length > 0,
    avisos.length
      ? `<ul class="lista avisos">${avisos.map(a => `<li class="${a.importante ? 'importante' : ''}"><span>${a.importante ? '<b>Importante · </b>' : ''}${esc(a.texto)}</span></li>`).join('')}</ul>`
      : '<p class="muted small" style="margin:0">No hay avisos para este día.</p>');

  html += plegable('s-sust', 'Sustituciones', 'naranja',
    (nAus ? `<span class="chip naranja">${nAus} ${nAus === 1 ? 'ausencia' : 'ausencias'}</span>${pendientes ? `<span class="chip rojo">${pendientes} sin cubrir</span>` : cobs.length ? '<span class="chip verde">Todo cubierto</span>' : ''}` : '<span class="chip">Nada que cubrir</span>') + (nLargas ? `<span class="chip morado">${nLargas} con sustituto/a</span>` : ''),
    nAus > 0,
    `<div class="barra no-imprimir" style="justify-content:flex-end;margin:0 0 6px"><button class="btn mini" data-imprimir data-titulo="Parte de sustituciones" data-sub="${esc(fechaLarga(fecha))}">${svg('imprimir')} Imprimir</button></div>${tablaSustituciones(fecha)}`);

  html += plegable('s-ahora', 'Ahora', 'azul', fueraDeJornada(fecha) ? '<span class="chip">Fuera del horario lectivo</span>' : `<span class="chip azul">${esc(tr.tramo?.etiqueta || '')}</span>`, true,
    `<div id="s-ahora-cuerpo">${seccionAhora(fecha, dia)}</div>`, 'sin-panel');

  html += plegable('s-recreos', `Recreo · ${esc(DIAS[dia - 1].toLowerCase())}`, 'verde', enRecreo ? '<span class="chip verde">Ahora</span>' : '', enRecreo,
    recreosDelDia(dia, fecha));

  v.innerHTML = html;
  enlazarHoy();
}

function enlazarHoy() {
  const tic = () => { const h = $('#hora'); if (h) h.textContent = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); };
  tic();
  clearInterval(reloj);
  const clave = () => { const t = tramoActual(ix.tramos); return `${t.tramo?.id}|${t.estado}`; };
  let ultimo = clave();
  reloj = setInterval(() => {
    if (estado.vista !== 'hoy') return clearInterval(reloj);
    tic();
    const k = clave();
    // Al cambiar de tramo (o al empezar o acabar la jornada) se repinta «Hoy» sin mover la página.
    if (k !== ultimo && !estado.tramo) { ultimo = k; const y = scrollY; vHoy(); scrollTo(0, y); }
  }, 20000);
  const ir = f => { estado.fecha = f; estado.tramo = ''; vHoy(); };
  $('#h-fecha').onchange = e => ir(e.target.value || hoyISO());
  $('#h-ant').onclick = () => ir(sumarDias(estado.fecha, -1));
  $('#h-sig').onclick = () => ir(sumarDias(estado.fecha, 1));
  const h = $('#h-hoy'); if (h) h.onclick = () => ir(hoyISO());
  $$('.saltos a').forEach(a => a.onclick = e => {
    e.preventDefault();
    const s = document.querySelector(a.getAttribute('href'));
    if (s) { s.open = true; plegados[s.id] = true; s.scrollIntoView({ behavior: 'smooth' }); }
  });
  $$('details.plegable').forEach(d => d.addEventListener('toggle', () => { plegados[d.id] = d.open; }));
  enlazarAhora();
}

// Estado abierto/cerrado elegido a mano (se mantiene mientras se navega por la página).
const plegados = {};
// Todos empiezan plegados; los que tienen algo se resaltan con un borde de color.
function plegable(id, titulo, color, chips, tieneAlgo, cuerpo, extra = '') {
  const abierto = id in plegados ? plegados[id] : false;
  return `<details class="panel plegable ${extra} ${tieneAlgo && id !== 's-ahora' ? 'resaltar r-' + color : ''}" id="${id}" ${abierto ? 'open' : ''}>
    <summary><h2 class="${color}">${titulo}</h2><span class="chips">${chips}</span><span class="flechita" aria-hidden="true"></span></summary>
    <div class="plegable-cuerpo">${cuerpo}</div></details>`;
}
function contarPendientes(fecha) {
  const dia = diaSemana(fecha); let n = 0;
  const cobs = db.coberturas.filter(c => c.fecha === fecha);
  for (const o of db.ocupaciones) if (o.dia === dia && LECTIVAS.has(o.tipo) && estadoOcupacion(db, o, fecha, cobs).estado === 'sin_cubrir') n++;
  return n;
}

/* ---------- Tabla de sustituciones: una columna por ausente, una fila por tramo ---------- */
function tablaSustituciones(fecha) {
  const dia = diaSemana(fecha);
  const aus = ausenciasDelDia(db, fecha);
  // Primero quienes hay que cubrir hoy; después las bajas que ya tienen sustituto/a.
  const largo = id => aus.find(a => a.docente_id === id && sustitutoLargo(a, fecha));
  const ids = [...new Set(aus.map(a => a.docente_id))].filter(id => !largo(id));
  const conSustituto = aus.filter(a => sustitutoLargo(a, fecha));
  const bajas = conSustituto.length ? `<h3>Ausencias con profesor/a sustituto</h3><ul class="lista">${conSustituto.map(a =>
    `<li><span><b>${esc(nombre(ix, a.docente_id))}</b>${a.hasta ? ` <span class="d">hasta el ${esc(fechaLarga(a.hasta).replace(/^\S+ /, ''))}</span>` : ''}</span>
      <span class="chip morado">Le sustituye ${esc(nombre(ix, sustitutoLargo(a, fecha)))}</span></li>`).join('')}</ul>` : '';
  if (!ids.length) return '<p class="muted small" style="margin:0">Hoy no hay ausencias que cubrir.</p>' + bajas;
  const cobs = db.coberturas.filter(c => c.fecha === fecha);
  const filas = ix.lectivos.map(t => {
    const celdas = ids.map(id => {
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
        const c = cobs.find(x => x.ocupacion_id === o.id && x.tramo_id === t.id);
        return `<div class="sust-celda ${c?.sustituto_id ? 'ok' : 'pend'}">${datos}
            ${c?.sustituto_id ? `<span class="chip verde">Sustituye: ${esc(corto(ix, c.sustituto_id))}</span>` : '<span class="chip naranja">Pendiente</span>'}
            ${c?.nota ? `<div class="nota-hora">${esc(c.nota)}</div>` : ''}
            ${(c?.adjuntos || []).map(x => `<a class="adjunto" href="${esc(x.url)}" target="_blank" rel="noopener" download="${esc(x.nombre)}">📎 ${esc(x.nombre)}</a>`).join('')}</div>`;
      }).join('') + '</td>';
    }).join('');
    return `<tr><th class="tramo"><b>${esc(t.etiqueta)}</b>${esc(t.inicio)}–${esc(t.fin)}</th>${celdas}</tr>`;
  }).join('');
  const cab = ids.map(id => {
    const as = aus.filter(a => a.docente_id === id);
    const l = largo(id);
    const parcial = as.every(a => a.tramos && a.tramos.length);
    const notas = as.map(a => a.nota).filter(Boolean);
    return `<th class="${l ? 'col-larga' : ''}"><span class="aus-nombre">${esc(nombre(ix, id))}</span>
      <span class="muted small">${l ? `Baja · le sustituye <b>${esc(nombre(ix, sustitutoLargo(l, fecha)))}</b>` : parcial ? 'Algunas horas' : 'Todo el día'}</span>
      ${notas.length && !l ? `<span class="small">${esc(notas.join(' · '))}</span>` : ''}</th>`;
  }).join('');
  return `<div class="scroll"><table class="tabla-sust" style="width:${84 + ids.length * 240}px"><colgroup><col style="width:84px">${ids.map(() => '<col style="width:240px">').join('')}</colgroup>
    <thead><tr><th class="tramo"></th>${cab}</tr></thead><tbody>${filas}</tbody></table></div>${bajas}`;
}

/* ---------- Ahora: clases, dónde está y profesorado fuera de aula ---------- */
// ¿Estamos fuera de la jornada? (solo cuenta para hoy y si no se ha elegido un tramo a mano)
function fueraDeJornada(fecha) {
  if (fecha !== hoyISO()) return false;
  const ta = tramoActual(ix.tramos);
  return ta.estado === 'terminado' || (ta.estado === 'siguiente' && ta.tramo === ix.tramos[0]);
}

function seccionAhora(fecha, dia) {
  const auto = !estado.tramo && fecha === hoyISO();
  const ta = tramoActual(ix.tramos);
  const tramo = estado.tramo ? ix.tramo[estado.tramo] : ta.tramo;
  const etiqueta = auto ? (ta.estado === 'en_curso' ? 'En curso' : 'Siguiente') : 'Seleccionado';
  const cobs = db.coberturas.filter(c => c.fecha === fecha);
  const selector = `<select id="a-tramo" aria-label="Tramo"><option value="">${fueraDeJornada(fecha) ? 'Elige un tramo…' : 'Tramo actual'}</option>${ix.tramos.map(t =>
      `<option value="${t.id}" ${t.id === estado.tramo ? 'selected' : ''}>${esc(t.etiqueta)} (${esc(t.inicio)}–${esc(t.fin)})</option>`).join('')}</select>`;
  // Fuera del horario lectivo (antes de la 1ª o después de la última) no se muestra ninguna hora.
  if (!estado.tramo && fueraDeJornada(fecha)) {
    const lista = ix.tramos;
    return `<div class="panel"><div class="barra" style="margin-bottom:10px"><span class="tramo-act">Fuera del horario lectivo</span>
      <span class="chip">${ta.estado === 'terminado' ? 'La jornada ha terminado' : `Empieza a las ${esc(lista[0]?.inicio || '')}`}</span>
      <span class="sep"></span>${selector}</div>
      <p class="muted small" style="margin:0">El horario lectivo es de ${esc(lista[0]?.inicio || '')} a ${esc(lista[lista.length - 1]?.fin || '')}. Elige un tramo para ver qué pasa a esa hora.</p></div>`;
  }

  const cab = `<div class="barra" style="margin-bottom:10px">
    <span class="tramo-act">${esc(tramo.etiqueta)} · ${esc(tramo.inicio)}–${esc(tramo.fin)}</span><span class="chip azul">${etiqueta}</span>
    <span class="sep"></span>${selector}</div>`;

  let clases;
  if (!tramo.lectivo) {
    clases = `<p class="muted">Es la hora del recreo. <a href="#s-recreos" class="ir-recreos">Ver quién vigila cada zona</a>.</p>`;
  } else {
    let alertas = 0;
    const tarjetas = ix.grupos.map(g => {
      const enGrupo = db.ocupaciones.filter(o => o.dia === dia && o.tramo_id === tramo.id && (o.grupos || []).includes(g.id));
      const ocs = enGrupo.filter(o => LECTIVAS.has(o.tipo));
      const apoyos = enGrupo.filter(o => o.tipo === 'apoyo' && !ausenteEn(db, o.docente_id, fecha, tramo.id) &&
        !cobs.some(c => c.tramo_id === tramo.id && c.sustituto_id === o.docente_id));
      if (!ocs.length) return `<div class="tarjeta-g"><h4>${esc(g.nombre)}</h4><span class="muted small">Sin clase</span></div>`;
      let alerta = false;
      const filas = ocs.map(o => {
        const e = estadoOcupacion(db, o, fecha, cobs);
        let extra = '', quien = corto(ix, o.docente_id);
        if (e.estado === 'sustituto_largo') { quien = corto(ix, e.docente_id); extra = `<span class="d">sustituye a ${esc(corto(ix, o.docente_id))}</span>`; }
        else if (e.estado === 'cubierta') { extra = `<span class="sus ok">Sustituye: ${esc(corto(ix, e.docente_id))}</span><span class="d">falta ${esc(corto(ix, e.ausente_id))}</span>`; quien = ''; }
        else if (e.estado === 'sin_cubrir') { alerta = true; extra = `<span class="sus">Sin cubrir · falta ${esc(corto(ix, e.ausente_id))}</span>`; quien = ''; }
        const aula = aulaDe(o);
        return `<div class="oc t-clase mat" style="--h:${hue(o.materia)}"><span class="m" title="${esc(nombreMateria(ix, o.materia, o.grupos))}">${esc(o.materia)}</span>
          <div class="g">${[quien, o.subgrupo, aula ? 'Aula ' + aula : ''].filter(Boolean).map(esc).join(' · ')}</div>${extra}</div>`;
      }).join('');
      if (alerta) alertas++;
      const ap = apoyos.length ? `<div class="small apoyo-en">Apoyo: ${apoyos.map(o => esc(corto(ix, o.docente_id))).join(', ')}</div>` : '';
      return `<div class="tarjeta-g ${alerta ? 'alerta' : ''}"><h4>${esc(g.nombre)}</h4>${filas}${ap}</div>`;
    }).join('');
    clases = `<h3 style="margin-top:0">Clases ${alertas ? `<span class="chip rojo">${alertas} sin cubrir</span>` : ''}</h3><div class="grupos-ahora">${tarjetas}</div>`;
  }

  let fuera = '';
  if (tramo.lectivo) {
    const grupos = {};
    for (const d of ix.docentes) {
      if (d.activo === false) continue;
      if (ausenteEn(db, d.id, fecha, tramo.id)) continue;
      const delDia = ocupacionesDe(db, d.id, fecha, dia);
      const aqui = delDia.filter(o => o.tramo_id === tramo.id);
      if (aqui.some(o => LECTIVAS.has(o.tipo))) continue;
      if (cobs.some(c => c.tramo_id === tramo.id && c.sustituto_id === d.id)) continue;
      const o = aqui[0];
      if (!o) continue; // los huecos libres son tiempo personal: no se muestran
      const cat = o.tipo;
      let det = o?.detalle || '';
      if (o?.tipo === 'apoyo') det = (o.grupos || []).length ? `en ${nombreGrupos(ix, o.grupos)}${aulaDe(o) ? ' · Aula ' + aulaDe(o) : ''}${materiaApoyo(o)}` : (det || 'clase sin indicar');
      (grupos[cat] = grupos[cat] || []).push({ d, det });
    }
    const orden = ['no_lectiva', 'guardia', 'apoyo', 'coordinacion', 'otro'];
    fuera = `<div class="panel"><h2 class="naranja">Profesorado fuera de aula</h2>${orden.filter(k => grupos[k]).map(k => `<h3>${esc(CATEGORIAS[k])}</h3><ul class="lista">${grupos[k].map(x =>
      `<li><span>${esc(x.d.corto || x.d.nombre)}</span><span class="d">${esc(x.det)}</span></li>`).join('')}</ul>`).join('') || '<p class="muted small">Nadie fuera de aula en este tramo.</p>'}</div>`;
  }

  return `<div class="cols">
    <div class="panel">${cab}${clases}</div>
    <div>
      <div class="panel"><h2 class="verde">¿Dónde está…?</h2>
        <select id="a-busca" style="width:100%">${opcionesDocentes(ix, '', { vacio: 'Elige a un compañero/a', soloActivos: true })}</select>
        <div id="a-res" style="margin-top:10px"></div></div>
      ${fuera}
    </div></div>`;
}
// «3º ESO B Inglés» → « · Inglés» (la materia del apoyo, si viene en el detalle)
function materiaApoyo(o) {
  const m = (o.detalle || '').replace(/^(PT\s*)?\d\s*º\s*(ESO|Bach\.?)\s*[AB](\s*\/\s*[AB])?[.\s/]*/i, '').trim();
  return m ? ` · ${m}` : '';
}

function refrescarAhora() {
  const s = $('#s-ahora-cuerpo'); if (!s) return;
  s.innerHTML = seccionAhora(estado.fecha, diaSemana(estado.fecha));
  enlazarAhora();
}
function enlazarAhora() {
  const sel = $('#a-tramo'); if (sel) sel.onchange = e => { estado.tramo = e.target.value; refrescarAhora(); };
  const ir = $('.ir-recreos'); if (ir) ir.onclick = e => { e.preventDefault(); const r = $('#s-recreos'); r.open = true; plegados['s-recreos'] = true; r.scrollIntoView({ behavior: 'smooth' }); };
  const b = $('#a-busca');
  if (b) b.onchange = e => { const id = e.target.value; $('#a-res').innerHTML = id ? dondeEsta(id) : ''; };
}

function dondeEsta(id) {
  const fecha = estado.fecha, dia = diaSemana(fecha);
  const tramo = estado.tramo ? ix.tramo[estado.tramo] : tramoActual(ix.tramos).tramo;
  const aus = ausenteEn(db, id, fecha, tramo.id);
  if (aus) {
    const sl = sustitutoLargo(aus, fecha);
    return `<div class="aviso error">Ausente${sl ? ` · le sustituye ${esc(nombre(ix, sl))}` : ''}.</div>`;
  }
  const cob = db.coberturas.find(c => c.fecha === fecha && c.tramo_id === tramo.id && c.sustituto_id === id);
  if (cob) {
    const o = ix.oc[cob.ocupacion_id];
    const aula = o ? aulaDe(o) : '';
    return `<div class="aviso info">Sustituyendo en <b>${esc(nombreGrupos(ix, o?.grupos))}</b>${aula ? ` (aula ${esc(aula)})` : ''} · ${esc(nombreMateria(ix, o?.materia, o?.grupos))}, a ${esc(corto(ix, cob.ausente_id))}.</div>`;
  }
  const aqui = ocupacionesDe(db, id, fecha, dia).filter(o => o.tramo_id === tramo.id);
  if (aqui.length) return aqui.map(o => bloqueOcupacion(ix, o, { vista: 'docente', extra: aulaDe(o) ? `<div class="g">Aula ${esc(aulaDe(o))}</div>` : '' })).join('') +
    `<p class="small" style="margin:8px 0 0"><a href="#/horarios/docente/${id}">Ver su horario completo</a></p>`;
  if (!tramo.lectivo) {
    const r = db.turnos_recreo.filter(t => t.dia === dia && t.docente_id === id);
    if (r.length) return r.map(t => `<div class="oc t-otro"><span class="m">Recreo</span><div class="g">${esc(ix.zona[t.zona_id]?.patio)} · ${esc(ix.zona[t.zona_id]?.nombre)}</div></div>`).join('');
  }
  return `<p class="muted small">Sin ocupación en este tramo. <a href="#/horarios/docente/${id}">Ver horario</a></p>`;
}

/* ---------- Recreos: ESO y Bachillerato por separado ---------- */
const esBach = patio => /bach/i.test(patio || '');
function patios() {
  const zonas = [...db.zonas_recreo].sort((a, b) => a.orden - b.orden);
  const lista = [];
  for (const z of zonas) {
    let p = lista.find(x => x.nombre === z.patio);
    if (!p) lista.push(p = { nombre: z.patio, zonas: [] });
    p.zonas.push(z);
  }
  return lista;
}
function recreosDelDia(dia, fecha) {
  const recreo = ix.tramos.find(x => !x.lectivo)?.id;
  return `<div class="patios">${patios().map(p => `<div class="patio ${esBach(p.nombre) ? 'bach' : 'eso'}">
    <h3 class="patio-t">${esc(p.nombre)}</h3><ul class="lista">${p.zonas.map(z => {
      const ts = db.turnos_recreo.filter(t => t.zona_id === z.id && t.dia === dia);
      const nombres = ts.map(t => {
        const aus = ausenteEn(db, t.docente_id, fecha, recreo);
        const sl = aus && sustitutoLargo(aus, fecha);
        if (sl) return `<span class="chip ${esBach(p.nombre) ? 'verde' : 'azul'}" title="Sustituye a ${esc(nombre(ix, t.docente_id))}">${esc(corto(ix, sl))} (por ${esc(corto(ix, t.docente_id))})</span>`;
        return `<span class="chip ${aus ? 'rojo' : esBach(p.nombre) ? 'verde' : 'azul'}" title="${esc(t.nota || '')}">${esc(corto(ix, t.docente_id))}${aus ? ' · ausente' : ''}${t.nota ? ' *' : ''}</span>`;
      }).join(' ');
      return `<li style="align-items:flex-start"><span><b>${esc(z.nombre)}</b>${botonInfo(z)}</span><span class="chips" style="justify-content:flex-end">${nombres || '<span class="d">—</span>'}</span></li>`;
    }).join('')}</ul></div>`).join('')}</div>`;
}

function botonInfo(z) {
  return z.descripcion ? `<button class="info-btn" data-info="${z.id}" title="${esc(z.descripcion)}" aria-label="Qué implica esta zona">i</button>` : '';
}
// Al pulsar la «i» de una zona se muestran sus indicaciones.
document.addEventListener('click', e => {
  const b = e.target.closest('[data-info]');
  if (!b) return;
  const z = ix.zona[b.dataset.info];
  modal({ titulo: z.nombre, contenido: `<p class="muted small" style="margin:0">${esc(z.patio)}</p><p style="margin:0">${esc(z.descripcion)}</p>`, botones: [], cancelar: 'Cerrar' });
});

/* ---------- HORARIOS ---------- */
function vHorarios() {
  const v = $('#vista');
  if (!estado.id) estado.id = estado.tipo === 'docente' ? (ix.docentes[0]?.id || '') : (ix.grupos[0]?.id || '');
  const opciones = estado.tipo === 'docente'
    ? ix.docentes.filter(d => d.activo !== false).map(d => `<option value="${d.id}" ${d.id === estado.id ? 'selected' : ''}>${esc(d.nombre)}</option>`).join('')
    : opcionesGrupos(ix, estado.id);
  const hoy = hoyISO();
  let nota = '';
  if (estado.tipo === 'docente') {
    const a = db.ausencias.find(x => x.docente_id === estado.id && sustitutoLargo(x, hoy));
    if (a) nota = `<div class="aviso">Actualmente le sustituye <b>${esc(nombre(ix, a.sustituto_id))}</b>.</div>`;
    const b = db.ausencias.find(x => x.sustituto_id === estado.id && sustitutoLargo(x, hoy));
    if (b) nota = `<div class="aviso info">Sustituye a <b>${esc(nombre(ix, b.docente_id))}</b>: se muestra su horario.</div>`;
  } else {
    const g = ix.grp[estado.id];
    if (g?.tutor_id) nota = `<p class="sub">Tutoría: ${esc(nombre(ix, g.tutor_id))}</p>`;
  }
  const titulo = estado.tipo === 'docente' ? nombre(ix, estado.id) : ix.grp[estado.id]?.nombre;
  v.innerHTML = `<div class="panel">
    <div class="barra">
      <div class="seg"><button data-t="docente" class="${estado.tipo === 'docente' ? 'activa' : ''}">Profesorado</button><button data-t="grupo" class="${estado.tipo === 'grupo' ? 'activa' : ''}">Grupos</button></div>
      <select id="h-sel" aria-label="Elegir">${opciones}</select>
      <span class="sep"></span>
      <button class="btn" data-imprimir data-sub="${estado.tipo === 'docente' ? 'Horario del profesor/a' : 'Horario del grupo'}">${svg('imprimir')} Imprimir</button>
    </div>
    <h2>${esc(titulo || '')}</h2>${nota}
    ${horarioSemanal(db, ix, { tipo: estado.tipo, id: estado.id, fecha: hoy })}
  </div>`;
  $$('.seg button', v).forEach(b => b.onclick = () => { estado.tipo = b.dataset.t; estado.id = ''; vHorarios(); irA('horarios', `${estado.tipo}/${estado.id}`); });
  $('#h-sel').onchange = e => { estado.id = e.target.value; irA('horarios', `${estado.tipo}/${estado.id}`); };
}

/* ---------- SÁBANA ---------- */
function vSabana() {
  const v = $('#vista');
  const hoy = hoyISO();
  const dia = estado.sabDia || diaSemana(hoy) || 1;
  const ta = diaSemana(hoy) === dia ? tramoActual(ix.tramos) : null;
  const actual = ta && ta.estado === 'en_curso' ? ta.tramo.id : '';
  const cab = ix.tramos.map(t => `<th class="${t.id === actual ? 'actual' : ''}">${esc(t.etiqueta)}<br><span style="font-weight:400">${esc(t.inicio)}</span></th>`).join('');
  let filas = '';
  const recreo = ix.tramos.find(t => !t.lectivo);
  if (estado.sabModo === 'docentes') {
    for (const d of ix.docentes) {
      if (d.activo === false) continue;
      const ocs = ocupacionesDe(db, d.id, hoy, dia);
      const turnos = db.turnos_recreo.filter(t => t.docente_id === d.id && t.dia === dia);
      const largo = db.ausencias.find(x => x.docente_id === d.id && sustitutoLargo(x, hoy));
      if (largo) continue; // se muestra en la fila de quien le sustituye
      if (!ocs.length && !turnos.length) continue;
      const her = db.ausencias.find(x => x.sustituto_id === d.id && sustitutoLargo(x, hoy));
      filas += `<tr><th>${esc(d.corto || d.nombre)}${her ? `<br><span class="muted small">(por ${esc(corto(ix, her.docente_id))})</span>` : ''}</th>` + ix.tramos.map(t => {
        let c = ocs.filter(o => o.tramo_id === t.id).map(o => bloqueOcupacion(ix, o, { vista: 'docente' })).join('');
        if (!t.lectivo) c += turnos.map(x => `<div class="oc t-otro"><span class="m">${esc(ix.zona[x.zona_id]?.nombre || 'Recreo')}</span></div>`).join('');
        return `<td class="${t.id === actual ? 'actual' : ''}">${c}</td>`;
      }).join('') + '</tr>';
    }
  } else {
    for (const g of ix.grupos) {
      filas += `<tr><th>${esc(g.nombre)}</th>` + ix.tramos.map(t => {
        const c = db.ocupaciones.filter(o => o.dia === dia && o.tramo_id === t.id && (o.grupos || []).includes(g.id)).map(o => {
          const a = db.ausencias.find(x => x.docente_id === o.docente_id && sustitutoLargo(x, hoy));
          return bloqueOcupacion(ix, { ...o, efectivo_id: a ? a.sustituto_id : o.docente_id }, { vista: 'grupo' });
        }).join('');
        return `<td class="${t.id === actual ? 'actual' : ''}">${c}</td>`;
      }).join('') + '</tr>';
    }
  }
  v.innerHTML = `<div class="panel">
    <div class="barra">
      <div class="seg" id="s-dia">${DIAS.map((d, i) => `<button data-d="${i + 1}" class="${i + 1 === dia ? 'activa' : ''}">${d.slice(0, 3)}</button>`).join('')}</div>
      <div class="seg" id="s-modo"><button data-m="docentes" class="${estado.sabModo === 'docentes' ? 'activa' : ''}">Por profesorado</button><button data-m="grupos" class="${estado.sabModo === 'grupos' ? 'activa' : ''}">Por grupos</button></div>
      <span class="sep"></span><button class="btn" data-imprimir data-sub="Sábana del día">${svg('imprimir')} Imprimir</button>
    </div>
    <h2>Sábana del ${esc(DIAS[dia - 1].toLowerCase())}</h2>
    <p class="sub">Qué hace cada ${estado.sabModo === 'docentes' ? 'compañero/a' : 'grupo'} en cada tramo. ${actual ? 'La columna resaltada es el tramo en curso.' : ''}</p>
    <div class="sabana-wrap"><table class="sabana"><thead><tr><th></th>${cab}</tr></thead><tbody>${filas}</tbody></table></div>
    <div class="leyenda">${['clase', 'tutoria', 'apoyo', 'coordinacion', 'no_lectiva'].map(k => `<span class="t-${k}"><i></i>${TIPOS[k]}</span>`).join('')}</div>
  </div>`;
  $$('#s-dia button').forEach(b => b.onclick = () => { estado.sabDia = +b.dataset.d; vSabana(); });
  $$('#s-modo button').forEach(b => b.onclick = () => { estado.sabModo = b.dataset.m; vSabana(); });
}

/* ---------- SUSTITUCIONES (cualquier día) ---------- */
function vSustituciones() {
  const v = $('#vista');
  const fecha = estado.susFecha;
  const dia = diaSemana(fecha);
  v.innerHTML = `<div class="panel">
    <div class="barra">
      <button class="btn" id="s-ant" aria-label="Día anterior">‹</button>
      <input type="date" id="s-fecha" value="${fecha}">
      <button class="btn" id="s-sig" aria-label="Día siguiente">›</button>
      <button class="btn" id="s-hoy">Hoy</button>
      <span class="sep"></span><button class="btn" data-imprimir data-titulo="Parte de sustituciones" data-sub="${esc(fechaLarga(fecha))}">${svg('imprimir')} Imprimir parte</button>
    </div>
    <h2>Parte de sustituciones</h2>
    <p class="sub">${esc(fechaLarga(fecha))}</p>
    ${dia ? tablaSustituciones(fecha) : '<p class="vacio">Fin de semana.</p>'}
  </div>`;
  const ir = f => { estado.susFecha = f; vSustituciones(); };
  $('#s-fecha').onchange = e => ir(e.target.value || hoyISO());
  $('#s-ant').onclick = () => ir(sumarDias(fecha, -1));
  $('#s-sig').onclick = () => ir(sumarDias(fecha, 1));
  $('#s-hoy').onclick = () => ir(hoyISO());
}

/* ---------- RECREOS (semana) ---------- */
function vRecreos() {
  const v = $('#vista');
  const dHoy = diaSemana(hoyISO());
  const tabla = p => `<div class="patio ${esBach(p.nombre) ? 'bach' : 'eso'}" style="margin-bottom:16px">
    <h3 class="patio-t">${esc(p.nombre)}</h3>
    <div class="tabla-wrap"><table class="datos recreos"><thead><tr><th>Zona</th>${DIAS.map((d, i) => `<th class="${i + 1 === dHoy ? 'hoy' : ''}">${d}</th>`).join('')}</tr></thead><tbody>
    ${p.zonas.map(z => `<tr><td><b>${esc(z.nombre)}</b>${botonInfo(z)}</td>` + [1, 2, 3, 4, 5].map(d => `<td class="${d === dHoy ? 'hoy' : ''}">${db.turnos_recreo.filter(t => t.zona_id === z.id && t.dia === d)
      .map(t => `<div>${esc(corto(ix, t.docente_id))}${t.nota ? `<div class="muted small">${esc(t.nota)}</div>` : ''}</div>`).join('')}</td>`).join('') + '</tr>').join('')}
    </tbody></table></div></div>`;
  v.innerHTML = `<div class="panel">
    <div class="barra"><h2 style="margin:0">Vigilancia de recreos</h2><span class="sep"></span><button class="btn" data-imprimir data-titulo="Vigilancia de recreos" data-sub="Turnos semanales">${svg('imprimir')} Imprimir</button></div>
    ${patios().map(tabla).join('')}
  </div>`;
}

/* ---------- Arranque ---------- */
(async function () {
  $$('#tabs button').forEach(b => b.onclick = () => irA(b.dataset.v));
  activarImpresion(() => db?.curso ? `Curso ${db.curso.nombre}` : '');
  try {
    await D.conectar();
    $('#demo').hidden = !D.esDemo();
    await cargar();
  } catch (e) {
    console.error(e);
    $('#vista').innerHTML = `<div class="aviso error">No se han podido cargar los datos: ${esc(e.message || e)}</div>`;
    return;
  }
  leerHash();
  window.addEventListener('hashchange', () => { leerHash(); pintar(); });
  pintar();
  // Recarga de datos cada 5 minutos (para ver sustituciones y avisos nuevos)
  setInterval(async () => {
    try {
      await cargar();
      if (estado.vista === 'hoy') { const y = scrollY; vHoy(); scrollTo(0, y); }
      if (estado.vista === 'sustituciones') pintar();
    } catch {}
  }, 5 * 60 * 1000);
})();
