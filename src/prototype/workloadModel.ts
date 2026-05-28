import type { Deadline } from "./types";

export function classifyImportedEvent(title: string): Deadline["eventType"] {
  return /coursework|exam|quiz|deadline|submission|review|presentation|project/i.test(title) ? "academic" : "general";
}

export function workloadScore(deadline: Deadline): number {
  if (deadline.eventType === "general") return 0;

  const urgencyScore = deadline.urgency === "high" ? 3 : deadline.urgency === "medium" ? 2 : 1;
  return deadline.effortHours + urgencyScore;
}

export function workloadLabel(deadline: Deadline): string {
  const score = workloadScore(deadline);

  if (score >= 9) return "Busy academic day";
  if (score >= 5) return "Moderate study load";
  if (deadline.eventType === "academic") return "Light academic task";
  return "General calendar event";
}

export function cookingEffortReason(deadline: Deadline): string {
  if (deadline.eventType === "general") {
    return "This is marked as a general event, so it will not reduce cooking effort.";
  }

  return `${workloadLabel(deadline)} based on ${deadline.effortHours}h estimated effort and ${deadline.urgency} urgency. The planner uses this to favour faster meals nearby.`;
}
