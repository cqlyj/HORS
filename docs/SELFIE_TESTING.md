# Selfie Check testing — HORS Call Home

`home.borrow` is a funds-moving function protected by:

```ts
{ origin: "same-human", assurance: "selfie", executor: "0g" }
```

The three checks answer different questions. AgentKit verifies that the calling
agent belongs to the service owner's anonymous human origin. Selfie Check
requires a live person for this invocation. The handler then runs through
verified 0G execution. Selfie is a presence and continuity signal, not login,
identity, or KYC.

## The binding that does—and does not—exist

AgentBook resolves an agent wallet to a `humanId`. IDKit returns a nullifier
scoped to the World app and action. World intentionally makes nullifiers from
different apps or actions unlinkable, so HORS cannot compare or derive these
identifiers.

HORS verifies two separate facts:

1. the signed caller wallet resolves to the configured owner `humanId`; and
2. a valid Selfie proof is bound to the caller, function, arguments, and call
   ID.

The proof's `signal` provides the second binding. It does not cryptographically
prove that the person taking the selfie is the person behind the AgentBook
`humanId`.

The SDK also provides an optional owner-authorized enrollment ceremony that
records `{ humanId, enrollmentNullifier, signalHash }`. That record is an
auditable administrative association, not cross-product identity equality.
Call Home does not configure this optional enrollment.

Reference: [World ID nullifier
scope](https://docs.world.org/world-id/idkit/integrate#step-6-store-the-nullifier).

## Completed end-to-end test

The 25 July 2026 operator trace records the full protected path:

| UTC | Observed result |
| --- | --- |
| `21:57:39.800` | `step-up-required`: Selfie and 0G required |
| `21:58:00.480` | Original call resumed with proof and one-use request state |
| `21:58:14.245` | `executed`: `teeVerified: true`, provider `0xa48f01287233509FD694a22Bf840225062E67836` |

Challenge to final response took approximately **34.4 seconds**. The resumed
handler also returned a real Galileo transfer receipt.

## Developer feedback

| Finding from development | Resulting design |
| --- | --- |
| A server challenge is not a human handoff. Early clients showed a loading state or returned challenge JSON but never generated a usable QR. | The direct CLI calls IDKit, renders `connectorURI` in a human-visible terminal, polls World, and resumes the same invocation automatically. |
| The client originally lacked the World `appId`; after that was supplied, IDKit's browser-oriented loader failed on packaged `file:` WASM in Node. | Challenges now carry the app context and the CLI loads the packaged WASM from disk. |
| Early verification pre-hashed the signal, then read `signal_hash` from the wrong response level. Missing values could pass unchecked. | HORS supplies the raw signal, checks `responses[].signal_hash` fail-closed, selects an accepted credential result, and consumes its nullifier once. |
| AgentKit `humanId` and IDKit nullifiers are privacy-scoped identifiers from separate products. | Same-human origin and live call assurance remain explicit, separate checks; neither is described as proof of the other. |

## User feedback

The first live operator session reported that there was “no QR” and only a
loading state. A later agent-hosted flow had the same discoverability problem:
the QR could not be relied on inside the agent UI. That feedback established
the product boundary now stated in the CLI skill: the human runs assurance
gates in a visible terminal; the agent may prepare the command but does not
hide or replace the World App handoff.

After the terminal flow was repaired, the operator reported that Selfie was
working and deliberately skipped Identity. The current Call Home trace provides
the stronger machine evidence above: QR handoff, automatic resume, verified 0G
execution, and transfer completion. No camera-friction, cancellation, or
independent-attendee feedback is claimed.

## Reproduce

After completing the [Call Home
setup](../examples/call-home/README.md), run:

```bash
hors call openagents.eth home.borrow \
  '{"recipientAddress":"0xYourFreshWallet"}'
```

A valid evidence run ends with automatic resume, a real provider address,
`teeVerified: true`, and the transfer receipt.

Official reference: [World Selfie Check
documentation](https://docs.world.org/world-id/credentials/11).
