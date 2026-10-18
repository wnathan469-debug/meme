/** Explicit filtering remains necessary when operators/tests use a BYPASSRLS connection. */
export function socialVisibility(m: string, p: string, owner: string) {
  return `(${m}.owner_user_id IS NULL OR ${m}.owner_user_id=${owner}) AND (${m}.algorithm_version='legacy' OR (${m}.algorithm_version='social-extraction@1.0.0' AND ${m}.evidence->>'text_fingerprint' IS NOT DISTINCT FROM ${p}.text_fingerprint AND ${m}.evidence->'entities'=${p}.entities AND ${m}.evidence->>'post_type'=${p}.post_type AND ${m}.evidence->>'author_id' IS NOT DISTINCT FROM coalesce(${p}.author_x_user_id,${p}.unresolved_author_x_user_id)))`;
}
