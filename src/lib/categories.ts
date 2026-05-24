import { Beer, Bed, Car, Fuel, Ticket, ShoppingBag, UtensilsCrossed, Plane, Coffee, MoreHorizontal, Banknote } from "lucide-react";

export const CATEGORIES = [
  { id: "food", label: "Food", icon: UtensilsCrossed, color: "hsl(22 95% 53%)" },
  { id: "drinks", label: "Drinks", icon: Beer, color: "hsl(280 80% 60%)" },
  { id: "stay", label: "Stay", icon: Bed, color: "hsl(200 90% 55%)" },
  { id: "travel", label: "Travel", icon: Car, color: "hsl(160 70% 45%)" },
  { id: "fuel", label: "Fuel", icon: Fuel, color: "hsl(0 80% 60%)" },
  { id: "tickets", label: "Tickets", icon: Ticket, color: "hsl(45 95% 55%)" },
  { id: "shopping", label: "Shopping", icon: ShoppingBag, color: "hsl(330 80% 60%)" },
  { id: "flight", label: "Flight", icon: Plane, color: "hsl(220 80% 60%)" },
  { id: "cafe", label: "Café", icon: Coffee, color: "hsl(30 60% 45%)" },
  { id: "advance", label: "Advance", icon: Banknote, color: "hsl(145 70% 40%)" },
  { id: "misc", label: "Misc", icon: MoreHorizontal, color: "hsl(220 8% 50%)" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export function getCategory(id: string) {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}
