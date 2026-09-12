import { supabase } from '../../lib/supabase/client'
import { parseDisputeError } from '../disputes/disputes.service'
import type { DisputeRpcError } from '../disputes/disputes.types'
import type { ListingReport, SubmitListingReportInput } from './reports.types'

/** Reports an active listing; reporter and seller identities are server-derived. */
export async function submitListingReport(
  input: SubmitListingReportInput,
): Promise<{ data: ListingReport | null; error: DisputeRpcError | null }> {
  const { data, error } = await supabase.rpc('submit_listing_report', {
    p_listing_id: input.listingId,
    p_reason: input.reason,
    p_description: input.description?.trim() || undefined,
  })
  return { data: (data ?? null) as ListingReport | null, error: parseDisputeError(error) }
}
