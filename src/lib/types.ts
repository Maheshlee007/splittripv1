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
  defaultCurrency?: string;
}

/* ---------- Personal Expense Tracker ---------- */

export interface CustomPaymentMethod {
  id: string;
  label: string;
  icon?: string;         // lucide icon name or emoji
  isDefault?: boolean;
}

export interface PersonalExpense {
  id: string;
  description: string;
  amount: number;
  currency: string;
  category: string;
  paymentMethod: string;   // ID from CustomPaymentMethod
  date: number;            // epoch ms — actual expense date
  monthKey: string;        // "2026-05" — derived from date, stored for indexing
  note?: string;
  billImage?: string;      // dataURL, max 500KB compressed
  createdAt: number;
  updatedAt: number;
}

export interface PersonalBudget {
  monthKey: string;        // "2026-05"
  category?: string;       // undefined = overall budget for month
  amount: number;
  currency: string;
}

export type LendingDirection = "owed_to_me" | "i_owe";

export interface Lending {
  id: string;
  personName: string;
  personPhone?: string;
  amount: number;
  currency: string;
  direction: LendingDirection;
  reason?: string;
  date: number;
  dueDate?: number;
  status: "pending" | "partial" | "settled";
  partialAmount?: number;
  settledAt?: number;
  createdAt: number;
}
