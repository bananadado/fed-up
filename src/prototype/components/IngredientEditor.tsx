import { Plus, Trash2 } from "lucide-react";
import { useId } from "react";

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
import { AppButton } from "./primitives";

export function IngredientEditor({
  ingredients,
  onChange,
  allowEmpty = false,
  emptyMessage = "No ingredients yet.",
}: {
  ingredients: IngredientDraft[];
  onChange: (ingredients: IngredientDraft[]) => void;
  allowEmpty?: boolean;
  emptyMessage?: string;
}) {
  const listId = useId();

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
        <p className="text-sm font-semibold">Ingredients</p>
        <AppButton type="button" variant="secondary" className="px-3 py-2" onClick={() => onChange([...ingredients, createIngredientDraft()])}>
          <Plus size={15} /> Add
        </AppButton>
      </div>
      <datalist id={listId}>
        {ingredientOptions.map((ingredient) => (
          <option key={ingredient} value={ingredient} />
        ))}
      </datalist>
      <div className="mt-3 space-y-3">
        {ingredients.length === 0 && (
          <div className="rounded-lg border border-dashed border-stone-200 bg-stone-50 px-3 py-4 text-sm text-stone-500">
            {emptyMessage}
          </div>
        )}
        {ingredients.map((ingredient) => (
          <div key={ingredient.id} className="rounded-lg border border-stone-200 bg-stone-50 p-3">
            <div className="flex items-end gap-2">
              <Label className="min-w-0 flex-1">
                <span className="text-xs font-semibold text-stone-600">Ingredient</span>
                <Input
                  list={listId}
                  value={ingredient.name}
                  onChange={(event) => updateIngredient(ingredient.id, { name: event.target.value })}
                  placeholder="oats"
                  className="mt-1 h-auto rounded-lg border-stone-200 bg-white px-3 py-2 text-sm focus-visible:border-emerald-600 focus-visible:ring-emerald-600/20"
                />
              </Label>
              <button
                type="button"
                aria-label="Remove row"
                onClick={() => removeIngredient(ingredient.id)}
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500 transition hover:bg-rose-50 hover:text-rose-700"
              >
                <Trash2 size={16} />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-[minmax(74px,.8fr)_minmax(78px,.8fr)_minmax(104px,1fr)] gap-2">
              <Label className="block min-w-0">
                <span className="text-xs font-semibold text-stone-600">Amount</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={ingredient.quantity}
                  onChange={(event) => updateIngredient(ingredient.id, { quantity: event.target.value })}
                  onKeyDown={(event) => { if (["e", "E", "+", "-"].includes(event.key)) event.preventDefault(); }}
                  onBlur={() => updateIngredient(ingredient.id, { quantity: formatQuantityForInput(sanitiseIngredientQuantity(ingredient.quantity)) })}
                  placeholder="100"
                  className="mt-1 h-auto rounded-lg border-stone-200 bg-white px-3 py-2 text-sm focus-visible:border-emerald-600 focus-visible:ring-emerald-600/20"
                />
              </Label>
              <Label className="block min-w-0">
                <span className="text-xs font-semibold text-stone-600">Unit</span>
                <select
                  value={ingredient.unit}
                  onChange={(event) => updateIngredient(ingredient.id, { unit: event.target.value })}
                  className="mt-1 h-[38px] w-full rounded-lg border border-stone-200 bg-white px-2 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                >
                  {ingredientUnits.map((unit) => (
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
                  onChange={(event) => updateIngredient(ingredient.id, { preparation: event.target.value })}
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
        ))}
      </div>
    </div>
  );
}
