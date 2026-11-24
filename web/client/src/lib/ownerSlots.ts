export type OwnerSlotDraft = {
  courtId: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  price: string;
  status: "AVAILABLE" | "BLOCKED";
};

export function validateOwnerSlot(draft: OwnerSlotDraft): string | undefined {
  if (!draft.courtId) return "Choose a court before adding a time slot.";
  if (!draft.slotDate) return "Choose the date for this time slot.";
  if (!draft.startTime || !draft.endTime || draft.startTime >= draft.endTime) return "End time must be later than start time.";
  const price = Number(draft.price);
  if (!Number.isFinite(price) || price < 0) return "Set a non-negative slot price.";
  return undefined;
}

export function isOwnerMutableSlot(status: string): boolean {
  return status !== "BOOKED" && status !== "HELD";
}

export function formatOwnerSlotTime(value: string): string {
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return value;
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}
