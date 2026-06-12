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

// Strip everything that isn't part of a valid number so letters and stray symbols
// can never reach the value. Keeps an optional leading minus (only when negatives
// are allowed) and at most one decimal point (only when decimals are allowed).
export function sanitiseNumericInput(raw: string, allowDecimal: boolean, allowNegative: boolean): string {
  const negative = allowNegative && raw.trimStart().startsWith("-");
  let body = raw.replace(allowDecimal ? /[^0-9.]/g : /[^0-9]/g, "");
  if (allowDecimal) {
    const firstDot = body.indexOf(".");
    if (firstDot !== -1) {
      body = body.slice(0, firstDot + 1) + body.slice(firstDot + 1).replace(/\./g, "");
    }
  }
  return negative ? `-${body}` : body;
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
  required,
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
  required?: boolean;
}) {
  const isNumeric = type === "number";
  const allowDecimal = isNumeric && (step === "any" || (step?.includes(".") ?? false));
  // Negatives stay blocked unless a field explicitly opts in with a negative min.
  const allowNegative = isNumeric && min !== undefined && Number(min) < 0;

  // Numeric fields are rendered as a sanitised text input rather than a native
  // number input: native inputs (a) show the browser's "Please enter a number"
  // message instead of letting us reject bad input, and (b) can't surface inline
  // feedback. We hold the display string locally so intermediate entries like
  // "0." survive while still emitting the cleaned value to the parent.
  const [text, setText] = useState(() =>
    isNumeric ? (value === 0 ? "" : String(value)) : String(value ?? ""),
  );
  const [illegal, setIllegal] = useState(false);

  // Show the local text only while it still parses to the current value — that
  // preserves in-progress entries like "0." or ".5". If the value changed from
  // outside (e.g. nutrition auto-fill), fall back to the freshly formatted value.
  const display = (() => {
    if (!isNumeric) return value;
    const trimmed = text.trim();
    const parsed = trimmed === "" || trimmed === "-" ? 0 : Number(trimmed);
    if (Number.isNaN(parsed)) return text; // mid-entry such as "."
    if (typeof value === "number" && Number.isNaN(value)) return text;
    return parsed === value ? text : value === 0 ? "" : String(value);
  })();

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (!isNumeric) {
      onChange(event.target.value);
      return;
    }
    const raw = event.target.value;
    const cleaned = sanitiseNumericInput(raw, allowDecimal, allowNegative);
    // Anything stripped means the user typed a letter or illegal symbol — flag it.
    setIllegal(cleaned !== raw);
    setText(cleaned);
    onChange(cleaned);
  }

  const invalid = Boolean(error) || illegal;
  const message =
    error && errorMessage
      ? errorMessage
      : illegal
        ? "Numbers only — letters and symbols aren't allowed"
        : null;

  return (
    <Label className="block" data-field-error={invalid || undefined}>
      <span className={cn("text-sm font-semibold", invalid && "text-red-600")}>
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      <Input
        type={isNumeric ? "text" : type}
        inputMode={isNumeric ? (allowDecimal ? "decimal" : "numeric") : undefined}
        step={isNumeric ? undefined : step}
        min={isNumeric ? undefined : min}
        max={isNumeric ? undefined : max}
        value={display}
        onChange={handleChange}
        onBlur={() => {
          setIllegal(false);
          onBlur?.();
        }}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        className={cn(
          "mt-2 h-auto rounded-lg border-stone-200 bg-white p-3 focus-visible:border-emerald-600 focus-visible:ring-emerald-600/20",
          invalid && "border-red-400 bg-red-50 ring-1 ring-red-400 focus-visible:border-red-400 focus-visible:ring-red-400/20",
        )}
      />
      {message && <p className="mt-1 text-xs font-medium text-red-600">{message}</p>}
    </Label>
  );
}

/**
 * Number input that keeps a free-text draft while typing (so the field can be
 * cleared) and only commits a clamped value on blur or Enter.
 */
export function NumberDraftField({
  label,
  labelClassName,
  value,
  onCommit,
  min,
  max,
  step,
  suffix,
}: {
  label: string;
  labelClassName?: string;
  value: number;
  onCommit: (value: number) => void;
  min: number;
  max: number;
  step?: string;
  suffix?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(String(value));
  }

  function commit() {
    const numeric = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(numeric)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, Math.round(numeric)));
    setDraft(String(clamped));
    if (clamped !== value) onCommit(clamped);
  }

  const input = (
    <Input
      type="number"
      min={String(min)}
      max={String(max)}
      step={step}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (["e", "E", "+", "-"].includes(event.key)) event.preventDefault();
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      onBlur={commit}
      className={suffix
        ? "h-auto rounded-lg border-0 bg-transparent p-3 shadow-none focus-visible:ring-0"
        : "mt-2 h-auto rounded-lg border-stone-200 bg-white p-3 focus-visible:border-emerald-600 focus-visible:ring-emerald-600/20"}
    />
  );

  return (
    <Label className="block">
      <span className={labelClassName ?? "text-sm font-semibold"}>{label}</span>
      {suffix ? (
        <div className="mt-2 flex items-center rounded-lg border border-stone-200 bg-white pr-3 transition-[color,box-shadow] focus-within:border-emerald-600 focus-within:ring-[3px] focus-within:ring-emerald-600/20">
          {input}
          <span className="text-sm text-stone-500">{suffix}</span>
        </div>
      ) : (
        input
      )}
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
  error,
  errorMessage,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  error?: boolean;
  errorMessage?: string;
}) {
  return (
    <Label className="block" data-field-error={error || undefined}>
      <span className={cn("text-sm font-semibold", error && "text-red-600")}>
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger
          aria-invalid={error || undefined}
          className={cn(
            "mt-2 h-auto w-full rounded-lg border-stone-200 bg-white p-3",
            !value && "text-stone-400",
            error && "border-red-400 bg-red-50 ring-1 ring-red-400",
          )}
        >
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
      {error && errorMessage && <p className="mt-1 text-xs font-medium text-red-600">{errorMessage}</p>}
    </Label>
  );
}
