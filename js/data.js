// Capa de datos: Supabase si está configurado; si no, «modo demostración» con data/seed.json + localStorage.
const SUPABASE_ESM = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
const DEMO_KEY = 'horarios-demo-v1';

// En la base de datos todas las tablas llevan el prefijo «hor_» para convivir con otras webs del colegio
// (por ejemplo, el control de baños) en el mismo proyecto de Supabase.
const T = t => 'hor_' + t;

export const TABLAS = ['docentes', 'grupos', 'tramos', 'materias', 'ocupaciones',
  'zonas_recreo', 'turnos_recreo', 'ausencias', 'coberturas', 'avisos'];

let sb = null;
let modo = 'demo';
let demo = null;

export const config = () => window.HORARIOS_CONFIG || {};
export const esDemo = () => modo === 'demo';

export async function conectar() {
  const c = config();
  if (c.supabaseUrl && c.supabaseAnonKey) {
    const { createClient } = await import(SUPABASE_ESM);
    sb = createClient(c.supabaseUrl, c.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true } });
    modo = 'supabase';
  } else {
    await cargarDemo();
  }
  return modo;
}

/* ---------- Modo demostración ---------- */
async function semilla() {
  const r = await fetch('data/seed.json', { cache: 'no-store' });
  if (!r.ok) throw new Error('No se pudo leer data/seed.json');
  return r.json();
}
export function seedACurso(seed, cursoId) {
  // Convierte un JSON exportado/semilla en filas con curso_id.
  const filas = {};
  for (const t of TABLAS) filas[t] = (seed[t] || []).map(x => ({ ...x, curso_id: cursoId }));
  return filas;
}
async function cargarDemo() {
  try { demo = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null'); } catch { demo = null; }
  const s = await semilla();
  // Si los datos de demostración han cambiado (nueva versión de seed.json), se recargan.
  if (!demo || demo.version !== s.version) {
    const curso = { ...s.curso, centro: s.centro };
    demo = { version: s.version, cursos: [curso], admins: [], config: { [curso.id]: s.config || {} }, motivos: {}, filas: seedACurso(s, curso.id) };
    guardarDemo();
  }
}
function guardarDemo() {
  try { localStorage.setItem(DEMO_KEY, JSON.stringify(demo)); } catch { /* sin almacenamiento: solo en memoria */ }
}
export async function reiniciarDemo() {
  try { localStorage.removeItem(DEMO_KEY); } catch {}
  demo = null; await cargarDemo();
}

/* ---------- Lectura ---------- */
async function todo(q) {
  // Supabase devuelve como mucho 1000 filas por consulta: paginamos.
  const out = []; const paso = 1000;
  for (let i = 0; ; i += paso) {
    const { data, error } = await q().range(i, i + paso - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < paso) break;
  }
  return out;
}

export async function listarCursos() {
  if (modo === 'demo') return [...demo.cursos];
  const { data, error } = await sb.from(T('cursos')).select('*').order('nombre');
  if (error) throw error;
  return data;
}

export async function cargarCurso(cursoId, { admin = false } = {}) {
  const cursos = await listarCursos();
  const curso = cursos.find(c => c.id === cursoId) || cursos.find(c => c.activo) || cursos[cursos.length - 1];
  const db = { modo, cursos, curso, config: {}, motivos: {} };
  if (!curso) { for (const t of TABLAS) db[t] = []; return db; }
  if (modo === 'demo') {
    for (const t of TABLAS) db[t] = demo.filas[t].filter(x => x.curso_id === curso.id).map(x => ({ ...x }));
    db.config = { ...(demo.config[curso.id] || {}) };
    if (admin) db.motivos = { ...(demo.motivos[curso.id] || {}) };
  } else {
    const res = await Promise.all(TABLAS.map(t => todo(() => sb.from(T(t)).select('*').eq('curso_id', curso.id))));
    TABLAS.forEach((t, i) => { db[t] = res[i]; });
    const { data: cfg } = await sb.from(T('config')).select('*').eq('curso_id', curso.id);
    for (const r of cfg || []) db.config[r.clave] = r.valor;
    if (admin) {
      const { data: m } = await sb.from(T('ausencias_motivo')).select('*').eq('curso_id', curso.id);
      for (const r of m || []) db.motivos[r.id] = r.motivo;
    }
  }
  return db;
}

/* ---------- Escritura ---------- */
export async function guardar(tabla, filas, cursoId) {
  filas = (Array.isArray(filas) ? filas : [filas]).map(f => ({ ...f, curso_id: cursoId }));
  if (!filas.length) return;
  if (modo === 'demo') {
    const arr = demo.filas[tabla];
    for (const f of filas) {
      const i = arr.findIndex(x => x.curso_id === cursoId && x.id === f.id);
      if (i >= 0) arr[i] = f; else arr.push(f);
    }
    guardarDemo(); return;
  }
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await sb.from(T(tabla)).upsert(filas.slice(i, i + 500), { onConflict: 'curso_id,id' });
    if (error) throw error;
  }
}

export async function borrar(tabla, ids, cursoId) {
  ids = Array.isArray(ids) ? ids : [ids];
  if (!ids.length) return;
  if (modo === 'demo') {
    demo.filas[tabla] = demo.filas[tabla].filter(x => !(x.curso_id === cursoId && ids.includes(x.id)));
    guardarDemo(); return;
  }
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await sb.from(T(tabla)).delete().eq('curso_id', cursoId).in('id', ids.slice(i, i + 200));
    if (error) throw error;
  }
}

export async function vaciarTabla(tabla, cursoId) {
  if (modo === 'demo') {
    demo.filas[tabla] = demo.filas[tabla].filter(x => x.curso_id !== cursoId);
    guardarDemo(); return;
  }
  const { error } = await sb.from(T(tabla)).delete().eq('curso_id', cursoId);
  if (error) throw error;
}

export async function guardarMotivo(id, motivo, cursoId) {
  if (modo === 'demo') {
    demo.motivos[cursoId] = demo.motivos[cursoId] || {};
    if (motivo) demo.motivos[cursoId][id] = motivo; else delete demo.motivos[cursoId][id];
    guardarDemo(); return;
  }
  if (motivo) {
    const { error } = await sb.from(T('ausencias_motivo')).upsert({ curso_id: cursoId, id, motivo }, { onConflict: 'curso_id,id' });
    if (error) throw error;
  } else {
    await sb.from(T('ausencias_motivo')).delete().eq('curso_id', cursoId).eq('id', id);
  }
}

export async function guardarConfig(clave, valor, cursoId) {
  if (modo === 'demo') {
    demo.config[cursoId] = { ...(demo.config[cursoId] || {}), [clave]: valor };
    guardarDemo(); return;
  }
  const { error } = await sb.from(T('config')).upsert({ curso_id: cursoId, clave, valor }, { onConflict: 'curso_id,clave' });
  if (error) throw error;
}

export async function guardarCurso(curso) {
  if (modo === 'demo') {
    const i = demo.cursos.findIndex(c => c.id === curso.id);
    if (i >= 0) demo.cursos[i] = { ...demo.cursos[i], ...curso }; else demo.cursos.push(curso);
    if (!demo.config[curso.id]) demo.config[curso.id] = {};
    guardarDemo(); return;
  }
  const { error } = await sb.from(T('cursos')).upsert(curso, { onConflict: 'id' });
  if (error) throw error;
}

export async function activarCurso(id) {
  const cursos = await listarCursos();
  for (const c of cursos) {
    if (c.activo !== (c.id === id)) await guardarCurso({ ...c, activo: c.id === id });
  }
}

export async function borrarCursoCompleto(id) {
  for (const t of TABLAS) await vaciarTabla(t, id);
  if (modo === 'demo') {
    demo.cursos = demo.cursos.filter(c => c.id !== id);
    delete demo.config[id]; delete demo.motivos[id];
    guardarDemo(); return;
  }
  await sb.from(T('config')).delete().eq('curso_id', id);
  await sb.from(T('ausencias_motivo')).delete().eq('curso_id', id);
  const { error } = await sb.from(T('cursos')).delete().eq('id', id);
  if (error) throw error;
}

/* ---------- Archivos adjuntos (avisos de sustituciones) ---------- */
const BUCKET = 'hor-adjuntos';
export async function subirAdjunto(archivo, cursoId) {
  if (modo === 'demo') {
    if (archivo.size > 1.5 * 1024 * 1024) throw new Error('En modo demostración los archivos no pueden pasar de 1,5 MB.');
    const url = await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(archivo); });
    return { nombre: archivo.name, url, tipo: archivo.type, ruta: '' };
  }
  const limpio = archivo.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '_');
  const ruta = `${cursoId}/${crypto.randomUUID()}-${limpio}`;
  const { error } = await sb.storage.from(BUCKET).upload(ruta, archivo, { contentType: archivo.type || 'application/octet-stream' });
  if (error) throw error;
  return { nombre: archivo.name, url: '', tipo: archivo.type, ruta };
}
// La carpeta de adjuntos es privada: cada enlace con data-adj pide al abrirlo un enlace temporal (10 minutos)
document.addEventListener('click', e => {
  const a = e.target.closest('a[data-adj]');
  if (!a || modo === 'demo' || !sb) return;
  e.preventDefault();
  const ventana = window.open('', '_blank');
  const opciones = a.hasAttribute('download') ? { download: a.getAttribute('download') || true } : undefined;
  sb.storage.from(BUCKET).createSignedUrl(a.dataset.adj, 600, opciones).then(({ data, error }) => {
    if (error || !data?.signedUrl) { ventana?.close(); alert('No se ha podido abrir el archivo: ' + (error?.message || 'sin permiso')); return; }
    if (ventana) ventana.location = data.signedUrl; else location.href = data.signedUrl;
  });
});
export async function borrarAdjunto(adj) {
  if (modo === 'demo' || !adj?.ruta) return;
  await sb.storage.from(BUCKET).remove([adj.ruta]);
}

/* ---------- Teams: el parte de sustituciones en un canal, a las 7:30 ---------- */
// La web deja preparado el parte de cada día (imagen + mensaje) en hor_teams_partes y la base de datos lo manda
// ese día a las 7:30 (supabase/teams.sql). La dirección del flujo de Teams es secreta y solo la conoce la base de datos.
// En modo demostración los partes se quedan en memoria y no se manda nada.
const DEMO_TEAMS = 'horarios-demo-teams';
const demoPartes = new Map();
export async function teamsConfigurado() {
  if (modo === 'demo') { try { return !!localStorage.getItem(DEMO_TEAMS); } catch { return false; } }
  const { data, error } = await sb.rpc('hor_teams_configurado');
  if (error) throw new Error(/function|schema cache/i.test(error.message) ? 'Falta ejecutar supabase/teams.sql en Supabase.' : error.message);
  return !!data;
}
export async function guardarWebhookTeams(url) {
  if (modo === 'demo') { try { if (url) localStorage.setItem(DEMO_TEAMS, '1'); else localStorage.removeItem(DEMO_TEAMS); } catch {} return; }
  const { error } = await sb.rpc('hor_guardar_webhook_teams', { url });
  if (error) throw error;
}
async function leerParte(fecha, cursoId) {
  if (modo === 'demo') return demoPartes.get(fecha) || null;
  const { data, error } = await sb.from(T('teams_partes')).select('*').eq('curso_id', cursoId).eq('fecha', fecha).maybeSingle();
  if (error) throw error;
  return data;
}
// Guarda (o rehace) el parte de un día. mensajeDe(urlImagen) monta la tarjeta de Teams.
export async function guardarParteTeams(fecha, imagen, mensajeDe, cursoId) {
  const antes = await leerParte(fecha, cursoId);
  if (modo === 'demo') {
    const url = URL.createObjectURL(imagen);
    if (antes?.imagen_url) URL.revokeObjectURL(antes.imagen_url);
    demoPartes.set(fecha, { ...antes, fecha, imagen_url: url, mensaje: mensajeDe(url), actualizado: new Date().toISOString(), enviado: antes?.enviado || null });
    return;
  }
  const ruta = `${cursoId}/teams/parte-${fecha}-${Date.now()}.png`;
  const { error: e1 } = await sb.storage.from(BUCKET).upload(ruta, imagen, { contentType: 'image/png' });
  if (e1) throw e1;
  // Teams descarga la imagen sin iniciar sesión: enlace temporal de 30 días (después el mensaje queda sin imagen)
  const { data: firmado, error: eF } = await sb.storage.from(BUCKET).createSignedUrl(ruta, 30 * 24 * 3600);
  if (eF) throw eF;
  const url = firmado.signedUrl;
  const { error: e2 } = await sb.from(T('teams_partes')).upsert(
    { curso_id: cursoId, fecha, imagen_ruta: ruta, mensaje: mensajeDe(url), actualizado: new Date().toISOString() },
    { onConflict: 'curso_id,fecha' });
  if (e2) throw e2;
  // La imagen anterior sobra, salvo que ya se haya mandado (el mensaje de Teams la sigue usando).
  if (antes?.imagen_ruta && !antes.enviado) await sb.storage.from(BUCKET).remove([antes.imagen_ruta]);
}
// El día ya no tiene sustituciones: se quita su parte (si no se ha mandado ya).
export async function borrarParteTeams(fecha, cursoId) {
  const antes = await leerParte(fecha, cursoId);
  if (!antes || antes.enviado) return;
  if (modo === 'demo') { if (antes.imagen_url) URL.revokeObjectURL(antes.imagen_url); demoPartes.delete(fecha); return; }
  await sb.from(T('teams_partes')).delete().eq('curso_id', cursoId).eq('fecha', fecha);
  if (antes.imagen_ruta) await sb.storage.from(BUCKET).remove([antes.imagen_ruta]);
}
// Estado del parte de un día: null (no hay) o { imagen_url, actualizado, enviado, resultado: { codigo, error } }.
export async function estadoParteTeams(fecha, cursoId) {
  const p = await leerParte(fecha, cursoId);
  if (!p) return null;
  if (modo !== 'demo') p.imagen_url = p.mensaje?.attachments?.[0]?.content?.body?.find(b => b.type === 'Image')?.url;
  return p;
}

/* ---------- Acceso (Microsoft 365) ---------- */
export async function sesion() {
  if (modo === 'demo') return { email: 'modo-demostracion', demo: true };
  let { data } = await sb.auth.getSession();
  // Abierta desde la app de Teams: entra sola con la cuenta de Teams
  if (!data.session && await window.TeamsSSO?.entrar(sb)) ({ data } = await sb.auth.getSession());
  return data.session ? { email: data.session.user.email, nombre: data.session.user.user_metadata?.full_name } : null;
}
export async function entrar() {
  if (await window.TeamsSSO?.entrar(sb)) return location.reload();
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'azure',
    options: { scopes: 'email openid profile', redirectTo: location.origin + location.pathname }
  });
  if (error) throw error;
}
export async function salir() {
  if (modo === 'demo') return;
  await sb.auth.signOut();
}
// Personal de ESO y Bachillerato (los horarios, ausencias y sustituciones solo los ve ese personal)
export async function esPersonal() {
  if (modo === 'demo') return true;
  let { data, error } = await sb.rpc('hor_puede_ver');
  if (error && /function|schema cache/i.test(error.message)) ({ data, error } = await sb.rpc('es_profesorado'));
  return !error && !!data;
}
export async function esAdmin() {
  if (modo === 'demo') return true;
  const { data, error } = await sb.rpc('hor_es_admin');
  if (error) return false;
  return !!data;
}
export async function listarAdmins() {
  if (modo === 'demo') return demo.admins.map(email => ({ email }));
  const { data, error } = await sb.from(T('admins')).select('*').order('email');
  if (error) throw error;
  return data;
}
export async function guardarAdmin(email) {
  email = email.trim().toLowerCase();
  if (modo === 'demo') { if (!demo.admins.includes(email)) demo.admins.push(email); guardarDemo(); return; }
  const { error } = await sb.from(T('admins')).upsert({ email });
  if (error) throw error;
}
export async function borrarAdmin(email) {
  if (modo === 'demo') { demo.admins = demo.admins.filter(e => e !== email); guardarDemo(); return; }
  const { error } = await sb.from(T('admins')).delete().eq('email', email);
  if (error) throw error;
}
