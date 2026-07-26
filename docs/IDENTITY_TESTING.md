# Identity Check testing — HORS Call Home

`home.emergency` is an exceptional transfer function protected by:

```ts
{ origin: "same-human", assurance: "identity", executor: "0g" }
```

The policy uses Identity Check as a risk gate for one sensitive invocation, not
as generic login.

## Data requested

Call Home currently supplies an empty Identity attribute list:

```json
{
  "assurance": "identity",
  "identityAttributes": []
}
```

It therefore requests only document-backed Identity attestation for this call.
It does not request or claim age, nationality, issuing country, document type,
document number, name, or a document image.

The World account must already hold a supported document credential. In the
completed test, that meant adding and verifying a passport before scanning.

## The binding that does—and does not—exist

AgentBook resolves the caller wallet to a `humanId`; Identity Check returns an
RP/action-scoped nullifier. These intentionally unlinkable identifiers cannot
be compared. HORS therefore verifies two separate facts:

1. the caller belongs to the configured anonymous human origin; and
2. a valid Identity proof approves this caller, function, arguments, and call
   ID.

The call signal provides the second binding. It does not prove that the
document holder and AgentBook human are cryptographically the same person. The
optional HORS enrollment record is an owner-authorized administrative
association, not identity equality; Call Home does not configure it.

Reference: [World ID nullifier
scope](https://docs.world.org/world-id/idkit/integrate#step-6-store-the-nullifier).

## Completed end-to-end test

Initial `home.emergency` runs reached the real policy gate:

```text
step-up-required · same-human · assurance identity · executor 0g
```

A subsequent operator test completed the full flow:

| Stage | Observed result |
| --- | --- |
| Handoff | CLI rendered the Identity QR |
| Verification | World App completed Identity Check with the verified passport |
| Resume | CLI submitted the proof and original one-use request state |
| Execution | `home.emergency` resumed and passed the protected path |

This test establishes document-backed attestation for the invocation. Because
`identityAttributes` is empty, it does not establish any additional personal
attribute.

## Developer feedback

| Finding from development | Resulting rule |
| --- | --- |
| Reusing the Selfie field contract breaks Identity binding; the installed Identity preset uses `legacy_signal`. | Build and verify the signal according to the selected credential flow, never by analogy with another IDKit preset. |
| World verification returns credential-specific entries in `results[]`; accepting only a top-level success is insufficient. | Select a successful accepted credential, then verify its action, nullifier, and nested `signal_hash` and apply one-use replay protection. |
| A valid QR opened a blank World App screen when the operator's account had no verified passport. The app gave no explanation, so the failure initially looked like a phone or QR problem. | State the credential prerequisite before scanning and treat a blank handoff as an eligibility problem to diagnose, not immediate evidence of a broken QR. |

## User feedback

- **“Where is my QR?”** The first live attempt exposed raw challenge state
  instead of an actionable handoff. The direct CLI now renders the QR, polls
  World, and resumes automatically.
- **A blank World App screen gave no diagnosis.** The operator initially
  suspected the phone and repeated the test several times. The account was
  missing a verified passport; after one was added, the same flow passed.

The product lesson is concrete: display the QR in a human-visible terminal and
state the required World credential before the handoff. A blank World App
screen can indicate credential ineligibility rather than a broken QR.

## Reproduce

After completing the [Call Home
setup](../examples/call-home/README.md), run:

```bash
hors call openagents.eth home.emergency \
  '{"recipientAddress":"0xYourFreshWallet","amount":"0.02","reason":"lost access to my main inference wallet"}'
```

Before scanning, confirm that the World account has a verified passport or
another document credential accepted by the configured Identity flow. A valid
run renders the QR, completes Identity Check, resumes automatically, and
finishes the protected 0G execution and Galileo transfer.

Official reference: [World Identity Check
documentation](https://docs.world.org/world-id/idkit/credentials#identity-check-preview).
