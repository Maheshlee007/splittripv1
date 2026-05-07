/**
 * Zod schemas for validating untrusted Group / Backup payloads.
 *
 * Used by:
 *  - sync.ts before applying P2P snapshots (finding p2p_snapshot_validation)
 *  - exports.ts importJSON & backup.ts restoreBackup (finding import_no_schema)
 */
import { z } from "zod";

// ~2 MB upper bound on a base64 data URL (incl. header).
const MAX_BILL_IMAGE = 2_700_000;

const safeStr = (max: number, min = 0) => {
  const base = min > 0 ? z.string().min(min).max(max) : z.string().max(max);
  return base.transform((s) => s.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, ""));
};

const RoleSchema = z.enum(["owner", "admin", "member"]);
const StatusSchema = z.enum(["active", "pending"]).optional();
const SplitModeSchema = z.enum(["equal", "shares", "exact", "percent"]);

export const MemberSchema = z.object({
  id: safeStr(64).min(1),
  name: safeStr(80).default(""),
  phone: safeStr(40).optional(),
  upiId: safeStr(80).optional(),
  role: RoleSchema,
  status: StatusSchema,
  leaveRequested: z.boolean().optional(),
}).passthrough();

const SplitSchema = z.object({
  memberId: safeStr(64),
  value: z.number().finite(),
});

const finiteAmount = z.number().finite().min(0).max(1e9);
const finiteTimestamp = z.number().finite().min(0).max(Date.now() + 365 * 24 * 60 * 60 * 1000);

export const ExpenseSchema = z.object({
  id: safeStr(64),
  description: safeStr(500).default(""),
  amount: finiteAmount,
  currency: safeStr(8).default("INR"),
  paidBy: safeStr(64),
  category: safeStr(40).default("misc"),
  note: safeStr(1000).optional(),
  splitMode: SplitModeSchema,
  splits: z.array(SplitSchema).max(200),
  billImage: z.string().max(MAX_BILL_IMAGE).optional(),
  createdAt: finiteTimestamp,
  date: finiteTimestamp.optional(),
  createdBy: safeStr(64),
  updatedAt: finiteTimestamp,
}).passthrough();

const ExpenseRequestSchema = z.object({
  id: safeStr(64),
  expense: ExpenseSchema.omit({ id: true, createdAt: true, updatedAt: true }).extend({
    createdBy: safeStr(64),
  }),
  status: z.enum(["pending", "approved", "rejected"]),
  requestedBy: safeStr(64),
  requestedAt: finiteTimestamp,
  reviewedBy: safeStr(64).optional(),
  reviewedAt: finiteTimestamp.optional(),
  reviewNote: safeStr(500).optional(),
}).passthrough();

const SettlementSchema = z.object({
  id: safeStr(64),
  fromId: safeStr(64),
  toId: safeStr(64),
  amount: finiteAmount,
  currency: safeStr(8).default("INR"),
  note: safeStr(500).optional(),
  createdAt: finiteTimestamp,
  createdBy: safeStr(64),
  // payment-claim verification (added in this pass)
  status: z.enum(["pending", "approved", "rejected", "partial"]).optional(),
  claimedAmount: finiteAmount.optional(),
  approvedAmount: finiteAmount.optional(),
  reviewedBy: safeStr(64).optional(),
  reviewedAt: finiteTimestamp.optional(),
}).passthrough();

const ActivitySchema = z.object({
  id: safeStr(64),
  type: z.enum(["join", "approve", "reject", "expense", "request", "settlement", "member", "archive", "leave"]),
  actorId: safeStr(64),
  actorName: safeStr(80),
  message: safeStr(300),
  createdAt: finiteTimestamp,
}).passthrough();

export const GroupSchema = z.object({
  id: safeStr(32).min(1),
  name: safeStr(80),
  emoji: safeStr(8).default("🧳"),
  currency: safeStr(8),
  budget: z.number().finite().min(0).max(1e9).optional(),
  createdAt: finiteTimestamp,
  ownerId: safeStr(64).default(""),
  archived: z.boolean().optional(),
  archivedAt: finiteTimestamp.optional(),
  inviteToken: safeStr(40).optional(),
  members: z.array(MemberSchema).max(200),
  expenses: z.array(ExpenseSchema).max(5000),
  requests: z.array(ExpenseRequestSchema).max(2000),
  settlements: z.array(SettlementSchema).max(5000),
  activity: z.array(ActivitySchema).max(500).optional(),
}).passthrough();

export const BackupSchema = z.object({
  app: z.literal("splittrip"),
  version: z.number().int(),
  exportedAt: finiteTimestamp,
  profile: z.object({
    id: safeStr(64),
    name: safeStr(80),
    phone: safeStr(40).optional(),
    upiId: safeStr(80).optional(),
  }).nullable(),
  groups: z.array(GroupSchema).max(500),
});

export function safeParseGroup(raw: unknown) {
  return GroupSchema.safeParse(raw);
}

export function safeParseBackup(raw: unknown) {
  return BackupSchema.safeParse(raw);
}
