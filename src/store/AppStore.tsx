import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { customAlphabet, nanoid } from "nanoid";
import { ActivityItem, Expense, ExpenseRequest, Group, Member, Profile, Settlement, Split, SplitMode } from "@/lib/types";
import { loadGroups, loadProfile, loadTheme, saveGroup, saveProfile, saveTheme, deleteGroup, ThemePref } from "@/lib/storage";

const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = customAlphabet(codeAlphabet, 6);

interface AppStoreValue {
  ready: boolean;
  profile: Profile;
  setProfileFields: (p: Partial<Profile>) => void;
  hasProfile: boolean;
  themePref: ThemePref;
  resolvedTheme: "light" | "dark";
  setThemePref: (p: ThemePref) => void;
  toggleTheme: () => void;
  groups: Group[];
  getGroup: (id: string) => Group | undefined;
  createGroup: (name: string, emoji: string, currency: string, syncDisabled?: boolean) => Group;
  joinGroup: (code: string, inviteToken?: string) => Group;
  removeGroup: (id: string) => void;
  setArchived: (id: string, archived: boolean) => void;
  setSyncEnabled: (id: string, enabled: boolean) => void;
  updateGroup: (id: string, fn: (g: Group) => Group) => void;
  importGroup: (g: Group) => void;
  /* member ops */
  addMember: (groupId: string, name: string, upiId?: string, phone?: string) => Member;
  updateMember: (groupId: string, memberId: string, patch: Partial<Member>) => void;
  removeMember: (groupId: string, memberId: string) => void;
  setRole: (groupId: string, memberId: string, role: Member["role"]) => void;
  approveMember: (groupId: string, memberId: string) => void;
  rejectMember: (groupId: string, memberId: string) => void;
  requestLeave: (groupId: string) => void;
  clearLeaveRequest: (groupId: string, memberId: string) => void;
  /* expense ops */
  addExpense: (groupId: string, e: Omit<Expense, "id" | "createdAt" | "updatedAt" | "createdBy">) => void;
  updateExpense: (groupId: string, e: Expense) => void;
  removeExpense: (groupId: string, expenseId: string) => void;
  /* request ops */
  submitRequest: (groupId: string, e: Omit<Expense, "id" | "createdAt" | "updatedAt" | "createdBy">) => void;
  approveRequest: (groupId: string, requestId: string) => void;
  rejectRequest: (groupId: string, requestId: string, note?: string) => void;
  /* settlement */
  addSettlement: (groupId: string, s: Omit<Settlement, "id" | "createdAt" | "createdBy">) => void;
  claimPayment: (groupId: string, opts: { fromId: string; toId: string; amount: number; currency: string; note?: string }) => void;
  reviewClaim: (groupId: string, claimId: string, decision: { approve: boolean; amount?: number; note?: string }) => void;
  approveLeave: (groupId: string, memberId: string) => void;
  regenerateInviteToken: (groupId: string) => void;
  /* sync */
  peers: Record<string, string[]>;
  myMemberId: (groupId: string) => string | undefined;
  myRole: (groupId: string) => Member["role"] | undefined;
  setBroadcaster: (fn: ((g: Group) => void) | null) => void;
  setKickCaster: (fn: ((target: string, kicker: string) => void) | null) => void;
  handleRemoteGroup: (incoming: Group) => void;
  handleRemoteKick: (groupId: string, memberId: string, kickerId: string) => void;
  handleTripEnded: (groupId: string) => void;
  setTripPeers: (groupId: string, activeMembers: string[]) => void;
}

const Ctx = createContext<AppStoreValue | null>(null);

function defaultProfile(): Profile {
  return { id: nanoid(), name: "" };
}

function activity(profile: Profile, type: ActivityItem["type"], message: string): ActivityItem {
  return { id: nanoid(), type, actorId: profile.id, actorName: profile.name || "Me", message, createdAt: Date.now() };
}

function withActivity(g: Group, item: ActivityItem): Group {
  return { ...g, activity: [item, ...(g.activity ?? [])].slice(0, 250) };
}

function ensureMe(group: Group, profile: Profile): Group {
  if (group.members.some((m) => m.id === profile.id)) return group;
  // joining via sync — owner present? if so, mark me pending; else owner is me (shouldn't happen normally)
  const isOwner = group.ownerId === profile.id;
  const role: Member["role"] = isOwner ? "owner" : "member";
  return {
    ...group,
    members: [
      ...group.members,
      {
        id: profile.id,
        name: profile.name || "Me",
        upiId: profile.upiId,
        phone: profile.phone,
        role,
        status: isOwner || !group.ownerId ? "active" : "pending",
      },
    ],
  };
}

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [themePref, setThemePrefState] = useState<ThemePref>("system");
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(getSystemTheme);
  const [groups, setGroups] = useState<Group[]>([]);
  const [peers, setPeers] = useState<Record<string, string[]>>({});
  const groupsRef = useRef<Group[]>([]);
  groupsRef.current = groups;

  // hydrate
  useEffect(() => {
    (async () => {
      const [p, t, gs] = await Promise.all([loadProfile(), loadTheme(), loadGroups()]);
      const prof = p ?? defaultProfile();
      setProfile(prof);
      setThemePrefState(t);
      setGroups(gs);
      if (!p) await saveProfile(prof);
      setReady(true);
    })();
  }, []);

  // system theme listener
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setSystemTheme(mq.matches ? "dark" : "light");
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  const resolvedTheme: "light" | "dark" = themePref === "system" ? systemTheme : themePref;

  // theme apply
  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");

    // Update all theme-color meta tags (some builds inject multiple tags)
    const changePwaThemeColor = (newColor: string) => {
      const metaTags = document.querySelectorAll('meta[name="theme-color"]');
      if (metaTags.length > 0) {
        metaTags.forEach((tag) => tag.setAttribute("content", newColor));
      } else {
        const meta = document.createElement("meta");
        meta.name = "theme-color";
        meta.content = newColor;
        document.head.appendChild(meta);
      }
    };

    changePwaThemeColor(resolvedTheme === "dark" ? "#99ff33" : "#F96915");
  }, [resolvedTheme]);

  const broadcasterRef = useRef<((g: Group) => void) | null>(null);
  const kickCasterRef = useRef<((target: string, kicker: string) => void) | null>(null);

  const setBroadcaster = useCallback((fn: ((g: Group) => void) | null) => { broadcasterRef.current = fn; }, []);
  const setKickCaster = useCallback((fn: ((t: string, k: string) => void) | null) => { kickCasterRef.current = fn; }, []);

  const handleRemoteGroup = useCallback((incoming: Group) => {
    setGroups((curr) => {
      const idx = curr.findIndex((g) => g.id === incoming.id);
      if (idx === -1) {
        const merged = ensureMe(sanitizeIncomingForProfile(incoming, undefined, profile), profile);
        saveGroup(merged);
        return [...curr, merged];
      }
      const merged = ensureMe(mergeGroups(curr[idx], sanitizeIncomingForProfile(incoming, curr[idx], profile)), profile);
      saveGroup(merged);
      const next = [...curr];
      next[idx] = merged;
      return next;
    });
  }, [profile]);

  const handleRemoteKick = useCallback((groupId: string, memberId: string, kickerId: string) => {
    if (memberId !== profile.id) return;
    const g = groupsRef.current.find((x) => x.id === groupId);
    if (g) {
      const kicker = g.members.find((m) => m.id === kickerId);
      if (!kicker || (kicker.role !== "owner" && kicker.role !== "admin")) {
        console.warn("Unauthorized kick attempt blocked.");
        return;
      }
    }
    deleteGroup(groupId);
    setGroups((curr) => curr.filter((g) => g.id !== groupId));
  }, [profile.id]);

  const persist = useCallback((g: Group, broadcast = true) => {
    saveGroup(g);
    if (broadcast && broadcasterRef.current) broadcasterRef.current(g);
  }, []);

  const handleTripEnded = useCallback((groupId: string) => {
    setGroups((curr) => {
      const next = curr.map((g) => (g.id === groupId ? { ...g, archived: true, archivedAt: Date.now() } : g));
      const tg = next.find((g) => g.id === groupId);
      if (tg) persist(tg);
      return next;
    });
  }, [persist]);

  const setTripPeers = useCallback((groupId: string, activeMembers: string[]) => {
    setPeers((p) => ({ ...p, [groupId]: activeMembers }));
  }, []);




  const setProfileFields = useCallback(
    (patch: Partial<Profile>) => {
      setProfile((p) => {
        const next = { ...p, ...patch };
        saveProfile(next);
        setGroups((curr) =>
          curr.map((g) => {
            const i = g.members.findIndex((m) => m.id === next.id);
            if (i === -1) return g;
            const ng = { ...g, members: [...g.members] };
            ng.members[i] = {
              ...ng.members[i],
              name: next.name || ng.members[i].name,
              upiId: next.upiId,
              phone: next.phone,
            };
            persist(ng);
            return ng;
          })
        );
        return next;
      });
    },
    [persist]
  );

  const setThemePref = useCallback((p: ThemePref) => {
    setThemePrefState(p);
    saveTheme(p);
  }, []);

  const toggleTheme = useCallback(() => {
    // cycle: light -> dark -> system -> light
    setThemePrefState((t) => {
      const next: ThemePref = t === "light" ? "dark" : t === "dark" ? "system" : "light";
      saveTheme(next);
      return next;
    });
  }, []);

  const getGroup = useCallback((id: string) => groupsRef.current.find((g) => g.id === id), []);

  const createGroup = useCallback(
    (name: string, emoji: string, currency: string, syncDisabled: boolean = false): Group => {
      const id = newCode();
      const g: Group = {
        id,
        name,
        emoji,
        currency,
        createdAt: Date.now(),
        ownerId: profile.id,
        inviteToken: nanoid(22),
        members: [{
          id: profile.id,
          name: profile.name || "Me",
          upiId: profile.upiId,
          phone: profile.phone,
          role: "owner",
          status: "active",
        }],
        expenses: [],
        requests: [],
        settlements: [],
        syncDisabled,
        activity: [activity(profile, "member", "created the trip")],
      };
      setGroups((curr) => [...curr, g]);
      persist(g);
      return g;
    },
    [profile, persist]
  );

  const joinGroup = useCallback(
    (code: string, inviteToken?: string): Group => {
      const id = code.toUpperCase().trim();
      const existing = groupsRef.current.find((g) => g.id === id);
      if (existing) {
        if (inviteToken && existing.inviteToken !== inviteToken) {
           updateGroup(id, (g) => ({ ...g, inviteToken }));
        }
        return existing;
      }
      const g: Group = {
        id,
        name: `Trip ${id}`,
        emoji: "🧳",
        currency: "INR",
        createdAt: Date.now(),
        ownerId: "",
        inviteToken,
        members: [{
          id: profile.id,
          name: profile.name || "Me",
          upiId: profile.upiId,
          phone: profile.phone,
          role: "member",
          status: "pending",
        }],
        expenses: [],
        requests: [],
        settlements: [],
        activity: [activity(profile, "join", "requested to join the trip")],
      };
      setGroups((curr) => [...curr, g]);
      persist(g);
      return g;
    },
    [profile, persist]
  );

  const importGroup = useCallback((g: Group) => {
    setGroups((curr) => {
      const i = curr.findIndex((x) => x.id === g.id);
      const merged = ensureMe(g, profile);
      saveGroup(merged);
      if (broadcasterRef.current) broadcasterRef.current(merged);
      if (i === -1) return [...curr, merged];
      const next = [...curr];
      next[i] = merged;
      return next;
    });
  }, [profile]);

  const removeGroup = useCallback((id: string) => {
    deleteGroup(id);
    setGroups((curr) => curr.filter((g) => g.id !== id));
  }, []);



  const setSyncEnabled = useCallback(
    (id: string, enabled: boolean) =>
      setGroups((curr) => {
        const next = curr.map((g) => (g.id === id ? { ...g, syncDisabled: !enabled } : g));
        const tg = next.find((g) => g.id === id);
        if (tg) persist(tg);
        return next;
      }),
    [persist]
  );

  const updateGroup = useCallback(
    (id: string, fn: (g: Group) => Group) => {
      setGroups((curr) => {
        const i = curr.findIndex((g) => g.id === id);
        if (i === -1) return curr;
        const next = [...curr];
        next[i] = fn(curr[i]);
        persist(next[i]);
        return next;
      });
    },
    [persist]
  );

  const addMember = useCallback(
    (groupId: string, name: string, upiId?: string, phone?: string): Member => {
      const m: Member = { id: nanoid(), name: name.trim() || "Member", upiId, phone, role: "member", status: "active" };
      updateGroup(groupId, (g) => withActivity({ ...g, members: [...g.members, m] }, activity(profile, "member", `added ${m.name} as a member`)));
      return m;
    },
    [profile, updateGroup]
  );

  const updateMember = useCallback(
    (groupId: string, memberId: string, patch: Partial<Member>) => {
      updateGroup(groupId, (g) => ({
        ...g,
        members: g.members.map((m) => (m.id === memberId ? { ...m, ...patch } : m)),
      }));
    },
    [updateGroup]
  );

  const removeMember = useCallback(
    (groupId: string, memberId: string) => {
      updateGroup(groupId, (g) => {
        const ownerId = g.ownerId || g.members[0]?.id;
        // Drop member from splits, drop expenses where they were sole participant,
        // and reassign paidBy to owner if their expense lingers.
        const expenses = g.expenses
          .map((e) => {
            const splits = e.splits.filter((s) => s.memberId !== memberId);
            const paidBy = e.paidBy === memberId ? ownerId : e.paidBy;
            return { ...e, splits, paidBy, updatedAt: Date.now() };
          })
          .filter((e) => e.splits.length > 0);
        const settlements = g.settlements.filter(
          (s) => s.fromId !== memberId && s.toId !== memberId
        );
        const requests = g.requests.filter(
          (r) => r.expense.paidBy !== memberId && r.requestedBy !== memberId
        );
        return withActivity({
          ...g,
          members: g.members.filter((m) => m.id !== memberId),
          expenses,
          settlements,
          requests,
        }, activity(profile, "member", "removed a member"));
      });
    },
    [profile, updateGroup]
  );

  const setArchived = useCallback((id: string, archived: boolean) => {
    updateGroup(id, (g) => withActivity({ ...g, archived, archivedAt: archived ? Date.now() : undefined }, activity(profile, "archive", archived ? "archived the trip" : "restored the trip")));
  }, [profile, updateGroup]);

  const regenerateInviteToken = useCallback((groupId: string) => {
    updateGroup(groupId, (g) => ({ ...g, inviteToken: nanoid(22) }));
  }, [updateGroup]);

  const setRole = useCallback(
    (groupId: string, memberId: string, role: Member["role"]) => {
      updateMember(groupId, memberId, { role });
    },
    [updateMember]
  );

  const approveMember = useCallback((groupId: string, memberId: string) => {
    updateGroup(groupId, (g) => withActivity({
      ...g,
      members: g.members.map((m) => (m.id === memberId ? { ...m, status: "active" } : m)),
    }, activity(profile, "approve", "approved a join request")));
  }, [profile, updateGroup]);

  const rejectMember = useCallback((groupId: string, memberId: string) => {
    removeMember(groupId, memberId);
  }, [removeMember]);

  const requestLeave = useCallback((groupId: string) => {
    updateGroup(groupId, (g) => withActivity({
      ...g,
      members: g.members.map((m) => (m.id === profile.id ? { ...m, leaveRequested: true } : m)),
    }, activity(profile, "leave", "requested to leave the trip")));
  }, [profile, updateGroup]);

  const clearLeaveRequest = useCallback((groupId: string, memberId: string) => {
    updateGroup(groupId, (g) => withActivity({
      ...g,
      members: g.members.map((m) => (m.id === memberId ? { ...m, leaveRequested: false } : m)),
    }, activity(profile, "leave", "cleared a leave request")));
  }, [profile, updateGroup]);

  const addExpense = useCallback<AppStoreValue["addExpense"]>(
    (groupId, e) => {
      const now = Date.now();
      const exp: Expense = { ...e, id: nanoid(), createdAt: (e as any).date ?? now, updatedAt: now, createdBy: profile.id, date: (e as any).date ?? now };
      updateGroup(groupId, (g) => withActivity({ ...g, expenses: [exp, ...g.expenses] }, activity(profile, "expense", `added ${e.description} for ${e.amount}`)));
    },
    [profile, updateGroup]
  );

  const updateExpense = useCallback(
    (groupId: string, exp: Expense) => {
      updateGroup(groupId, (g) => ({
        ...g,
        expenses: g.expenses.map((x) => (x.id === exp.id ? { ...exp, date: (exp as any).date ?? exp.createdAt, updatedAt: Date.now() } : x)),
      }));
    },
    [updateGroup]
  );

  const removeExpense = useCallback(
    (groupId: string, expenseId: string) => {
      updateGroup(groupId, (g) => ({ ...g, expenses: g.expenses.filter((x) => x.id !== expenseId) }));
    },
    [updateGroup]
  );

  const submitRequest = useCallback<AppStoreValue["submitRequest"]>(
    (groupId, e) => {
      const r: ExpenseRequest = {
        id: nanoid(),
        expense: { ...e, createdBy: profile.id },
        status: "pending",
        requestedBy: profile.id,
        requestedAt: Date.now(),
      };
      updateGroup(groupId, (g) => withActivity({ ...g, requests: [r, ...g.requests] }, activity(profile, "request", `requested expense ${e.description}`)));
    },
    [profile, updateGroup]
  );

  const approveRequest = useCallback(
    (groupId: string, requestId: string) => {
      updateGroup(groupId, (g) => {
        const r = g.requests.find((x) => x.id === requestId);
        if (!r || r.status !== "pending") return g;
        const requester = g.members.find((m) => m.id === r.requestedBy)?.name ?? "member";
        const exp: Expense = {
          ...r.expense,
          id: nanoid(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        return withActivity({
          ...g,
          expenses: [exp, ...g.expenses],
          requests: g.requests.map((x) =>
            x.id === requestId ? { ...x, status: "approved", reviewedBy: profile.id, reviewedAt: Date.now() } : x
          ),
        }, activity(profile, "approve", `approved ${requester}'s expense request: ${r.expense.description}`));
      });
    },
    [profile, updateGroup]
  );

  const rejectRequest = useCallback(
    (groupId: string, requestId: string, note?: string) => {
      updateGroup(groupId, (g) => {
        const r = g.requests.find((x) => x.id === requestId);
        if (!r) return g;
        const requester = g.members.find((m) => m.id === r.requestedBy)?.name ?? "member";
        return withActivity({
          ...g,
          requests: g.requests.map((x) =>
            x.id === requestId
              ? { ...x, status: "rejected", reviewedBy: profile.id, reviewedAt: Date.now(), reviewNote: note }
              : x
          ),
        }, activity(profile, "reject", `rejected ${requester}'s expense request: ${r.expense.description}`));
      });
    },
    [profile, updateGroup]
  );

  const addSettlement = useCallback<AppStoreValue["addSettlement"]>(
    (groupId, s) => {
      const st: Settlement = { ...s, id: nanoid(), createdAt: Date.now(), createdBy: profile.id };
      updateGroup(groupId, (g) => ({ ...g, settlements: [st, ...g.settlements] }));
    },
    [profile.id, updateGroup]
  );

  /** Member claims they paid the owner. Creates a pending settlement awaiting owner verification. */
  const claimPayment = useCallback(
    (groupId: string, opts: { fromId: string; toId: string; amount: number; currency: string; note?: string }) => {
      const st: Settlement = {
        id: nanoid(),
        fromId: opts.fromId,
        toId: opts.toId,
        amount: 0, // not counted until approved
        claimedAmount: opts.amount,
        currency: opts.currency,
        note: opts.note,
        createdAt: Date.now(),
        createdBy: profile.id,
        status: "pending",
      };
      updateGroup(groupId, (g) => withActivity(
        { ...g, settlements: [st, ...g.settlements] },
        activity(profile, "settlement", `claimed paid ${opts.amount} (awaiting verification)`)
      ));
    },
    [profile, updateGroup]
  );

  const reviewClaim = useCallback(
    (groupId: string, claimId: string, decision: { approve: boolean; amount?: number; note?: string }) => {
      updateGroup(groupId, (g) => {
        const next = g.settlements.map((s) => {
          if (s.id !== claimId || s.status === undefined) return s;
          if (!decision.approve) {
            return { ...s, status: "rejected" as const, reviewedBy: profile.id, reviewedAt: Date.now(), note: decision.note ?? s.note };
          }
          const claim = s.claimedAmount ?? 0;
          const approved = decision.amount ?? claim;
          return {
            ...s,
            amount: approved,
            approvedAmount: approved,
            status: (approved < claim ? "partial" : "approved") as "partial" | "approved",
            reviewedBy: profile.id,
            reviewedAt: Date.now(),
            note: decision.note ?? s.note,
          };
        });
        return withActivity({ ...g, settlements: next }, activity(profile, "settlement", decision.approve ? "verified a payment" : "rejected a payment claim"));
      });
    },
    [profile, updateGroup]
  );

  /** Owner/admin approves a member's leave request: kicks via P2P then removes locally. */
  const approveLeave = useCallback(
    (groupId: string, memberId: string) => {
      if (kickCasterRef.current) {
        try { kickCasterRef.current(memberId, profile.id); } catch { /* */ }
      }
      removeMember(groupId, memberId);
    },
    [removeMember, profile.id]
  );



  const myMemberId = useCallback(
    (groupId: string) => {
      const g = groupsRef.current.find((x) => x.id === groupId);
      return g?.members.find((m) => m.id === profile.id)?.id;
    },
    [profile.id]
  );

  const myRole = useCallback(
    (groupId: string) => {
      const g = groupsRef.current.find((x) => x.id === groupId);
      return g?.members.find((m) => m.id === profile.id)?.role;
    },
    [profile.id]
  );

  const hasProfile = !!profile.name?.trim();

  const value = useMemo<AppStoreValue>(
    () => ({
      ready,
      profile,
      setProfileFields,
      hasProfile,
      themePref,
      resolvedTheme,
      setThemePref,
      toggleTheme,
      groups,
      getGroup,
      createGroup,
      joinGroup,
      removeGroup,
      setArchived,
      setSyncEnabled,
      updateGroup,
      importGroup,
      addMember,
      updateMember,
      removeMember,
      setRole,
      approveMember,
      rejectMember,
      requestLeave,
      clearLeaveRequest,
      addExpense,
      updateExpense,
      removeExpense,
      submitRequest,
      approveRequest,
      rejectRequest,
      addSettlement,
      claimPayment,
      reviewClaim,
      approveLeave,
      regenerateInviteToken,
      peers,
      myMemberId,
      myRole,
      setBroadcaster,
      setKickCaster,
      handleRemoteGroup,
      handleRemoteKick,
      handleTripEnded,
      setTripPeers,
    }),
    [
      ready, profile, setProfileFields, hasProfile, themePref, resolvedTheme, setThemePref, toggleTheme,
      groups, getGroup, createGroup, joinGroup, removeGroup, setArchived, updateGroup, importGroup,
      addMember, updateMember, removeMember, setRole, approveMember, rejectMember, requestLeave, clearLeaveRequest,
      addExpense, updateExpense, removeExpense,
      submitRequest, approveRequest, rejectRequest, addSettlement, claimPayment, reviewClaim, approveLeave, regenerateInviteToken, peers, myMemberId, myRole,
      setBroadcaster, setKickCaster, handleRemoteGroup, handleRemoteKick, setTripPeers,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside AppStoreProvider");
  return v;
}

/** Merge two snapshots of the same group: union by id, prefer newer updatedAt.
 *  Security: role/status are LOCKED to local values when a local member exists,
 *  so a peer cannot promote themselves via a crafted snapshot. */
function mergeGroups(a: Group, b: Group): Group {
  // For name/emoji/currency: prefer the version from the side that has the real owner data,
  // or the one that doesn't look like a placeholder "Trip XXXXX"
  const aIsPlaceholder = /^Trip [A-Z0-9]{4,8}$/.test(a.name);
  const bIsPlaceholder = /^Trip [A-Z0-9]{4,8}$/.test(b.name);
  const pickName = bIsPlaceholder ? a.name : (aIsPlaceholder ? b.name : (b.name || a.name));
  const pickEmoji = (bIsPlaceholder || b.emoji === "🧳") && a.emoji !== "🧳" ? a.emoji : (b.emoji || a.emoji);
  const pickMemberName = (localName: string | undefined, remoteName: string | undefined) => {
    const local = (localName ?? "").trim();
    const remote = (remoteName ?? "").trim();
    const localIsPlaceholder = !local || local.toLowerCase() === "me";
    const remoteIsPlaceholder = !remote || remote.toLowerCase() === "me";
    if (localIsPlaceholder && !remoteIsPlaceholder) return remote;
    return local || remote || "Me";
  };
  const merged: Group = {
    ...a,
    name: pickName,
    emoji: pickEmoji,
    currency: b.currency || a.currency,
    budget: b.budget ?? a.budget,
    ownerId: a.ownerId || b.ownerId,
    inviteToken: a.inviteToken || b.inviteToken,
    archived: a.archived ?? b.archived,
    archivedAt: a.archivedAt ?? b.archivedAt,
    members: mergeBy(a.members, b.members, (m) => m.id, (x, y) => ({
      ...y,
      ...x,
      // role: local wins (prevents privilege escalation via crafted snapshot)
      role: x.role,
      // status: "active" wins over "pending" (owner approval propagates to member)
      status: y.status === "active" ? "active" : x.status ?? y.status,
      // contact info: prefer freshest non-empty
      name: pickMemberName(x.name, y.name),
      upiId: x.upiId ?? y.upiId,
      phone: x.phone ?? y.phone,
    })),
    expenses: mergeBy(a.expenses, b.expenses, (m) => m.id, (x, y) => (y.updatedAt > x.updatedAt ? y : x)),
    requests: mergeBy(a.requests, b.requests, (m) => m.id, (x, y) =>
      (y.reviewedAt ?? y.requestedAt) > (x.reviewedAt ?? x.requestedAt) ? y : x
    ),
    settlements: mergeBy(a.settlements, b.settlements, (m) => m.id, (x, y) =>
      ((y.reviewedAt ?? y.createdAt) > (x.reviewedAt ?? x.createdAt) ? y : x)
    ),
  };
  return merged;
}

function sanitizeIncomingForProfile(incoming: Group, local: Group | undefined, profile: Profile): Group {
  const localMe = local?.members.find((m) => m.id === profile.id);
  const incomingMe = incoming.members.find((m) => m.id === profile.id);
  const iAmOwner = local?.ownerId === profile.id || incoming.ownerId === profile.id;
  const approved = iAmOwner || localMe?.status === "active" || incomingMe?.status === "active";
  if (approved) return incoming;
  const owner = incoming.members.find((m) => m.id === incoming.ownerId);
  const me = incomingMe ?? localMe ?? { id: profile.id, name: profile.name || "Me", role: "member" as const, status: "pending" as const, upiId: profile.upiId, phone: profile.phone };
  return {
    ...incoming,
    name: local?.name || incoming.name,
    emoji: local?.emoji || incoming.emoji,
    members: [owner, { ...me, status: "pending" as const }].filter(Boolean) as Member[],
    expenses: [],
    requests: [],
    settlements: [],
    activity: incoming.activity?.filter((a) => a.actorId === profile.id || a.type === "join"),
  };
}

function mergeBy<T>(a: T[], b: T[], key: (t: T) => string, pick: (x: T, y: T) => T): T[] {
  const map = new Map<string, T>();
  for (const x of a) map.set(key(x), x);
  for (const y of b) {
    const k = key(y);
    const existing = map.get(k);
    map.set(k, existing ? pick(existing, y) : y);
  }
  return [...map.values()];
}
