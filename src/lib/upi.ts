export function buildUpiLink(opts: {
  vpa: string;
  name: string;
  amount?: number;
  note?: string;
  currency?: string;
}): string {
  const params = new URLSearchParams();
  params.set("pa", opts.vpa);
  params.set("pn", opts.name);
  if (opts.amount && opts.amount > 0) params.set("am", opts.amount.toFixed(2));
  params.set("cu", opts.currency || "INR");
  if (opts.note) params.set("tn", opts.note);
  return `upi://pay?${params.toString()}`;
}
