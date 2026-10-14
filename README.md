# Horarios y sustituciones · ESO y Bachillerato

Web para consultar los horarios del profesorado y gestionar las sustituciones del día,
inspirada en la [App de Localizaciones y Sustituciones de maestroSeb](https://blogsaverroes.juntadeandalucia.es/maestroseb/2026/10/04/app-de-localizaciones-y-sustituciones/)
y con la estética del portal [Utilidades del profesorado](https://claustro-utilidades.vercel.app/).

Es una web estática (HTML + JavaScript, sin compilación) que se publica en **Vercel** y guarda los datos en **Supabase**
(base de datos gratuita). El acceso de administración se hace con la **cuenta de Microsoft 365** del colegio.

## Qué tiene

**Parte pública** (`/`): para todo el claustro, sin contraseña. Menú: **Hoy · Sustituciones · Horarios ▾ · Sábana**.

- **Hoy**: apartados plegables (empiezan cerrados y se resaltan si tienen algo):
  - **Avisos** que publica jefatura.
  - **Sustituciones**: una columna por cada ausente y una fila por tramo, con materia (nombre oficial), grupo, aula,
    quién sustituye y el aviso/adjuntos de esa hora. Debajo, las ausencias con profesor/a sustituto.
  - **Ahora**: clases por parejas A/B, «¿Dónde está…?» y profesorado fuera de aula (los apoyos indican en qué clase están).
    Fuera del horario lectivo no muestra ninguna hora.
  - **Recreo** del día, ESO y Bachillerato por separado.
- **Sustituciones**: el parte de cualquier día.
- **Horarios ▾**: *Profesorado* · *Grupos* (con el nombre oficial de cada materia) · *Recreos* · *Apoyos, coordinación y NL*.
- **Sábana**: todo el profesorado (o todos los grupos) de un día, tramo a tramo.

**Administración** (`/admin.html`): menús desplegables.

- **Ausencias**: Sustituciones del día · Ausencias y bajas · Contador · Prioridad para sustituir.
- **Avisos**: Para una sustitución (texto y archivos para una hora concreta) · Avisos generales.
- **Horarios**: Profesorado · Grupos · Recreos · Apoyos, coordinación y NL (todo editable).
- **Datos**: Profesorado · Grupos (tutoría y aula) · Materias (nombre oficial por curso y quién la da en cada grupo, sacado
  de los horarios) · Tramos horarios · Personas con acceso.
- **Cursos**: Curso académico (preparar y activar cursos) · Exportar / importar (copia, CSV, PDF y XML de aSc, Séneca) ·
  Nuevo horario (enlace a la herramienta de creación de horarios, proyecto aparte: `nuevoHorarioUrl` en `config.js`).

Todo lo imprimible sale con plantilla corporativa (logo, cabecera y pie), ajustado a una o dos páginas.

Sin base de datos configurada, la web funciona en **modo demostración** (lee `data/seed.json` y los cambios se quedan en el navegador).
Así se puede probar todo antes de instalarlo.

## Puesta en marcha (una sola vez, ~30 min)

### 1. Subir a GitHub

```bash
git init
git add .
git commit -m "Web de horarios y sustituciones"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/horarios-sustituciones.git
git push -u origin main
```

### 2. Base de datos y acceso con Microsoft 365 (proyecto común «Acceso Microsoft 365»)

Las webs del colegio que usan la cuenta de Microsoft 365 comparten el proyecto de Supabase **«Acceso Microsoft 365»**
(el mismo que el Control de baños), que ya tiene configurado el inicio de sesión de salesianas.org. Todas las tablas
de esta web llevan el prefijo `hor_` y no tocan las de las demás.

1. En Supabase, abre el proyecto **«Acceso Microsoft 365»** → **SQL Editor → New query**, pega
   [`supabase/schema.sql`](supabase/schema.sql) y pulsa *Run*. Crea las tablas y da acceso de administración a
   Marián, Laura R., Rocío, Ana F., Ana G. y Miguel Ángel (se puede cambiar después en *Datos → Personas con acceso*).
2. **Authentication → URL Configuration → Redirect URLs**: añade `https://TU-WEB.vercel.app/admin.html`
   (la dirección que dé Vercel en el paso 4). No cambies la *Site URL*: es la del control de baños y se comparte.
   El mismo `schema.sql` crea en *Storage* la carpeta pública `hor-adjuntos` para los archivos de los avisos
   (solo la administración puede subir o borrar; no subáis documentos con datos personales del alumnado).
3. [`config.js`](config.js) ya tiene la `supabaseUrl` y la `supabaseAnonKey` del proyecto «Acceso Microsoft 365» (las mismas que el control de baños).

### 3. Si algún día se quiere un proyecto de Supabase propio

Habría que repetir la configuración de Microsoft Entra ID (registro de la aplicación con la URI
`https://TU-PROYECTO.supabase.co/auth/v1/callback`, secreto de cliente, notificaciones opcionales *email* y *xms_edov*)
y activar el proveedor **Azure** en *Authentication → Sign In / Providers* con la URL del inquilino
`https://login.microsoftonline.com/ID-DEL-INQUILINO`.

### 4. Publicar en Vercel

1. En <https://vercel.com> → **Add New → Project** → importa el repositorio de GitHub.
2. *Framework Preset*: **Other**. No hace falta comando de compilación. **Deploy**.
3. Cada `git push` vuelve a publicar la web automáticamente.

### 5. Primer arranque

Entra en `https://TU-WEB.vercel.app/admin.html` con tu cuenta. Como la base de datos está vacía, aparece el botón
**«Cargar curso 2026-2027»**, que vuelca los horarios ya importados. Después, en *Curso y datos*, añade al resto de
personas que podrán administrar.

### 6. Enlazarlo desde el portal de utilidades

En el repositorio de `claustro-utilidades`, añade una entrada en `utilidades.js` apuntando a la URL de Vercel
(o a `/admin.html` para jefatura).

## Cada curso nuevo

1. *Curso y datos → Preparar nuevo curso* (p. ej. `2027-2028`), copiando profesorado, grupos, tramos y recreos.
2. Cárgale los horarios en *Cursos → Exportar / importar*: el **PDF** del horario total de aSc (como el de este curso),
   el **XML de aSc** (*Archivo → Exportar → aSc Horarios XML*) o el **XML de Séneca** (*Utilidades →
   Importación/Exportación → Exportación de horarios*: aporta nombres completos, grupos, tramos y aulas). Antes de
   guardar se muestra un resumen; se conservan las personas existentes, sus ausencias y el contador.
3. Revisa nombres cortos, apoyos, coordinaciones y recreos, y pulsa **Activar** cuando empiece el curso.
   El curso anterior se conserva con su contador.

## Datos de este curso (2026-2027)

`data/seed.json` se generó a partir de `Horarios.pdf` (aSc), `Horas no lectivas - apoyos - coordinaciones.docx`
y `Recreos.docx`: 26 docentes, 12 grupos, 7 tramos (con recreo 11:00-11:30), 551 ocupaciones y 7 zonas de recreo.
Conviene revisar en el panel:

- En el PDF, **«NUEVO TECN» es Beatriz Alejandre** (sus apoyos coinciden con el documento de no lectivas).
- **Pablo Puro** tiene una baja larga desde el 1/10/2026, sin fecha de fin, con **María Rodríguez** como sustituta desde ese
  mismo día. Ajusta las fechas reales en *Ausencias y bajas*.
- Aparecen en los Word pero no en el PDF: **Charo**, **Ana García (PT)** y **Sara R. (PP)**. Se han dado de alta;
  Ana García y Sara R. no entran en el reparto de sustituciones. Revísalo en *Profesorado*.
- Diferencias entre el PDF y el Word de no lectivas (se ha dado prioridad a las clases del PDF y, en el resto, al Word):
  Ana Gallardo (coordinación martes 4ª y jueves 4ª en el PDF; el Word la pone el martes 5ª y jueves 3ª, cuando tiene clase;
  martes 3ª: PDF no lectiva, Word coordinación),
  Miguel Ángel (Word: pasillo martes 3ª y coordinación miércoles 3ª, que no están en el PDF; PDF: no lectiva jueves 2ª),
  Nuria (Word: apoyo lunes 5ª; PDF: apoyo lunes 6ª), Elena (PDF: apoyos lunes y jueves 6ª), José Antonio martes 5ª
  (PDF apoyo, Word coordinación) y Rocío Cano miércoles 4ª (PDF no lectiva, Word coordinación).
- Los grupos de Bachillerato no tienen hora de tutoría en el PDF, así que no tienen tutor/a asignado: se puede poner en *Grupos*.
- Los nombres de las materias son los oficiales de la normativa (Anexos de ESO y Bachillerato) y dependen del curso
  (p. ej. «F» es Filosofía en 4º ESO y 1º Bach. y Física en 2º Bach.). En 4º ESO las matemáticas se han separado en
  «MAT A» (Mariola, con alumnado de ambos grupos) y «MAT B» (José Antonio e Isa).
- Falta indicar el **aula** de cada grupo (*Datos → Grupos*) para que salga en las sustituciones.

## Estructura

```
index.html        Parte pública
admin.html        Administración
config.js         Datos de conexión (Supabase) y del centro
css/styles.css    Estilos (paleta corporativa, modo oscuro, impresión)
js/data.js        Acceso a datos (Supabase o modo demostración)
js/logic.js       Lógica: horario efectivo, ausencias, candidatos, autoasignación, contador
js/ui.js          Componentes comunes (rejilla de horario, diálogos…)
js/public.js      Vistas públicas
js/admin.js       Vistas de administración
js/asc.js         Importador del XML de aSc Horarios
data/seed.json    Datos iniciales del curso 2026-2027
supabase/schema.sql  Tablas y reglas de seguridad
```

Para probarlo en local: `python3 -m http.server` en esta carpeta y abrir <http://localhost:8000>.
