// Función de Supabase «hor-teams»: manda al canal de Teams el parte de sustituciones de un día.
// La llama la propia base de datos cada día lectivo a las 7:30 (supabase/teams.sql); no la usa la web.
//
// Primero llama al flujo con su dirección tal cual (lleva su propia firma). Si el flujo solo admite a gente de la
// organización, repite identificándose ante Microsoft como la app «Acceso a Microsoft 365» (la misma con la que se
// entra en las webs del colegio); el valor de su secreto está en Supabase → Edge Functions → Secrets (MS_CLIENT_SECRET).
// La dirección del flujo y la clave para llamar a esta función están en la tabla hor_secretos.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const DIRECTORIO = Deno.env.get('MS_TENANT_ID') ?? 'ffc9dc7d-c481-401d-a266-18c5970bf597'; // salesianas.org
const APP = Deno.env.get('MS_CLIENT_ID') ?? '20ce60a3-2c20-4553-bdf1-2a5ad249348d';         // Acceso a Microsoft 365
const FLUJOS = 'https://service.flow.microsoft.com//.default';                                  // servicio de flujos de Microsoft

const respuesta = (estado: number, datos: unknown) =>
  new Response(JSON.stringify(datos), { status: estado, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: filas } = await sb.from('hor_secretos').select('clave, valor');
  const secreto = Object.fromEntries((filas ?? []).map(f => [f.clave, f.valor]));
  if (!secreto.clave_funcion || req.headers.get('x-clave') !== secreto.clave_funcion) return respuesta(403, { error: 'No autorizado' });
  if (!secreto.teams_webhook) return respuesta(400, { error: 'Todavía no hay ningún canal de Teams configurado' });

  const { fecha } = await req.json().catch(() => ({}));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? '')) return respuesta(400, { error: 'Falta la fecha (AAAA-MM-DD)' });
  const { data: partes, error } = await sb.from('hor_teams_partes').select('*').eq('fecha', fecha).is('enviado', null);
  if (error) return respuesta(500, { error: error.message });
  if (!partes?.length) return respuesta(200, { enviados: 0 });

  // Identificación ante Microsoft como la app del colegio (solo si el flujo la pide; se pide una vez)
  let token: string | null = null, fallo = '';
  const identificarse = async () => {
    if (token || fallo) return token;
    const r = await fetch(`https://login.microsoftonline.com/${DIRECTORIO}/oauth2/v2.0/token`, {
      method: 'POST',
      body: new URLSearchParams({ client_id: APP, client_secret: Deno.env.get('MS_CLIENT_SECRET') ?? '', grant_type: 'client_credentials', scope: FLUJOS })
    });
    const datos = await r.json().catch(() => ({}));
    if (datos.access_token) token = datos.access_token;
    else fallo = 'Microsoft no ha dado acceso a la app: ' + String(datos.error_description ?? datos.error ?? r.status).slice(0, 300);
    return token;
  };

  const resultados = [];
  for (const p of partes) {
    const cuerpo = JSON.stringify(p.mensaje);
    // 1) Con la dirección tal cual: la firma que lleva (sig) basta en los flujos abiertos.
    let t = await fetch(secreto.teams_webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cuerpo });
    // 2) Si el flujo solo admite gente de la organización, se repite identificándose como la app
    //    y sin la firma de la dirección (Teams no admite las dos a la vez).
    if (t.status === 401 && await identificarse()) {
      const destino = new URL(secreto.teams_webhook);
      for (const firma of ['sig', 'sp', 'sv']) destino.searchParams.delete(firma);
      t = await fetch(destino, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: cuerpo });
    }
    const resultado = t.ok ? { codigo: t.status, error: null }
      : { codigo: t.status, error: fallo || (await t.text()).slice(0, 300) || `Teams ha respondido ${t.status}` };
    await sb.from('hor_teams_partes').update({ enviado: new Date().toISOString(), resultado })
      .eq('curso_id', p.curso_id).eq('fecha', p.fecha);
    resultados.push({ fecha: p.fecha, ...resultado });
  }
  return respuesta(200, { enviados: partes.length, resultados });
});
