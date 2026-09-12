import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Stellt sicher, dass die Anfrage von einem eingeloggten Nutzer kommt.
 *
 * Wichtig: das Gateway prueft mit verify_jwt nur die Signatur — und der
 * oeffentliche anon-Key ist selbst ein gueltiges JWT. Erst getUser() unterscheidet
 * einen echten Login vom blossen Besitz des anon-Keys.
 */
export async function requireUser(req: Request): Promise<{ id: string; email: string | null }> {
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) throw new AuthError('Nicht eingeloggt')

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } },
  )
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new AuthError('Nicht eingeloggt')
  return { id: data.user.id, email: data.user.email ?? null }
}

export class AuthError extends Error {}
