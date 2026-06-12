import { Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createIngredientDraft,
  formatQuantityForInput,
  ingredientOptions,
  ingredientPreparations,
  ingredientUnits,
  sanitiseIngredientQuantity,
  type IngredientDraft,
} from "../ingredients";
import { AppButton, sanitiseNumericInput } from "./primitives";

function IngredientCombobox({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const lowerQuery = query.toLowerCase();
  const filtered = (query
    ? (ingredientOptions as readonly string[]).filter((opt) => opt.toLowerCase().includes(lowerQuery))
    : (ingredientOptions as readonly string[]).slice()) as string[];

  const isExactMatch = (ingredientOptions as readonly string[]).some((opt) => opt.toLowerCase() === lowerQuery);
  const showCustom = query.trim().length > 0 && !isExactMatch;
  const customOffset = showCustom ? 1 : 0;
  const totalOptions = customOffset + filtered.length;

  function selectValue(val: string) {
    setQuery(val);
    onChange(val);
    setOpen(false);
    setFocusedIndex(-1);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    onChange(val);
    setOpen(true);
    setFocusedIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(i + 1, totalOptions - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && focusedIndex >= 0) {
      e.preventDefault();
      if (focusedIndex === 0 && showCustom) {
        selectValue(query.trim());
      } else {
        const opt = filtered[focusedIndex - customOffset];
        if (opt !== undefined) selectValue(opt);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setFocusedIndex(-1);
    }
  }

  useEffect(() => {
    if (focusedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll<HTMLElement>("[data-option]");
      items[focusedIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [focusedIndex]);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <Input
          value={query}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Type or select an ingredient…"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          className={`pl-8 ${className ?? ""}`}
        />
      </div>
      {open && (
        <div
          ref={listRef}
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-stone-200 bg-white shadow-lg"
        >
          {showCustom && (
            <button
              type="button"
              role="option"
              data-option
              aria-selected={false}
              onMouseDown={(e) => { e.preventDefault(); selectValue(query.trim()); }}
              className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-emerald-700 ${focusedIndex === 0 ? "bg-emerald-50" : "hover:bg-emerald-50"}`}
            >
              <Plus size={14} className="shrink-0" />
              Add &ldquo;{query.trim()}&rdquo; as custom ingredient
            </button>
          )}
          {showCustom && filtered.length > 0 && (
            <div className="mx-3 border-t border-stone-100" />
          )}
          {filtered.map((opt, i) => {
            const idx = i + customOffset;
            return (
              <button
                key={opt}
                type="button"
                role="option"
                data-option
                aria-selected={query === opt}
                onMouseDown={(e) => { e.preventDefault(); selectValue(opt); }}
                className={`w-full px-3 py-2 text-left text-sm ${focusedIndex === idx ? "bg-stone-100" : "hover:bg-stone-50"} ${query === opt ? "font-medium text-emerald-800" : "text-stone-700"}`}
              >
                {opt}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-3 py-3 text-sm text-stone-400">
              {showCustom ? "No matching ingredients — add your own above" : "No ingredients available"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function IngredientEditor({
  ingredients,
  onChange,
  allowEmpty = false,
  emptyMessage = "No ingredients yet.",
  required = false,
}: {
  ingredients: IngredientDraft[];
  onChange: (ingredients: IngredientDraft[]) => void;
  allowEmpty?: boolean;
  emptyMessage?: string;
  required?: boolean;
}) {
  // useId kept for the unit/prep selects accessibility if needed in future
  useId();

  function updateIngredient(id: string, patch: Partial<IngredientDraft>) {
    onChange(ingredients.map((ingredient) => ingredient.id === id ? { ...ingredient, ...patch } : ingredient));
  }

  function removeIngredient(id: string) {
    const nextIngredients = ingredients.filter((ingredient) => ingredient.id !== id);
    onChange(nextIngredients.length > 0 || allowEmpty ? nextIngredients : [createIngredientDraft()]);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">Ingredients{required && <span className="ml-1 text-red-500">*</span>}</p>
        <AppButton type="button" variant="secondary" className="px-3 py-2" onClick={() => onChange([...ingredients, createIngredientDraft()])}>
          <Plus size={15} /> Add
        </AppButton>
      </div>
      <div className="mt-3 space-y-3">
        {ingredients.length === 0 && (
          <p className="select-none px-1 py-2 text-sm italic text-stone-400">
            {emptyMessage}
          </p>
        )}
        {ingredients.map((ingredient) => (
          <IngredientEditorRow
            key={ingredient.id}
            ingredient={ingredient}
            onUpdate={(patch) => updateIngredient(ingredient.id, patch)}
            onRemove={() => removeIngredient(ingredient.id)}
          />
        ))}
      </div>
    </div>
  );
}

function unitOptionsForIngredient(unit: string): string[] {
  const canonical = unit.trim();
  if (!canonical || (ingredientUnits as readonly string[]).includes(canonical)) {
    return [...ingredientUnits];
  }

  return [canonical, ...ingredientUnits];
}

function IngredientEditorRow({
  ingredient,
  onUpdate,
  onRemove,
}: {
  ingredient: IngredientDraft;
  onUpdate: (patch: Partial<IngredientDraft>) => void;
  onRemove: () => void;
}) {
  const unitOptions = unitOptionsForIngredient(ingredient.unit);

  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
      <div className="flex items-end gap-2">
        <Label className="min-w-0 flex-1">
          <span className="text-xs font-semibold text-stone-600">Ingredient</span>
          <IngredientCombobox
            value={ingredient.name}
            onChange={(name) => onUpdate({ name })}
            className="mt-1 h-auto rounded-lg border-stone-200 bg-white py-2 text-sm focus-visible:border-emerald-600 focus-visible:ring-emerald-600/20"
          />
        </Label>
        <button
          type="button"
          aria-label="Remove row"
          onClick={onRemove}
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500 transition hover:bg-rose-50 hover:text-rose-700"
        >
          <Trash2 size={16} />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-[minmax(74px,.8fr)_minmax(78px,.8fr)_minmax(104px,1fr)] gap-2">
        <Label className="block min-w-0">
          <span className="text-xs font-semibold text-stone-600">Amount</span>
          <Input
            type="text"
            inputMode="decimal"
            value={ingredient.quantity}
            onChange={(event) => onUpdate({ quantity: sanitiseNumericInput(event.target.value, true, false) })}
            onBlur={() => onUpdate({ quantity: formatQuantityForInput(sanitiseIngredientQuantity(ingredient.quantity)) })}
            placeholder="100"
            className="mt-1 h-auto rounded-lg border-stone-200 bg-white px-3 py-2 text-sm focus-visible:border-emerald-600 focus-visible:ring-emerald-600/20"
          />
        </Label>
        <Label className="block min-w-0">
          <span className="text-xs font-semibold text-stone-600">Unit</span>
          <select
            value={ingredient.unit}
            onChange={(event) => onUpdate({ unit: event.target.value })}
            className="mt-1 h-[38px] w-full rounded-lg border border-stone-200 bg-white px-2 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
          >
            {unitOptions.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </Label>
        <Label className="block min-w-0">
          <span className="text-xs font-semibold text-stone-600">Prep</span>
          <select
            value={ingredient.preparation}
            onChange={(event) => onUpdate({ preparation: event.target.value })}
            className="mt-1 h-[38px] w-full rounded-lg border border-stone-200 bg-white px-2 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
          >
            <option value="">none</option>
            {ingredientPreparations.map((preparation) => (
              <option key={preparation} value={preparation}>
                {preparation}
              </option>
            ))}
          </select>
        </Label>
      </div>
    </div>
  );
}
