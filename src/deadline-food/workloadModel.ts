import type { Deadline } from "./types";

const academicEventPatterns = [
  /\b(coursework|assignment|assessment|submission|submit|deadline|due|hand-?in)\b/i,
  /\b(exam|midterm|final|quiz|test|viva)\b/i,
  /\b(lecture|tutorial|seminar|lab|practical|workshop|class|revision|study)\b/i,
  /\b(module|course|supervision|supervisor|office hours|dissertation|thesis)\b/i,
  /\b(project|presentation|essay|report|write-?up|problem sheet|review)\b/i,
];

export function classifyImportedEvent(title: string): Deadline["eventType"] {
  return academicEventPatterns.some((pattern) => pattern.test(title)) ? "academic" : "general";
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
