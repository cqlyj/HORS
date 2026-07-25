export function extractAssuranceChallenge(inputRequests: unknown): unknown {
  if (!inputRequests || typeof inputRequests !== "object") {
    return inputRequests;
  }
  const assurance = (inputRequests as { assurance?: unknown }).assurance;
  if (!assurance || typeof assurance !== "object") {
    return inputRequests;
  }
  const rec = assurance as Record<string, unknown>;
  const message =
    typeof rec.message === "string"
      ? rec.message
      : typeof rec.params === "object" &&
          rec.params &&
          typeof (rec.params as { message?: string }).message === "string"
        ? (rec.params as { message: string }).message
        : undefined;
  if (message) {
    try {
      return JSON.parse(message);
    } catch {
      return message;
    }
  }
  return assurance;
}
