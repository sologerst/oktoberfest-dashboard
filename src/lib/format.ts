export function formatCount(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatCents(cents: number | null): string {
  if (cents === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function formatQuantity(quantity: number | null): string | null {
  if (quantity === null) return null;
  if (Number.isInteger(quantity)) return new Intl.NumberFormat("en-US").format(quantity);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(quantity);
}
