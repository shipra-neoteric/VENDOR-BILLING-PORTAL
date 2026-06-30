import apiClient from '../../services/apiClient';
import type { WorkOrder } from '../../types/VendorBilling';

export const fetchWorkOrders = (params?: {
  projectId?: string;
  vendorCode?: string;
  status?: string;
  search?: string;
}) => apiClient.get<{ workOrders: WorkOrder[] }>('/work-orders', { params });

export const getWorkOrder = (id: string) =>
  apiClient.get<{ workOrder: WorkOrder }>(`/work-orders/${id}`);

export const createWorkOrder = (data: Partial<WorkOrder>) =>
  apiClient.post<{ workOrder: WorkOrder }>('/work-orders', data);

export const updateWorkOrder = (id: string, data: Partial<WorkOrder>) =>
  apiClient.put<{ workOrder: WorkOrder }>(`/work-orders/${id}`, data);

export const addScopeProgress = (workOrderId: string, itemId: string, data: {
  date?: string;
  qtyAdded: number;
  remarks?: string;
}) =>
  apiClient.post(`/work-orders/${workOrderId}/scope-items/${itemId}/progress`, data);
