import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { customAlphabet, nanoid } from "nanoid";
import { Expense, ExpenseRequest, Group, Member, Profile, Settlement, Split, SplitMode } from "@/lib/types";
import { loadGroups, loadProfile, loadTheme, saveGroup, saveProfile, saveTheme, deleteGroup } from "@/lib/storage";
import { connectGroup, disconnectGroup, broadcastGroup, onRemoteGroup } from "@/lib/sync";

const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = customAlphabet(codeAlphabet, 6);

interface AppStoreValue {
  ready: boolean;
  profile: Profile;
  setProfileFields: (p: Partial<Profile>) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  groups: Group[];
  getGroup: (id: string) => Group | undefined;
  createGroup: (name: string, emoji: string, currency: string) => Group;
  joinGroup: (code: string) => Group;
  removeGroup: (id: string) => void;
  updateGroup: (id: string, fn: (g: Group) => Group) => void;
  /* member ops */
  addMember: (groupId: string, name: string, upiId?: string) => Member;
  updateMember: (groupId: string, memberId: string, patch: Partial<Member>) => void;
  removeMember: (groupId: string, memberId: string) => void;
  setRole: (groupId: string, memberId: string, role: Member["role"]) => void;
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
  /* sync */
  peers: Record<string, number>;
  myMemberId: (groupId: string) => string | undefined;
  myRole: (groupId: string) => Member["role"] | undefined;
}

const Ctx = createContext<AppStoreValue | null>(null);

function defaultProfile(): Profile {
  return { id: nanoid(), name: "" };
}

function ensureMe(group: Group, profile: Profile): Group {
  // make sure the local profile has a member entry tied to profile.id
  if (group.members.some((m) => m.id === profile.id)) return group;
  const role: Member["role"] = group.ownerId === profile.id ? "owner" : "member";
  return {
    ...group,
    members: [...group.members, { id: profile.id, name: profile.name || "Me", upiId: profile.upiId, role }],
  };
}

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [groups, setGroups] = useState<Group[]>([]);
  const [peers, setPeers] = useState<Record<string, number>>({});
  const groupsRef = useRef<Group[]>([]);
  groupsRef.current = groups;

  // hydrate
  useEffect(() => {
    (async () => {
      const [p, t, gs] = await Promise.all([loadProfile(), loadTheme(), loadGroups()]);
      const prof = p ?? defaultProfile();
      setProfile(prof);
      setTheme(t);
      setGroups(gs);
      if (!p) await saveProfile(prof);
      setReady(true);
    })();
  }, []);

  // theme apply
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // sync wiring per group
  useEffect(() => {
    if (!ready) return;
    const ids = new Set(groups.map((g) => g.id));
    for (const g of groups) {
      connectGroup(g.id, {
        onPeers: (n) => setPeers((p) => ({ ...p, [g.id]: n })),
      });
    }
    // cleanup happens on unmount only; we don't disconnect on group list churn here.
    return () => {
      for (const id of ids) disconnectGroup(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, groups.map((g) => g.id).join(",")]);

  // listen for remote updates
  useEffect(() => {
    const off = onRemoteGroup((incoming) => {
      setGroups((curr) => {
        const idx = curr.findIndex((g) => g.id === incoming.id);
        // last-write-wins by max(updatedAt of children) — simplistic but works since y-webrtc gives full doc
        if (idx === -1) {
          const merged = ensureMe(incoming, profile);
          saveGroup(merged);
          return [...curr, merged];
        }
        const merged = ensureMe(mergeGroups(curr[idx], incoming), profile);
        saveGroup(merged);
        const next = [...curr];
        next[idx] = merged;
        return next;
      });
    });
    return off;
  }, [profile]);

  const persist = useCallback((g: Group, broadcast = true) => {
    saveGroup(g);
    if (broadcast) broadcastGroup(g);
  }, []);

  const setProfileFields = useCallback(
    (patch: Partial<Profile>) => {
      setProfile((p) => {
        const next = { ...p, ...patch };
        saveProfile(next);
        // propagate name/upi to my member entries in all groups
        setGroups((curr) =>
          curr.map((g) => {
            const i = g.members.findIndex((m) => m.id === next.id);
            if (i === -1) return g;
            const ng = { ...g, members: [...g.members] };
            ng.members[i] = { ...ng.members[i], name: next.name || ng.members[i].name, upiId: next.upiId };
            persist(ng);
            return ng;
          })
        );
        return next;
      });
    },
    [persist]
  );

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === "light" ? "dark" : "light";
      saveTheme(next);
      return next;
    });
  }, []);

  const getGroup = useCallback((id: string) => groupsRef.current.find((g) => g.id === id), []);

  const createGroup = useCallback(
    (name: string, emoji: string, currency: string): Group => {
      const id = newCode();
      const g: Group = {
        id,
        name,
        emoji,
        currency,
        createdAt: Date.now(),
        ownerId: profile.id,
        members: [{ id: profile.id, name: profile.name || "Me", upiId: profile.upiId, role: "owner" }],
        expenses: [],
        requests: [],
        settlements: [],
      };
      setGroups((curr) => [...curr, g]);
      persist(g);
      return g;
    },
    [profile, persist]
  );

  const joinGroup = useCallback(
    (code: string): Group => {
      const id = code.toUpperCase().trim();
      const existing = groupsRef.current.find((g) => g.id === id);
      if (existing) return existing;
      // create stub; sync will fill it in
      const g: Group = {
        id,
        name: `Trip ${id}`,
        emoji: "🧳",
        currency: "INR",
        createdAt: Date.now(),
        ownerId: "",
        members: [{ id: profile.id, name: profile.name || "Me", upiId: profile.upiId, role: "member" }],
        expenses: [],
        requests: [],
        settlements: [],
      };
      setGroups((curr) => [...curr, g]);
      persist(g);
      return g;
    },
    [profile, persist]
  );

  const removeGroup = useCallback((id: string) => {
    disconnectGroup(id);
    deleteGroup(id);
    setGroups((curr) => curr.filter((g) => g.id !== id));
  }, []);

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
    (groupId: string, name: string, upiId?: string): Member => {
      const m: Member = { id: nanoid(), name: name.trim() || "Member", upiId, role: "member" };
      updateGroup(groupId, (g) => ({ ...g, members: [...g.members, m] }));
      return m;
    },
    [updateGroup]
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
      updateGroup(groupId, (g) => ({ ...g, members: g.members.filter((m) => m.id !== memberId) }));
    },
    [updateGroup]
  );

  const setRole = useCallback(
    (groupId: string, memberId: string, role: Member["role"]) => {
      updateMember(groupId, memberId, { role });
    },
    [updateMember]
  );

  const addExpense = useCallback<AppStoreValue["addExpense"]>(
    (groupId, e) => {
      const exp: Expense = { ...e, id: nanoid(), createdAt: Date.now(), updatedAt: Date.now(), createdBy: profile.id };
      updateGroup(groupId, (g) => ({ ...g, expenses: [exp, ...g.expenses] }));
    },
    [profile.id, updateGroup]
  );

  const updateExpense = useCallback(
    (groupId: string, exp: Expense) => {
      updateGroup(groupId, (g) => ({
        ...g,
        expenses: g.expenses.map((x) => (x.id === exp.id ? { ...exp, updatedAt: Date.now() } : x)),
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
      updateGroup(groupId, (g) => ({ ...g, requests: [r, ...g.requests] }));
    },
    [profile.id, updateGroup]
  );

  const approveRequest = useCallback(
    (groupId: string, requestId: string) => {
      updateGroup(groupId, (g) => {
        const r = g.requests.find((x) => x.id === requestId);
        if (!r || r.status !== "pending") return g;
        const exp: Expense = {
          ...r.expense,
          id: nanoid(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        return {
          ...g,
          expenses: [exp, ...g.expenses],
          requests: g.requests.map((x) =>
            x.id === requestId ? { ...x, status: "approved", reviewedBy: profile.id, reviewedAt: Date.now() } : x
          ),
        };
      });
    },
    [profile.id, updateGroup]
  );

  const rejectRequest = useCallback(
    (groupId: string, requestId: string, note?: string) => {
      updateGroup(groupId, (g) => ({
        ...g,
        requests: g.requests.map((x) =>
          x.id === requestId
            ? { ...x, status: "rejected", reviewedBy: profile.id, reviewedAt: Date.now(), reviewNote: note }
            : x
        ),
      }));
    },
    [profile.id, updateGroup]
  );

  const addSettlement = useCallback<AppStoreValue["addSettlement"]>(
    (groupId, s) => {
      const st: Settlement = { ...s, id: nanoid(), createdAt: Date.now(), createdBy: profile.id };
      updateGroup(groupId, (g) => ({ ...g, settlements: [st, ...g.settlements] }));
    },
    [profile.id, updateGroup]
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

  const value = useMemo<AppStoreValue>(
    () => ({
      ready,
      profile,
      setProfileFields,
      theme,
      toggleTheme,
      groups,
      getGroup,
      createGroup,
      joinGroup,
      removeGroup,
      updateGroup,
      addMember,
      updateMember,
      removeMember,
      setRole,
      addExpense,
      updateExpense,
      removeExpense,
      submitRequest,
      approveRequest,
      rejectRequest,
      addSettlement,
      peers,
      myMemberId,
      myRole,
    }),
    [
      ready, profile, setProfileFields, theme, toggleTheme, groups, getGroup,
      createGroup, joinGroup, removeGroup, updateGroup, addMember, updateMember,
      removeMember, setRole, addExpense, updateExpense, removeExpense,
      submitRequest, approveRequest, rejectRequest, addSettlement, peers, myMemberId, myRole,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside AppStoreProvider");
  return v;
}

/** Merge two snapshots of the same group: union by id, prefer newer updatedAt. */
function mergeGroups(a: Group, b: Group): Group {
  const merged: Group = {
    ...a,
    name: b.name || a.name,
    emoji: b.emoji || a.emoji,
    currency: b.currency || a.currency,
    budget: b.budget ?? a.budget,
    ownerId: a.ownerId || b.ownerId,
    members: mergeBy(a.members, b.members, (m) => m.id, (x, y) => ({ ...x, ...y })),
    expenses: mergeBy(a.expenses, b.expenses, (m) => m.id, (x, y) => (y.updatedAt > x.updatedAt ? y : x)),
    requests: mergeBy(a.requests, b.requests, (m) => m.id, (x, y) =>
      (y.reviewedAt ?? y.requestedAt) > (x.reviewedAt ?? x.requestedAt) ? y : x
    ),
    settlements: mergeBy(a.settlements, b.settlements, (m) => m.id, (x) => x),
  };
  return merged;
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
