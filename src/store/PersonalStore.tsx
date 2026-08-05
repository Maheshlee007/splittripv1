import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { PersonalExpense, Lending, CustomPaymentMethod } from "@/lib/types";
import {
  loadAllPersonalExpenses, savePersonalExpense, deletePersonalExpense as deleteExpFromDB,
  loadLendings, saveLending, deleteLending as deleteLendFromDB,
  loadPaymentMethods, savePaymentMethod, deletePaymentMethod as deletePMFromDB,
} from "@/lib/storage";
import { initCategories, isExcludedCategory, useCategories } from "@/lib/categories";
import { setPaymentMethodRegistry } from "@/lib/personal-utils";

interface PersonalState {
  expenses: PersonalExpense[];
  lendings: Lending[];
  paymentMethods: CustomPaymentMethod[];
  loading: boolean;
  addExpense: (e: PersonalExpense) => Promise<void>;
  updateExpense: (e: PersonalExpense) => Promise<void>;
  removeExpense: (id: string) => Promise<void>;
  addLending: (l: Lending) => Promise<void>;
  updateLending: (l: Lending) => Promise<void>;
  removeLending: (id: string) => Promise<void>;
  addPaymentMethod: (pm: CustomPaymentMethod) => Promise<void>;
  removePaymentMethod: (id: string) => Promise<void>;
  getMonthExpenses: (monthKey: string) => PersonalExpense[];
  getYearTotals: (year: number) => Record<string, number>;
  getCategoryBreakdown: (monthKey: string) => Record<string, number>;
  getPaymentBreakdown: (monthKey: string) => Record<string, number>;
  /** Sum of a month's expenses, skipping categories flagged excludeFromTotal. */
  getMonthTotal: (monthKey: string) => number;
  /** Per-category amounts that were kept out of the total (e.g. CC Paid). */
  getExcludedBreakdown: (monthKey: string) => Record<string, number>;
}

const PersonalContext = createContext<PersonalState | null>(null);

export function PersonalStoreProvider({ children }: { children: ReactNode }) {
  const [expenses, setExpenses] = useState<PersonalExpense[]>([]);
  const [lendings, setLendings] = useState<Lending[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<CustomPaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);

  // Re-derive totals when the category registry changes (custom category added,
  // or its excludeFromTotal flag flipped).
  const categories = useCategories();

  useEffect(() => {
    Promise.all([loadAllPersonalExpenses(), loadLendings(), loadPaymentMethods(), initCategories()]).then(([exps, lends, pms]) => {
      setExpenses(exps.sort((a, b) => b.date - a.date));
      setLendings(lends.sort((a, b) => b.createdAt - a.createdAt));
      setPaymentMethods(pms);
      setLoading(false);
    });
  }, []);

  // Keep the non-React lookup used by exports/labels in sync.
  useEffect(() => {
    setPaymentMethodRegistry(paymentMethods);
  }, [paymentMethods]);

  // Expense CRUD
  const addExpense = useCallback(async (e: PersonalExpense) => {
    await savePersonalExpense(e);
    setExpenses((prev) => [e, ...prev].sort((a, b) => b.date - a.date));
  }, []);

  const updateExpense = useCallback(async (e: PersonalExpense) => {
    await savePersonalExpense(e);
    setExpenses((prev) => prev.map((x) => (x.id === e.id ? e : x)).sort((a, b) => b.date - a.date));
  }, []);

  const removeExpense = useCallback(async (id: string) => {
    await deleteExpFromDB(id);
    setExpenses((prev) => prev.filter((x) => x.id !== id));
  }, []);

  // Lending CRUD
  const addLending = useCallback(async (l: Lending) => {
    await saveLending(l);
    setLendings((prev) => [l, ...prev].sort((a, b) => b.createdAt - a.createdAt));
  }, []);

  const updateLending = useCallback(async (l: Lending) => {
    await saveLending(l);
    setLendings((prev) => prev.map((x) => (x.id === l.id ? l : x)));
  }, []);

  const removeLending = useCallback(async (id: string) => {
    await deleteLendFromDB(id);
    setLendings((prev) => prev.filter((x) => x.id !== id));
  }, []);

  // Payment method CRUD
  const addPaymentMethod = useCallback(async (pm: CustomPaymentMethod) => {
    await savePaymentMethod(pm);
    setPaymentMethods((prev) => [...prev, pm]);
  }, []);

  const removePaymentMethod = useCallback(async (id: string) => {
    await deletePMFromDB(id);
    setPaymentMethods((prev) => prev.filter((x) => x.id !== id));
  }, []);

  // Derived data
  const getMonthExpenses = useCallback((monthKey: string) => {
    return expenses.filter((e) => e.monthKey === monthKey);
  }, [expenses]);

  const getYearTotals = useCallback((year: number): Record<string, number> => {
    const totals: Record<string, number> = {};
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, "0")}`;
      totals[key] = 0;
    }
    for (const e of expenses) {
      if (e.monthKey.startsWith(`${year}-`) && !isExcludedCategory(e.category)) {
        totals[e.monthKey] = (totals[e.monthKey] ?? 0) + e.amount;
      }
    }
    return totals;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, categories]);

  const getMonthTotal = useCallback((monthKey: string): number => {
    return expenses.reduce(
      (sum, e) => (e.monthKey === monthKey && !isExcludedCategory(e.category) ? sum + e.amount : sum),
      0
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, categories]);

  const getCategoryBreakdown = useCallback((monthKey: string): Record<string, number> => {
    const result: Record<string, number> = {};
    for (const e of expenses) {
      if (e.monthKey === monthKey && !isExcludedCategory(e.category)) {
        result[e.category] = (result[e.category] ?? 0) + e.amount;
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, categories]);

  const getExcludedBreakdown = useCallback((monthKey: string): Record<string, number> => {
    const result: Record<string, number> = {};
    for (const e of expenses) {
      if (e.monthKey === monthKey && isExcludedCategory(e.category)) {
        result[e.category] = (result[e.category] ?? 0) + e.amount;
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, categories]);

  const getPaymentBreakdown = useCallback((monthKey: string): Record<string, number> => {
    const result: Record<string, number> = {};
    for (const e of expenses) {
      if (e.monthKey === monthKey && !isExcludedCategory(e.category)) {
        result[e.paymentMethod] = (result[e.paymentMethod] ?? 0) + e.amount;
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, categories]);

  const value = useMemo(() => ({
    expenses, lendings, paymentMethods, loading,
    addExpense, updateExpense, removeExpense,
    addLending, updateLending, removeLending,
    addPaymentMethod, removePaymentMethod,
    getMonthExpenses, getYearTotals, getCategoryBreakdown, getPaymentBreakdown,
    getMonthTotal, getExcludedBreakdown,
  }), [expenses, lendings, paymentMethods, loading, addExpense, updateExpense, removeExpense, addLending, updateLending, removeLending, addPaymentMethod, removePaymentMethod, getMonthExpenses, getYearTotals, getCategoryBreakdown, getPaymentBreakdown, getMonthTotal, getExcludedBreakdown]);

  return <PersonalContext.Provider value={value}>{children}</PersonalContext.Provider>;
}

export function usePersonal() {
  const ctx = useContext(PersonalContext);
  if (!ctx) throw new Error("usePersonal must be used within PersonalStoreProvider");
  return ctx;
}
