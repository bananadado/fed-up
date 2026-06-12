import { cn } from "@/lib/utils";

import type { Meal } from "../types";

type MealThumbnailProps = {
  meal: Meal;
  className?: string;
  imageClassName?: string;
  iconClassName?: string;
};

export function MealThumbnail({
  meal,
  className,
  imageClassName,
  iconClassName,
}: MealThumbnailProps) {
  return (
    <span className={cn("inline-flex shrink-0 overflow-hidden rounded-md bg-emerald-50", className)}>
      {meal.photoUrl ? (
        <img
          src={meal.photoUrl}
          alt={meal.name}
          className={cn("h-full w-full object-cover", imageClassName)}
        />
      ) : (
        <span
          className={cn("flex h-full w-full items-center justify-center", iconClassName)}
          role="img"
          aria-label={`${meal.name} image`}
        >
          {meal.image}
        </span>
      )}
    </span>
  );
}
