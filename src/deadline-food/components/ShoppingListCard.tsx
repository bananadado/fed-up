import { ClipboardCheck, ClipboardList, ExternalLink, ShoppingBasket } from "lucide-react";
import { useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AppButton, SelectField } from "./primitives";
import type { GroceryVendor, ShoppingItem, ShoppingScope } from "../shopping";
import { countHint, estimateShoppingListCost, formatShoppingList, shoppingItemKey, shoppingItemLabel } from "../shopping";
import { money } from "../utils";

const SCOPE_OPTIONS: { value: ShoppingScope; label: string }[] = [
  { value: "week", label: "Next 7 days" },
  { value: "all", label: "Full plan" },
];

async function writeClipboardText(value: string) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.append(textArea);
  textArea.select();
  document.execCommand("copy");
  textArea.remove();
}

function currentItemKeys(items: ShoppingItem[]) {
  return new Set(items.map((item) => shoppingItemKey(item)));
}

function readStoredCheckedItems(storageKey: string | undefined, items: ShoppingItem[]) {
  if (!storageKey) {
    return {};
  }

  try {
    const storedValue = window.localStorage.getItem(storageKey);
    const parsedValue = storedValue ? JSON.parse(storedValue) : null;
    const itemKeys = currentItemKeys(items);

    if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) {
      return {};
    }

    const checkedItems: Record<string, boolean> = {};

    Object.entries(parsedValue).forEach(([key, value]) => {
      if (itemKeys.has(key) && value === true) {
        checkedItems[key] = true;
      }
    });

    return checkedItems;
  } catch {
    return {};
  }
}

function writeStoredCheckedItems(storageKey: string | undefined, checkedItems: Record<string, boolean>, items: ShoppingItem[]) {
  if (!storageKey) {
    return;
  }

  const itemKeys = currentItemKeys(items);
  const checkedEntries = Object.entries(checkedItems).filter(([key, value]) => itemKeys.has(key) && value);

  if (checkedEntries.length === 0) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(checkedEntries)));
}

export function ShoppingListCard({
  title,
  description,
  items,
  selectedVendor,
  vendors,
  onSelectVendor,
  onOpenIngredient,
  onCopy,
  onToggleItem,
  storageKey,
  compact = false,
  scope,
  onScopeChange,
  showEstimatedCost = false,
}: {
  title: string;
  description: string;
  items: ShoppingItem[];
  selectedVendor: GroceryVendor;
  vendors: GroceryVendor[];
  onSelectVendor: (vendorId: string) => void;
  onOpenIngredient: (ingredient: string) => void;
  onCopy?: () => void;
  onToggleItem?: (ingredient: string, checked: boolean, checkedCount: number, itemCount: number) => void;
  storageKey?: string;
  compact?: boolean;
  /** Current time-range scope. Pass with {@link onScopeChange} to show the toggle. */
  scope?: ShoppingScope;
  onScopeChange?: (scope: ShoppingScope) => void;
  /** Show an illustrative estimated total for the listed items. */
  showEstimatedCost?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>(() => readStoredCheckedItems(storageKey, items));
  const outstandingItems = useMemo(() => items.filter((item) => !checkedItems[shoppingItemKey(item)]), [checkedItems, items]);
  const listText = useMemo(() => formatShoppingList(outstandingItems), [outstandingItems]);
  const checkedCount = items.length - outstandingItems.length;
  const estimatedCost = useMemo(
    () => (showEstimatedCost ? estimateShoppingListCost(items) : null),
    [showEstimatedCost, items],
  );
  const showScopeToggle = Boolean(scope && onScopeChange);

  async function copyList() {
    if (!listText) {
      return;
    }

    await writeClipboardText(listText);
    onCopy?.();
    const count = outstandingItems.length;
    setCopied(true);
    setCopyMessage(`Copied ${count} item${count === 1 ? "" : "s"} — paste into a note or your supermarket's search box.`);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function toggleItem(item: ShoppingItem, checked: boolean) {
    setCheckedItems((current) => {
      const nextCheckedItems = {
        ...current,
        [shoppingItemKey(item)]: checked,
      };
      const nextCheckedCount = items.filter((shoppingItem) => nextCheckedItems[shoppingItemKey(shoppingItem)]).length;

      writeStoredCheckedItems(storageKey, nextCheckedItems, items);
      onToggleItem?.(item.name, checked, nextCheckedCount, items.length);

      return nextCheckedItems;
    });
  }

  return (
    <Card className="gap-0 rounded-lg border-stone-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
          <ShoppingBasket size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="font-bold">{title}</h2>
          <p className="mt-1 text-sm text-stone-500">{description}</p>
          {items.length > 0 && (
            <p className="mt-2 text-xs font-medium text-stone-500">
              {checkedCount} of {items.length} items ticked off
            </p>
          )}
        </div>
      </div>

      {showScopeToggle && (
        <div className="mt-4">
          <span className="mb-1.5 block text-sm font-medium text-stone-700">Shopping for</span>
          <div className="inline-flex rounded-lg border border-stone-200 bg-stone-50 p-0.5" role="group" aria-label="Shopping list time range">
            {SCOPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={scope === option.value}
                onClick={() => onScopeChange?.(option.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition",
                  scope === option.value ? "bg-white text-emerald-800 shadow-sm" : "text-stone-500 hover:text-stone-700",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {estimatedCost !== null && items.length > 0 && (
        <div className="mt-4 flex items-baseline justify-between rounded-lg bg-emerald-50 px-3 py-2.5">
          <span className="text-sm font-medium text-emerald-900">Estimated total</span>
          <span className="text-right">
            <span className="text-lg font-bold text-emerald-800">{money(estimatedCost)}</span>
            <span className="ml-1.5 text-xs text-emerald-700">illustrative</span>
          </span>
        </div>
      )}

      <div className="mt-4">
        <SelectField
          label="Supermarket"
          value={selectedVendor.id}
          options={vendors.map((vendor) => ({ label: vendor.label, value: vendor.id }))}
          onChange={onSelectVendor}
        />
      </div>

      <div className="mt-4 grid gap-2">
        {items.map((item) => (
          <div
            key={shoppingItemKey(item)}
            className={compact ? "flex items-center justify-between gap-3 rounded-lg bg-stone-50 px-3 py-2" : "grid gap-2 rounded-lg bg-stone-50 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"}
          >
            <label className="flex min-w-0 items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(checkedItems[shoppingItemKey(item)])}
                onChange={(event) => toggleItem(item, event.target.checked)}
                className="size-4 rounded border-stone-300 text-emerald-700 accent-emerald-700"
              />
              {(() => {
                const checked = Boolean(checkedItems[shoppingItemKey(item)]);
                const hint = !checked ? countHint(item) : null;
                return (
                  <span className={checked ? "min-w-0 text-sm text-stone-400 line-through" : "min-w-0 text-sm text-stone-700"}>
                    {shoppingItemLabel(item)}
                    {hint && <span className="ml-1.5 text-stone-400">{hint}</span>}
                  </span>
                );
              })()}
            </label>
            <AppButton
              type="button"
              variant="secondary"
              className="shrink-0 px-3 py-1.5 text-xs"
              onClick={() => onOpenIngredient(item.name)}
              disabled={Boolean(checkedItems[shoppingItemKey(item)])}
              aria-label={`Search ${item.name} at ${selectedVendor.label}`}
            >
              <ExternalLink size={14} /> Search
            </AppButton>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-1.5">
        <div className="flex flex-wrap gap-2">
          <AppButton type="button" variant="secondary" onClick={copyList} disabled={!listText}>
            {copied ? <ClipboardCheck size={16} /> : <ClipboardList size={16} />}
            {copied ? "Copied" : "Copy list"}
          </AppButton>
        </div>
        {copyMessage ? (
          <p className="text-xs font-medium text-emerald-700" aria-live="polite">{copyMessage}</p>
        ) : (
          <p className="text-xs text-stone-500">Copies your remaining items as text to paste into a note or a supermarket app.</p>
        )}
      </div>
    </Card>
  );
}
