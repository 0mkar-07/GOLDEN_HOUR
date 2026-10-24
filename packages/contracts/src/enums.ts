export enum UserRole {
  AMBULANCE = 'AMBULANCE',
  HOSPITAL = 'HOSPITAL',
  ADMIN = 'ADMIN',
}

export enum CaseStatus {
  DRAFT = 'DRAFT',
  ASSESSED = 'ASSESSED',
  DISPATCHING = 'DISPATCHING',
  EN_ROUTE = 'EN_ROUTE',
  ARRIVED = 'ARRIVED',
  HANDED_OVER = 'HANDED_OVER',
  CLOSED = 'CLOSED',
  CANCELED = 'CANCELED',
}

export enum RequestRole {
  MAIN = 'MAIN',
  STANDBY = 'STANDBY',
}

export enum RequestStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  CANCELED = 'CANCELED',
  EXPIRED = 'EXPIRED',
}

export enum DestinationReadiness {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  UNAVAILABLE = 'UNAVAILABLE',
}

export enum AllocationState {
  RESERVED = 'RESERVED',
  IN_USE = 'IN_USE',
  RELEASED = 'RELEASED',
}
