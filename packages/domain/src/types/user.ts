import type { SystemRole, UserStatus } from "../enums";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  systemRole: SystemRole;
  status: UserStatus;
}

export interface UserAdminRow {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  department: string | null;
  avatarKey?: string | null;
  systemRole: SystemRole;
  status: UserStatus;
  createdAt: number;
  updatedAt: number;
}

export type UserDto = UserAdminRow;
