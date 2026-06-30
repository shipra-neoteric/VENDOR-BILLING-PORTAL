// Re-exports from work-items api — work progress uses the same endpoints
export { fetchWorkOrders, addScopeProgress } from '../work-items/api';
import apiClient from '../../services/apiClient';
import type { Project } from '../../types/VendorBilling';

export const fetchProjects = () =>
  apiClient.get<{ projects: Project[] }>('/projects');
