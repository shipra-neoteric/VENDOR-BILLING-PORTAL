import apiClient from '../../services/apiClient';

export const fetchLedgerSummary = (params?: { projectId?: string; vendorCode?: string }) =>
  apiClient.get<{ summary: any[] }>('/ledger/summary', { params });

export const fetchWorkOrderLedger = (workOrderId: string) =>
  apiClient.get<{ workOrder: any; ledgerRows: any[]; totals: any; contract: number }>(
    `/ledger/${workOrderId}`
  );
