// Re-Export: Der Parser liegt in supabase/functions/_shared/, damit App und
// Edge Function dieselbe Implementierung nutzen (keine Duplikation).
export { parsePerspectiveLeadEmail } from '../../supabase/functions/_shared/perspectiveLeadParser'
export type { PerspectiveLead } from '../../supabase/functions/_shared/perspectiveLeadParser'
