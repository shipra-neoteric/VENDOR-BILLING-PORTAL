import apiClient from '../../services/apiClient';
import type { Project } from '../../types/VendorBilling';

export const fetchProjects = (status?: string) =>
  apiClient.get<{ projects: Project[] }>('/projects', status ? { params: { status } } : {});

export const createProject = (data: Partial<Project>) =>
  apiClient.post<{ project: Project }>('/projects', data);

export const updateProject = (id: string, data: Partial<Project>) =>
  apiClient.put<{ project: Project }>(`/projects/${id}`, data);

export const deleteProject = (id: string) =>
  apiClient.delete(`/projects/${id}`);
