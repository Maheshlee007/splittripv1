export type Role = "owner" | "admin" | "member";

export interface Member {
  id: string;
  name: string;
  phone?: string;
  upiId?: string;
  role: Role;
  /** pending = waiting for owner approval after self-join */
  status?: "active" | "pending";
  /** member asked owner/admin to remove them from the trip */
  leaveRequested?: boolean;
}

export type SplitMode = "equal" | "shares" | "exact" | "percent";

export interface Split {
  memberId: string;
  /** value depends on mode: equal=ignored; shares=share count; exact=amount; percent=0-100 */
  value: number;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  currency: string;
  paidBy: string;          // member id
  category: string;
  note?: string;
  splitMode: SplitMode;
  splits: Split[];         // participants (members excluded are simply not in this list)
  /** optional dataURL of the bill photo */
  billImage?: string;
  createdAt: number;
  /** the date the expense actually occurred — defaults to createdAt */
  date?: number;
  createdBy: string;
  updatedAt: number;
}

export type RequestStatus = "pending" | "approved" | "rejected";

export interface ExpenseRequest {
  id: string;
  expense: Omit<Expense, "id" | "createdAt" | "updatedAt">;
  status: RequestStatus;
  requestedBy: string;
  requestedAt: number;
  reviewedBy?: string;
  reviewedAt?: number;
  reviewNote?: string;
}

export interface Settlement {
  id: string;
  fromId: string;
  toId: string;
  amount: number;
  currency: string;
  note?: string;
  createdAt: number;
  createdBy: string;
  /** Payment-claim verification flow. Owner approves member's "I paid you" claim. */
  status?: "pending" | "approved" | "rejected" | "partial";
  /** Amount the member claims to have paid (before owner verification). */
  claimedAmount?: number;
  /** Amount the owner has actually verified (used by Balances). */
  approvedAmount?: number;
  reviewedBy?: string;
  reviewedAt?: number;
}

export interface ActivityItem {
  id: string;
  type: "join" | "approve" | "reject" | "expense" | "request" | "settlement" | "member" | "archive" | "leave";
  actorId: string;
  actorName: string;
  message: string;
  createdAt: number;
}

export interface Group {
  id: string;          // also room code (uppercase)
  name: string;
  emoji: string;
  currency: string;
  budget?: number;
  createdAt: number;
  ownerId: string;
  archived?: boolean;
  archivedAt?: number;
  /** Random per-trip token used in shareable URLs (not the human code). */
  inviteToken?: string;
  members: Member[];
  expenses: Expense[];
  requests: ExpenseRequest[];
  settlements: Settlement[];
  activity?: ActivityItem[];
  syncDisabled?: boolean;
}

export interface Profile {
  id: string;
  name: string;
  phone?: string;
  upiId?: string;
}
