import { seedMeals } from "./data";
import type { Deadline, Meal } from "./types";

export function parseICS(text: string): Deadline[] | null {
  const blocks = text.split("BEGIN:VEVENT").slice(1);
  const parsed = blocks.map((block, index) => {
    const title = (block.match(/SUMMARY:(.+)/)?.[1] || `Imported event ${index + 1}`).trim();
    const raw = block.match(/DTSTART(?:;[^:]*)?:(\d{8})(?:T(\d{4}))?/) || [];
    const date = raw[1] ? new Date(`${raw[1].slice(0, 4)}-${raw[1].slice(4, 6)}-${raw[1].slice(6, 8)}T12:00:00`) : null;
    const label = date ? date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "Upcoming";
    const time = raw[2] ? `${raw[2].slice(0, 2)}:${raw[2].slice(2, 4)}` : "All day";
    return { id: `ics-${index}`, title, date: label, time, intensity: "Imported", eventType: "general" as const, effortHours: 1, urgency: "medium" as const };
  });
  return parsed.length ? parsed.slice(0, 5) : null;
}

export function money(n: number) {
  return `£${n.toFixed(2)}`;
}

export function formatCookingLimit(minutes: number | null) {
  if (minutes === null) {
    return "Unlimited";
  }

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes === 0 ? `${hours} hr${hours === 1 ? "" : "s"}` : `${hours} hr ${remainingMinutes} min`;
  }

  return `${minutes} min`;
}

export function mealById(id: string, customRecipes: Meal[]) {
  return [...customRecipes, ...seedMeals].find((meal) => meal.id === id);
}

export function getMealById(id: string, customRecipes: Meal[]) {
  const meal = mealById(id, customRecipes);

  if (!meal) {
    return seedMeals[0] as Meal;
  }

  return meal;
}
