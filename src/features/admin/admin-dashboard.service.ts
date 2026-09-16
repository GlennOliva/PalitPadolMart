import { supabase } from '../../lib/supabase/client'
import { runAdminSingle } from './admin-service-utils'
import type { AdminResult, AdminSummaryRow } from './admin.types'

export function getAdminSummary(): Promise<AdminResult<AdminSummaryRow>> {
  return runAdminSingle<AdminSummaryRow>(() => supabase.rpc('admin_summary'))
}
