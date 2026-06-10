import { useId, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getUniversitySuggestions } from "../universities";

export function UniversityField({
  label,
  value,
  onChange,
  required,
  error,
  errorMessage,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: boolean;
  errorMessage?: string;
}) {
  const listId = useId();
  const [draftQuery, setDraftQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const query = draftQuery ?? value;
  const suggestions = useMemo(() => getUniversitySuggestions(query), [query]);

  function selectUniversity(university: string) {
    setDraftQuery(null);
    setOpen(false);
    onChange(university);
  }

  function handleBlur() {
    window.setTimeout(() => {
      setOpen(false);
      if (value && query !== value) {
        setDraftQuery(null);
      }
    }, 100);
  }

  return (
    <Label className="relative block" data-field-error={error || undefined}>
      <span className={cn("text-sm font-semibold", error && "text-red-600")}>
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      <Input
        value={query}
        onChange={(event) => {
          setDraftQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            const firstSuggestion = suggestions[0];
            if (firstSuggestion) {
              selectUniversity(firstSuggestion);
            }
          }
          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="Start typing a university"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={error || undefined}
        className={cn(
          "mt-2 h-auto rounded-lg border-stone-200 bg-white p-3 focus-visible:border-emerald-600 focus-visible:ring-emerald-600/20",
          error && "border-red-400 bg-red-50 ring-1 ring-red-400 focus-visible:border-red-400 focus-visible:ring-red-400/20",
        )}
      />
      {open && (
        <div id={listId} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-stone-200 bg-white p-1 shadow-lg">
          {suggestions.map((university) => (
            <button
              key={university}
              type="button"
              role="option"
              aria-selected={university === value}
              onMouseDown={(event) => {
                event.preventDefault();
                selectUniversity(university);
              }}
              className={cn(
                "w-full rounded-md px-3 py-2 text-left text-sm transition hover:bg-emerald-50 focus:bg-emerald-50 focus:outline-none",
                university === value ? "bg-emerald-50 font-semibold text-emerald-800" : "text-stone-700",
              )}
            >
              {university}
            </button>
          ))}
        </div>
      )}
      {error && errorMessage && <p className="mt-1 text-xs font-medium text-red-600">{errorMessage}</p>}
    </Label>
  );
}
