import { tescoIngredientPriceTable } from "./generatedTescoIngredientPrices";

export type IngredientPriceSource = {
  retailer: "seeded-uk" | "tesco";
  source: string;
  sourceUrl?: string;
  sourceDate: string;
  confidence: "high" | "medium" | "low";
};

export type IngredientPriceRecord = {
  ingredient: string;
  aliases: string[];
  pencePerGram: number;
  packagePricePence?: number;
  packageGrams?: number;
  source: IngredientPriceSource;
};

const SEEDED_SOURCE: IngredientPriceSource = {
  retailer: "seeded-uk",
  source: "Seeded UK own-brand grocery baseline",
  sourceDate: "2026-06-09",
  confidence: "medium",
};

function priced(
  ingredient: string,
  aliases: string[],
  packagePricePence: number,
  packageGrams: number,
  confidence: IngredientPriceSource["confidence"] = "medium",
): IngredientPriceRecord {
  return {
    ingredient,
    aliases,
    packagePricePence,
    packageGrams,
    pencePerGram: packagePricePence / packageGrams,
    source: { ...SEEDED_SOURCE, confidence },
  };
}

export const DEFAULT_PRICE_PENCE_PER_GRAM = 0.25;

export const seededIngredientPriceTable: IngredientPriceRecord[] = [
  priced("chicken breast", ["chicken breast", "chicken", "halal chicken"], 425, 500),
  priced("chicken pieces", ["chicken pieces", "halal chicken pieces", "chicken thigh", "chicken thighs"], 330, 600),
  priced("tuna", ["tuna", "tinned tuna", "canned tuna"], 90, 145),
  priced("egg", ["egg", "eggs"], 240, 696),
  priced("rice", ["rice", "long grain rice", "basmati rice"], 130, 1000),
  priced("microwave rice", ["microwave rice", "rice pouch", "rice portion"], 70, 250),
  priced("couscous", ["couscous"], 100, 500),
  priced("noodles", ["noodles", "egg noodles"], 120, 500),
  priced("oats", ["oats", "porridge oats"], 90, 1000),
  priced("bread", ["bread", "wholegrain roll", "roll"], 75, 800),
  priced("flatbread", ["flatbread", "pita", "pitta"], 95, 300),
  priced("tortilla wrap", ["tortilla wrap", "wrap", "wraps"], 120, 360),
  priced("potato", ["potato", "potatoes"], 95, 2500),
  priced("jacket potato", ["jacket potato", "baking potato"], 100, 1000),
  priced("broccoli", ["broccoli"], 80, 350),
  priced("carrot", ["carrot", "carrots", "carrot sticks"], 55, 1000),
  priced("cucumber", ["cucumber"], 65, 300),
  priced("lettuce", ["lettuce"], 75, 250),
  priced("salad leaves", ["salad leaves", "salad", "side salad", "grain salad"], 120, 200),
  priced("spinach", ["spinach", "frozen greens"], 150, 500),
  priced("tomato", ["tomato", "tomatoes", "chopped tomatoes", "tomato salsa"], 75, 400),
  priced("pepper", ["pepper", "peppers", "frozen peppers", "bell pepper", "red pepper", "green pepper"], 160, 480),
  priced("peas", ["peas", "frozen peas"], 100, 900),
  priced("sweetcorn", ["sweetcorn", "corn"], 80, 325),
  priced("edamame", ["edamame"], 180, 300),
  priced("mixed vegetables", ["mixed vegetables", "vegetables"], 120, 1000),
  priced("mixed beans", ["mixed beans", "beans", "bean filling"], 85, 400),
  priced("baked beans", ["baked beans"], 45, 400),
  priced("chickpeas", ["chickpeas", "chickpea"], 65, 400),
  priced("lentils", ["lentils", "red lentils"], 160, 1000),
  priced("hummus", ["hummus", "yoghurt dressing"], 140, 200),
  priced("peanut butter", ["peanut butter"], 180, 340),
  priced("yoghurt", ["yoghurt", "yogurt", "greek yoghurt"], 170, 500),
  priced("oat milk", ["oat milk"], 145, 1000),
  priced("cheese", ["cheese", "cheddar", "cheddar cheese"], 240, 400),
  priced("banana", ["banana", "bananas"], 90, 1000),
  priced("apple", ["apple", "apples"], 160, 1000),
  priced("berries", ["berries", "berry", "frozen berries"], 250, 500),
  priced("soy sauce", ["soy sauce"], 180, 150),
  priced("lemon juice", ["lemon juice", "lemon"], 30, 120),
  priced("lime", ["lime", "lime or vinegar"], 25, 80),
  priced("oil", ["oil", "olive oil", "vegetable oil", "sunflower oil"], 225, 1000),
  priced("spice", ["spice", "spices", "smoked paprika", "black pepper", "pepper sachet", "hot sauce"], 100, 100, "low"),
  priced("vegetable sushi", ["vegetable sushi", "vegetable sushi pieces"], 250, 180, "low"),
];

export const ingredientPriceTable: IngredientPriceRecord[] = [
  ...tescoIngredientPriceTable,
  ...seededIngredientPriceTable,
];
