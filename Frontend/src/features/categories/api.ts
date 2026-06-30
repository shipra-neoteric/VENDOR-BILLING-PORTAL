import apiClient from '../../services/apiClient';

export const fetchCategories = () =>
  apiClient.get<{ categories: any[] }>('/categories');

export const createCategory = (data: { name: string; color: string; description?: string; isActive?: boolean }) =>
  apiClient.post<{ category: any }>('/categories', data);

export const updateCategory = (id: string, data: any) =>
  apiClient.put<{ category: any }>(`/categories/${id}`, data);

export const deleteCategory = (id: string) =>
  apiClient.delete(`/categories/${id}`);
