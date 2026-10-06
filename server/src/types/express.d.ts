import type { Role, UserStatus } from "@prisma/client";

export type AuthUser = {
  id: string;
  role: Role;
  status: UserStatus;
  firstName: string;
  lastName: string;
  username: string;
  avatarUrl: string | null;
};

export type Validated<TBody = unknown, TQuery = unknown, TParams = unknown> = {
  body: TBody;
  query: TQuery;
  params: TParams;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      validated?: Validated;
    }
  }
}

export {};
