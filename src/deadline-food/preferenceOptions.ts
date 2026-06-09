type FoodPreferenceGroup = "likes" | "dislikes";

const incompatibleRecommendedOptionsByDiet: Record<string, Partial<Record<FoodPreferenceGroup, string[]>>> = {
  vegetarian: {
    dislikes: ["Fish"],
  },
  vegan: {
    likes: ["Omelettes"],
    dislikes: ["Fish"],
  },
  "gluten-free": {
    likes: ["Pasta", "Sandwiches", "Instant noodles", "Wraps", "Toast / cereal"],
  },
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function filterFoodPreferenceOptions(options: string[], dietaryRequirements: string[], group: FoodPreferenceGroup) {
  const hiddenOptions = new Set(
    dietaryRequirements.flatMap((requirement) => incompatibleRecommendedOptionsByDiet[normalize(requirement)]?.[group] ?? []),
  );

  return options.filter((option) => !hiddenOptions.has(option));
}
