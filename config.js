// Configuración de la web de horarios (lo único que hay que tocar al instalarla).
// Mientras supabaseUrl esté vacío, la web funciona en «modo demostración»:
// lee data/seed.json y los cambios del panel solo se guardan en el navegador.
window.HORARIOS_CONFIG = {
  // Supabase → Project Settings → API → Project URL
  supabaseUrl: 'https://hblayjaknhfxieqbzrlq.supabase.co',
  // Supabase → Project Settings → API → anon public key (es pública, no pasa nada por verla)
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhibGF5amFrbmhmeGllcWJ6cmxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMjg0ODEsImV4cCI6MjEwNjgwNDQ4MX0.K2iWyQAt9upNBXUhdZuV-Nle9fkCMYgQ6jTBBO0MluE',
  centro: 'Escuelas Salesianas María Auxiliadora',
  // Enlace de vuelta al portal de utilidades
  portal: 'https://claustro-utilidades.vercel.app/',
  // Herramienta (proyecto aparte) para crear los horarios del curso siguiente. Vacío = «Próximamente».
  nuevoHorarioUrl: ''
};
