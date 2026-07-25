/**
 * Extract signal_hash from IDKit v4 proof payload.
 * @see https://docs.world.org/world-id/idkit/integrate — responses[].signal_hash
 */
export function extractSignalHash(proofPayload: string): string | undefined {
  try {
    const proof = JSON.parse(proofPayload) as Record<string, unknown>;
    const responses = proof.responses;
    if (!Array.isArray(responses) || responses.length === 0) return undefined;
    const first = responses[0] as Record<string, unknown>;
    return first.signal_hash != null ? String(first.signal_hash) : undefined;
  } catch {
    return undefined;
  }
}
