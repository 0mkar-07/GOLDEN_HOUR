import {
  LoginRequest,
  LoginResponse,
  UserDto,
  HospitalDto,
  ResourcePoolDto,
  StaffAvailabilityDto,
  UpdateHospitalRequest,
  UpdateResourcePoolRequest,
  UpdateStaffAvailabilityRequest,
  EmergencyCaseDto,
  AssessmentDto,
  CreateCaseRequest,
  SubmitAssessmentRequest,
  ConfirmRequirementsRequest,
  Agent1Proposal,
  RecommendationDto,
  RoadGraphDto,
  AmbulancePositionDto,
  HospitalRequestDto,
  DestinationDto,
  AllocationDto,
  AdminOverviewDto,
  AuditEventDto,
  AuditFilterQueryDto,
  SystemSettingsDto,
  AdminHospitalUpdateDto,
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

  async getHospitalStaff(id: string): Promise<{ staffAvailability: StaffAvailabilityDto[] }> {
    return request<{ staffAvailability: StaffAvailabilityDto[] }>(`/api/v1/hospitals/${id}/staff`, {
      method: 'GET',
    });
  },

  async updateStaffAvailability(
    id: string,
    updates: UpdateStaffAvailabilityRequest
  ): Promise<{ staffAvailability: StaffAvailabilityDto }> {
    return request<{ staffAvailability: StaffAvailabilityDto }>(`/api/v1/staff-availability/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  // Cases & Assessments API
  async createCase(payload: CreateCaseRequest): Promise<{ case: EmergencyCaseDto }> {
    return request<{ case: EmergencyCaseDto }>('/api/v1/cases', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getCase(id: string): Promise<{ case: EmergencyCaseDto; latestAssessment: AssessmentDto | null }> {
    return request<{ case: EmergencyCaseDto; latestAssessment: AssessmentDto | null }>(`/api/v1/cases/${id}`, {
      method: 'GET',
    });
  },

  async listCases(): Promise<{ cases: EmergencyCaseDto[] }> {
    return request<{ cases: EmergencyCaseDto[] }>('/api/v1/cases', {
      method: 'GET',
    });
  },

  async submitAssessment(
    caseId: string,
    payload: SubmitAssessmentRequest
  ): Promise<{ assessment: AssessmentDto; agent1Proposal: Agent1Proposal }> {
    return request<{ assessment: AssessmentDto; agent1Proposal: Agent1Proposal }>(
      `/api/v1/cases/${caseId}/assessments`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  async confirmRequirements(
    caseId: string,
    payload: ConfirmRequirementsRequest
  ): Promise<{ assessment: AssessmentDto; message: string }> {
    return request<{ assessment: AssessmentDto; message: string }>(
      `/api/v1/cases/${caseId}/confirm-requirements`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  async generateRecommendations(caseId: string): Promise<{ recommendation: RecommendationDto }> {
    return request<{ recommendation: RecommendationDto }>(`/api/v1/cases/${caseId}/recommendations`, {
      method: 'POST',
    });
  },

  async getRecommendations(caseId: string): Promise<{ recommendation: RecommendationDto | null }> {
    return request<{ recommendation: RecommendationDto | null }>(`/api/v1/cases/${caseId}/recommendations`, {
      method: 'GET',
    });
  },

  async getRoadGraph(): Promise<{
    graph: RoadGraphDto;
    trafficOverrides: Record<string, number>;
    ambulancePosition: AmbulancePositionDto;
  }> {
    return request<{
      graph: RoadGraphDto;
      trafficOverrides: Record<string, number>;
      ambulancePosition: AmbulancePositionDto;
    }>('/api/v1/routing/graph', {
      method: 'GET',
    });
  },

  // Dispatch & Hospital Request API
  async dispatchCase(caseId: string): Promise<{
    case: EmergencyCaseDto;
    requests: HospitalRequestDto[];
    destination: DestinationDto;
  }> {
    return request<{
      case: EmergencyCaseDto;
      requests: HospitalRequestDto[];
      destination: DestinationDto;
    }>(`/api/v1/cases/${caseId}/dispatch`, {
      method: 'POST',
    });
  },

  async listHospitalRequests(hospitalId?: string): Promise<{ requests: HospitalRequestDto[] }> {
    const query = hospitalId ? `?hospitalId=${hospitalId}` : '';
    return request<{ requests: HospitalRequestDto[] }>(`/api/v1/hospital-requests${query}`, {
      method: 'GET',
    });
  },

  async acceptHospitalRequest(requestId: string): Promise<{
    request: HospitalRequestDto;
    case: EmergencyCaseDto;
    allocations: AllocationDto[];
  }> {
    return request<{
      request: HospitalRequestDto;
      case: EmergencyCaseDto;
      allocations: AllocationDto[];
    }>(`/api/v1/hospital-requests/${requestId}/accept`, {
      method: 'POST',
    });
  },

  async declineHospitalRequest(requestId: string): Promise<{ request: HospitalRequestDto }> {
    return request<{ request: HospitalRequestDto }>(`/api/v1/hospital-requests/${requestId}/decline`, {
      method: 'POST',
    });
  },

  async getCaseDestination(caseId: string): Promise<{
    destination: DestinationDto | null;
    allocations: AllocationDto[];
  }> {
    return request<{
      destination: DestinationDto | null;
      allocations: AllocationDto[];
    }>(`/api/v1/cases/${caseId}/destination`, {
      method: 'GET',
    });
  },

  // Phase 8: Diversion, Arrival, Handover, and Resource Lifecycle
  async divertCase(
    caseId: string,
    payload: {
      targetHospitalId: string;
      expectedDestinationVersion: number;
      reason: string;
    }
  ): Promise<{
    case: EmergencyCaseDto;
    destination: DestinationDto;
    request: HospitalRequestDto;
    releasedAllocations: AllocationDto[];
  }> {
    return request<{
      case: EmergencyCaseDto;
      destination: DestinationDto;
      request: HospitalRequestDto;
      releasedAllocations: AllocationDto[];
    }>(`/api/v1/cases/${caseId}/divert`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async arriveCase(caseId: string): Promise<{ case: EmergencyCaseDto }> {
    return request<{ case: EmergencyCaseDto }>(`/api/v1/cases/${caseId}/arrive`, {
      method: 'POST',
    });
  },

  async handoverCase(caseId: string): Promise<{ case: EmergencyCaseDto }> {
    return request<{ case: EmergencyCaseDto }>(`/api/v1/cases/${caseId}/handover`, {
      method: 'POST',
    });
  },

  async listHospitalAllocations(hospitalId: string): Promise<{ allocations: AllocationDto[] }> {
    return request<{ allocations: AllocationDto[] }>(`/api/v1/hospitals/${hospitalId}/allocations`, {
      method: 'GET',
    });
  },

  async startUseAllocation(
    allocationId: string,
    payload: { expectedVersion: number }
  ): Promise<{ allocation: AllocationDto }> {
    return request<{ allocation: AllocationDto }>(`/api/v1/allocations/${allocationId}/start-use`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async releaseAllocation(
    allocationId: string,
    payload: { expectedVersion: number }
  ): Promise<{ allocation: AllocationDto }> {
    return request<{ allocation: AllocationDto }>(`/api/v1/allocations/${allocationId}/release`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Admin API (Phase 9)
  async getAdminOverview(): Promise<AdminOverviewDto> {
    return request<AdminOverviewDto>('/api/v1/admin/overview', {
      method: 'GET',
    });
  },

  async getAdminAuditLogs(query?: AuditFilterQueryDto): Promise<{ total: number; logs: AuditEventDto[] }> {
    const params = new URLSearchParams();
    if (query?.caseId) params.append('caseId', query.caseId);
    if (query?.hospitalId) params.append('hospitalId', query.hospitalId);
    if (query?.action) params.append('action', query.action);
    if (query?.since) params.append('since', query.since);
    if (query?.limit) params.append('limit', String(query.limit));
    const qs = params.toString();
    return request<{ total: number; logs: AuditEventDto[] }>(`/api/v1/admin/audit-logs${qs ? `?${qs}` : ''}`, {
      method: 'GET',
    });
  },

  async getAdminCases(): Promise<{ cases: any[] }> {
    return request<{ cases: any[] }>('/api/v1/admin/cases', {
      method: 'GET',
    });
  },

  async getAdminSettings(): Promise<{ settings: SystemSettingsDto }> {
    return request<{ settings: SystemSettingsDto }>('/api/v1/admin/settings', {
      method: 'GET',
    });
  },

  async updateAdminSettings(settings: SystemSettingsDto): Promise<{ message: string; settings: SystemSettingsDto }> {
    return request<{ message: string; settings: SystemSettingsDto }>('/api/v1/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  async updateAdminHospitalStatus(
    id: string,
    updates: AdminHospitalUpdateDto
  ): Promise<{ message: string; hospital: HospitalDto }> {
    return request<{ message: string; hospital: HospitalDto }>(`/api/v1/admin/hospitals/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  async resetDemoScenario(): Promise<{ message: string }> {
    return request<{ message: string }>('/api/v1/admin/reset', {
      method: 'POST',
    });
  },
};
