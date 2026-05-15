import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { PersonalExpense } from "@/lib/types";
import { loadAllPersonalExpenses, savePersonalExpense, deletePersonalExpense as deleteFromDB } from "@/lib/storage";
import { deriveMonthKey } from "@/lib/personal-utils";

interface PersonalState {
  expenses: PersonalExpense[];
  loading: boolean;
  addExpense: (e: PersonalExpense) => Promise<void>;
  updateExpense: (e: PersonalExpense) => Promise<void>;
  removeExpense: (id: string) => Promise<void>;
  getMonthExpenses: (monthKey: string) => PersonalExpense[];
  getYearTotals: (year: number) => Record<string, number>;
  getCategoryBreakdown: (monthKey: string) => Record<string, number>;
  getPaymentBreakdown: (monthKey: string) => Record<string, number>;
}

const PersonalContext = createContext<PersonalState | null>(null);

export function PersonalStoreProvider({ children }: { children: ReactNode }) {
  const [expenses, setExpenses] = useState<PersonalExpense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAllPersonalExpenses().then((data) => {
      setExpenses(data.sort((a, b) => b.date - a.date));
      setLoading(false);
    });
  }, []);

  const addExpense = useCallback(async (e: PersonalExpense) => {
    await savePersonalExpense(e);
    setExpenses((prev) => [e, ...prev].sort((a, b) => b.date - a.date));
  }, []);

  const updateExpense = useCallback(async (e: PersonalExpense) => {
    await savePersonalExpense(e);
    setExpenses((prev) => prev.map((x) => (x.id === e.id ? e : x)).sort((a, b) => b.date - a.date));
  }, []);

  const removeExpense = useCallback(async (id: string) => {
    await deleteFromDB(id);
    setExpenses((prev) => prev.filter((x) => x.id !== id));
  }, []);

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
      if (e.monthKey.startsWith(`${year}-`)) {
        totals[e.monthKey] = (totals[e.monthKey] ?? 0) + e.amount;
      }
    }
    return totals;
  }, [expenses]);

  const getCategoryBreakdown = useCallback((monthKey: string): Record<string, number> => {
    const result: Record<string, number> = {};
    for (const e of expenses) {
      if (e.monthKey === monthKey) {
        result[e.category] = (result[e.category] ?? 0) + e.amount;
      }
    }
    return result;
  }, [expenses]);

  const getPaymentBreakdown = useCallback((monthKey: string): Record<string, number> => {
    const result: Record<string, number> = {};
    for (const e of expenses) {
      if (e.monthKey === monthKey) {
        result[e.paymentMethod] = (result[e.paymentMethod] ?? 0) + e.amount;
      }
    }
    return result;
  }, [expenses]);

  const value = useMemo(() => ({
    expenses,
    loading,
    addExpense,
    updateExpense,
    removeExpense,
    getMonthExpenses,
    getYearTotals,
    getCategoryBreakdown,
    getPaymentBreakdown,
  }), [expenses, loading, addExpense, updateExpense, removeExpense, getMonthExpenses, getYearTotals, getCategoryBreakdown, getPaymentBreakdown]);

  return <PersonalContext.Provider value={value}>{children}</PersonalContext.Provider>;
}

export function usePersonal() {
  const ctx = useContext(PersonalContext);
  if (!ctx) throw new Error("usePersonal must be used within PersonalStoreProvider");
  return ctx;
}
