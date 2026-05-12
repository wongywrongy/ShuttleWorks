import axios, { type AxiosInstance } from 'axios';
import type {
  ScheduleRequest,
  ScheduleResponse,
  HealthResponse,
} from '../types/schedule';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

class ApiClient {
  private client: AxiosInstance;

  constructor(baseURL: string = API_BASE_URL) {
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 300000, // 5 minutes for large schedules
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          // Server responded with error status
          const message = error.response.data?.detail || error.response.data?.message || 'An error occurred';
          throw new Error(message);
        } else if (error.request) {
          // Request made but no response received
          throw new Error('No response from server. Please check if the backend is running.');
        } else {
          // Something else happened
          throw new Error(error.message || 'An unexpected error occurred');
        }
      }
    );
  }

  async healthCheck(): Promise<HealthResponse> {
    const response = await this.client.get<HealthResponse>('/health');
    return response.data;
  }

  async generateSchedule(request: ScheduleRequest): Promise<ScheduleResponse> {
    const response = await this.client.post<ScheduleResponse>('/schedule', request);
    return response.data;
  }

  async validateRequest(request: ScheduleRequest): Promise<{ valid: boolean; errors?: string[] }> {
    try {
      const response = await this.client.post('/validate', request);
      return { valid: true, ...response.data };
    } catch (error: any) {
      if (error.response?.status === 400 || error.response?.status === 422) {
        return {
          valid: false,
          errors: [error.response.data?.detail || 'Validation failed'],
        };
      }
      throw error;
    }
  }
}

export const apiClient = new ApiClient();
export default apiClient;
