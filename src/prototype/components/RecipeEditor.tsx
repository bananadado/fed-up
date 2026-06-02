import { Camera, Plus, RefreshCcw, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { uploadRecipePhoto } from "@/adapters/deadlineFoodApi";

import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { fetchOpenFoodFactsNutrition } from "../nutritionApi";
import type { Meal, MealSlot, NutritionSource, RecipeIngredient } from "../types";
import { AppButton, Field } from "./primitives";
import { IngredientEditor } from "./IngredientEditor";
import {
  createIngredientDraft,
  ingredientDraftsFromIngredients,
  sanitiseIngredientDrafts,
  type IngredientDraft,
} from "../ingredients";
import { money, nutritionSourceSummary } from "../utils";
import type { TrackPrototypeEvent } from "../analytics";

const MEAL_SLOT_OPTIONS: MealSlot[] = ["breakfast", "lunch", "dinner"];

const TAG_OPTIONS: string[] = [
  "batch-friendly",
  "high protein",
  "hot meal",
  "low effort",
  "microwave",
  "near campus",
  "near halls",
  "near library",
  "no cooking",
  "quick",
  "vegan",
  "vegetarian",
];

type EditorForm = {
  name: string;
  time: number;
  price: number;
  totalCost: number;
  servings: number;
  mealSlots: MealSlot[];
  ingredients: IngredientDraft[];
  tags: string[];
  allergens: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  nutritionSource?: NutritionSource;
  instructions: string;
  note: string;
};

export type RecipeEditorOutput = {
  name: string;
  time: number;
  price: number;
  totalCost: number;
  servings: number;
  mealSlots: MealSlot[];
  ingredients: RecipeIngredient[];
  tags: string[];
  allergens: string[];
  nutrition: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    source?: NutritionSource;
  };
  instructions: string[];
  note: string;
};

function mealToForm(meal: Meal): EditorForm {
  return {
    name: meal.name,
    time: meal.time,
    price: meal.price,
    totalCost: meal.price,
    servings: 1,
    mealSlots: meal.mealSlots,
    ingredients: ingredientDraftsFromIngredients(meal.ingredients),
    tags: meal.tags,
    allergens: meal.allergens.join(", "),
    calories: meal.nutrition.calories,
    protein: meal.nutrition.protein,
    carbs: meal.nutrition.carbs,
    fat: meal.nutrition.fat,
    nutritionSource: meal.nutrition.source,
    instructions: meal.instructions.join("\n"),
    note: meal.note,
  };
}

function defaultForm(): EditorForm {
  return {
    name: "",
    time: 10,
    price: 2.5,
    totalCost: 5,
    servings: 2,
    mealSlots: ["breakfast", "lunch", "dinner"],
    ingredients: [createIngredientDraft()],
    tags: [],
    allergens: "",
    calories: 500,
    protein: 20,
    carbs: 60,
    fat: 15,
    nutritionSource: undefined,
    instructions: "",
    note: "",
  };
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function positiveNumber(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// ── Tag chip picker ──────────────────────────────────────────────────────────

function TagEditor({
  values,
  onChange,
  options,
  placeholder = "Add a tag…",
}: {
  values: string[];
  onChange: (values: string[]) => void;
  options: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const available = options.filter((opt) => !values.includes(opt));
  const filtered = query
    ? available.filter((opt) => opt.toLowerCase().includes(query.toLowerCase()))
    : available;

  const isExactMatch =
    options.some((opt) => opt.toLowerCase() === query.toLowerCase()) ||
    values.some((v) => v.toLowerCase() === query.toLowerCase());
  const showCustom = query.trim().length > 0 && !isExactMatch;
  const customOffset = showCustom ? 1 : 0;
  const totalOptions = customOffset + filtered.length;

  function addTag(tag: string) {
    if (!values.includes(tag)) {
      onChange([...values, tag]);
    }
    setQuery("");
    setOpen(false);
    setFocusedIndex(-1);
    inputRef.current?.focus();
  }

  function removeTag(tag: string) {
    onChange(values.filter((v) => v !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !query && values.length > 0) {
      removeTag(values[values.length - 1]!);
      return;
    }
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
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (focusedIndex === 0 && showCustom) {
        addTag(query.trim());
      } else if (focusedIndex >= 0) {
        const opt = filtered[focusedIndex - customOffset];
        if (opt !== undefined) addTag(opt);
      } else if (query.trim()) {
        addTag(query.trim());
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setFocusedIndex(-1);
    }
  }

  useEffect(() => {
    if (focusedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll<HTMLElement>("[data-tag-option]");
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
      <div
        className="flex min-h-[40px] cursor-text flex-wrap gap-1.5 rounded-lg border border-stone-200 bg-white p-2 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/20"
        onClick={() => inputRef.current?.focus()}
      >
        {values.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
              className="text-emerald-600 hover:text-emerald-900"
              aria-label={`Remove ${tag}`}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setFocusedIndex(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={values.length === 0 ? placeholder : ""}
          className="min-w-[120px] flex-1 border-none bg-transparent text-sm outline-none placeholder:text-stone-400"
          autoComplete="off"
        />
      </div>
      {open && (filtered.length > 0 || showCustom) && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-stone-200 bg-white shadow-lg"
        >
          {showCustom && (
            <button
              type="button"
              data-tag-option
              onMouseDown={(e) => { e.preventDefault(); addTag(query.trim()); }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-emerald-700 ${focusedIndex === 0 ? "bg-emerald-50" : "hover:bg-emerald-50"}`}
            >
              <Plus size={14} className="shrink-0" />
              Add &ldquo;{query.trim()}&rdquo; as tag
            </button>
          )}
          {showCustom && filtered.length > 0 && <div className="mx-3 border-t border-stone-100" />}
          {filtered.map((opt, i) => {
            const idx = i + customOffset;
            return (
              <button
                key={opt}
                type="button"
                data-tag-option
                onMouseDown={(e) => { e.preventDefault(); addTag(opt); }}
                className={`w-full px-3 py-2 text-left text-sm ${focusedIndex === idx ? "bg-stone-100" : "hover:bg-stone-50"} text-stone-700`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function RecipeEditor({
  mode,
  meal,
  title,
  description,
  onSubmit,
  onCancel,
  submitLabel,
  track,
}: {
  mode: "create" | "edit";
  meal?: Meal;
  title?: string;
  description?: string;
  onSubmit: (output: RecipeEditorOutput, photoUrl: string | undefined) => void;
  onCancel?: () => void;
  submitLabel?: string;
  track: TrackPrototypeEvent;
}) {
  const [form, setForm] = useState<EditorForm>(() => (meal ? mealToForm(meal) : defaultForm()));
  const [attempted, setAttempted] = useState(false);
  const [nutritionLoading, setNutritionLoading] = useState(false);
  const [nutritionStatus, setNutritionStatus] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const ingredients = sanitiseIngredientDrafts(form.ingredients);
  const servings = positiveNumber(Number(form.servings), 1);
  const totalCost = Math.max(0, Number(form.totalCost) || 0);
  const costPerPortion = totalCost / servings;

  const errors = {
    name: mode === "create" && !form.name.trim(),
    ingredients: mode === "create" && ingredients.length === 0,
    servings: mode === "create" && Number(form.servings) < 1,
    totalCost: mode === "create" && totalCost <= 0,
  };
  const hasErrors = errors.name || errors.ingredients || errors.servings || errors.totalCost;

  async function estimateNutrition() {
    if (ingredients.length === 0) {
      setAttempted(true);
      setNutritionStatus("Add at least one ingredient with a quantity first.");
      return;
    }
    setNutritionLoading(true);
    setNutritionStatus(null);
    try {
      const nutrition = await fetchOpenFoodFactsNutrition(ingredients);
      setForm((prev) => ({
        ...prev,
        calories: nutrition.calories,
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        fat: nutrition.fat,
        nutritionSource: nutrition.source,
      }));
      const missing = nutrition.source?.missingIngredients ?? [];
      setNutritionStatus(
        missing.length > 0 ? `Couldn't find: ${missing.join(", ")}` : "All ingredients matched",
      );
      track("recipe_nutrition_refreshed", {
        ...(meal ? { meal_id: meal.id } : {}),
        provider: nutrition.source?.provider,
        ingredient_count: ingredients.length,
        matched_count: nutrition.source?.matchedIngredients?.length ?? 0,
        missing_count: missing.length,
      });
    } catch (error) {
      setNutritionStatus(
        error instanceof Error ? error.message : "Nutrition data could not be loaded.",
      );
    } finally {
      setNutritionLoading(false);
    }
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPhotoFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setPhotoPreview(null);
    }
  }

  function toggleMealSlot(slot: MealSlot) {
    const next = form.mealSlots.includes(slot)
      ? form.mealSlots.filter((s) => s !== slot)
      : [...form.mealSlots, slot];
    setForm({ ...form, mealSlots: next });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (hasErrors) {
      setAttempted(true);
      requestAnimationFrame(() => {
        const firstError = formRef.current?.querySelector(
          "[data-field-error] input, [data-ingredient-error]",
        );
        if (firstError instanceof HTMLElement) {
          firstError.scrollIntoView({ behavior: "smooth", block: "center" });
          firstError.focus({ preventScroll: true });
        }
      });
      return;
    }

    let photoUrl: string | undefined = mode === "edit" ? meal?.photoUrl : undefined;
    if (photoFile) {
      setUploading(true);
      try {
        const result = await uploadRecipePhoto(photoFile);
        photoUrl = result.photoUrl;
      } catch {
        // non-fatal: submit without new photo
      }
      setUploading(false);
    }

    const nextServings = Math.max(1, Math.round(servings));
    const nextTotalCost = Number(totalCost.toFixed(2));
    const output: RecipeEditorOutput = {
      name: form.name.trim(),
      time: Math.max(0, Math.round(Number(form.time) || 0)),
      price:
        mode === "create"
          ? Number((nextTotalCost / nextServings).toFixed(2))
          : Number(form.price) || 0,
      totalCost: nextTotalCost,
      servings: nextServings,
      mealSlots: form.mealSlots.length > 0 ? form.mealSlots : ["breakfast", "lunch", "dinner"],
      ingredients,
      tags: form.tags,
      allergens: splitList(form.allergens),
      nutrition: {
        calories: Math.max(0, Math.round(Number(form.calories) || 0)),
        protein: Math.max(0, Math.round(Number(form.protein) || 0)),
        carbs: Math.max(0, Math.round(Number(form.carbs) || 0)),
        fat: Math.max(0, Math.round(Number(form.fat) || 0)),
        source: form.nutritionSource,
      },
      instructions: form.instructions
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      note: form.note.trim(),
    };

    onSubmit(output, photoUrl);
  }

  const displayedPhoto = photoPreview ?? meal?.photoUrl;
  const hasHeader = title || onCancel;

  return (
    <Card className="gap-0 rounded-lg border-stone-200 bg-white p-6">
      {hasHeader && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {title && <h1 className="text-3xl font-bold">{title}</h1>}
            {description && <p className="mt-2 text-stone-600">{description}</p>}
          </div>
          {onCancel && (
            <AppButton type="button" variant="secondary" onClick={onCancel}>
              <X size={16} /> Cancel
            </AppButton>
          )}
        </div>
      )}
      <form
        ref={formRef}
        className={`${hasHeader ? "mt-5 " : ""}space-y-4`}
        onSubmit={handleSubmit}
      >
        <label className="relative inline-block cursor-pointer">
          <div className="h-36 w-48 overflow-hidden rounded-lg bg-emerald-50 shadow-inner">
            {displayedPhoto ? (
              <img
                src={displayedPhoto}
                alt={form.name || "Recipe"}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-8xl">
                {meal?.image ?? "🍽️"}
              </div>
            )}
          </div>
          <div className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1.5 text-xs font-semibold text-stone-700 shadow-sm">
            <Camera size={13} />
            {displayedPhoto ? "Replace photo" : "Add photo"}
          </div>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={handlePhotoChange}
          />
        </label>

        <Field
          label="Recipe name"
          required
          value={form.name}
          onChange={(name) => setForm({ ...form, name })}
          placeholder="e.g. Microwave bean burrito"
          error={attempted && errors.name}
          errorMessage="Please enter a recipe name"
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Time (mins)"
            type="number"
            value={form.time}
            onChange={(time) => setForm({ ...form, time: +time })}
          />
          {mode === "create" ? (
            <Field
              label="Servings"
              type="number"
              required
              value={form.servings}
              onChange={(s) => setForm({ ...form, servings: +s })}
              error={attempted && errors.servings}
              errorMessage="Must be at least 1"
            />
          ) : (
            <Field
              label="Cost / portion (£)"
              type="number"
              step="0.05"
              value={form.price}
              onChange={(price) => setForm({ ...form, price: +price })}
            />
          )}
        </div>

        {mode === "create" && (
          <>
            <Field
              label="Total recipe cost (£)"
              type="number"
              step="0.05"
              required
              value={form.totalCost}
              onChange={(cost) => setForm({ ...form, totalCost: +cost })}
              error={attempted && errors.totalCost}
              errorMessage="Please enter a cost"
            />
            <p className="rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
              Estimated cost per portion: {money(costPerPortion)}
            </p>
          </>
        )}

        <div data-field-error={attempted && errors.ingredients || undefined}>
          <IngredientEditor
            required={mode === "create"}
            ingredients={form.ingredients}
            onChange={(nextIngredients) => setForm({ ...form, ingredients: nextIngredients })}
          />
          {attempted && errors.ingredients && (
            <p className="mt-2 text-xs font-medium text-red-600" data-ingredient-error>
              Add at least one ingredient
            </p>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold">Meal slots</p>
          <div className="flex flex-wrap gap-2">
            {MEAL_SLOT_OPTIONS.map((slot) => {
              const active = form.mealSlots.includes(slot);
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => toggleMealSlot(slot)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium capitalize transition ${
                    active
                      ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                      : "border-stone-200 bg-white text-stone-500 hover:border-stone-300 hover:text-stone-700"
                  }`}
                >
                  {slot}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold">
            Tags <span className="font-normal text-stone-400">(optional)</span>
          </p>
          <TagEditor
            values={form.tags}
            onChange={(tags) => setForm({ ...form, tags })}
            options={TAG_OPTIONS}
            placeholder="Search or add tags…"
          />
        </div>

        <Field
          label="Allergens"
          value={form.allergens}
          onChange={(allergens) => setForm({ ...form, allergens })}
          placeholder="gluten, dairy"
        />

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-stone-50 p-3">
          <div>
            <p className="text-sm font-semibold">Nutrition data</p>
            <p className="mt-1 text-xs text-stone-500">
              {nutritionStatus ?? nutritionSourceSummary(form.nutritionSource)}
            </p>
          </div>
          <AppButton
            type="button"
            variant="secondary"
            onClick={estimateNutrition}
            disabled={nutritionLoading}
          >
            <RefreshCcw size={16} /> {nutritionLoading ? "Checking..." : "Pull from OpenFoodFacts"}
          </AppButton>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field
            label="Calories"
            type="number"
            value={form.calories}
            onChange={(calories) => setForm({ ...form, calories: +calories })}
          />
          <Field
            label="Protein (g)"
            type="number"
            value={form.protein}
            onChange={(protein) => setForm({ ...form, protein: +protein })}
          />
          <Field
            label="Carbs (g)"
            type="number"
            value={form.carbs}
            onChange={(carbs) => setForm({ ...form, carbs: +carbs })}
          />
          <Field
            label="Fat (g)"
            type="number"
            value={form.fat}
            onChange={(fat) => setForm({ ...form, fat: +fat })}
          />
        </div>

        <label className="block">
          <span className="text-sm font-semibold">Method</span>
          <Textarea
            value={form.instructions}
            onChange={(event) => setForm({ ...form, instructions: event.target.value })}
            className="mt-2 min-h-36 rounded-lg border-stone-200 bg-white"
            placeholder={"Step 1\nStep 2\nStep 3"}
          />
        </label>

        <Field
          label="Notes"
          value={form.note}
          onChange={(note) => setForm({ ...form, note })}
          placeholder="Any tips or variations"
        />

        {attempted && hasErrors && (
          <p className="text-center text-sm font-medium text-red-600">
            Please fill in all required fields
          </p>
        )}

        <AppButton
          type="submit"
          className={mode === "create" ? `${attempted && hasErrors ? "mt-3" : "mt-6"} w-full` : ""}
          disabled={uploading}
        >
          {uploading
            ? "Uploading photo..."
            : (submitLabel ?? (mode === "create" ? "Add recipe" : "Save recipe"))}
        </AppButton>
      </form>
    </Card>
  );
}
