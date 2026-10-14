// Panel de administración (jefatura): sustituciones, ausencias, contador y mantenimiento de datos.
import * as D from './data.js';
import {
  DIAS, TIPOS, LECTIVAS, CATEGORIAS, PRIORIDAD_DEFECTO, indices, hoyISO, diaSemana, sumarDias, fechaLarga, fechaCorta,
  necesidades, candidatos, autoasignar, cortoAuto, ausenciasDelDia, sustitutoLargo, estadisticas, uid, ausenciaActiva
} from './logic.js';
import { importarAsc } from './asc.js';
import { nombreMateria } from './ui.js';
import { importarPdfAsc } from './pdfasc.js';
import { leerArchivoSeneca } from './seneca.js';
import {
  $, $$, esc, svg, activarImpresion, toast, modal, confirmar, horarioSemanal, bloqueOcupacion, nombreGrupos, corto, nombre,
  opcionesDocentes, opcionesGrupos
} from './ui.js';

let db, ix;
const st = { cat: 'ausencias', sub: 'sustituciones', fecha: hoyISO(), docH: '', ausFiltro: 'activas', desde: '', hasta: '', cursoId: null };

/* ---------- Datos ---------- */
async function recargar() {
  db = await D.cargarCurso(st.cursoId, { admin: true });
  ix = indices(db);
  $('#curso').textContent = db.curso ? `Curso ${db.curso.nombre}${db.curso.activo ? '' : ' (no activo)'}` : 'Sin curso';
}
const cid = () => db.curso.id;
async function guardarFilas(tabla, filas) {
  filas = [].concat(filas);
  await D.guardar(tabla, filas, cid());
  for (const f of filas) {
    const row = { ...f, curso_id: cid() };
    const i = db[tabla].findIndex(x => x.id === f.id);
    if (i >= 0) db[tabla][i] = row; else db[tabla].push(row);
  }
  ix = indices(db);
}
async function borrarFilas(tabla, ids) {
  ids = [].concat(ids);
  await D.borrar(tabla, ids, cid());
  db[tabla] = db[tabla].filter(x => !ids.includes(x.id));
  ix = indices(db);
}
// Ejecuta una acción mostrando el error si falla.
async function seguro(fn, ok) {
  try { const r = await fn(); if (ok) toast(ok); return r; }
  catch (e) { console.error(e); toast('Error: ' + (e.message || e), true); }
}

/* ---------- Navegación ---------- */
// Menú: categorías y, dentro de cada una, su submenú.
// Iconos del menú (mismo estilo que los desplegables de Control de baños)
const IC = {
  sust: '<path d="M8 7h11M8 12h11M8 17h11"/><circle cx="4" cy="7" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="17" r="1"/>',
  bajas: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M9 15l6 0"/>',
  contador: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  prioridad: '<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>',
  aviso: '<path d="M4 15V9l12-5v16L4 15z"/><path d="M8 16v3a2 2 0 0 0 4 0"/>',
  clip: '<path d="M20 12l-8 8a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/>',
  horario: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M9 9v12M15 9v12"/>',
  recreo: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  apoyo: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.9.7 3.1 2.4 3.5 5.2"/>',
  profes: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  catalogo: '<path d="M4 5h16M4 12h16M4 19h10"/>',
  cursos: '<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
  nuevo: '<path d="M12 5v14M5 12h14"/>'
};
// Menú: categorías y, dentro de cada una, sus apartados (desplegable).
const MENU = {
  ausencias: { t: 'Ausencias', subs: [['sustituciones', 'Sustituciones del día', () => vSust(), 'sust', '#009abb'], ['bajas', 'Ausencias y bajas', () => vAusencias(), 'bajas', '#ee712a'], ['contador', 'Contador', () => vContador(), 'contador', '#8a9400'], ['prioridad', 'Prioridad para sustituir', () => vPrioridad(), 'prioridad', '#7a5bc7']] },
  avisos: { t: 'Avisos', subs: [['sustitucion', 'Para una sustitución', () => vAvisosSust(), 'clip', '#ee712a'], ['generales', 'Avisos generales', () => vAvisos(), 'aviso', '#d23c3c']] },
  horarios: { t: 'Horarios', subs: [['profesorado', 'Profesorado', () => { st.modoH = 'docente'; vHorarios(); }, 'profes', '#009abb'], ['grupos', 'Grupos', () => { st.modoH = 'grupo'; vHorarios(); }, 'horario', '#8a9400'], ['recreos', 'Recreos', () => vRecreos(), 'recreo', '#ee712a'], ['otras', 'Apoyos, coordinación y NL', () => vOtras(), 'apoyo', '#7a5bc7']] },
  datos: { t: 'Datos', subs: [['profesorado', 'Profesorado', () => vProfes(), 'profes', '#009abb'], ['grupos', 'Grupos', () => vCatalogos('grupos'), 'apoyo', '#8a9400'], ['materias', 'Materias', () => vMaterias(), 'catalogo', '#ee712a'], ['tramos', 'Tramos horarios', () => vCatalogos('tramos'), 'bajas', '#7a5bc7'], ['accesos', 'Personas con acceso', () => vCurso('accesos'), 'cursos', '#d23c3c']] },
  cursos: { t: 'Cursos', subs: [['academico', 'Curso académico', () => vCurso('academico'), 'bajas', '#009abb'], ['datos', 'Exportar / importar', () => vCurso('datos'), 'contador', '#8a9400'], ['nuevo', 'Nuevo horario', () => vNuevo(), 'nuevo', '#ee712a']] }
};
function leerRuta() {
  const [c, s] = location.hash.replace(/^#\/?/, '').split('/');
  st.cat = MENU[c] ? c : 'ausencias';
  st.sub = MENU[st.cat].subs.some(x => x[0] === s) ? s : MENU[st.cat].subs[0][0];
}
function irA(cat, sub) {
  st.cat = cat; st.sub = sub || MENU[cat].subs[0][0];
  history.replaceState(null, '', `#/${st.cat}/${st.sub}`); pintar();
}
function pintar() {
  const ico = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;
  $('#tabs').innerHTML = Object.entries(MENU).map(([k, m]) => m.subs.length < 2
    ? `<button data-c="${k}" class="${k === st.cat ? 'activa' : ''}">${esc(m.t)}</button>`
    : `<div class="menu-g"><button type="button" data-menu="${k}" class="${k === st.cat ? 'activa' : ''}" aria-haspopup="true">${esc(m.t)}</button>
        <div class="desplegable">${m.subs.map(([s, t, , i, c]) => `<button type="button" data-c="${k}" data-s="${s}" style="--c:${c}" class="${k === st.cat && s === st.sub ? 'activo' : ''}">${ico(i)}${esc(t)}</button>`).join('')}</div></div>`).join('');
  $$('#tabs [data-c]').forEach(b => b.onclick = () => { $$('#tabs .menu-g').forEach(m => m.classList.remove('abierto')); irA(b.dataset.c, b.dataset.s); });
  $$('#tabs [data-menu]').forEach(b => b.onclick = e => { e.stopPropagation(); const g = b.parentElement; const ab = !g.classList.contains('abierto'); $$('#tabs .menu-g').forEach(m => m.classList.remove('abierto')); g.classList.toggle('abierto', ab); });
  const m = MENU[st.cat], s = m.subs.find(x => x[0] === st.sub);
  $('#migas').innerHTML = m.subs.length > 1 ? `${esc(m.t)} › <b>${esc(s[1])}</b>` : '';
  s[2]();
}
document.addEventListener('click', e => { if (!e.target.closest('#tabs .menu-g')) $$('#tabs .menu-g').forEach(m => m.classList.remove('abierto')); });

/* =====================================================================
   SUSTITUCIONES DEL DÍA
   ===================================================================== */
function vSust() {
  const v = $('#vista');
  const fecha = st.fecha, dia = diaSemana(fecha);
  const nec = dia ? necesidades(db, fecha).sort((a, b) => ix.tramo[a.oc.tramo_id].orden - ix.tramo[b.oc.tramo_id].orden ||
    nombreGrupos(ix, a.oc.grupos).localeCompare(nombreGrupos(ix, b.oc.grupos))) : [];
  const aus = ausenciasDelDia(db, fecha);
  const pendientes = nec.filter(n => n.estado === 'sin_cubrir').length;

  const filasAus = aus.map(a => {
    const sl = sustitutoLargo(a, fecha);
    const tr = a.tramos && a.tramos.length ? a.tramos.map(t => ix.tramo[t]?.etiqueta).join(', ') : 'Todo el día';
    return `<li><span><b>${esc(nombre(ix, a.docente_id))}</b> <span class="d">${esc(tr)}${a.hasta !== a.desde ? ` · ${a.hasta ? `${esc(fechaCorta(a.desde))} → ${esc(fechaCorta(a.hasta))}` : `baja prolongada desde ${esc(fechaCorta(a.desde))}`}` : ''}</span>
      ${sl ? `<br><span class="chip verde">Sustituto: ${esc(nombre(ix, sl))}</span>` : ''}
      ${db.motivos[a.id] ? `<br><span class="d">Motivo: ${esc(db.motivos[a.id])}</span>` : ''}</span>
      <button class="btn mini" data-edaus="${a.id}">${svg('lapiz')} Editar</button></li>`;
  }).join('');

  const porTramo = {};
  for (const n of nec) (porTramo[n.oc.tramo_id] = porTramo[n.oc.tramo_id] || []).push(n);
  const bloques = Object.keys(porTramo).sort((a, b) => ix.tramo[a].orden - ix.tramo[b].orden).map(tid => {
    const t = ix.tramo[tid];
    const cands = candidatos(db, fecha, tid);
    return `<h3>${esc(t.etiqueta)} · ${esc(t.inicio)}–${esc(t.fin)}</h3>` + porTramo[tid].map(n => {
      const sel = n.cobertura?.sustituto_id || '';
      const grupos = {};
      for (const c of cands) (grupos[c.categoria] = grupos[c.categoria] || []).push(c);
      const orden = [...((db.config.prioridad && db.config.prioridad.length) ? db.config.prioridad : PRIORIDAD_DEFECTO).filter(k => k !== 'libre'), 'otro', 'libre', 'fuera']
        .filter((x, i, a) => a.indexOf(x) === i);
      const opts = orden.filter(k => grupos[k]).map(k => `<optgroup label="${esc(CATEGORIAS[k] || k)}">${grupos[k].map(c =>
        `<option value="${c.docente.id}" ${c.docente.id === sel ? 'selected' : ''} ${c.ya && c.docente.id !== sel ? 'disabled' : ''}>${esc(c.docente.nombre)} · ${c.cuenta} sust.${c.detalle ? ' · ' + esc(c.detalle) : ''}${c.ya && c.docente.id !== sel ? ' (ya asignado)' : ''}</option>`).join('')}</optgroup>`).join('');
      const extra = sel && !cands.some(c => c.docente.id === sel) ? `<option value="${sel}" selected>${esc(nombre(ix, sel))}</option>` : '';
      return `<div class="sust-fila ${n.estado === 'cubierta' ? 'cubierta' : 'pendiente'}">
        <div><b>${esc(nombreGrupos(ix, n.oc.grupos))}</b>${n.oc.subgrupo ? `<div class="muted small">${esc(n.oc.subgrupo)}</div>` : ''}</div>
        <div>${esc(n.oc.materia)} <span class="muted small">· falta ${esc(corto(ix, n.ausente_id))}</span></div>
        <select data-cubrir="${n.oc.id}" data-tramo="${tid}" aria-label="Sustituto"><option value="">— Sin cubrir —</option>${extra}${opts}</select>
        <button class="btn mini" data-nota="${n.oc.id}" data-tramo="${tid}" title="Aviso para esta hora (sale en «Hoy»)">${n.cobertura?.nota || n.cobertura?.adjuntos?.length ? 'Aviso ✓' : 'Aviso'}</button>
      </div>`;
    }).join('');
  }).join('');

  v.innerHTML = `<div class="panel">
    <div class="barra">
      <button class="btn" id="s-ant" aria-label="Día anterior">‹</button>
      <input type="date" id="s-fecha" value="${fecha}">
      <button class="btn" id="s-sig" aria-label="Día siguiente">›</button>
      <button class="btn" id="s-hoy">Hoy</button>
      <span class="sep"></span>
      <button class="btn pri" id="s-nueva">${svg('mas')} Añadir ausencia</button>
      <button class="btn" id="s-auto" ${pendientes ? '' : 'disabled'}>${svg('rayo')} Autoasignar</button>
      <button class="btn" data-imprimir data-titulo="Parte de sustituciones" data-sub="${esc(fechaLarga(fecha))}">${svg('imprimir')} Imprimir parte</button>
    </div>
    <h2>${esc(fechaLarga(fecha))}</h2>
    ${!dia ? '<p class="vacio">Fin de semana.</p>' : `
    <div class="cols">
      <div>
        <h3>Clases que hay que cubrir ${pendientes ? `<span class="chip naranja">${pendientes} pendientes</span>` : nec.length ? '<span class="chip verde">Todo cubierto</span>' : ''}</h3>
        ${bloques || '<p class="muted">No hay clases sin profesor/a. Añade una ausencia para empezar.</p>'}
        <p class="small muted no-imprimir">Las opciones salen ordenadas por prioridad (configurable en «Curso y datos») y, dentro de cada bloque, por quien menos sustituciones lleva.</p>
      </div>
      <div><h3>Ausencias del día</h3>${aus.length ? `<ul class="lista">${filasAus}</ul>` : '<p class="muted small">Ninguna.</p>'}</div>
    </div>`}
  </div>`;

  const ir = f => { st.fecha = f; vSust(); };
  $('#s-fecha').onchange = e => ir(e.target.value || hoyISO());
  $('#s-ant').onclick = () => ir(sumarDias(fecha, -1));
  $('#s-sig').onclick = () => ir(sumarDias(fecha, 1));
  $('#s-hoy').onclick = () => ir(hoyISO());
  $('#s-nueva').onclick = () => editarAusencia(null, { desde: fecha, hasta: fecha });
  const auto = $('#s-auto');
  if (auto) auto.onclick = async () => {
    const nuevas = autoasignar(db, fecha);
    if (!nuevas.length) return toast('No hay candidatos disponibles para los huecos pendientes.', true);
    await seguro(() => guardarFilas('coberturas', nuevas), `${nuevas.length} sustituciones asignadas`);
    vSust();
  };
  $$('[data-edaus]', v).forEach(b => b.onclick = () => editarAusencia(db.ausencias.find(a => a.id === b.dataset.edaus)));
  $$('[data-cubrir]', v).forEach(s => s.onchange = async () => {
    const n = nec.find(x => x.oc.id === s.dataset.cubrir && x.oc.tramo_id === s.dataset.tramo);
    const sus = s.value;
    if (!sus && n.cobertura && !n.cobertura.nota && !(n.cobertura.adjuntos || []).length) {
      await seguro(() => borrarFilas('coberturas', n.cobertura.id));
    } else {
      const c = { ...(n.cobertura || { id: uid('c'), fecha, tramo_id: n.oc.tramo_id, ocupacion_id: n.oc.id, nota: '' }),
        ausente_id: n.ausente_id, ausencia_id: n.ausencia.id, sustituto_id: sus || null };
      await seguro(() => guardarFilas('coberturas', c));
    }
    vSust();
  });
  $$('[data-nota]', v).forEach(b => b.onclick = async () => {
    const n = nec.find(x => x.oc.id === b.dataset.nota && x.oc.tramo_id === b.dataset.tramo);
    if (await editarAvisoHora(n, fecha)) vSust();
  });
}

/* =====================================================================
   AUSENCIAS Y BAJAS
   ===================================================================== */
async function editarAusencia(a, defecto = {}) {
  const nueva = !a;
  a = a ? { ...a } : { id: uid('a'), docente_id: '', desde: defecto.desde || hoyISO(), hasta: defecto.hasta ?? hoyISO(), tramos: [], larga: false, sustituto_id: null, sustituto_desde: null, nota: '' };
  const motivo = db.motivos[a.id] || '';
  const r = await modal({
    titulo: nueva ? 'Nueva ausencia' : 'Editar ausencia',
    botones: nueva ? [{ id: 'ok', texto: 'Guardar', pri: true }] : [{ id: 'del', texto: 'Borrar', peligro: true }, { id: 'ok', texto: 'Guardar', pri: true }],
    contenido: `<div class="form-grid">
      <label class="campo ancho">Profesor/a que falta<select name="docente" required>${opcionesDocentes(ix, a.docente_id)}</select></label>
      <label class="campo">Desde<input type="date" name="desde" value="${a.desde}" required></label>
      <label class="campo">Hasta <span class="muted" style="font-weight:400">(vacío = sin fecha de fin)</span><input type="date" name="hasta" value="${a.hasta || ''}"></label>
      <div class="campo ancho">Tramos
        <label class="campo fila" style="font-weight:500;color:var(--texto)"><input type="checkbox" name="todo" ${!a.tramos?.length ? 'checked' : ''}> Todo el día</label>
        <div class="checks" id="f-tramos" ${!a.tramos?.length ? 'hidden' : ''}>${ix.lectivos.map(t => `<label><input type="checkbox" name="tramo" value="${t.id}" ${a.tramos?.includes(t.id) ? 'checked' : ''}>${esc(t.etiqueta)} ${esc(t.inicio)}</label>`).join('')}</div>
      </div>
      <label class="campo ancho fila" style="color:var(--texto)"><input type="checkbox" name="larga" ${a.larga ? 'checked' : ''}> Baja de larga duración (con sustituto/a que viene al centro)</label>
      <div class="ancho form-grid" id="f-larga" ${a.larga ? '' : 'hidden'} style="padding:12px;border:1px dashed var(--borde);border-radius:12px">
        <label class="campo">Sustituto/a<select name="sust">${opcionesDocentes(ix, a.sustituto_id || '', { vacio: 'Aún no ha llegado' })}<option value="__nuevo">+ Dar de alta a una persona nueva…</option></select></label>
        <label class="campo">Se incorpora el<input type="date" name="sdesde" value="${a.sustituto_desde || ''}"></label>
        <label class="campo ancho" id="f-nuevo" hidden>Nombre de la persona sustituta<input type="text" name="nuevo" placeholder="Nombre y apellido"></label>
        <p class="small muted ancho" style="margin:0">Desde su incorporación, el sustituto/a hereda el horario completo y ya no hace falta cubrir esas clases cada día. Hasta entonces aparecen como huecos a cubrir.</p>
      </div>
      <label class="campo ancho">Nota pública <span class="muted" style="font-weight:400">(la ve todo el claustro)</span><input type="text" name="nota" value="${esc(a.nota || '')}" placeholder="Ej.: Actividad complementaria con 4º ESO"></label>
      <label class="campo ancho">Motivo <span class="muted" style="font-weight:400">(privado: solo jefatura)</span><input type="text" name="motivo" value="${esc(motivo)}"></label>
    </div>`,
    alAbrir: d => {
      const q = n => d.querySelector(`[name=${n}]`);
      q('todo').onchange = () => { d.querySelector('#f-tramos').hidden = q('todo').checked; };
      q('larga').onchange = () => { d.querySelector('#f-larga').hidden = !q('larga').checked; if (q('larga').checked && !q('hasta').value) q('hasta').value = ''; };
      q('sust').onchange = () => { d.querySelector('#f-nuevo').hidden = q('sust').value !== '__nuevo'; if (q('sust').value && !q('sdesde').value) q('sdesde').value = q('desde').value; };
    },
    validar: (b, d) => {
      if (b === 'del') return null;
      const q = n => d.querySelector(`[name=${n}]`);
      if (!q('docente').value) return 'Elige quién falta.';
      if (!q('desde').value) return 'Indica la fecha de inicio.';
      if (q('hasta').value && q('hasta').value < q('desde').value) return 'La fecha de fin es anterior a la de inicio.';
      if (!q('todo').checked && !d.querySelectorAll('[name=tramo]:checked').length) return 'Marca algún tramo o «Todo el día».';
      if (q('sust').value === '__nuevo' && !q('nuevo').value.trim()) return 'Escribe el nombre de la persona sustituta.';
      if (q('sust').value === q('docente').value) return 'El sustituto no puede ser la misma persona.';
      return null;
    }
  });
  if (!r) return;
  if (r.boton === 'del') {
    const cobs = db.coberturas.filter(c => c.ausencia_id === a.id);
    if (!await confirmar(`¿Borrar esta ausencia${cobs.length ? ` y sus ${cobs.length} sustituciones registradas` : ''}? Se descontarán del contador.`, 'Borrar', true)) return;
    await seguro(async () => { await borrarFilas('coberturas', cobs.map(c => c.id)); await borrarFilas('ausencias', a.id); await D.guardarMotivo(a.id, '', cid()); delete db.motivos[a.id]; }, 'Ausencia borrada');
    return pintar();
  }
  const f = r.form; const q = n => f.querySelector(`[name=${n}]`);
  a.docente_id = q('docente').value;
  a.desde = q('desde').value; a.hasta = q('hasta').value || null;
  a.tramos = q('todo').checked ? [] : $$('[name=tramo]:checked', f).map(x => x.value);
  a.larga = q('larga').checked;
  a.nota = q('nota').value.trim();
  await seguro(async () => {
    if (a.larga) {
      let s = q('sust').value;
      if (s === '__nuevo') {
        const nom = q('nuevo').value.trim();
        const nuevoDoc = { id: uid('d'), nombre: nom, corto: cortoAuto(nom, db.docentes), abrev: '', activo: true, en_bolsa: true, orden: (ix.docentes.at(-1)?.orden || 0) + 1, notas: `Sustituye a ${nombre(ix, a.docente_id)}` };
        await guardarFilas('docentes', nuevoDoc); s = nuevoDoc.id;
      }
      a.sustituto_id = s || null;
      a.sustituto_desde = s ? (q('sdesde').value || a.desde) : null;
    } else { a.sustituto_id = null; a.sustituto_desde = null; }
    await guardarFilas('ausencias', a);
    const m = q('motivo').value.trim();
    await D.guardarMotivo(a.id, m, cid());
    if (m) db.motivos[a.id] = m; else delete db.motivos[a.id];
  }, 'Ausencia guardada');
  pintar();
}

function vAusencias() {
  const v = $('#vista'); const hoy = hoyISO();
  let lista = [...db.ausencias].sort((a, b) => b.desde.localeCompare(a.desde));
  if (st.ausFiltro === 'activas') lista = lista.filter(a => ausenciaActiva(a, hoy) || a.desde > hoy);
  if (st.ausFiltro === 'largas') lista = lista.filter(a => a.larga);
  const filas = lista.map(a => {
    const activa = ausenciaActiva(a, hoy);
    const tr = a.tramos?.length ? a.tramos.map(t => ix.tramo[t]?.etiqueta).join(', ') : 'Todo el día';
    const horas = db.coberturas.filter(c => c.ausencia_id === a.id && c.sustituto_id).length;
    return `<tr>
      <td><b>${esc(nombre(ix, a.docente_id))}</b>${a.nota ? `<div class="muted small">${esc(a.nota)}</div>` : ''}</td>
      <td>${esc(fechaCorta(a.desde))}${a.hasta !== a.desde ? ` → ${a.hasta ? esc(fechaCorta(a.hasta)) : '<i>sin fin</i>'}` : ''}</td>
      <td>${esc(tr)}</td>
      <td>${a.larga ? '<span class="chip morado">Larga</span>' : '<span class="chip">Puntual</span>'} ${activa ? '<span class="chip rojo">En curso</span>' : a.desde > hoy ? '<span class="chip azul">Próxima</span>' : ''}</td>
      <td>${a.sustituto_id ? `${esc(nombre(ix, a.sustituto_id))}<div class="muted small">desde ${esc(fechaCorta(a.sustituto_desde))}</div>` : '—'}</td>
      <td class="num">${horas}</td>
      <td class="small">${esc(db.motivos[a.id] || '')}</td>
      <td><button class="btn mini" data-ed="${a.id}">${svg('lapiz')} Editar</button></td></tr>`;
  }).join('');
  v.innerHTML = `<div class="panel">
    <div class="barra">
      <div class="seg" id="a-f">${[['activas', 'Actuales y próximas'], ['largas', 'Bajas largas'], ['todas', 'Todas']].map(([k, t]) =>
        `<button data-f="${k}" class="${st.ausFiltro === k ? 'activa' : ''}">${t}</button>`).join('')}</div>
      <span class="sep"></span>
      <button class="btn pri" id="a-nueva">${svg('mas')} Nueva ausencia o baja</button>
    </div>
    <h2>Ausencias y bajas</h2>
    <p class="sub">Para una baja larga pon el periodo (o déjalo sin fecha de fin) y, cuando llegue la persona sustituta, edítala y añádela: heredará el horario.</p>
    ${lista.length ? `<div class="tabla-wrap"><table class="datos"><thead><tr><th>Profesor/a</th><th>Periodo</th><th>Tramos</th><th>Tipo</th><th>Sustituto/a</th><th class="num">Horas cubiertas</th><th>Motivo (privado)</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>`
      : '<p class="vacio">No hay ausencias.</p>'}
  </div>`;
  $$('#a-f button').forEach(b => b.onclick = () => { st.ausFiltro = b.dataset.f; vAusencias(); });
  $('#a-nueva').onclick = () => editarAusencia(null, { desde: hoy, hasta: hoy });
  $$('[data-ed]', v).forEach(b => b.onclick = () => editarAusencia(db.ausencias.find(a => a.id === b.dataset.ed)));
}

/* =====================================================================
   AVISOS PARA UNA SUSTITUCIÓN (texto y archivos para una hora concreta)
   ===================================================================== */
const MAX_MB = 10;
async function editarAvisoHora(n, fecha) {
  const c0 = n.cobertura || {};
  let adjuntos = [...(c0.adjuntos || [])];
  const quitados = [];
  const pintaAdj = d => {
    d.querySelector('#f-adj').innerHTML = adjuntos.length ? adjuntos.map((x, i) => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.nombre)}</a>
      <button type="button" class="btn mini peligro" data-qadj="${i}">Quitar</button></li>`).join('') : '<li class="muted">Sin archivos</li>';
    d.querySelectorAll('[data-qadj]').forEach(b => b.onclick = () => { quitados.push(...adjuntos.splice(+b.dataset.qadj, 1)); pintaAdj(d); });
  };
  const t = ix.tramo[n.oc.tramo_id];
  const r = await modal({
    titulo: `Aviso · ${nombreGrupos(ix, n.oc.grupos)} · ${t?.etiqueta} (${fechaCorta(fecha)})`,
    contenido: `<p class="small muted" style="margin:0">${esc(nombreMateria(ix, n.oc.materia, n.oc.grupos))} · falta ${esc(nombre(ix, n.ausente_id))}${n.docente_id ? ` · sustituye ${esc(nombre(ix, n.docente_id))}` : ''}</p>
      <label class="campo">Aviso (se ve en «Hoy» y en el parte)<textarea name="nota" placeholder="Lo que haya enviado el profesor/a: «Tienen que hacer la ficha 12», «Examen: vigilar»…">${esc(c0.nota || '')}</textarea></label>
      <div class="campo">Archivos adjuntos <span class="muted" style="font-weight:400">(fichas, imágenes, PDF… hasta ${MAX_MB} MB cada uno)</span>
        <ul class="lista" id="f-adj"></ul>
        <label class="btn" style="align-self:flex-start">${svg('subir')} Añadir archivo<input type="file" name="archivos" multiple hidden></label>
        <span class="small muted" id="f-nuevos"></span></div>
      <p class="small muted" style="margin:0">Los adjuntos los puede abrir cualquiera que vea la parte pública: no subas documentos con datos personales del alumnado.</p>`,
    alAbrir: d => {
      pintaAdj(d);
      const inp = d.querySelector('[name=archivos]');
      inp.onchange = () => { d.querySelector('#f-nuevos').textContent = inp.files.length ? `Se subirán: ${[...inp.files].map(f => f.name).join(', ')}` : ''; };
    },
    validar: (b, d) => {
      const g = [...d.querySelector('[name=archivos]').files].find(f => f.size > MAX_MB * 1024 * 1024);
      return g ? `«${g.name}» ocupa más de ${MAX_MB} MB.` : null;
    }
  });
  if (!r) return false;
  const nota = r.form.querySelector('[name=nota]').value.trim();
  const nuevos = [...r.form.querySelector('[name=archivos]').files];
  const ok = await seguro(async () => {
    for (const f of nuevos) adjuntos.push(await D.subirAdjunto(f, cid()));
    for (const x of quitados) await D.borrarAdjunto(x);
    const c = { ...(n.cobertura || { id: uid('c'), fecha, tramo_id: n.oc.tramo_id, ocupacion_id: n.oc.id, sustituto_id: null }),
      ausente_id: n.ausente_id, ausencia_id: n.ausencia.id, nota, adjuntos };
    await guardarFilas('coberturas', c);
    return true;
  }, 'Aviso guardado');
  return !!ok;
}

function vAvisosSust() {
  const v = $('#vista');
  const fecha = st.fecha, dia = diaSemana(fecha);
  const nec = dia ? necesidades(db, fecha).sort((a, b) => ix.tramo[a.oc.tramo_id].orden - ix.tramo[b.oc.tramo_id].orden) : [];
  const porAusente = {};
  for (const n of nec) (porAusente[n.ausente_id] = porAusente[n.ausente_id] || []).push(n);
  const hoy = hoyISO();
  const proximos = db.coberturas.filter(c => c.fecha >= hoy && (c.nota || (c.adjuntos || []).length)).sort((a, b) => a.fecha.localeCompare(b.fecha) || (ix.tramo[a.tramo_id]?.orden || 0) - (ix.tramo[b.tramo_id]?.orden || 0));
  const adj = c => (c?.adjuntos || []).map(x => `<a class="chip azul" href="${esc(x.url)}" target="_blank" rel="noopener">📎 ${esc(x.nombre)}</a>`).join(' ');
  v.innerHTML = `<div class="panel">
    <div class="barra">
      <button class="btn" id="v-ant" aria-label="Día anterior">‹</button>
      <input type="date" id="v-fecha" value="${fecha}">
      <button class="btn" id="v-sig" aria-label="Día siguiente">›</button>
      <button class="btn" id="v-hoy">Hoy</button>
      <span class="sep"></span>
      <button class="btn" id="v-aus">${svg('mas')} Añadir ausencia</button>
    </div>
    <h2>Avisos para las sustituciones · ${esc(fechaLarga(fecha))}</h2>
    <p class="sub">Si un profesor/a manda tarea o indicaciones para una hora concreta, añádelas aquí (con archivos si hace falta). Aparecen en «Hoy», en su casilla de la tabla de sustituciones.</p>
    ${!dia ? '<p class="vacio">Fin de semana.</p>' : !nec.length ? '<p class="vacio">Ese día no hay clases que cubrir. Añade antes la ausencia.</p>' :
      Object.entries(porAusente).map(([id, lista]) => `<h3>${esc(nombre(ix, id))}</h3>${lista.map(n => {
        const t = ix.tramo[n.oc.tramo_id]; const c = n.cobertura;
        const tiene = c?.nota || (c?.adjuntos || []).length;
        return `<div class="sust-fila ${tiene ? 'cubierta' : ''}" style="grid-template-columns:90px minmax(0,1fr) minmax(0,1.6fr) auto">
          <div><b>${esc(t.etiqueta)}</b> <span class="muted small">${esc(t.inicio)}</span></div>
          <div><b>${esc(nombreGrupos(ix, n.oc.grupos))}</b><div class="muted small">${esc(nombreMateria(ix, n.oc.materia, n.oc.grupos))}${n.docente_id ? ' · sustituye ' + esc(corto(ix, n.docente_id)) : ''}</div></div>
          <div class="small">${c?.nota ? esc(c.nota) : '<span class="muted">Sin aviso</span>'} ${adj(c)}</div>
          <button class="btn mini" data-av="${n.oc.id}|${n.oc.tramo_id}">${svg('lapiz')} ${tiene ? 'Editar' : 'Añadir'}</button></div>`;
      }).join('')}`).join('')}
  </div>
  <div class="panel"><h2 class="naranja">Próximos avisos de sustituciones</h2>
    ${proximos.length ? `<div class="tabla-wrap"><table class="datos"><thead><tr><th>Fecha</th><th>Tramo</th><th>Grupo</th><th>Ausente</th><th>Aviso</th></tr></thead><tbody>${proximos.map(c => {
      const o = ix.oc[c.ocupacion_id];
      return `<tr><td>${esc(fechaCorta(c.fecha))}</td><td>${esc(ix.tramo[c.tramo_id]?.etiqueta || '')}</td><td>${esc(nombreGrupos(ix, o?.grupos))}</td><td>${esc(corto(ix, c.ausente_id))}</td><td class="small">${esc(c.nota || '')} ${adj(c)}</td></tr>`;
    }).join('')}</tbody></table></div>` : '<p class="muted small">No hay avisos pendientes.</p>'}</div>`;
  const ir = f => { st.fecha = f; vAvisosSust(); };
  $('#v-fecha').onchange = e => ir(e.target.value || hoyISO());
  $('#v-ant').onclick = () => ir(sumarDias(fecha, -1));
  $('#v-sig').onclick = () => ir(sumarDias(fecha, 1));
  $('#v-hoy').onclick = () => ir(hoyISO());
  $('#v-aus').onclick = () => editarAusencia(null, { desde: fecha, hasta: fecha });
  $$('[data-av]', v).forEach(b => b.onclick = async () => {
    const [oc, tr] = b.dataset.av.split('|');
    if (await editarAvisoHora(nec.find(x => x.oc.id === oc && x.oc.tramo_id === tr), fecha)) vAvisosSust();
  });
}

/* =====================================================================
   AVISOS GENERALES (pestaña «Hoy»)
   ===================================================================== */
function vAvisos() {
  const v = $('#vista'); const hoy = hoyISO();
  const lista = [...(db.avisos || [])].sort((a, b) => (b.desde || '').localeCompare(a.desde || ''));
  const estadoAviso = a => a.hasta && a.hasta < hoy ? '<span class="chip">Caducado</span>' : a.desde > hoy ? '<span class="chip azul">Próximo</span>' : '<span class="chip verde">Visible</span>';
  v.innerHTML = `<div class="panel">
    <div class="barra"><h2 style="margin:0">Avisos</h2><span class="sep"></span><button class="btn pri" id="av-nuevo">${svg('mas')} Nuevo aviso</button></div>
    <p class="sub">Aparecen arriba en la pestaña «Hoy» de la parte pública durante las fechas indicadas.</p>
    ${lista.length ? `<div class="tabla-wrap"><table class="datos"><thead><tr><th>Aviso</th><th>Desde</th><th>Hasta</th><th>Estado</th><th></th></tr></thead><tbody>
      ${lista.map(a => `<tr><td>${a.importante ? '<span class="chip rojo">Importante</span> ' : ''}${esc(a.texto)}</td><td>${esc(fechaCorta(a.desde))}</td><td>${esc(fechaCorta(a.hasta)) || '—'}</td>
        <td>${estadoAviso(a)}</td><td><button class="btn mini" data-av="${a.id}">${svg('lapiz')} Editar</button></td></tr>`).join('')}</tbody></table></div>`
      : '<p class="vacio">No hay avisos.</p>'}
  </div>`;
  $('#av-nuevo').onclick = () => editarAviso(null);
  $$('[data-av]', v).forEach(b => b.onclick = () => editarAviso(db.avisos.find(x => x.id === b.dataset.av)));
}
async function editarAviso(a) {
  const nuevo = !a;
  a = a ? { ...a } : { id: uid('v'), texto: '', desde: st.fecha || hoyISO(), hasta: st.fecha || hoyISO(), importante: false };
  const r = await modal({
    titulo: nuevo ? 'Nuevo aviso' : 'Editar aviso',
    botones: nuevo ? [{ id: 'ok', texto: 'Publicar', pri: true }] : [{ id: 'del', texto: 'Borrar', peligro: true }, { id: 'ok', texto: 'Guardar', pri: true }],
    contenido: `<div class="form-grid">
      <label class="campo ancho">Texto<textarea name="texto" placeholder="Ej.: Hoy 4º ESO sale de excursión: sus clases de 3ª a 6ª no se dan.">${esc(a.texto)}</textarea></label>
      <label class="campo">Desde<input type="date" name="desde" value="${a.desde || ''}"></label>
      <label class="campo">Hasta<input type="date" name="hasta" value="${a.hasta || ''}"></label>
      <label class="campo fila ancho" style="color:var(--texto)"><input type="checkbox" name="importante" ${a.importante ? 'checked' : ''}> Destacar como importante</label></div>`,
    validar: (b, d) => b === 'ok' && !d.querySelector('[name=texto]').value.trim() ? 'Escribe el aviso.' : null
  });
  if (!r) return;
  if (r.boton === 'del') { await seguro(() => borrarFilas('avisos', a.id), 'Aviso borrado'); return vAvisos(); }
  const q = n => r.form.querySelector(`[name=${n}]`);
  await seguro(() => guardarFilas('avisos', { ...a, texto: q('texto').value.trim(), desde: q('desde').value || null, hasta: q('hasta').value || null, importante: q('importante').checked }), 'Aviso publicado');
  vAvisos();
}

/* =====================================================================
   CONTADOR
   ===================================================================== */
function vContador() {
  const v = $('#vista');
  const desde = st.desde || db.curso?.inicio || '';
  const hasta = st.hasta || hoyISO();
  const s = estadisticas(db, desde, hasta);
  const filas = ix.docentes.map(d => ({ d, ...(s[d.id] || { horas_sustituido: 0, horas_cubiertas: 0, ausencias: 0, dias_ausencia: 0 }) }));
  const maxC = Math.max(1, ...filas.map(f => f.horas_cubiertas));
  const maxS = Math.max(1, ...filas.map(f => f.horas_sustituido));
  st.orden = st.orden || 'horas_cubiertas';
  filas.sort((a, b) => st.orden === 'nombre' ? a.d.nombre.localeCompare(b.d.nombre) : (b[st.orden] - a[st.orden]) || a.d.nombre.localeCompare(b.d.nombre));
  const tot = filas.reduce((t, f) => ({ c: t.c + f.horas_cubiertas, s: t.s + f.horas_sustituido, a: t.a + f.ausencias, d: t.d + f.dias_ausencia }), { c: 0, s: 0, a: 0, d: 0 });
  const th = (k, t, num = true) => `<th class="${num ? 'num' : ''}" style="cursor:pointer" data-o="${k}">${t}${st.orden === k ? ' ▾' : ''}</th>`;
  v.innerHTML = `<div class="panel">
    <div class="barra">
      <label class="campo fila">Desde <input type="date" id="c-desde" value="${desde}"></label>
      <label class="campo fila">Hasta <input type="date" id="c-hasta" value="${hasta}"></label>
      <span class="sep"></span>
      <button class="btn" id="c-csv">${svg('descargar')} Exportar CSV</button>
      <button class="btn" data-imprimir data-titulo="Contador de sustituciones" data-sub="Del ${esc(fechaCorta(desde))} al ${esc(fechaCorta(hasta))}">${svg('imprimir')} Imprimir</button>
    </div>
    <h2>Contador de sustituciones</h2>
    <p class="sub">Horas que cada persona ha cubierto y horas en las que ha habido que sustituirla. Las bajas largas con sustituto/a no generan horas a partir de su incorporación.</p>
    <div class="chips" style="margin-bottom:12px"><span class="chip azul">${tot.c} horas cubiertas</span><span class="chip naranja">${tot.a} ausencias · ${tot.d} días lectivos</span></div>
    <div class="tabla-wrap"><table class="datos"><thead><tr>${th('nombre', 'Profesor/a', false)}${th('horas_cubiertas', 'Ha sustituido (h)')}<th style="width:22%"></th>${th('horas_sustituido', 'Le han sustituido (h)')}<th style="width:22%"></th>${th('ausencias', 'Ausencias')}${th('dias_ausencia', 'Días')}</tr></thead>
    <tbody>${filas.map(f => `<tr><td>${esc(f.d.nombre)}${f.d.activo === false ? ' <span class="chip">inactivo</span>' : ''}${f.d.en_bolsa === false ? ' <span class="chip">no sustituye</span>' : ''}</td>
      <td class="num"><b>${f.horas_cubiertas}</b></td><td><div class="barra-num" style="width:${f.horas_cubiertas / maxC * 100}%"></div></td>
      <td class="num">${f.horas_sustituido}</td><td><div class="barra-num naranja" style="width:${f.horas_sustituido / maxS * 100}%"></div></td>
      <td class="num">${f.ausencias}</td><td class="num">${f.dias_ausencia}</td></tr>`).join('')}</tbody></table></div>
  </div>`;
  $('#c-desde').onchange = e => { st.desde = e.target.value; vContador(); };
  $('#c-hasta').onchange = e => { st.hasta = e.target.value; vContador(); };
  $$('[data-o]', v).forEach(t => t.onclick = () => { st.orden = t.dataset.o; vContador(); });
  $('#c-csv').onclick = () => {
    const filasCsv = [['Fecha', 'Tramo', 'Grupo', 'Materia', 'Ausente', 'Sustituto', 'Nota']];
    for (const c of [...db.coberturas].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
      if ((desde && c.fecha < desde) || (hasta && c.fecha > hasta)) continue;
      const o = ix.oc[c.ocupacion_id];
      filasCsv.push([c.fecha, ix.tramo[c.tramo_id]?.etiqueta || '', nombreGrupos(ix, o?.grupos), o?.materia || '', nombre(ix, c.ausente_id), c.sustituto_id ? nombre(ix, c.sustituto_id) : 'Sin cubrir', c.nota || '']);
    }
    descargar(`sustituciones_${desde}_${hasta}.csv`, '﻿' + filasCsv.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\r\n'), 'text/csv');
  };
}

function descargar(nombreArchivo, contenido, tipo = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  a.download = nombreArchivo; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* =====================================================================
   HORARIOS (edición)
   ===================================================================== */
function vHorarios() {
  const v = $('#vista');
  const porGrupo = st.modoH === 'grupo';
  if (!st.docH) st.docH = ix.alfabetico[0]?.id || '';
  if (!st.grpH) st.grpH = ix.grupos[0]?.id || '';
  let selector, titulo;
  if (porGrupo) {
    const n = db.ocupaciones.filter(o => (o.grupos || []).includes(st.grpH) && LECTIVAS.has(o.tipo));
    const horas = new Set(n.map(o => o.dia + '|' + o.tramo_id)).size;
    const tutor = ix.grp[st.grpH]?.tutor_id;
    selector = `<select id="h-grp">${opcionesGrupos(ix, st.grpH)}</select><span class="chip azul">${horas} horas semanales</span>${tutor ? `<span class="chip verde">Tutoría: ${esc(corto(ix, tutor))}</span>` : ''}`;
    titulo = ix.grp[st.grpH]?.nombre || '';
  } else {
    const n = db.ocupaciones.filter(o => o.docente_id === st.docH);
    const lect = n.filter(o => LECTIVAS.has(o.tipo)).length;
    selector = `<select id="h-doc">${opcionesDocentes(ix, st.docH)}</select><span class="chip azul">${lect} horas lectivas</span><span class="chip">${n.length - lect} otras</span>`;
    titulo = nombre(ix, st.docH);
  }
  v.innerHTML = `<div class="panel">
    <div class="barra">
      ${selector}
      <span class="sep"></span>
      ${porGrupo ? '' : `<button class="btn" id="h-copiar">Copiar horario de otra persona…</button>`}
      <button class="btn" data-imprimir data-sub="${porGrupo ? 'Horario del grupo' : 'Horario del profesor/a'}">${svg('imprimir')} Imprimir</button>
    </div>
    <h2>${esc(titulo)}</h2>
    <p class="sub">Pulsa en cualquier casilla para añadir, cambiar o quitar lo que hay en ella.</p>
    <div id="h-grid">${horarioSemanal(db, ix, { tipo: porGrupo ? 'grupo' : 'docente', id: porGrupo ? st.grpH : st.docH, editable: true, resaltarHoy: false })}</div>
    <div id="h-avisos"></div>
  </div>`;
  if (porGrupo) $('#h-grp').onchange = e => { st.grpH = e.target.value; vHorarios(); };
  else { $('#h-doc').onchange = e => { st.docH = e.target.value; vHorarios(); }; $('#h-copiar').onclick = copiarHorario; }
  $$('.celda.editable', v).forEach(c => c.onclick = () => editarCelda(porGrupo ? { grupo: st.grpH } : { docente: st.docH }, +c.dataset.dia, c.dataset.tramo));
  avisosConflictos(porGrupo ? (o => (o.grupos || []).includes(st.grpH)) : (o => o.docente_id === st.docH), porGrupo ? null : st.docH);
}

// Avisos: grupos con dos clases a la vez sin desdoble y docentes en dos clases a la vez.
function avisosConflictos(afecta, docId) {
  const mapa = {};
  for (const o of db.ocupaciones) {
    if (!LECTIVAS.has(o.tipo)) continue;
    for (const g of o.grupos || []) {
      const k = `${g}|${o.dia}|${o.tramo_id}`;
      (mapa[k] = mapa[k] || []).push(o);
    }
  }
  const conflictos = [];
  for (const [k, lista] of Object.entries(mapa)) {
    if (lista.length < 2 || lista.every(o => o.subgrupo)) continue;
    if (!lista.some(afecta)) continue;
    const [g, dia, t] = k.split('|');
    conflictos.push(`${ix.grp[g]?.nombre} · ${DIAS[dia - 1]} ${ix.tramo[t]?.etiqueta}: ${lista.map(o => `${o.materia} (${corto(ix, o.docente_id)})`).join(', ')}`);
  }
  const porDoc = {};
  for (const o of db.ocupaciones.filter(o => LECTIVAS.has(o.tipo) && (docId ? o.docente_id === docId : afecta(o)))) {
    // en vista de grupo, revisa el resto de clases de los docentes de ese grupo
    for (const x of db.ocupaciones.filter(x => x.docente_id === o.docente_id && x.dia === o.dia && x.tramo_id === o.tramo_id && LECTIVAS.has(x.tipo))) {
      const k = `${x.docente_id}|${x.dia}|${x.tramo_id}`; (porDoc[k] = porDoc[k] || new Map()).set(x.id, x);
    }
  }
  for (const [k, m] of Object.entries(porDoc)) if (m.size > 1) {
    const [d, dia, t] = k.split('|'); const l = [...m.values()];
    conflictos.push(`${corto(ix, d)} tiene dos clases a la vez el ${DIAS[dia - 1]} a ${ix.tramo[t]?.etiqueta}: ${l.map(o => `${o.materia} ${nombreGrupos(ix, o.grupos)}`).join(' y ')}`);
  }
  $('#h-avisos').innerHTML = conflictos.length ? `<div class="aviso" style="margin-top:12px"><b>Revisa:</b><br>${[...new Set(conflictos)].map(esc).join('<br>')}</div>` : '';
}

function formOcupacion(o, i, conDocente = false) {
  return `<fieldset data-i="${i}" data-id="${o.id || ''}" style="border:1px solid var(--borde);border-radius:12px;padding:10px;margin:0">
    <div class="form-grid">
      ${conDocente ? `<label class="campo ancho">Profesor/a<select name="docente">${opcionesDocentes(ix, o.docente_id || '')}</select></label>` : ''}
      <label class="campo">Tipo<select name="tipo">${Object.entries(TIPOS).map(([k, t]) => `<option value="${k}" ${o.tipo === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="campo">Materia<input type="text" name="materia" list="dl-materias" value="${esc(o.materia || '')}" placeholder="LyL, MAT…"></label>
      <div class="campo ancho">Grupos<div class="checks">${ix.grupos.map(g => `<label><input type="checkbox" name="grupo" value="${g.id}" ${(o.grupos || []).includes(g.id) ? 'checked' : ''}>${esc(g.nombre)}</label>`).join('')}</div></div>
      <label class="campo">Desdoble / subgrupo<input type="text" name="subgrupo" value="${esc(o.subgrupo || '')}" placeholder="Grupo 1"></label>
      <label class="campo">Detalle<input type="text" name="detalle" value="${esc(o.detalle || '')}" placeholder="Pasillo ESO, apoyo 2º ESO B MAT…"></label>
      <label class="campo">Aula <span class="muted" style="font-weight:400">(si no es la del grupo)</span><input type="text" name="aula" value="${esc(o.aula || '')}" placeholder="Lab. Ciencias, Gimnasio…"></label>
      <label class="campo fila ancho" style="color:var(--rojo)"><input type="checkbox" name="quitar"> Quitar esta ocupación</label>
    </div></fieldset>`;
}

// quien: { docente } o { grupo }
async function editarCelda(quien, dia, tramoId) {
  const t = ix.tramo[tramoId];
  const porGrupo = !!quien.grupo;
  const ocs = db.ocupaciones.filter(o => o.dia === dia && o.tramo_id === tramoId &&
    (porGrupo ? (o.grupos || []).includes(quien.grupo) : o.docente_id === quien.docente));
  const blanco = () => ({ tipo: 'clase', grupos: porGrupo ? [quien.grupo] : [] });
  const lista = ocs.length ? ocs : [blanco()];
  const r = await modal({
    titulo: `${porGrupo ? ix.grp[quien.grupo]?.nombre : nombre(ix, quien.docente)} · ${DIAS[dia - 1]} ${t.etiqueta} (${t.inicio}–${t.fin})`,
    contenido: `<datalist id="dl-materias">${[...new Map(db.materias.map(m => [m.abrev, m])).values()].map(m => `<option value="${esc(m.abrev)}">${esc(m.nombre)}</option>`).join('')}</datalist>
      <div id="f-ocs" style="display:flex;flex-direction:column;gap:10px">${lista.map((o, i) => formOcupacion(o, i, porGrupo)).join('')}</div>
      <button type="button" class="btn" id="f-mas">${svg('mas')} Añadir otra (desdoble, ${porGrupo ? 'optativa…' : 'apoyo simultáneo…'})</button>`,
    alAbrir: d => { d.querySelector('#f-mas').onclick = () => d.querySelector('#f-ocs').insertAdjacentHTML('beforeend', formOcupacion(blanco(), Date.now(), porGrupo)); },
    validar: (b, d) => {
      if (!porGrupo) return null;
      for (const fs of d.querySelectorAll('fieldset')) {
        if (fs.querySelector('[name=quitar]').checked) continue;
        if (!fs.querySelector('[name=docente]').value && fs.querySelector('[name=materia]').value.trim()) return 'Elige el profesor/a de cada clase.';
      }
      return null;
    }
  });
  if (!r) return;
  const guardar = [], quitar = [];
  for (const fs of $$('fieldset', r.form)) {
    const q = n => fs.querySelector(`[name=${n}]`);
    const id = fs.dataset.id;
    const grupos = $$('[name=grupo]:checked', fs).map(x => x.value);
    const docente_id = porGrupo ? q('docente').value : quien.docente;
    const vacio = !q('materia').value.trim() && !q('detalle').value.trim() && q('tipo').value === 'clase' && (!grupos.length || porGrupo);
    if (q('quitar').checked || vacio || !docente_id) { if (id) quitar.push(id); continue; }
    guardar.push({ id: id || uid('o'), docente_id, dia, tramo_id: tramoId, tipo: q('tipo').value, materia: q('materia').value.trim(),
      grupos, subgrupo: q('subgrupo').value.trim(), detalle: q('detalle').value.trim(), aula: q('aula').value.trim() });
  }
  await seguro(async () => {
    if (quitar.length) await borrarFilas('ocupaciones', quitar);
    if (guardar.length) await guardarFilas('ocupaciones', guardar);
    const nuevas = [...new Set(guardar.map(o => o.materia).filter(m => m && !ix.mat[m]))].map(m => ({ id: uid('m'), abrev: m, nombre: m, niveles: [] }));
    if (nuevas.length) await guardarFilas('materias', nuevas);
  }, 'Horario actualizado');
  pintar();
}

/* =====================================================================
   APOYOS, COORDINACIONES Y NO LECTIVAS (rejilla como el documento de jefatura)
   ===================================================================== */
const OTRAS = ['apoyo', 'coordinacion', 'no_lectiva', 'guardia', 'otro'];
function vOtras() {
  const v = $('#vista');
  st.filtroOtras = st.filtroOtras || 'todas';
  const vale = o => OTRAS.includes(o.tipo) && (st.filtroOtras === 'todas' || o.tipo === st.filtroOtras);
  const cuenta = k => db.ocupaciones.filter(o => k === 'todas' ? OTRAS.includes(o.tipo) : o.tipo === k).length;
  const filas = ix.lectivos.map(t => `<tr><th class="tramo"><b>${esc(t.etiqueta)}</b>${esc(t.inicio)}–${esc(t.fin)}</th>${[1, 2, 3, 4, 5].map(d => {
    const ocs = db.ocupaciones.filter(o => o.dia === d && o.tramo_id === t.id && vale(o))
      .sort((a, b) => OTRAS.indexOf(a.tipo) - OTRAS.indexOf(b.tipo) || corto(ix, a.docente_id).localeCompare(corto(ix, b.docente_id)));
    return `<td><div class="celda" style="min-height:40px">${ocs.map(o =>
      `<button class="oc t-${o.tipo}" data-oc="${o.id}" style="text-align:left;cursor:pointer;border-top:0;border-right:0;border-bottom:0;width:100%"><span class="m">${esc(corto(ix, o.docente_id))}</span>
        <div class="g">${esc(TIPOS[o.tipo])}${(o.grupos || []).length ? ' · ' + esc(nombreGrupos(ix, o.grupos)) : ''}${o.detalle && o.detalle !== TIPOS[o.tipo] && !(o.grupos || []).length ? ' · ' + esc(o.detalle) : ''}</div></button>`).join('')}
      <button class="btn mini" data-nueva="${d}|${t.id}" style="align-self:flex-start" aria-label="Añadir">${svg('mas')}</button></div></td>`;
  }).join('')}</tr>`).join('');
  v.innerHTML = `<div class="panel">
    <div class="barra">
      <div class="seg" id="o-f">${[['todas', 'Todas'], ['apoyo', 'Apoyos'], ['coordinacion', 'Coordinación'], ['no_lectiva', 'No lectivas'], ['otro', 'Otras']].map(([k, tx]) =>
        `<button data-f="${k}" class="${st.filtroOtras === k ? 'activa' : ''}">${tx} (${cuenta(k)})</button>`).join('')}</div>
      <span class="sep"></span><button class="btn" data-imprimir data-titulo="Apoyos, coordinaciones y horas no lectivas">${svg('imprimir')} Imprimir</button>
    </div>
    <h2>Apoyos, coordinaciones y horas no lectivas</h2>
    <p class="sub">Pulsa en una persona para cambiarla o quitarla, o en + para añadir a alguien en ese tramo.</p>
    <div class="scroll"><table class="horario"><thead><tr><th class="tramo"></th>${DIAS.map(d => `<th>${d}</th>`).join('')}</tr></thead><tbody>${filas}</tbody></table></div>
    <div class="leyenda">${['apoyo', 'coordinacion', 'no_lectiva', 'otro'].map(k => `<span class="t-${k}"><i></i>${TIPOS[k]}</span>`).join('')}</div>
  </div>`;
  $$('#o-f button').forEach(b => b.onclick = () => { st.filtroOtras = b.dataset.f; vOtras(); });
  $$('[data-oc]', v).forEach(b => b.onclick = () => editarOtra(db.ocupaciones.find(o => o.id === b.dataset.oc)));
  $$('[data-nueva]', v).forEach(b => b.onclick = () => {
    const [dia, tramo_id] = b.dataset.nueva.split('|');
    editarOtra(null, { dia: +dia, tramo_id, tipo: st.filtroOtras !== 'todas' ? st.filtroOtras : 'apoyo' });
  });
}

async function editarOtra(o, defecto = {}) {
  const nueva = !o;
  o = o ? { ...o } : { id: uid('o'), docente_id: '', materia: '', grupos: [], subgrupo: '', detalle: '', ...defecto };
  const r = await modal({
    titulo: nueva ? 'Añadir' : `${nombre(ix, o.docente_id)} · ${DIAS[o.dia - 1]} ${ix.tramo[o.tramo_id]?.etiqueta}`,
    botones: nueva ? [{ id: 'ok', texto: 'Guardar', pri: true }] : [{ id: 'del', texto: 'Quitar', peligro: true }, { id: 'ok', texto: 'Guardar', pri: true }],
    contenido: `<div class="form-grid">
      <label class="campo ancho">Profesor/a<select name="docente">${opcionesDocentes(ix, o.docente_id)}</select></label>
      <label class="campo">Día<select name="dia">${DIAS.map((d, i) => `<option value="${i + 1}" ${o.dia === i + 1 ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <label class="campo">Tramo<select name="tramo">${ix.lectivos.map(t => `<option value="${t.id}" ${o.tramo_id === t.id ? 'selected' : ''}>${esc(t.etiqueta)} (${esc(t.inicio)})</option>`).join('')}</select></label>
      <label class="campo">Tipo<select name="tipo">${OTRAS.map(k => `<option value="${k}" ${o.tipo === k ? 'selected' : ''}>${TIPOS[k]}</option>`).join('')}</select></label>
      <label class="campo">Detalle<input type="text" name="detalle" value="${esc(o.detalle || '')}" placeholder="Pasillo ESO, Lengua, Coord. P…"></label>
      <div class="campo ancho">Grupo donde hace el apoyo<div class="checks">${ix.grupos.map(g => `<label><input type="checkbox" name="grupo" value="${g.id}" ${(o.grupos || []).includes(g.id) ? 'checked' : ''}>${esc(g.nombre)}</label>`).join('')}</div></div>
    </div>`,
    validar: (b, d) => {
      if (b === 'del') return null;
      const doc = d.querySelector('[name=docente]').value, dia = +d.querySelector('[name=dia]').value, t = d.querySelector('[name=tramo]').value;
      if (!doc) return 'Elige a la persona.';
      const choca = db.ocupaciones.find(x => x.id !== o.id && x.docente_id === doc && x.dia === dia && x.tramo_id === t && LECTIVAS.has(x.tipo));
      if (choca) return `${nombre(ix, doc)} tiene clase a esa hora (${choca.materia} ${nombreGrupos(ix, choca.grupos)}).`;
      return null;
    }
  });
  if (!r) return;
  if (r.boton === 'del') { await seguro(() => borrarFilas('ocupaciones', o.id), 'Quitado'); return vOtras(); }
  const q = n => r.form.querySelector(`[name=${n}]`).value;
  await seguro(() => guardarFilas('ocupaciones', { ...o, docente_id: q('docente'), dia: +q('dia'), tramo_id: q('tramo'), tipo: q('tipo'), detalle: q('detalle').trim(), grupos: $$('[name=grupo]:checked', r.form).map(x => x.value) }), 'Guardado');
  vOtras();
}

async function copiarHorario() {
  const destino = st.docH;
  const r = await modal({
    titulo: `Copiar horario en ${nombre(ix, destino)}`,
    contenido: `<label class="campo">Copiar el horario de<select name="origen">${opcionesDocentes(ix, '')}</select></label>
      <label class="campo fila" style="color:var(--texto)"><input type="checkbox" name="reemplazar" checked> Borrar antes el horario actual de ${esc(nombre(ix, destino))}</label>
      <label class="campo fila" style="color:var(--texto)"><input type="checkbox" name="mover"> Quitar el horario a la persona de origen (traspaso definitivo)</label>
      <p class="small muted" style="margin:0">Para una baja temporal no hace falta copiar nada: basta con indicar el sustituto/a en «Ausencias y bajas».</p>`,
    botones: [{ id: 'ok', texto: 'Copiar', pri: true }],
    validar: (b, d) => !d.querySelector('[name=origen]').value ? 'Elige de quién copiar.' : d.querySelector('[name=origen]').value === destino ? 'Elige otra persona.' : null
  });
  if (!r) return;
  const origen = r.form.querySelector('[name=origen]').value;
  const reemplazar = r.form.querySelector('[name=reemplazar]').checked;
  const mover = r.form.querySelector('[name=mover]').checked;
  await seguro(async () => {
    if (reemplazar) await borrarFilas('ocupaciones', db.ocupaciones.filter(o => o.docente_id === destino).map(o => o.id));
    const src = db.ocupaciones.filter(o => o.docente_id === origen);
    if (mover) await guardarFilas('ocupaciones', src.map(o => ({ ...o, docente_id: destino })));
    else await guardarFilas('ocupaciones', src.map(o => ({ ...o, id: uid('o'), docente_id: destino })));
  }, 'Horario copiado');
  vHorarios();
}

/* =====================================================================
   PROFESORADO
   ===================================================================== */
function vProfes() {
  const v = $('#vista');
  const horas = id => db.ocupaciones.filter(o => o.docente_id === id && LECTIVAS.has(o.tipo)).length;
  v.innerHTML = `<div class="panel">
    <div class="barra"><h2 style="margin:0">Profesorado</h2><span class="sep"></span><button class="btn pri" id="p-nuevo">${svg('mas')} Añadir</button></div>
    <p class="sub">Los cambios se guardan al salir de cada casilla. «Nombre corto» es el que se ve en la sábana y en «Ahora». «Sustituye» indica si entra en el reparto de sustituciones.</p>
    <div class="tabla-wrap"><table class="datos"><thead><tr><th style="width:56px">Orden</th><th>Nombre completo</th><th>Nombre corto</th><th>Siglas aSc</th><th class="num">Horas</th><th>Activo</th><th>Sustituye</th><th>Notas</th><th></th></tr></thead>
    <tbody>${ix.docentes.map(d => `<tr data-id="${d.id}">
      <td><input type="text" name="orden" value="${d.orden ?? ''}" style="width:52px"></td>
      <td><input type="text" name="nombre" value="${esc(d.nombre)}"></td>
      <td><input type="text" name="corto" value="${esc(d.corto || '')}"></td>
      <td><input type="text" name="abrev" value="${esc(d.abrev || '')}" style="width:70px"></td>
      <td class="num">${horas(d.id)}</td>
      <td><input type="checkbox" name="activo" ${d.activo !== false ? 'checked' : ''}></td>
      <td><input type="checkbox" name="en_bolsa" ${d.en_bolsa !== false ? 'checked' : ''}></td>
      <td><input type="text" name="notas" value="${esc(d.notas || '')}"></td>
      <td><button class="btn mini peligro" data-del="${d.id}" aria-label="Borrar">${svg('x')}</button></td></tr>`).join('')}</tbody></table></div>
  </div>`;
  $$('tr[data-id] input', v).forEach(inp => inp.onchange = async () => {
    const tr = inp.closest('tr'); const d = { ...ix.doc[tr.dataset.id] };
    const k = inp.name;
    d[k] = inp.type === 'checkbox' ? inp.checked : k === 'orden' ? (parseInt(inp.value, 10) || 0) : inp.value.trim();
    await seguro(() => guardarFilas('docentes', d), 'Guardado');
  });
  $('#p-nuevo').onclick = async () => {
    const d = { id: uid('d'), nombre: 'Nuevo profesor/a', corto: 'Nuevo', abrev: '', activo: true, en_bolsa: true, orden: (ix.docentes.at(-1)?.orden || 0) + 1, notas: '' };
    await seguro(() => guardarFilas('docentes', d));
    vProfes();
    const inp = $(`tr[data-id="${d.id}"] input[name=nombre]`); inp?.focus(); inp?.select();
  };
  $$('[data-del]', v).forEach(b => b.onclick = async () => {
    const id = b.dataset.del; const d = ix.doc[id];
    const usos = db.ocupaciones.filter(o => o.docente_id === id).length + db.coberturas.filter(c => c.sustituto_id === id || c.ausente_id === id).length
      + db.ausencias.filter(a => a.docente_id === id || a.sustituto_id === id).length;
    if (usos) {
      if (await confirmar(`${d.nombre} tiene horario, ausencias o sustituciones registradas. En vez de borrarla, ¿la marcamos como inactiva? (Se conserva el historial del contador.)`, 'Marcar inactiva')) {
        await seguro(() => guardarFilas('docentes', { ...d, activo: false, en_bolsa: false }), 'Marcada como inactiva'); vProfes();
      }
      return;
    }
    if (!await confirmar(`¿Borrar a ${d.nombre}?`, 'Borrar', true)) return;
    await seguro(() => borrarFilas('docentes', id), 'Borrado'); vProfes();
  });
}

/* =====================================================================
   CATÁLOGOS: grupos, materias, tramos
   ===================================================================== */
function vCatalogos(parte) {
  const v = $('#vista');
  const tablaEditable = (tabla, cols, filas, titulo, ayuda) => `<div class="panel" data-tabla="${tabla}">
    <div class="barra"><h2 style="margin:0">${titulo}</h2><span class="sep"></span><button class="btn" data-add="${tabla}">${svg('mas')} Añadir</button></div>
    ${ayuda ? `<p class="sub">${ayuda}</p>` : ''}
    <div class="tabla-wrap"><table class="datos"><thead><tr>${cols.map(c => `<th>${c.t}</th>`).join('')}<th></th></tr></thead><tbody>
    ${filas.map(f => `<tr data-id="${f.id}">${cols.map(c => `<td>${c.campo(f)}</td>`).join('')}<td><button class="btn mini peligro" data-del="${f.id}" aria-label="Borrar">${svg('x')}</button></td></tr>`).join('')}
    </tbody></table></div></div>`;
  const txt = (k, w = '') => f => `<input type="text" name="${k}" value="${esc(f[k] ?? '')}" ${w ? `style="width:${w}"` : ''}>`;
  v.innerHTML = parte === 'grupos' ?
    tablaEditable('grupos', [
      { t: 'Orden', campo: txt('orden', '52px') }, { t: 'Nombre', campo: txt('nombre') }, { t: 'Etapa', campo: txt('etapa') },
      { t: 'Tutor/a', campo: f => `<select name="tutor_id">${opcionesDocentes(ix, f.tutor_id || '', { vacio: '—' })}</select>` },
      { t: 'Aula', campo: txt('aula', '110px') }
    ], ix.grupos, 'Grupos', 'El aula de cada grupo aparece en «Hoy» junto a cada sustitución.') :
    tablaEditable('tramos', [
      { t: 'Orden', campo: txt('orden', '52px') }, { t: 'Etiqueta', campo: txt('etiqueta') },
      { t: 'Inicio', campo: f => `<input type="time" name="inicio" value="${f.inicio}">` }, { t: 'Fin', campo: f => `<input type="time" name="fin" value="${f.fin}">` },
      { t: 'Lectivo', campo: f => `<input type="checkbox" name="lectivo" ${f.lectivo ? 'checked' : ''}>` }
    ], ix.tramos, 'Tramos horarios', 'Marca como no lectivo el recreo. «Hoy» usa estas horas para saber qué tramo está en curso.');

  $$('[data-tabla]', v).forEach(p => {
    const tabla = p.dataset.tabla;
    $$('tr[data-id] input, tr[data-id] select', p).forEach(inp => inp.onchange = async () => {
      const id = inp.closest('tr').dataset.id;
      const f = { ...db[tabla].find(x => x.id === id) };
      f[inp.name] = inp.type === 'checkbox' ? inp.checked : inp.name === 'orden' ? (parseInt(inp.value, 10) || 0)
        : inp.name === 'niveles' ? inp.value.split(',').map(x => x.trim()).filter(Boolean) : (inp.value || null);
      if (inp.name === 'tutor_id' && !inp.value) f.tutor_id = null;
      await seguro(() => guardarFilas(tabla, f), 'Guardado');
    });
    p.querySelector('[data-add]').onclick = async () => {
      const n = db[tabla].length + 1;
      const nuevo = tabla === 'grupos' ? { id: uid('g'), nombre: 'Nuevo grupo', etapa: '', orden: n, tutor_id: null, aula: '' }
        : tabla === 'materias' ? { id: uid('m'), abrev: 'NUEVA', nombre: '', niveles: [] }
          : { id: uid('t'), orden: n, etiqueta: `${n}ª`, inicio: '14:30', fin: '15:30', lectivo: true };
      await seguro(() => guardarFilas(tabla, nuevo)); pintar();
    };
    $$('[data-del]', p).forEach(b => b.onclick = async () => {
      const id = b.dataset.del;
      const usado = tabla === 'grupos' ? db.ocupaciones.some(o => (o.grupos || []).includes(id))
        : tabla === 'tramos' ? db.ocupaciones.some(o => o.tramo_id === id) : false;
      if (usado) return toast('Está en uso en algún horario: quítalo de los horarios antes de borrarlo.', true);
      if (!await confirmar('¿Borrar?', 'Borrar', true)) return;
      await seguro(() => borrarFilas(tabla, id), 'Borrado'); pintar();
    });
  });
}

/* =====================================================================
   MATERIAS: nombre oficial y quién la da en cada grupo (sale del horario)
   ===================================================================== */
const nivelDe = gid => (ix.grp[gid]?.nombre || '').replace(/\s+[A-Z]$/, '');
function vMaterias() {
  const v = $('#vista');
  const abrevs = [...new Set([...db.materias.map(m => m.abrev), ...db.ocupaciones.filter(o => o.materia).map(o => o.materia)])].sort((a, b) => a.localeCompare(b));
  st.matFiltro = st.matFiltro || '';
  const tarjetas = abrevs.filter(ab => !st.matFiltro || normal(ab + ' ' + db.materias.filter(m => m.abrev === ab).map(m => m.nombre).join(' ')).includes(normal(st.matFiltro))).map(ab => {
    const ocs = db.ocupaciones.filter(o => o.materia === ab && LECTIVAS.has(o.tipo));
    // Quién la da y en qué grupos
    const porDoc = {};
    for (const o of ocs) {
      const d = (porDoc[o.docente_id] = porDoc[o.docente_id] || { horas: 0, grupos: new Set() });
      d.horas++; (o.grupos || []).forEach(g => d.grupos.add(g));
    }
    // Nombre oficial por curso: un nombre para cada curso donde se imparte
    const niveles = [...new Set(ocs.flatMap(o => (o.grupos || []).map(nivelDe)))].sort();
    const filasNombre = (niveles.length ? niveles : ['']).map(n => {
      const nom = nombreMateria(ix, ab, ocs.find(o => (o.grupos || []).some(g => nivelDe(g) === n))?.grupos || []);
      return `<label class="campo fila" style="color:var(--texto);font-weight:500"><span style="min-width:74px" class="muted small">${esc(n || 'Nombre')}</span>
        <input type="text" data-nombre="${esc(ab)}" data-nivel="${esc(n)}" value="${esc(nom === ab ? '' : nom)}" placeholder="Nombre oficial" style="flex:1"></label>`;
    }).join('');
    const quien = Object.entries(porDoc).sort((a, b) => b[1].horas - a[1].horas).map(([d, x]) =>
      `<li><span><b>${esc(nombre(ix, d))}</b> <span class="d">${x.horas} h</span></span><span class="chips">${[...x.grupos].sort((a, b) => (ix.grp[a]?.orden || 0) - (ix.grp[b]?.orden || 0)).map(g => `<span class="chip azul">${esc(ix.grp[g]?.nombre || g)}</span>`).join('')}</span></li>`).join('');
    return `<div class="panel" style="margin-bottom:10px">
      <div class="barra" style="margin-bottom:6px"><h2 style="margin:0">${esc(ab)}</h2><span class="chip">${ocs.length} h/semana</span><span class="sep"></span>
        ${ocs.length ? '' : `<button class="btn mini peligro" data-delmat="${esc(ab)}">Borrar</button>`}</div>
      <div class="cols" style="grid-template-columns:minmax(0,1fr) minmax(0,1.3fr)">
        <div><h3 style="margin-top:0">Nombre oficial${niveles.length > 1 ? ' por curso' : ''}</h3>${filasNombre}</div>
        <div><h3 style="margin-top:0">Quién la da</h3>${quien ? `<ul class="lista">${quien}</ul>` : '<p class="muted small">Todavía no está en ningún horario.</p>'}</div>
      </div></div>`;
  }).join('');
  v.innerHTML = `<div class="panel">
    <div class="barra"><h2 style="margin:0">Materias</h2><input type="search" id="m-buscar" placeholder="Buscar materia…" value="${esc(st.matFiltro)}"><span class="sep"></span>
      <button class="btn" id="m-nueva">${svg('mas')} Nueva materia</button></div>
    <p class="sub">Cada materia muestra quién la da y en qué grupos. Esa relación sale directamente de los horarios: para cambiar quién da una materia o dónde,
      edítalo en <i>Horarios</i> y aquí se actualiza solo. Si una materia cambia de nombre según el curso (p. ej. Lengua Castellana y Literatura I en 1º Bach.), aparece una línea por curso.</p>
  </div>${tarjetas || '<p class="vacio">No hay materias.</p>'}`;
  const b = $('#m-buscar'); b.oninput = () => { st.matFiltro = b.value; const pos = b.selectionStart; vMaterias(); const n = $('#m-buscar'); n.focus(); n.setSelectionRange(pos, pos); };
  $$('[data-nombre]', v).forEach(inp => inp.onchange = async () => {
    const ab = inp.dataset.nombre, niv = inp.dataset.nivel, nom = inp.value.trim() || ab;
    const filas = db.materias.filter(m => m.abrev === ab);
    const general = filas.find(m => !(m.niveles || []).length);
    const propia = filas.find(m => (m.niveles || []).includes(niv));
    let fila;
    if (!niv) fila = { ...(general || { id: uid('m'), abrev: ab, niveles: [] }), nombre: nom };
    else if (propia && propia.niveles.length === 1) fila = { ...propia, nombre: nom };
    else {
      // Separar este curso de la fila compartida
      if (propia) await guardarFilas('materias', { ...propia, niveles: propia.niveles.filter(n => n !== niv) });
      fila = { id: uid('m'), abrev: ab, nombre: nom, niveles: [niv] };
    }
    await seguro(() => guardarFilas('materias', fila), 'Nombre guardado');
  });
  $('#m-nueva').onclick = async () => {
    const r = await modal({ titulo: 'Nueva materia', contenido: `<div class="form-grid"><label class="campo">Siglas<input type="text" name="abrev" placeholder="p. ej. LAT"></label>
      <label class="campo">Nombre oficial<input type="text" name="nombre" placeholder="Latín"></label></div>
      <p class="small muted" style="margin:0">Después, ponla en los horarios (Horarios → Profesorado o Grupos) y aquí aparecerá quién la da.</p>`,
      validar: (b, d) => { const ab = d.querySelector('[name=abrev]').value.trim(); return !ab ? 'Escribe las siglas.' : ix.mat[ab] ? 'Ya existe una materia con esas siglas.' : null; } });
    if (!r) return;
    const q = n => r.form.querySelector(`[name=${n}]`).value.trim();
    await seguro(() => guardarFilas('materias', { id: uid('m'), abrev: q('abrev'), nombre: q('nombre') || q('abrev'), niveles: [] }), 'Materia creada');
    vMaterias();
  };
  $$('[data-delmat]', v).forEach(btn => btn.onclick = async () => {
    if (!await confirmar(`¿Borrar la materia ${btn.dataset.delmat}?`, 'Borrar', true)) return;
    await seguro(() => borrarFilas('materias', db.materias.filter(m => m.abrev === btn.dataset.delmat).map(m => m.id)), 'Borrada'); vMaterias();
  });
}

/* =====================================================================
   RECREOS
   ===================================================================== */
function vRecreos() {
  const v = $('#vista');
  const zonas = [...db.zonas_recreo].sort((a, b) => a.orden - b.orden);
  v.innerHTML = `<div class="panel">
    <div class="barra"><h2 style="margin:0">Turnos de recreo</h2><span class="sep"></span><button class="btn" id="r-zona">${svg('mas')} Añadir zona</button></div>
    <p class="sub">Pulsa en un nombre para quitarlo o cambiar su nota. Usa el desplegable de cada casilla para añadir a alguien.</p>
    <div class="tabla-wrap"><table class="datos"><thead><tr><th>Zona</th>${DIAS.map(d => `<th>${d}</th>`).join('')}</tr></thead><tbody>
    ${zonas.map(z => `<tr><td style="white-space:nowrap"><b>${esc(z.nombre)}</b><div class="muted small">${esc(z.patio)}</div>
        <button class="btn mini" data-zona="${z.id}" style="margin-top:4px">${svg('lapiz')} Editar</button></td>
      ${[1, 2, 3, 4, 5].map(d => `<td style="min-width:130px"><div class="chips" style="margin-bottom:6px">${db.turnos_recreo.filter(t => t.zona_id === z.id && t.dia === d).map(t =>
        `<button class="chip azul" data-turno="${t.id}" title="${esc(t.nota || '')}" style="border:0;cursor:pointer">${esc(corto(ix, t.docente_id))}${t.nota ? ' *' : ''}</button>`).join('')}</div>
        <select data-add="${z.id}|${d}" style="width:100%;min-height:30px;padding:2px 6px">${opcionesDocentes(ix, '', { vacio: '+ Añadir…', soloActivos: true })}</select></td>`).join('')}</tr>`).join('')}
    </tbody></table></div></div>`;
  $$('[data-add]', v).forEach(s => s.onchange = async () => {
    if (!s.value) return;
    const [zona_id, dia] = s.dataset.add.split('|');
    await seguro(() => guardarFilas('turnos_recreo', { id: uid('r'), zona_id, dia: +dia, docente_id: s.value, nota: '' }));
    vRecreos();
  });
  $$('[data-turno]', v).forEach(b => b.onclick = async () => {
    const t = db.turnos_recreo.find(x => x.id === b.dataset.turno);
    const r = await modal({ titulo: `${nombre(ix, t.docente_id)} · ${DIAS[t.dia - 1]}`, contenido: `<label class="campo">Nota<input type="text" name="nota" value="${esc(t.nota || '')}" placeholder="Ej.: grupos A, toca el timbre…"></label>`,
      botones: [{ id: 'del', texto: 'Quitar del turno', peligro: true }, { id: 'ok', texto: 'Guardar', pri: true }] });
    if (!r) return;
    if (r.boton === 'del') await seguro(() => borrarFilas('turnos_recreo', t.id));
    else await seguro(() => guardarFilas('turnos_recreo', { ...t, nota: r.form.querySelector('[name=nota]').value.trim() }));
    vRecreos();
  });
  const editarZona = async z => {
    const nueva = !z; z = z || { id: uid('z'), patio: '', nombre: '', descripcion: '', orden: zonas.length + 1 };
    const r = await modal({ titulo: nueva ? 'Nueva zona' : 'Editar zona',
      botones: nueva ? [{ id: 'ok', texto: 'Guardar', pri: true }] : [{ id: 'del', texto: 'Borrar zona', peligro: true }, { id: 'ok', texto: 'Guardar', pri: true }],
      contenido: `<div class="form-grid"><label class="campo">Patio<input type="text" name="patio" value="${esc(z.patio)}"></label>
        <label class="campo">Orden<input type="number" name="orden" value="${z.orden}"></label>
        <label class="campo ancho">Zona<input type="text" name="nombre" value="${esc(z.nombre)}"></label>
        <label class="campo ancho">Indicaciones<textarea name="descripcion">${esc(z.descripcion)}</textarea></label></div>`,
      validar: (b, d) => b === 'ok' && !d.querySelector('[name=nombre]').value.trim() ? 'Pon un nombre a la zona.' : null });
    if (!r) return;
    if (r.boton === 'del') {
      if (!await confirmar('¿Borrar la zona y sus turnos?', 'Borrar', true)) return;
      await seguro(async () => { await borrarFilas('turnos_recreo', db.turnos_recreo.filter(t => t.zona_id === z.id).map(t => t.id)); await borrarFilas('zonas_recreo', z.id); });
    } else {
      const q = n => r.form.querySelector(`[name=${n}]`).value.trim();
      await seguro(() => guardarFilas('zonas_recreo', { ...z, patio: q('patio'), nombre: q('nombre'), descripcion: q('descripcion'), orden: parseInt(q('orden'), 10) || 0 }), 'Zona guardada');
    }
    vRecreos();
  };
  $('#r-zona').onclick = () => editarZona(null);
  $$('[data-zona]', v).forEach(b => b.onclick = () => editarZona(db.zonas_recreo.find(z => z.id === b.dataset.zona)));
}

/* =====================================================================
   PRIORIDAD PARA SUSTITUIR
   ===================================================================== */
function vPrioridad() {
  const v = $('#vista');
  const prioridad = ((db.config.prioridad && db.config.prioridad.length) ? db.config.prioridad : PRIORIDAD_DEFECTO).filter(k => k !== 'libre');
  v.innerHTML = `<div class="panel">
    <h2 class="verde">Prioridad para sustituir</h2>
    <p class="sub">Orden en que se proponen candidatos cuando falta alguien. Dentro de cada bloque, primero quien menos sustituciones lleva.
      Quien tiene un hueco libre no se propone ni se asigna automáticamente (es su tiempo personal): aparece al final de la lista solo por si se ofrece.</p>
    <ul class="lista" style="max-width:460px">${prioridad.map((p, i) => `<li><span>${i + 1}. ${esc(CATEGORIAS[p] || p)}</span><span>
      <button class="btn mini" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button><button class="btn mini" data-down="${i}" ${i === prioridad.length - 1 ? 'disabled' : ''} aria-label="Bajar">↓</button></span></li>`).join('')}</ul>
  </div>`;
  $$('[data-up],[data-down]', v).forEach(b => b.onclick = async () => {
    const p = [...prioridad]; const i = +(b.dataset.up ?? b.dataset.down); const j = b.dataset.up != null ? i - 1 : i + 1;
    [p[i], p[j]] = [p[j], p[i]];
    await seguro(() => D.guardarConfig('prioridad', p, cid()), 'Prioridad guardada');
    db.config.prioridad = p; vPrioridad();
  });
}

/* =====================================================================
   NUEVO HORARIO (próximamente)
   ===================================================================== */
function vNuevo() {
  const url = D.config().nuevoHorarioUrl;
  $('#vista').innerHTML = `<div class="panel" style="max-width:760px">
    <h2 class="naranja">Nuevo horario</h2>
    <p>La herramienta para <b>crear los horarios</b> del curso siguiente será un proyecto aparte. Desde aquí se abrirá y, cuando el horario esté
      terminado, se exportará para cargarlo en <i>Cursos → Exportar / importar</i> (en un curso nuevo preparado en <i>Cursos → Curso académico</i>).</p>
    ${url ? `<a class="btn pri" href="${esc(url)}" target="_blank" rel="noopener">Abrir la herramienta de horarios</a>`
      : '<span class="chip naranja">Próximamente</span><p class="small muted">Cuando exista, basta con poner su dirección en <code>config.js</code> (<code>nuevoHorarioUrl</code>) y aparecerá aquí el botón.</p>'}
  </div>`;
}

/* =====================================================================
   CURSO Y DATOS
   ===================================================================== */
async function vCurso(parte = 'academico') {
  const v = $('#vista');
  let admins = [];
  if (parte === 'accesos') try { admins = await D.listarAdmins(); } catch {}
  const P = {};
  P.academico = `
  <div class="panel">
    <h2>Cursos académicos</h2>
    <p class="sub">Cada curso guarda su propio profesorado, horarios, ausencias y contador. El curso activo es el que ve el claustro.</p>
    <div class="tabla-wrap"><table class="datos"><thead><tr><th>Curso</th><th>Inicio</th><th>Fin</th><th>Estado</th><th></th></tr></thead><tbody>
      ${db.cursos.map(c => `<tr><td><b>${esc(c.nombre)}</b></td><td>${esc(fechaCorta(c.inicio))}</td><td>${esc(fechaCorta(c.fin))}</td>
        <td>${c.activo ? '<span class="chip verde">Activo</span>' : ''} ${c.id === db.curso.id ? '<span class="chip azul">Viendo</span>' : ''}</td>
        <td style="white-space:nowrap">${c.id !== db.curso.id ? `<button class="btn mini" data-ver="${c.id}">Ver</button>` : ''}
          ${!c.activo ? `<button class="btn mini" data-act="${c.id}">Activar</button>` : ''}
          ${c.id === db.curso.id ? `<button class="btn mini" data-fechas="${c.id}">${svg('lapiz')} Fechas</button>` : ''}
          ${!c.activo ? `<button class="btn mini peligro" data-borrar="${c.id}">Borrar</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="barra" style="margin-top:12px"><button class="btn pri" id="k-nuevo">${svg('mas')} Preparar nuevo curso</button></div>
  </div>`;
  P.datos = `
  <div class="panel">
    <h2 class="verde">Exportar</h2>
    <p class="sub">Descarga los datos del curso que estás viendo (${esc(db.curso.nombre)}).</p>
    <div class="opciones-io">
      <button class="opcion-io" id="k-exp">${svg('descargar')}<b>Copia de seguridad</b><span>Todo el curso en un archivo JSON (horarios, ausencias, contador, avisos…). Sirve para restaurarlo después.</span></button>
      <button class="opcion-io" id="k-csv">${svg('descargar')}<b>Horarios para Excel</b><span>Un CSV con cada hora de cada docente: día, tramo, tipo, materia, grupos y aula.</span></button>
    </div>
  </div>

  <div class="panel">
    <h2 class="naranja">Importar</h2>
    <p class="sub">Carga horarios en el curso que estás viendo (${esc(db.curso.nombre)}). Antes de guardar verás un resumen. Se conservan las personas que ya existen (con sus ausencias y su contador), los recreos y los avisos.</p>
    <div class="opciones-io">
      <label class="opcion-io">${svg('subir')}<b>PDF de aSc Horarios</b><span>El PDF «horario total» con las páginas de cada grupo y de cada profesor/a (como el de este curso).</span><input type="file" id="k-pdf" accept=".pdf,application/pdf" hidden></label>
      <label class="opcion-io">${svg('subir')}<b>XML de aSc Horarios</b><span>En aSc: <i>Archivo → Exportar → aSc Horarios XML</i>. Es el más completo.</span><input type="file" id="k-asc" accept=".xml,text/xml" hidden></label>
      <label class="opcion-io">${svg('subir')}<b>XML de Séneca</b><span>En Séneca: <i>Utilidades → Importación/Exportación → Exportación de horarios</i>. Aporta nombres completos, grupos, tramos y aulas.</span><input type="file" id="k-sen" accept=".xml,text/xml" hidden></label>
      <label class="opcion-io peligro">${svg('subir')}<b>Restaurar copia de seguridad</b><span>Sustituye TODO el curso por el contenido de una copia JSON descargada antes.</span><input type="file" id="k-imp" accept=".json,application/json" hidden></label>
    </div>
    <p class="small muted" id="k-estado"></p>
  </div>
  ${D.esDemo() ? `<div class="panel"><h2>Modo demostración</h2><p class="sub">Vuelve a cargar los datos originales importados del PDF (borra los cambios hechos en este navegador).</p>
    <button class="btn peligro" id="k-reset">Restablecer datos de demostración</button></div>` : ''}`;
  P.accesos = `
  <div class="panel">
    <h2 class="rojo">Personas con acceso a la administración</h2>
    <p class="sub">Correos de Microsoft 365 que pueden entrar a este panel (además de la propia web, Supabase solo admite cuentas @salesianas.org).</p>
    ${D.esDemo() ? '<p class="muted small">En modo demostración no se piden credenciales.</p>' : ''}
    <ul class="lista" style="max-width:460px">${admins.map(a => `<li><span>${esc(a.email)}</span><button class="btn mini peligro" data-qadm="${esc(a.email)}">Quitar</button></li>`).join('') || '<li class="muted">Ninguna</li>'}</ul>
    <div class="barra" style="margin-top:10px"><input type="email" id="k-adm" placeholder="nombre@salesianas.org" style="min-width:260px"><button class="btn" id="k-add">Añadir</button></div>
  </div>`;
  v.innerHTML = P[parte];
  const en = (sel, ev, fn) => { const e = $(sel); if (e) e[ev] = fn; };

  $$('[data-ver]', v).forEach(b => b.onclick = async () => { st.cursoId = b.dataset.ver; await recargar(); pintar(); });
  $$('[data-act]', v).forEach(b => b.onclick = async () => {
    if (!await confirmar('¿Activar este curso? Será el que vea todo el claustro.', 'Activar')) return;
    await seguro(() => D.activarCurso(b.dataset.act), 'Curso activado'); st.cursoId = b.dataset.act; await recargar(); pintar();
  });
  $$('[data-borrar]', v).forEach(b => b.onclick = async () => {
    const c = db.cursos.find(x => x.id === b.dataset.borrar);
    if (!await confirmar(`¿Borrar el curso ${c.nombre} con todos sus datos? No se puede deshacer. Descarga antes una copia si la necesitas.`, 'Borrar definitivamente', true)) return;
    await seguro(() => D.borrarCursoCompleto(c.id), 'Curso borrado');
    if (st.cursoId === c.id) st.cursoId = null;
    await recargar(); pintar();
  });
  $$('[data-fechas]', v).forEach(b => b.onclick = async () => {
    const c = db.curso;
    const r = await modal({ titulo: `Curso ${c.nombre}`, contenido: `<div class="form-grid"><label class="campo ancho">Nombre<input type="text" name="nombre" value="${esc(c.nombre)}"></label>
      <label class="campo">Inicio de clases<input type="date" name="inicio" value="${c.inicio || ''}"></label><label class="campo">Fin de clases<input type="date" name="fin" value="${c.fin || ''}"></label></div>` });
    if (!r) return;
    const q = n => r.form.querySelector(`[name=${n}]`).value;
    await seguro(() => D.guardarCurso({ ...c, nombre: q('nombre'), inicio: q('inicio') || null, fin: q('fin') || null }), 'Guardado');
    await recargar(); pintar();
  });
  en('#k-nuevo', 'onclick', nuevoCurso);
  en('#k-exp', 'onclick', () => {
    const out = { version: 1, centro: D.config().centro, curso: db.curso, config: db.config, exportado: new Date().toISOString() };
    for (const t of D.TABLAS) out[t] = db[t].map(({ curso_id, ...x }) => x);
    out.motivos = db.motivos;
    descargar(`horarios_${db.curso.nombre}_${hoyISO()}.json`, JSON.stringify(out, null, 1));
  });
  en('#k-imp', 'onchange', async e => {
    const f = e.target.files[0]; if (!f) return;
    let datos; try { datos = JSON.parse(await f.text()); } catch { return toast('El archivo no es un JSON válido.', true); }
    if (!datos.docentes || !datos.ocupaciones) return toast('El archivo no parece una copia de esta aplicación.', true);
    if (!await confirmar(`Se reemplazarán TODOS los datos del curso ${db.curso.nombre} por los de la copia (${datos.docentes.length} docentes, ${datos.ocupaciones.length} ocupaciones, ${(datos.coberturas || []).length} sustituciones). ¿Seguir?`, 'Reemplazar', true)) return;
    await seguro(async () => {
      for (const t of D.TABLAS) { await D.vaciarTabla(t, cid()); await D.guardar(t, datos[t] || [], cid()); }
      for (const [k, val] of Object.entries(datos.config || {})) await D.guardarConfig(k, val, cid());
      for (const [id, m] of Object.entries(datos.motivos || {})) await D.guardarMotivo(id, m, cid());
    }, 'Copia restaurada');
    await recargar(); pintar();
  });
  en('#k-csv', 'onclick', () => {
    const filas = [['Docente', 'Día', 'Tramo', 'Inicio', 'Tipo', 'Materia', 'Grupos', 'Subgrupo', 'Aula', 'Detalle']];
    const orden = o => (ix.doc[o.docente_id]?.orden || 0) * 1000 + o.dia * 100 + (ix.tramo[o.tramo_id]?.orden || 0);
    for (const o of [...db.ocupaciones].sort((a, b) => orden(a) - orden(b))) {
      const t = ix.tramo[o.tramo_id];
      filas.push([nombre(ix, o.docente_id), DIAS[o.dia - 1], t?.etiqueta || '', t?.inicio || '', TIPOS[o.tipo] || o.tipo, o.materia || '', nombreGrupos(ix, o.grupos), o.subgrupo || '', o.aula || '', o.detalle || '']);
    }
    descargar(`horarios_${db.curso.nombre}.csv`, '\ufeff' + filas.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\r\n'), 'text/csv');
  });
  const leer = async (input, fn, origen) => {
    const f = input.files[0]; input.value = ''; if (!f) return;
    const est = $('#k-estado');
    try { est.textContent = 'Leyendo el archivo…'; const res = await fn(f, m => { est.textContent = m; }); est.textContent = ''; await aplicarImportacion(res, origen); }
    catch (err) { console.error(err); est.textContent = ''; toast(err.message || String(err), true); }
  };
  en('#k-pdf', 'onchange', e => leer(e.target, importarPdfAsc, 'PDF de aSc'));
  en('#k-asc', 'onchange', e => leer(e.target, async f => importarAsc(await f.text()), 'XML de aSc'));
  en('#k-sen', 'onchange', e => leer(e.target, leerArchivoSeneca, 'Séneca'));
  en('#k-add', 'onclick', async () => {
    const e = $('#k-adm').value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return toast('Escribe un correo válido.', true);
    await seguro(() => D.guardarAdmin(e), 'Acceso concedido'); pintar();
  });
  $$('[data-qadm]', v).forEach(b => b.onclick = async () => {
    if (!await confirmar(`¿Quitar el acceso a ${b.dataset.qadm}?`, 'Quitar', true)) return;
    await seguro(() => D.borrarAdmin(b.dataset.qadm), 'Acceso retirado'); pintar();
  });
  const reset = $('#k-reset');
  if (reset) reset.onclick = async () => {
    if (!await confirmar('¿Restablecer los datos de demostración? Se perderán los cambios hechos en este navegador.', 'Restablecer', true)) return;
    await D.reiniciarDemo(); st.cursoId = null; await recargar(); toast('Datos restablecidos'); pintar();
  };
}

/* ---------- Importación (PDF / XML de aSc / Séneca) ---------- */
const normal = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9ºª]+/g, ' ').trim();
function buscarDocente(d) {
  const n = normal(d.nombre);
  return db.docentes.find(x => d.abrev && x.abrev && x.abrev === d.abrev)
    || db.docentes.find(x => normal(x.nombre) === n)
    || db.docentes.find(x => normal(x.nombre).startsWith(n + ' ') || n.startsWith(normal(x.nombre) + ' '))
    || db.docentes.find(x => normal(x.corto) === n);
}

async function aplicarImportacion(res, origen) {
  // Emparejar con lo que ya hay para conservar ids (ausencias, contador, recreos…)
  const mapaDoc = {}, mapaGrp = {}, mapaTramo = {};
  const docNuevos = [], docExist = [];
  for (const d of res.docentes) {
    const p = buscarDocente(d);
    if (p) { mapaDoc[d.id] = p.id; docExist.push({ p, d }); } else docNuevos.push(d);
  }
  for (const g of res.grupos) { const p = db.grupos.find(x => normal(x.nombre) === normal(g.nombre)); if (p) mapaGrp[g.id] = p.id; }
  for (const t of res.tramos) { const p = db.tramos.find(x => x.inicio === t.inicio && x.lectivo === t.lectivo); if (p) mapaTramo[t.id] = p.id; }
  const grpNuevos = res.grupos.filter(g => !mapaGrp[g.id]);
  const tramosNuevos = res.tramos.filter(t => !mapaTramo[t.id]);
  const matNuevas = res.materias.filter(m => !ix.mat[m.abrev]);
  const usados = new Set(res.ocupaciones.map(o => o.docente_id));
  const fuera = db.docentes.filter(x => x.activo !== false && !Object.values(mapaDoc).includes(x.id));
  const otrasActuales = db.ocupaciones.filter(o => !LECTIVAS.has(o.tipo)).length;
  const nLect = res.ocupaciones.filter(o => LECTIVAS.has(o.tipo)).length;
  const nOtras = res.ocupaciones.length - nLect;
  const lista = arr => arr.length ? arr.map(esc).join(', ') : '—';

  const r = await modal({
    titulo: `Importar ${origen}`,
    botones: [{ id: 'ok', texto: res.soloCatalogos ? 'Completar datos' : 'Importar horarios', pri: true }],
    contenido: `${res.avisos.length ? `<div class="aviso">${res.avisos.slice(0, 6).map(esc).join('<br>')}${res.avisos.length > 6 ? `<br>… y ${res.avisos.length - 6} avisos más` : ''}</div>` : ''}
      <table class="datos"><tbody>
        <tr><td>Profesorado</td><td class="num">${res.docentes.length}</td><td class="small">${docExist.length} ya existían${docNuevos.length ? ` · <b>nuevos:</b> ${lista(docNuevos.filter(d => usados.has(d.id) || res.soloCatalogos).map(d => d.nombre))}` : ''}</td></tr>
        <tr><td>Grupos</td><td class="num">${res.grupos.length}</td><td class="small">${grpNuevos.length ? `<b>nuevos:</b> ${lista(grpNuevos.map(g => g.nombre))}` : 'todos existían'}</td></tr>
        <tr><td>Tramos</td><td class="num">${res.tramos.length}</td><td class="small">${tramosNuevos.length ? `<b>nuevos:</b> ${lista(tramosNuevos.map(t => t.inicio + '–' + t.fin))}` : 'coinciden con los actuales'}</td></tr>
        ${res.soloCatalogos ? '' : `<tr><td>Clases y tutorías</td><td class="num">${nLect}</td><td class="small">sustituyen a las ${db.ocupaciones.filter(o => LECTIVAS.has(o.tipo)).length} actuales</td></tr>
        <tr><td>Apoyos, coord. y NL</td><td class="num">${nOtras}</td><td class="small">ahora hay ${otrasActuales}</td></tr>`}
        <tr><td>Materias nuevas</td><td class="num">${matNuevas.length}</td><td class="small">${lista(matNuevas.map(m => m.abrev))}</td></tr>
      </tbody></table>
      ${res.soloCatalogos ? `
        <label class="campo fila" style="color:var(--texto)"><input type="checkbox" name="nombres" checked> Poner el nombre completo de Séneca a quien ya existe (${docExist.length})</label>
        <label class="campo fila" style="color:var(--texto)"><input type="checkbox" name="altas"> Dar de alta a quien no existe (${docNuevos.length}) <span class="muted">(Séneca incluye a todo el personal del centro)</span></label>
        <label class="campo fila" style="color:var(--texto)"><input type="checkbox" name="grupos" ${grpNuevos.length ? '' : 'disabled'}> Añadir los grupos nuevos (${grpNuevos.length})</label>` : `
        <label class="campo fila" style="color:var(--texto)"><input type="checkbox" name="conservar" ${otrasActuales ? 'checked' : ''}> Conservar los apoyos, coordinaciones y no lectivas actuales (con su detalle) en vez de los del archivo</label>
        ${fuera.length ? `<label class="campo fila" style="color:var(--texto)"><input type="checkbox" name="inactivos"> Marcar como inactivo a quien no aparece en el archivo (${fuera.length}: ${lista(fuera.map(x => x.corto || x.nombre))})</label>` : ''}
        <p class="small muted" style="margin:0">No se tocan recreos, ausencias, sustituciones ni avisos. Descarga antes una copia de seguridad si quieres poder volver atrás.</p>`}`
  });
  if (!r) return;
  const q = n => r.form.querySelector(`[name=${n}]`);
  const limpiar = arr => arr.map(({ curso_seneca, ...x }) => x);
  await seguro(async () => {
    if (res.soloCatalogos) {
      if (q('nombres').checked) await guardarFilas('docentes', docExist.map(({ p, d }) => ({ ...p, nombre: d.nombre })));
      if (q('altas').checked) await guardarFilas('docentes', docNuevos.map((d, i) => ({ ...d, corto: cortoAuto(d.nombre, db.docentes), orden: (ix.docentes.at(-1)?.orden || 0) + i + 1 })));
      if (q('grupos')?.checked) await guardarFilas('grupos', limpiar(grpNuevos));
      if (tramosNuevos.length && !db.tramos.length) await guardarFilas('tramos', tramosNuevos);
      return;
    }
    // Profesorado: actualiza siglas de quien existe y da de alta a quien falta
    await guardarFilas('docentes', docExist.map(({ p, d }) => ({ ...p, abrev: d.abrev || p.abrev, activo: true })));
    const altas = docNuevos.filter(d => usados.has(d.id)).map((d, i) => ({ ...d, corto: cortoAuto(d.nombre, db.docentes), orden: (ix.docentes.at(-1)?.orden || 0) + i + 1 }));
    if (altas.length) await guardarFilas('docentes', altas);
    if (q('inactivos')?.checked) await guardarFilas('docentes', fuera.map(x => ({ ...x, activo: false })));
    // Grupos, tramos y materias nuevos
    const tutorDe = id => mapaDoc[id] || id;
    if (grpNuevos.length) await guardarFilas('grupos', limpiar(grpNuevos).map(g => ({ ...g, tutor_id: g.tutor_id ? tutorDe(g.tutor_id) : null })));
    const tutores = res.grupos.filter(g => mapaGrp[g.id] && g.tutor_id).map(g => ({ ...ix.grp[mapaGrp[g.id]], tutor_id: tutorDe(g.tutor_id) }));
    if (tutores.length) await guardarFilas('grupos', tutores);
    if (tramosNuevos.length) await guardarFilas('tramos', tramosNuevos.map(t => {
      const id = db.tramos.some(x => x.id === t.id) ? uid('t') : t.id;
      mapaTramo[t.id] = id; return { ...t, id };
    }));
    if (matNuevas.length) await guardarFilas('materias', matNuevas);
    // Ocupaciones
    const conservar = q('conservar')?.checked;
    const nuevas = res.ocupaciones.filter(o => LECTIVAS.has(o.tipo) || !conservar).map(o => ({
      ...o, docente_id: mapaDoc[o.docente_id] || o.docente_id, tramo_id: mapaTramo[o.tramo_id] || o.tramo_id,
      grupos: (o.grupos || []).map(g => mapaGrp[g] || g)
    }));
    // Las clases que no cambian conservan su id (así no se pierden las sustituciones ya asignadas).
    const clave = o => [o.docente_id, o.dia, o.tramo_id, o.tipo, o.materia || '', [...(o.grupos || [])].sort().join(','), o.subgrupo || ''].join('|');
    const actuales = new Map(db.ocupaciones.map(o => [clave(o), o]));
    const mantener = new Set();
    const reusar = (o, prev) => { o.id = prev.id; o.aula = o.aula || prev.aula || ''; o.detalle = o.detalle || prev.detalle || ''; mantener.add(prev.id); };
    for (const o of nuevas) {
      const prev = actuales.get(clave(o));
      if (prev && !mantener.has(prev.id)) reusar(o, prev);
    }
    // Misma hora, docente y grupos pero otra sigla (p. ej. «MAT» → «MAT A» cambiada a mano): se conserva la sigla actual.
    const sinMateria = o => clave({ ...o, materia: '' });
    const libres = new Map(db.ocupaciones.filter(o => !mantener.has(o.id) && LECTIVAS.has(o.tipo)).map(o => [sinMateria(o), o]));
    for (const o of nuevas) {
      if (mantener.has(o.id) || !LECTIVAS.has(o.tipo)) continue;
      const prev = libres.get(sinMateria(o));
      if (prev && !mantener.has(prev.id)) { reusar(o, prev); o.materia = prev.materia; }
    }
    const quitar = db.ocupaciones.filter(o => (LECTIVAS.has(o.tipo) || !conservar) && !mantener.has(o.id)).map(o => o.id);
    await borrarFilas('ocupaciones', quitar);
    await guardarFilas('ocupaciones', nuevas);
  }, res.soloCatalogos ? 'Datos completados' : 'Horarios importados');
  await recargar(); pintar();
}

async function nuevoCurso() {
  const actual = db.curso;
  const sig = (actual?.nombre || '').match(/^(\d{4})-(\d{4})$/) ? `${+actual.nombre.slice(0, 4) + 1}-${+actual.nombre.slice(5) + 1}` : '';
  const r = await modal({
    titulo: 'Preparar nuevo curso',
    contenido: `<div class="form-grid">
      <label class="campo ancho">Nombre<input type="text" name="nombre" value="${sig}" placeholder="2027-2028"></label>
      <label class="campo">Inicio de clases<input type="date" name="inicio"></label><label class="campo">Fin de clases<input type="date" name="fin"></label>
      <div class="campo ancho">Copiar del curso ${esc(actual?.nombre || '')}
        <div class="checks">${[['docentes', 'Profesorado'], ['grupos', 'Grupos'], ['materias', 'Materias'], ['tramos', 'Tramos'], ['recreos', 'Zonas de recreo'], ['turnos', 'Turnos de recreo'], ['ocupaciones', 'Horarios']]
          .map(([k, t]) => `<label><input type="checkbox" name="copiar" value="${k}" ${['docentes', 'grupos', 'materias', 'tramos', 'recreos'].includes(k) ? 'checked' : ''}>${t}</label>`).join('')}</div></div>
      <label class="campo fila ancho" style="color:var(--texto)"><input type="checkbox" name="activar"> Activarlo ya (si no, el claustro seguirá viendo el curso actual)</label>
      <p class="small muted ancho" style="margin:0">Las ausencias y el contador empiezan de cero. Después podrás importar el XML de aSc del nuevo curso o editar los horarios a mano.</p>
    </div>`,
    botones: [{ id: 'ok', texto: 'Crear curso', pri: true }],
    validar: (b, d) => {
      const n = d.querySelector('[name=nombre]').value.trim();
      if (!n) return 'Pon un nombre al curso.';
      if (db.cursos.some(c => c.nombre === n)) return 'Ya existe un curso con ese nombre.';
      return null;
    }
  });
  if (!r) return;
  const q = n => r.form.querySelector(`[name=${n}]`);
  const copiar = $$('[name=copiar]:checked', r.form).map(x => x.value);
  const nombreC = q('nombre').value.trim();
  const curso = { id: 'c-' + nombreC.replace(/[^0-9a-z]+/gi, '-').toLowerCase(), nombre: nombreC, activo: false, inicio: q('inicio').value || null, fin: q('fin').value || null };
  await seguro(async () => {
    await D.guardarCurso(curso);
    const limpia = arr => arr.map(({ curso_id, ...x }) => x);
    if (copiar.includes('docentes')) await D.guardar('docentes', limpia(db.docentes.filter(d => d.activo !== false)), curso.id);
    if (copiar.includes('grupos')) await D.guardar('grupos', limpia(db.grupos).map(g => copiar.includes('docentes') ? g : { ...g, tutor_id: null }), curso.id);
    if (copiar.includes('materias')) await D.guardar('materias', limpia(db.materias), curso.id);
    if (copiar.includes('tramos')) await D.guardar('tramos', limpia(db.tramos), curso.id);
    if (copiar.includes('recreos')) await D.guardar('zonas_recreo', limpia(db.zonas_recreo), curso.id);
    if (copiar.includes('turnos')) await D.guardar('turnos_recreo', limpia(db.turnos_recreo), curso.id);
    if (copiar.includes('ocupaciones')) await D.guardar('ocupaciones', limpia(db.ocupaciones), curso.id);
    await D.guardarConfig('prioridad', db.config.prioridad || PRIORIDAD_DEFECTO, curso.id);
    if (q('activar').checked) await D.activarCurso(curso.id);
  }, `Curso ${nombreC} creado`);
  st.cursoId = curso.id;
  await recargar(); pintar();
}

// Base de datos vacía: ofrece cargar los horarios importados del PDF (data/seed.json).
function primerArranque() {
  $('#tabs').hidden = true;
  $('#vista').innerHTML = `<div class="panel" style="max-width:640px;margin:30px auto">
    <h2>Primer arranque</h2>
    <p>La base de datos está vacía. Puedes cargar el curso 2026-2027 con los horarios de ESO y Bachillerato ya importados
      (profesorado, grupos, horarios, apoyos, coordinaciones y recreos) y revisarlo después.</p>
    <div class="barra"><button class="btn pri" id="i-seed">Cargar curso 2026-2027</button>
      <label class="btn">${svg('subir')} Restaurar una copia (JSON)<input type="file" id="i-json" accept=".json" hidden></label></div>
  </div>`;
  const cargarDatos = async datos => {
    const curso = { id: datos.curso.id, nombre: datos.curso.nombre, inicio: datos.curso.inicio || null, fin: datos.curso.fin || null, centro: datos.centro || datos.curso.centro || null, activo: true };
    const ok = await seguro(async () => {
      await D.guardarCurso(curso);
      for (const t of D.TABLAS) await D.guardar(t, datos[t] || [], curso.id);
      for (const [k, v] of Object.entries(datos.config || {})) await D.guardarConfig(k, v, curso.id);
      for (const [id, m] of Object.entries(datos.motivos || {})) await D.guardarMotivo(id, m, curso.id);
      return true;
    }, 'Datos cargados');
    if (ok) location.reload(); // si algo falla, se queda en esta pantalla mostrando el error
  };
  $('#i-seed').onclick = async () => cargarDatos(await (await fetch('data/seed.json', { cache: 'no-store' })).json());
  $('#i-json').onchange = async e => { const f = e.target.files[0]; if (f) cargarDatos(JSON.parse(await f.text())); };
}

/* ---------- Arranque ---------- */
(async function () {
  try { await D.conectar(); } catch (e) {
    document.body.classList.add('sin-sesion'); $('#login').hidden = false; $('#login-msg').textContent = 'No se ha podido conectar: ' + (e.message || e); return;
  }
  // Etiqueta de la tarjeta de acceso: el curso activo (se lee de la base de datos, no hay que cambiarlo cada año).
  D.listarCursos().then(cs => {
    const c = cs.find(x => x.activo) || cs[cs.length - 1];
    const e = $('#login-eyebrow');
    if (c) { e.textContent = `Curso ${c.nombre}`; e.hidden = false; }
  }).catch(() => {});
  const s = await D.sesion();
  if (!s) {
    document.body.classList.add('sin-sesion'); $('#login').hidden = false;
    $('#entrar').onclick = () => D.entrar().catch(e => { $('#login-msg').textContent = e.message; });
    return;
  }
  if (!(await D.esAdmin())) {
    document.body.classList.add('sin-sesion'); $('#login').hidden = false; $('#entrar').hidden = true;
    $('#login-msg').innerHTML = `La cuenta <b>${esc(s.email)}</b> no tiene permiso para administrar. Pide acceso a jefatura de estudios.<br><button class="btn" id="otra" style="margin-top:10px">Usar otra cuenta</button>`;
    $('#otra').onclick = async () => { await D.salir(); location.reload(); };
    return;
  }
  activarImpresion(() => db?.curso ? `Curso ${db.curso.nombre}` : '');
  if (!D.esDemo()) { $('#usuario').textContent = s.email; $('#salir').hidden = false; $('#salir').onclick = async () => { await D.salir(); location.href = './'; }; }
  $('#demo').hidden = !D.esDemo();
  $('#app').hidden = false;
  $('#tabs').hidden = false;
  await recargar();
  if (!db.curso) return primerArranque();
  leerRuta();
  window.addEventListener('hashchange', () => { leerRuta(); pintar(); });
  pintar();
})();
