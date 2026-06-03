/**
 * UK ingredient price estimation (Aldi/Tesco own-brand, mid-2025).
 * All prices in pence per 100g unless the comment says "per item".
 *
 * The lookup scans ingredient names for the longest matching substring,
 * so more specific entries must appear earlier in the list.
 */

const PRICE_TABLE: Array<[string, number]> = [
  // Proteins — specific first
  ["chicken breast", 85],
  ["chicken thigh", 55],
  ["chicken wing", 50],
  ["minced beef", 75],
  ["ground beef", 75],
  ["beef mince", 75],
  ["beef steak", 120],
  ["pork belly", 75],
  ["pork chop", 80],
  ["pork loin", 90],
  ["smoked salmon", 200],
  ["salmon fillet", 190],
  ["tinned tuna", 45],
  ["canned tuna", 45],
  // Dairy — specific first
  ["cream cheese", 50],
  ["sour cream", 32],
  ["double cream", 65],
  ["single cream", 50],
  ["parmesan cheese", 150],
  ["cheddar cheese", 80],
  ["mozzarella cheese", 80],
  ["greek yoghurt", 28],
  ["greek yogurt", 28],
  ["almond milk", 22],
  ["coconut milk", 22],
  ["oat milk", 18],
  // Condiments/sauces — specific first
  ["tomato paste", 20],
  ["tomato puree", 20],
  ["tomato sauce", 15],
  ["oyster sauce", 25],
  ["fish sauce", 25],
  ["soy sauce", 20],
  ["olive oil", 60],
  ["vegetable oil", 15],
  ["sunflower oil", 15],
  ["peanut butter", 30],
  ["tahini", 65],
  // Vegetables — specific first
  ["sweet potato", 18],
  ["spring onion", 20],
  ["red pepper", 40],
  ["green pepper", 35],
  ["yellow pepper", 40],
  ["bell pepper", 38],
  ["red onion", 10],
  // Grains — specific first
  ["self-raising flour", 10],
  ["bread flour", 10],
  ["plain flour", 8],
  ["bread crumb", 20],
  ["breadcrumb", 20],
  ["brown sugar", 8],
  ["caster sugar", 7],
  ["icing sugar", 7],
  // General proteins
  ["chicken", 70],
  ["beef", 85],
  ["pork", 70],
  ["lamb", 130],
  ["goat", 130],
  ["bacon", 75],
  ["ham", 90],
  ["sausage", 50],
  ["turkey", 80],
  ["duck", 150],
  ["salmon", 190],
  ["tuna", 55],
  ["cod", 130],
  ["haddock", 120],
  ["prawn", 160],
  ["shrimp", 160],
  ["crab", 200],
  ["mussel", 120],
  ["squid", 130],
  ["fish", 100],
  // Dairy (general)
  ["butter", 50],
  ["cream", 60],
  ["cheddar", 80],
  ["mozzarella", 80],
  ["parmesan", 150],
  ["feta", 90],
  ["brie", 90],
  ["cheese", 80],
  ["yoghurt", 22],
  ["yogurt", 22],
  ["milk", 7],
  // Vegetables (general)
  ["onion", 9],
  ["garlic", 18],
  ["potato", 10],
  ["tomato", 27],
  ["carrot", 9],
  ["celery", 15],
  ["broccoli", 22],
  ["cauliflower", 16],
  ["spinach", 32],
  ["kale", 28],
  ["lettuce", 22],
  ["cucumber", 25],
  ["courgette", 27],
  ["zucchini", 27],
  ["aubergine", 32],
  ["eggplant", 32],
  ["mushroom", 27],
  ["leek", 22],
  ["pea", 12],
  ["sweetcorn", 16],
  ["corn", 16],
  ["lentil", 16],
  ["chickpea", 20],
  ["bean", 18],
  // Grains (general)
  ["pasta", 12],
  ["spaghetti", 12],
  ["rice", 13],
  ["noodle", 15],
  ["couscous", 20],
  ["bread", 16],
  ["flour", 9],
  ["oats", 11],
  // Pantry
  ["sugar", 7],
  ["honey", 55],
  ["oil", 20],
  ["vinegar", 18],
  ["coconut", 40],
  ["stock", 5],
  ["herb", 30],
  ["spice", 35],
  ["salt", 1],
];

/** Ingredients sold per item with typical UK weights. */
const PER_ITEM: Record<string, { pence: number; grams: number }> = {
  egg: { pence: 20, grams: 58 },
  lemon: { pence: 30, grams: 120 },
  lime: { pence: 25, grams: 80 },
  avocado: { pence: 75, grams: 160 },
};

/** Parse a fraction or mixed number string ("3/4", "1 1/2", "2") to a float. */
function parseFraction(raw: string): number {
  const mixed = raw.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) return parseInt(mixed[1]!) + parseInt(mixed[2]!) / parseInt(mixed[3]!);

  const frac = raw.match(/(\d+)\s*\/\s*(\d+)/);
  if (frac) return parseInt(frac[1]!) / parseInt(frac[2]!);

  const n = parseFloat(raw);
  return isNaN(n) ? 1 : n;
}

/** Convert a TheMealDB measure string to approximate grams (or ml treated as g). */
export function measureToGrams(measure: string, ingredient: string): number {
  const s = measure.trim().toLowerCase();
  if (!s || s === "to taste" || s === "pinch" || s === "dash" || s === "sprig") return 3;

  const qty = parseFraction(s);

  if (/kg/.test(s)) return qty * 1000;
  if (/\blb|pound/.test(s)) return qty * 454;
  if (/\boz\b/.test(s)) return qty * 28;
  if (/\bg\b/.test(s) && !/tbsp|tsp/.test(s)) return qty;
  if (/ml/.test(s)) return qty;
  if (/litre|liter|\bl\b/.test(s)) return qty * 1000;
  if (/pint/.test(s)) return qty * 568;
  if (/cup/.test(s)) return qty * 240;
  if (/tbsp|tablespoon|tbs/.test(s)) return qty * 15;
  if (/tsp|teaspoon/.test(s)) return qty * 5;
  if (/can|tin/.test(s)) return qty * 400;
  if (/pack|packet/.test(s)) return qty * 150;
  if (/clove/.test(s)) return qty * 5; // garlic clove ≈ 5g

  // Plain number → likely item count; estimate weight by ingredient
  if (!isNaN(qty)) {
    for (const [key, item] of Object.entries(PER_ITEM)) {
      if (ingredient.toLowerCase().includes(key)) return qty * item.grams;
    }
    return qty * 80; // generic "1 x" default
  }

  return 100;
}

/** Look up the price (pence) per 100g for an ingredient name. */
function pricePerHundredGrams(ingredient: string): number {
  const name = ingredient.toLowerCase();

  // Check per-item ingredients first (they have their own cost logic)
  for (const [key] of Object.entries(PER_ITEM)) {
    if (name.includes(key)) return 0; // handled separately
  }

  // Walk the table — first match (longest key) wins
  for (const [key, price] of PRICE_TABLE) {
    if (name.includes(key)) return price;
  }

  return 20; // unknown → generic pantry item estimate
}

/** Return the pence cost for one ingredient at the given measure. */
function ingredientCost(name: string, measure: string): number {
  const lc = name.toLowerCase();

  // Per-item pricing
  for (const [key, item] of Object.entries(PER_ITEM)) {
    if (lc.includes(key)) {
      const qty = parseFraction(measure.trim().toLowerCase()) || 1;
      return qty * item.pence;
    }
  }

  const grams = measureToGrams(measure, name);
  const pencePerHundred = pricePerHundredGrams(name);
  return (grams / 100) * pencePerHundred;
}

/**
 * Estimate total meal price in pence from an ingredient list.
 * Adds 15% overhead for oil, salt, and pantry staples not explicitly priced.
 */
export function estimatePricePence(
  ingredients: Array<{ name: string; measure: string }>,
): number {
  if (ingredients.length === 0) return 200;

  const rawTotal = ingredients.reduce(
    (sum, { name, measure }) => sum + ingredientCost(name, measure),
    0,
  );

  const withOverhead = rawTotal * 1.15;

  // Round to nearest 5p, clamp to a reasonable range
  const rounded = Math.round(withOverhead / 5) * 5;
  return Math.min(Math.max(rounded, 50), 800);
}
