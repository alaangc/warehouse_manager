export type UserRole = 'ADMINISTRATOR' | 'DRIVER';
export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  active: boolean;
};
export type SessionResponse = { data: SessionUser };
export type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  instance?: string;
  requestId?: string;
  errors?: Record<string, string[]>;
};
export type ApiPaths = Record<string, Record<string, unknown>>;
