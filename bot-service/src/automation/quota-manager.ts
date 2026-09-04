export * from '../quota/quota-manager';
import { QuotaManager, ExtractedQuota } from '../quota/quota-manager';
import { Page } from 'playwright';

export async function syncQuotaFromLivePortal(page: Page, navigateIfNeeded: boolean = true): Promise<ExtractedQuota | null> {
  return QuotaManager.syncQuotaFromLivePortal(page, navigateIfNeeded);
}
