const MAX_TIME_INPUT_MINUTES = 23 * 60 + 59;

export const clockTimeInputPattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export function minutesToTimeInputValue(minutes: number | null | undefined, maxMinutes = MAX_TIME_INPUT_MINUTES) {
  const numericMinutes = Number(minutes);
  const boundedMinutes = Math.min(
    Math.max(Number.isFinite(numericMinutes) ? Math.round(numericMinutes) : 0, 0),
    maxMinutes,
  );
  const hours = Math.floor(boundedMinutes / 60);
  const remainingMinutes = boundedMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(remainingMinutes).padStart(2, "0")}`;
}

export function timeInputValueToMinutes(value: string) {
  if (!clockTimeInputPattern.test(value)) {
    return 0;
  }

  const [hours, minutes] = value.split(":").map(Number);

  return (hours ?? 0) * 60 + (minutes ?? 0);
}
