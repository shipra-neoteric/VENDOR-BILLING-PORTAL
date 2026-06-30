import apiClient from '../../services/apiClient';
import type { Contractor } from '../../types/VendorBilling';

export const fetchContractors = (params?: { status?: string; search?: string }) =>
  apiClient.get<{ contractors: Contractor[] }>('/contractors', { params });

export const getContractor = (id: string) =>
  apiClient.get<{ contractor: Contractor }>(`/contractors/${id}`);

export const createContractor = (data: Partial<Contractor>) =>
  apiClient.post<{ contractor: Contractor }>('/contractors', data);

export const bulkImportContractors = (contractors: Partial<Contractor>[]) =>
  apiClient.post<{ created: Contractor[]; skipped: any[]; errors: any[] }>(
    '/contractors/bulk',
    { contractors }
  );

export const updateContractor = (id: string, data: Partial<Contractor>) =>
  apiClient.put<{ contractor: Contractor }>(`/contractors/${id}`, data);
