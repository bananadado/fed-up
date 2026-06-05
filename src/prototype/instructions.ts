// Derive a "brief" cooking method from detailed recipe steps so the recipe view
// can offer a Brief vs Detailed toggle (issue #186). Brief keeps the first
// sentence of each step — the imperative gist — without inventing new content,
// so the transform stays deterministic and explainable.

// First sentence = text up to a terminator that is followed by whitespace and the
// start of a new sentence (a capital letter or opening quote/bracket). Splitting
// only before a capital avoids cutting at abbreviations like "approx. 5 minutes".
const SENTENCE_BREAK = /^.*?[.!?](?=\s+[A-Z"'(])/;
const MIN_BRIEF_LENGTH = 8;

export function briefInstruction(step: string): string {
  const trimmed = step.trim();
  const match = trimmed.match(SENTENCE_BREAK);

  if (match && match[0].trim().length >= MIN_BRIEF_LENGTH) {
    return match[0].trim();
  }

  return trimmed;
}

export function briefInstructions(steps: string[]): string[] {
  return steps.map(briefInstruction);
}

/**
 * True when at least one step would actually be shortened by the brief view, so
 * the toggle can be hidden for recipes whose steps are already terse.
 */
export function hasBriefVariant(steps: string[]): boolean {
  return steps.some((step) => briefInstruction(step) !== step.trim());
}
