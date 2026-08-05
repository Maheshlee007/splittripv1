import {
  Smartphone, CreditCard, Wallet, Banknote, WalletCards, CircleDollarSign,
  Landmark, PiggyBank, QrCode, Coins, Gift, Receipt, Building2,
} from "lucide-react";
import type { CustomPaymentMethod } from "./types";

export const ICON_MAP: Record<string, typeof Smartphone> = {
  "smartphone": Smartphone,
  "credit-card": CreditCard,
  "wallet": Wallet,
  "banknote": Banknote,
  "wallet-cards": WalletCards,
  "landmark": Landmark,
  "piggy-bank": PiggyBank,
  "qr-code": QrCode,
  "coins": Coins,
  "gift": Gift,
  "receipt": Receipt,
  "building": Building2,
  "default": CircleDollarSign,
};

/** Icon keys offered when adding a payment method. */
export const PAYMENT_ICON_CHOICES = [
  "smartphone", "credit-card", "wallet", "banknote", "wallet-cards",
  "landmark", "piggy-bank", "qr-code", "coins", "gift", "receipt", "building", "default",
];

export const DEFAULT_PAYMENT_METHODS: { id: string; label: string; icon: typeof Smartphone }[] = [
  { id: "upi", label: "UPI", icon: Smartphone },
  { id: "credit", label: "Credit Card", icon: CreditCard },
  { id: "debit", label: "Debit Card", icon: Wallet },
  { id: "cash", label: "Cash", icon: Banknote },
  { id: "wallet", label: "Wallet", icon: WalletCards },
];

export function getPaymentMethodIcon(pm: CustomPaymentMethod) {
  return ICON_MAP[pm.icon ?? "default"] ?? CircleDollarSign;
}

/**
 * Mirror of PersonalStore's payment methods so non-React consumers
 * (exports, breakdown labels) can resolve user-added methods too.
 */
let paymentRegistry: CustomPaymentMethod[] = [];

export function setPaymentMethodRegistry(methods: CustomPaymentMethod[]) {
  paymentRegistry = methods;
}

export function getPaymentMethod(id: string) {
  const custom = paymentRegistry.find((m) => m.id === id);
  if (custom) return { id: custom.id, label: custom.label, icon: getPaymentMethodIcon(custom) };
  const found = DEFAULT_PAYMENT_METHODS.find((m) => m.id === id);
  if (found) return found;
  const label = id ? id.replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()) : "—";
  return { id, label, icon: CircleDollarSign };
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
