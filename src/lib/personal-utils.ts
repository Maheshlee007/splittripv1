import { Smartphone, CreditCard, Wallet, Banknote, WalletCards } from "lucide-react";
import type { PaymentMethod } from "./types";

export const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: typeof Smartphone }[] = [
  { id: "upi", label: "UPI", icon: Smartphone },
  { id: "credit", label: "Credit", icon: CreditCard },
  { id: "debit", label: "Debit", icon: Wallet },
  { id: "cash", label: "Cash", icon: Banknote },
  { id: "wallet", label: "Wallet", icon: WalletCards },
];

export function getPaymentMethod(id: PaymentMethod) {
  return PAYMENT_METHODS.find((m) => m.id === id) ?? PAYMENT_METHODS[0];
}

export function deriveMonthKey(date: number): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthKeyToDate(key: string): Date {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

export function monthKeyLabel(key: string): string {
  const d = monthKeyToDate(key);
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export function monthKeyFullLabel(key: string): string {
  const d = monthKeyToDate(key);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export async function compressBillImage(dataUrl: string, maxKB = 500): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const MAX_WIDTH = 1200;
      let { width, height } = img;
      if (width > MAX_WIDTH) {
        height = (height * MAX_WIDTH) / width;
        width = MAX_WIDTH;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      let quality = 0.7;
      let result = canvas.toDataURL("image/jpeg", quality);
      // Reduce quality until under limit
      while (result.length > maxKB * 1024 * 1.37 && quality > 0.2) {
        quality -= 0.1;
        result = canvas.toDataURL("image/jpeg", quality);
      }
      resolve(result);
    };
    img.onerror = () => resolve(dataUrl); // fallback
    img.src = dataUrl;
  });
}
