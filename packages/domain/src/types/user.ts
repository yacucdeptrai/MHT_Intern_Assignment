import type { SystemRole, UserStatus } from "../enums";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  systemRole: SystemRole;
  status: UserStatus;
}
