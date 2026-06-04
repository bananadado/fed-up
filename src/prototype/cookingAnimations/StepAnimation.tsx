// Renders the animation for one recipe step as a locally AI-generated, looping
// WebP (see tools/cooking-anim). The clip is chosen procedurally from the step's
// classified {action, object}: a food-specific clip if one exists, else the
// action-level clip, else generic. Honours prefers-reduced-motion via the poster
// (first-frame still). Renders nothing if no animation set has been generated yet.

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import { ANIMATIONS } from "./generated";
import type { CookingActionType, StepClassification } from "./classifyStep";

const ACTION_VERBS: Record<CookingActionType, string> = {
  boil: "Boiling",
  fry: "Frying",
  chop: "Chopping",
  pour: "Adding",
  mix: "Mixing",
  bake: "Roasting",
  season: "Seasoning",
  drain: "Draining",
  microwave: "Microwaving",
  assemble: "Assembling",
  serve: "Serving",
  generic: "Cooking",
};

/** Resolve {action, object} to a generated clip id, most specific first. */
function resolveAnimationId(action: CookingActionType, object: string | null): string | null {
  const candidates = object ? [`${action}_${object}`, action, "generic"] : [action, "generic"];
  return candidates.find((id) => id in ANIMATIONS) ?? null;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export type StepAnimationProps = StepClassification & {
  className?: string;
};

export function StepAnimation({ action, object, objectLabel, className }: StepAnimationProps) {
  const reducedMotion = usePrefersReducedMotion();
  const id = resolveAnimationId(action, object);
  const animation = id ? ANIMATIONS[id] : undefined;
  if (!animation) return null;

  const verb = ACTION_VERBS[action];
  const label = objectLabel ? `${verb} ${objectLabel}` : verb;

  return (
    <img
      src={reducedMotion ? animation.poster : animation.src}
      alt={label}
      title={label}
      loading="lazy"
      decoding="async"
      className={cn("aspect-[3/2] w-full bg-stone-100 object-cover", className)}
    />
  );
}
