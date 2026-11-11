export class ConfigurationError extends Error {
  constructor(code, message) { super(message); this.name = 'ConfigurationError'; this.code = code; }
}

export function validateCloudConfiguration(env) {
  if (!env.VERCEL && !env.SUPABASE_URL) return;
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_PASSWORD'];
  const missing = required.filter(name => !env[name]);
  if (missing.length) throw new ConfigurationError('CONFIG_MISSING', `Variables Vercel manquantes : ${missing.join(', ')}. Enregistrez-les pour cet environnement, puis redéployez le site.`);
  if (env.ADMIN_PASSWORD.length < 16) throw new ConfigurationError('ADMIN_PASSWORD_TOO_SHORT', 'ADMIN_PASSWORD doit contenir au moins 16 caractères. Modifiez la variable dans Vercel, puis redéployez.');
  let url;
  try { url = new URL(env.SUPABASE_URL); } catch {}
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new ConfigurationError('SUPABASE_URL_INVALID', 'SUPABASE_URL doit être l’URL HTTPS du projet Supabase, sans chemin ni guillemets. Corrigez-la dans Vercel et redéployez.');
  let role;
  try { role = JSON.parse(Buffer.from(env.SUPABASE_SERVICE_ROLE_KEY.split('.')[1], 'base64url').toString()).role; } catch {}
  if (env.SUPABASE_SERVICE_ROLE_KEY.startsWith('sb_publishable_') || role === 'anon') throw new ConfigurationError('SUPABASE_KEY_PUBLIC', 'La clé Supabase configurée est publique. Utilisez la clé serveur service_role dans SUPABASE_SERVICE_ROLE_KEY, puis redéployez.');
}
