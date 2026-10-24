import {
  LoginRequest,
  LoginResponse,
  UserDto,
  HospitalDto,
  ResourcePoolDto,
  UpdateHospitalRequest,
  UpdateResourcePoolRequest,
} from '@goldenhour/contracts';

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
    credentials: 'include', // Includes httpOnly cookies
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.code || 'UNKNOWN_ERROR',
      data?.message || `Request failed with status ${response.status}`,
      data?.details
    );
  }

  return data as T;
}

export const apiClient = {
  // Auth API
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    return request<LoginResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },

  async logout(): Promise<{ message: string }> {
    return request<{ message: string }>('/api/v1/auth/logout', {
      method: 'POST',
    });
  },

  async getMe(): Promise<{ user: UserDto }> {
    return request<{ user: UserDto }>('/api/v1/auth/me', {
      method: 'GET',
    });
  },

  // Hospital API
  async listHospitals(): Promise<{ hospitals: HospitalDto[] }> {
    return request<{ hospitals: HospitalDto[] }>('/api/v1/hospitals', {
      method: 'GET',
    });
  },

  async getHospital(id: string): Promise<{ hospital: HospitalDto }> {
    return request<{ hospital: HospitalDto }>(`/api/v1/hospitals/${id}`, {
      method: 'GET',
    });
  },

  async updateHospital(id: string, updates: UpdateHospitalRequest): Promise<{ hospital: HospitalDto }> {
    return request<{ hospital: HospitalDto }>(`/api/v1/hospitals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  async getHospitalResources(id: string): Promise<{ resourcePools: ResourcePoolDto[] }> {
    return request<{ resourcePools: ResourcePoolDto[] }>(`/api/v1/hospitals/${id}/resources`, {
      method: 'GET',
    });
  },

  async updateResourcePool(id: string, updates: UpdateResourcePoolRequest): Promise<{ resourcePool: ResourcePoolDto }> {
    return request<{ resourcePool: ResourcePoolDto }>(`/api/v1/resource-pools/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },
};
