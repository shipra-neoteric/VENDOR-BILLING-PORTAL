import apiClient from '../../services/apiClient';

export const fetchBills = (params?: {
  workOrderId?: string;
  vendorCode?: string;
  projectId?: string;
  status?: string;
  search?: string;
}) => apiClient.get<{ bills: any[] }>('/bills', { params });

export const getBill = (id: string) =>
  apiClient.get<{ bill: any }>(`/bills/${id}`);

export const createBill = (data: any) =>
  apiClient.post<{ bill: any }>('/bills', data);

export const updateBill = (id: string, data: any) =>
  apiClient.put<{ bill: any }>(`/bills/${id}`, data);

export const verifyBill = (id: string, remarks?: string) =>
  apiClient.patch(`/bills/${id}/verify`, { remarks });

export const approveBill = (id: string, remarks?: string) =>
  apiClient.patch(`/bills/${id}/approve`, { remarks });

export const rejectBill = (id: string, reason: string) =>
  apiClient.patch(`/bills/${id}/reject`, { reason });

export const initiatePayment = (id: string, data: { tdsPercent?: number; tdsAmount?: number; remarks?: string }) =>
  apiClient.patch(`/bills/${id}/initiate-payment`, data);

export const payBill = (id: string, paymentData: {
  paymentUTR?: string;
  paymentChequeNo?: string;
  paymentDate?: string;
  paymentBank?: string;
  paymentMode?: string;
  paymentReleasedBy?: string;
}) => apiClient.patch(`/bills/${id}/pay`, paymentData);
