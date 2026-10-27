// Activa Supabase solo después de aplicar la migración SQL y configurar Auth.
// La clave publishable/anon es pública. Nunca pongas aquí service_role ni secretos.
export const backend = {
  provider: 'supabase' as 'nest' | 'supabase',
  supabaseUrl: 'https://ztnosyncncakuvhmgayk.supabase.co',
  supabasePublishableKey: 'sb_publishable_Tr1MoWU-toBqU6vG4NJvJQ_6qX3bO3c',
};
