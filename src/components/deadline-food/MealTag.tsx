import { cn } from "@/lib/utils";

export function MealTag({ children, tone = "neutral" }: { children: string; tone?: "neutral" | "good" | "warn" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium",
        tone === "good" && "border-emerald-200 bg-emerald-50 text-emerald-800",
        tone === "warn" && "border-amber-200 bg-amber-50 text-amber-900",
        tone === "neutral" && "border-slate-200 bg-slate-50 text-slate-700",
      )}
    >
      {children}
    </span>
  );
}
