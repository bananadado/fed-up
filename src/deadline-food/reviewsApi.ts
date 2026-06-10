import { firebaseFunctionUrl } from "@/adapters/deadlineFoodApi";

import type { RecipeReview } from "./types";

// Reviews are stored in Firestore only (issue #123): they are global and persist
// across reloads, rather than living in per-session local state.

export type RecipeReviewsResult = {
  reviews: RecipeReview[];
  rating: number;
};

function reviewsUrl(): string {
  return firebaseFunctionUrl("deadlineFoodRecipeReviews", "/api/deadline-food/recipe-reviews");
}

async function readJson(response: Response, label: string): Promise<RecipeReviewsResult> {
  if (!response.ok) {
    throw new Error(`${label} request failed with ${response.status}`);
  }

  const body = (await response.json()) as Partial<RecipeReviewsResult>;
  return {
    reviews: Array.isArray(body.reviews) ? body.reviews : [],
    rating: typeof body.rating === "number" ? body.rating : 0,
  };
}

export async function fetchRecipeReviews(recipeId: string): Promise<RecipeReviewsResult> {
  const url = `${reviewsUrl()}?recipeId=${encodeURIComponent(recipeId)}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  return readJson(response, "Recipe reviews");
}

export async function submitRecipeReview(input: {
  recipeId: string;
  author: string;
  rating: number;
  comment: string;
}): Promise<RecipeReviewsResult> {
  const response = await fetch(reviewsUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipeId: input.recipeId,
      review: { author: input.author, rating: input.rating, comment: input.comment },
    }),
  });
  return readJson(response, "Submit recipe review");
}
