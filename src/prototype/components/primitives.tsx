import { useState, type FormEvent, type ReactNode } from "react";

import { Button as ShadcnButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "green" | "amber" | "rose" | "blue";

const badgeTones: Record<Tone, string> = {
  neutral: "bg-stone-100 text-stone-600",
  green: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  rose: "bg-rose-100 text-rose-700",
  blue: "bg-blue-100 text-blue-700",
};

type AppButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const appButtonClasses: Record<AppButtonVariant, string> = {
  primary: "bg-emerald-700 text-white hover:bg-emerald-800 shadow-sm",
  secondary: "border border-stone-200 bg-white text-stone-800 hover:bg-stone-50",
  ghost: "text-stone-600 hover:bg-stone-100",
  danger: "border border-rose-100 bg-rose-50 text-rose-700 hover:bg-rose-100",
};

export function Badge({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", badgeTones[tone], className)}>
      {children}
    </span>
  );
}

export function AppButton({
  children,
  variant = "primary",
  className = "",
  ...props
}: Omit<React.ComponentProps<typeof ShadcnButton>, "variant"> & { variant?: AppButtonVariant }) {
  return (
    <ShadcnButton
      {...props}
      variant="ghost"
      className={cn(
        "h-auto rounded-lg px-4 py-2.5 text-sm font-semibold transition active:translate-y-px disabled:pointer-events-none disabled:opacity-60",
        appButtonClasses[variant],
        className,
      )}
    >
      {children}
    </ShadcnButton>
  );
}

export function ChoiceGroup({
  title,
  options,
  selected,
  onToggle,
  onAdd,
  addPlaceholder,
  danger,
}: {
  title: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  onAdd?: (value: string) => void;
  addPlaceholder?: string;
  danger?: boolean;
}) {
  const [customValue, setCustomValue] = useState("");
  const visibleOptions = [...options, ...selected.filter((value) => !options.includes(value))];

  function addCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = customValue.trim();

    if (!value) {
      return;
    }

    onAdd?.(value);
    setCustomValue("");
  }

  return (
    <div>
      <p className="mb-2 text-sm font-semibold">{title}</p>
      <div className="flex flex-wrap gap-2">
        {visibleOptions.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            aria-pressed={selected.includes(option)}
            title={selected.includes(option) ? `Selected. Click to remove ${option}.` : `Click to add ${option}.`}
            className={cn(
              "rounded-full border px-3 py-2 text-sm transition",
              selected.includes(option)
                ? danger
                  ? "border-rose-300 bg-rose-50 text-rose-700"
                  : "border-emerald-600 bg-emerald-50 text-emerald-800"
                : "border-stone-200 bg-white text-stone-600",
            )}
          >
            {option}
          </button>
        ))}
      </div>
      {onAdd && (
        <form className="mt-3 flex gap-2" onSubmit={addCustom}>
          <Input
            value={customValue}
            onChange={(event) => setCustomValue(event.target.value)}
            placeholder={addPlaceholder ?? "Add anything missed"}
            className="h-auto rounded-lg border-stone-200 bg-white px-3 py-2 text-sm focus-visible:border-emerald-600 focus-visible:ring-emerald-600/20"
          />
          <AppButton type="submit" variant="secondary" className="shrink-0">
            Add
          </AppButton>
        </form>
      )}
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  step,
  min,
  max,
  onBlur,
  error,
  errorMessage,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  step?: string;
  min?: string;
  max?: string;
  onBlur?: () => void;
  error?: boolean;
  errorMessage?: string;
}) {
  return (
    <Label className="block">
      <span className={cn("text-sm font-semibold", error && "text-red-600")}>{label}</span>
      <Input
        type={type}
        step={step}
        min={min}
        max={max}
        value={type === "number" && value === 0 ? "" : value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={type === "number" ? (event) => { if (["e", "E", "+", "-"].includes(event.key)) event.preventDefault(); } : undefined}
        onBlur={onBlur}
        placeholder={placeholder}
        className={cn(
          "mt-2 h-auto rounded-lg border-stone-200 bg-white p-3 focus-visible:border-emerald-600 focus-visible:ring-emerald-600/20",
          error && "border-red-400 bg-red-50 ring-1 ring-red-400 focus-visible:border-red-400 focus-visible:ring-red-400/20",
        )}
      />
      {error && errorMessage && <p className="mt-1 text-xs font-medium text-red-600">{errorMessage}</p>}
    </Label>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = "Please select…",
  required,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <Label className="block">
      <span className="text-sm font-semibold">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger className={cn("mt-2 h-auto w-full rounded-lg border-stone-200 bg-white p-3", !value && "text-stone-400")}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Label>
  );
}
