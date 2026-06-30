import apiClient from '../../services/apiClient';

export const fetchDashboardData = () =>
  Promise.all([
    apiClient.get('/work-orders'),
    apiClient.get('/bills'),
    apiClient.get('/projects'),
  ]);
