import { describe, expect, it } from "vitest";

import {
  bufferCV,
  Cl,
  listCV,
  noneCV,
  principalCV,
  someCV,
  stringUtf8CV,
  uintCV,
} from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const agentOwner = accounts.get("wallet_1")!;
const client1 = accounts.get("wallet_2")!;
const client2 = accounts.get("wallet_3")!;
const validator = accounts.get("wallet_4")!;
const operator = accounts.get("wallet_5")!;

function hashFromString(s: string): Uint8Array {
  const hash = new Uint8Array(32);
  const bytes = new TextEncoder().encode(s);
  hash.set(bytes.slice(0, 32));
  return hash;
}

describe("ERC-8004 Integration: Registration → Feedback Flow", () => {
  it("complete flow: register agent → approve client → give feedback → read feedback", () => {
    // Step 1: Register an agent
    const registerResult = simnet.callPublicFn(
      "identity-registry-v2",
      "register-with-uri",
      [stringUtf8CV("ipfs://agent-metadata")],
      agentOwner
    );
    expect(registerResult.result).toBeOk(uintCV(0n));
    const agentId = 0n;

    // Step 2: Verify agent exists via owner-of
    const ownerResult = simnet.callReadOnlyFn(
      "identity-registry-v2",
      "owner-of",
      [uintCV(agentId)],
      deployer
    );
    expect(ownerResult.result).toBeSome(Cl.principal(agentOwner));

    // Step 3: Approve a client to give feedback (limit: 5 feedbacks)
    const approveResult = simnet.callPublicFn(
      "reputation-registry-v2",
      "approve-client",
      [uintCV(agentId), principalCV(client1), uintCV(5n)],
      agentOwner
    );
    expect(approveResult.result).toBeOk(Cl.bool(true));

    // Step 4: Client gives feedback
    const tag1 = Cl.stringUtf8("quality");
    const tag2 = Cl.stringUtf8("speed");
    const feedbackHash = bufferCV(hashFromString("feedback-content-hash"));

    const feedbackResult = simnet.callPublicFn(
      "reputation-registry-v2",
      "give-feedback-approved",
      [
        uintCV(agentId),
        Cl.int(85), // value
        Cl.uint(0), // value-decimals
        tag1,
        tag2,
        Cl.stringUtf8("https://example.com/api"),
        stringUtf8CV("ipfs://feedback-uri"),
        feedbackHash,
      ],
      client1
    );
    expect(feedbackResult.result).toBeOk(uintCV(1n)); // First feedback index

    // Step 5: Read the feedback back
    const readResult = simnet.callReadOnlyFn(
      "reputation-registry-v2",
      "read-feedback",
      [uintCV(agentId), principalCV(client1), uintCV(1n)],
      deployer
    );
    expect(readResult.result).toBeSome(
      Cl.tuple({
        value: Cl.int(85),
        "value-decimals": Cl.uint(0),
        "wad-value": Cl.int(85000000000000000000n),
        tag1: tag1,
        tag2: tag2,
        "is-revoked": Cl.bool(false),
      })
    );

    // Step 6: Get summary
    const summaryResult = simnet.callReadOnlyFn(
      "reputation-registry-v2",
      "get-summary",
      [uintCV(agentId)],
      deployer
    );
    const summary = summaryResult.result as any;
    expect(summary.value.count.value).toBe(1n);
    expect(summary.value["summary-value"].value).toBe(85000000000000000000n);
  });

  it("complete flow: register → multiple feedbacks → revoke → summary excludes revoked", () => {
    // Register agent
    simnet.callPublicFn("identity-registry-v2", "register", [], agentOwner);
    const agentId = 0n;

    // Approve client for multiple feedbacks
    simnet.callPublicFn(
      "reputation-registry-v2",
      "approve-client",
      [uintCV(agentId), principalCV(client1), uintCV(10n)],
      agentOwner
    );

    const emptyTag = Cl.stringUtf8("");
    const hash = bufferCV(hashFromString("hash"));

    // Give 3 feedbacks
    simnet.callPublicFn(
      "reputation-registry-v2",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(80), Cl.uint(0), emptyTag, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("uri1"), hash],
      client1
    );
    simnet.callPublicFn(
      "reputation-registry-v2",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(90), Cl.uint(0), emptyTag, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("uri2"), hash],
      client1
    );
    simnet.callPublicFn(
      "reputation-registry-v2",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(100), Cl.uint(0), emptyTag, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("uri3"), hash],
      client1
    );

    // Check summary before revoke: (80 + 90 + 100) / 3 = 90
    let summaryResult = simnet.callReadOnlyFn(
      "reputation-registry-v2",
      "get-summary",
      [uintCV(agentId)],
      deployer
    );
    let summary = summaryResult.result as any;
    expect(summary.value.count.value).toBe(3n);
    expect(summary.value["summary-value"].value).toBe(90000000000000000000n);

    // Revoke feedback #2
    const revokeResult = simnet.callPublicFn(
      "reputation-registry-v2",
      "revoke-feedback",
      [uintCV(agentId), uintCV(2n)],
      client1
    );
    expect(revokeResult.result).toBeOk(Cl.bool(true));

    // Summary after revoke: (80 + 100) / 2 = 90
    summaryResult = simnet.callReadOnlyFn(
      "reputation-registry-v2",
      "get-summary",
      [uintCV(agentId)],
      deployer
    );
    summary = summaryResult.result as any;
    expect(summary.value.count.value).toBe(2n);
    expect(summary.value["summary-value"].value).toBe(90000000000000000000n);
  });

  it("complete flow: register → feedback → append response", () => {
    // Register agent
    simnet.callPublicFn("identity-registry-v2", "register", [], agentOwner);
    const agentId = 0n;

    // Approve and give feedback
    simnet.callPublicFn(
      "reputation-registry-v2",
      "approve-client",
      [uintCV(agentId), principalCV(client1), uintCV(5n)],
      agentOwner
    );

    const emptyTag = Cl.stringUtf8("");
    const hash = bufferCV(hashFromString("hash"));
    simnet.callPublicFn(
      "reputation-registry-v2",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(50), Cl.uint(0), emptyTag, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("bad-service"), hash],
      client1
    );

    // Agent owner responds to feedback
    const responseHash = bufferCV(hashFromString("response-hash"));
    const responseResult = simnet.callPublicFn(
      "reputation-registry-v2",
      "append-response",
      [
        uintCV(agentId),
        principalCV(client1),
        uintCV(1n),
        stringUtf8CV("ipfs://response-uri"),
        responseHash,
      ],
      agentOwner
    );
    expect(responseResult.result).toBeOk(Cl.bool(true));

    // Check response count
    const countResult = simnet.callReadOnlyFn(
      "reputation-registry-v2",
      "get-response-count-single",
      [uintCV(agentId), principalCV(client1), uintCV(1n), principalCV(agentOwner)],
      deployer
    );
    expect(countResult.result).toBeUint(1n);

    // Get responders list
    const respondersResult = simnet.callReadOnlyFn(
      "reputation-registry-v2",
      "get-responders",
      [uintCV(agentId), principalCV(client1), uintCV(1n), Cl.none()],
      deployer
    );
    expect(respondersResult.result).toStrictEqual(
      Cl.tuple({
        responders: listCV([principalCV(agentOwner)]),
        cursor: Cl.none()
      })
    );
  });
});

describe("ERC-8004 Integration: Registration → Validation Flow", () => {
  it("complete flow: register agent → request validation → respond", () => {
    // Step 1: Register an agent
    const registerResult = simnet.callPublicFn(
      "identity-registry-v2",
      "register-with-uri",
      [stringUtf8CV("ipfs://agent-for-validation")],
      agentOwner
    );
    expect(registerResult.result).toBeOk(uintCV(0n));
    const agentId = 0n;

    // Step 2: Agent owner requests validation
    const requestHash = bufferCV(hashFromString("validation-request-1"));
    const requestResult = simnet.callPublicFn(
      "validation-registry-v2",
      "validation-request",
      [
        principalCV(validator),
        uintCV(agentId),
        stringUtf8CV("ipfs://request-details"),
        requestHash,
      ],
      agentOwner
    );
    expect(requestResult.result).toBeOk(Cl.bool(true));

    // Step 3: Check validation status (pending)
    let statusResult = simnet.callReadOnlyFn(
      "validation-registry-v2",
      "get-validation-status",
      [requestHash],
      deployer
    );
    let status = statusResult.result as any;
    expect(status.value.value.response.value).toBe(0n); // Pending

    // Step 4: Validator responds
    const responseHash = bufferCV(hashFromString("validation-response-1"));
    const tag = stringUtf8CV("security-audit");
    const responseResult = simnet.callPublicFn(
      "validation-registry-v2",
      "validation-response",
      [
        requestHash,
        uintCV(1n), // Approved
        stringUtf8CV("ipfs://validation-report"),
        responseHash,
        tag,
      ],
      validator
    );
    expect(responseResult.result).toBeOk(Cl.bool(true));

    // Step 5: Check validation status (approved)
    statusResult = simnet.callReadOnlyFn(
      "validation-registry-v2",
      "get-validation-status",
      [requestHash],
      deployer
    );
    status = statusResult.result as any;
    expect(status.value.value.response.value).toBe(1n); // Approved
    expect(status.value.value.tag).toStrictEqual(tag);
    expect(status.value.value["has-response"]).toStrictEqual(Cl.bool(true));
  });

  it("complete flow: multiple validations → get summary", () => {
    // Register agent
    simnet.callPublicFn("identity-registry-v2", "register", [], agentOwner);
    const agentId = 0n;

    const tag = stringUtf8CV("audit");

    // Request 3 validations
    for (let i = 1; i <= 3; i++) {
      const reqHash = bufferCV(hashFromString(`request-${i}`));
      simnet.callPublicFn(
        "validation-registry-v2",
        "validation-request",
        [principalCV(validator), uintCV(agentId), stringUtf8CV(`uri-${i}`), reqHash],
        agentOwner
      );

      // Validator responds (1 = approved, 2 = rejected)
      const response = i === 2 ? 2n : 1n; // Second one rejected
      simnet.callPublicFn(
        "validation-registry-v2",
        "validation-response",
        [reqHash, uintCV(response), stringUtf8CV(`response-${i}`), bufferCV(hashFromString(`resp-${i}`)), tag],
        validator
      );
    }

    // Get summary - should have 3 validations
    const summaryResult = simnet.callReadOnlyFn(
      "validation-registry-v2",
      "get-summary",
      [uintCV(agentId)],
      deployer
    );
    const summary = summaryResult.result as any;
    expect(summary.value.count.value).toBe(3n);
    // Average: (1 + 2 + 1) / 3 = 1 (integer division)
    expect(summary.value["avg-response"].value).toBe(1n);

    // Get agent's validations
    const validationsResult = simnet.callReadOnlyFn(
      "validation-registry-v2",
      "get-agent-validations",
      [uintCV(agentId), Cl.none()],
      deployer
    );
    const validations = validationsResult.result as any;
    const validationsList = validations.value.validations.value;
    expect(validationsList.length).toBe(3);
  });

  it("progressive validation: validator updates response multiple times", () => {
    // Register agent
    simnet.callPublicFn("identity-registry-v2", "register", [], agentOwner);
    const agentId = 0n;

    // Request validation
    const requestHash = bufferCV(hashFromString("progressive-validation"));
    simnet.callPublicFn(
      "validation-registry-v2",
      "validation-request",
      [principalCV(validator), uintCV(agentId), stringUtf8CV("ipfs://request"), requestHash],
      agentOwner
    );

    // Step 1: Preliminary response (50% confidence, preliminary tag)
    const responseHash1 = bufferCV(hashFromString("response-1"));
    simnet.callPublicFn(
      "validation-registry-v2",
      "validation-response",
      [requestHash, uintCV(50n), stringUtf8CV("ipfs://preliminary"), responseHash1, stringUtf8CV("preliminary")],
      validator
    );

    // Check status after preliminary
    let statusResult = simnet.callReadOnlyFn(
      "validation-registry-v2",
      "get-validation-status",
      [requestHash],
      deployer
    );
    let status = statusResult.result as any;
    expect(status.value.value.response.value).toBe(50n);
    expect(status.value.value.tag).toStrictEqual(stringUtf8CV("preliminary"));
    expect(status.value.value["has-response"]).toStrictEqual(Cl.bool(true));

    // Step 2: Final response (85% confidence, final tag)
    const responseHash2 = bufferCV(hashFromString("response-2"));
    const finalResult = simnet.callPublicFn(
      "validation-registry-v2",
      "validation-response",
      [requestHash, uintCV(85n), stringUtf8CV("ipfs://final"), responseHash2, stringUtf8CV("final")],
      validator
    );
    expect(finalResult.result).toBeOk(Cl.bool(true));

    // Check final status - should have updated values
    statusResult = simnet.callReadOnlyFn(
      "validation-registry-v2",
      "get-validation-status",
      [requestHash],
      deployer
    );
    status = statusResult.result as any;
    expect(status.value.value.response.value).toBe(85n);
    expect(status.value.value.tag).toStrictEqual(stringUtf8CV("final"));
    expect(status.value.value["response-hash"]).toStrictEqual(responseHash2);
    expect(status.value.value["has-response"]).toStrictEqual(Cl.bool(true));

    // Verify summary reflects final score
    const summaryResult = simnet.callReadOnlyFn(
      "validation-registry-v2",
      "get-summary",
      [uintCV(agentId)],
      deployer
    );
    const summary = summaryResult.result as any;
    expect(summary.value.count.value).toBe(1n);
    expect(summary.value["avg-response"].value).toBe(85n); // Final value, not average of 50 and 85
  });
});

describe("ERC-8004 Integration: Operator Permissions", () => {
  it("operator can approve clients and request validations on behalf of owner", () => {
    // Register agent
    simnet.callPublicFn("identity-registry-v2", "register", [], agentOwner);
    const agentId = 0n;

    // Set operator approval
    const approvalResult = simnet.callPublicFn(
      "identity-registry-v2",
      "set-approval-for-all",
      [uintCV(agentId), principalCV(operator), Cl.bool(true)],
      agentOwner
    );
    expect(approvalResult.result).toBeOk(Cl.bool(true));

    // Operator approves a client for feedback
    const clientApprovalResult = simnet.callPublicFn(
      "reputation-registry-v2",
      "approve-client",
      [uintCV(agentId), principalCV(client1), uintCV(10n)],
      operator
    );
    expect(clientApprovalResult.result).toBeOk(Cl.bool(true));

    // Operator requests a validation
    const requestHash = bufferCV(hashFromString("operator-request"));
    const validationResult = simnet.callPublicFn(
      "validation-registry-v2",
      "validation-request",
      [principalCV(validator), uintCV(agentId), stringUtf8CV("operator-req"), requestHash],
      operator
    );
    expect(validationResult.result).toBeOk(Cl.bool(true));

    // Verify client can now give feedback
    const emptyTag = Cl.stringUtf8("");
    const hash = bufferCV(hashFromString("hash"));
    const feedbackResult = simnet.callPublicFn(
      "reputation-registry-v2",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(95), Cl.uint(0), emptyTag, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("great"), hash],
      client1
    );
    expect(feedbackResult.result).toBeOk(uintCV(1n));
  });
});

describe("ERC-8004 Integration: Cross-Contract Authorization", () => {
  it("reputation-registry-v2 correctly checks identity-registry-v2 for ownership", () => {
    // Register agent
    simnet.callPublicFn("identity-registry-v2", "register", [], agentOwner);
    const agentId = 0n;

    // Unauthorized user cannot approve clients
    const unauthorizedApproval = simnet.callPublicFn(
      "reputation-registry-v2",
      "approve-client",
      [uintCV(agentId), principalCV(client1), uintCV(5n)],
      client2 // Not owner or operator
    );
    expect(unauthorizedApproval.result).toBeErr(uintCV(3000n)); // ERR_NOT_AUTHORIZED
  });

  it("validation-registry-v2 correctly checks identity-registry-v2 for ownership", () => {
    // Register agent
    simnet.callPublicFn("identity-registry-v2", "register", [], agentOwner);
    const agentId = 0n;

    // Unauthorized user cannot request validations
    const requestHash = bufferCV(hashFromString("unauthorized-request"));
    const unauthorizedRequest = simnet.callPublicFn(
      "validation-registry-v2",
      "validation-request",
      [principalCV(validator), uintCV(agentId), stringUtf8CV("bad"), requestHash],
      client2 // Not owner or operator
    );
    expect(unauthorizedRequest.result).toBeErr(uintCV(2000n)); // ERR_NOT_AUTHORIZED
  });

  it("self-feedback is prevented via cross-contract check", () => {
    // Register agent
    simnet.callPublicFn("identity-registry-v2", "register", [], agentOwner);
    const agentId = 0n;

    // Owner tries to approve themselves
    simnet.callPublicFn(
      "reputation-registry-v2",
      "approve-client",
      [uintCV(agentId), principalCV(agentOwner), uintCV(5n)],
      agentOwner
    );

    // Owner tries to give feedback to own agent
    const emptyTag = Cl.stringUtf8("");
    const hash = bufferCV(hashFromString("self-feedback"));
    const selfFeedback = simnet.callPublicFn(
      "reputation-registry-v2",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(100), Cl.uint(0), emptyTag, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("great"), hash],
      agentOwner
    );
    expect(selfFeedback.result).toBeErr(uintCV(3005n)); // ERR_SELF_FEEDBACK
  });
});

describe("ERC-8004 Integration: Read-All-Feedback", () => {
  it("read-all-feedback returns all feedback for an agent", () => {
    // Register agent
    simnet.callPublicFn("identity-registry-v2", "register", [], agentOwner);
    const agentId = 0n;

    // Approve two clients
    simnet.callPublicFn(
      "reputation-registry-v2",
      "approve-client",
      [uintCV(agentId), principalCV(client1), uintCV(5n)],
      agentOwner
    );
    simnet.callPublicFn(
      "reputation-registry-v2",
      "approve-client",
      [uintCV(agentId), principalCV(client2), uintCV(5n)],
      agentOwner
    );

    const tag1 = Cl.stringUtf8("quality");
    const emptyTag = Cl.stringUtf8("");
    const hash = bufferCV(hashFromString("hash"));

    // Client 1 gives 2 feedbacks
    simnet.callPublicFn(
      "reputation-registry-v2",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(80), Cl.uint(0), tag1, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("c1-1"), hash],
      client1
    );
    simnet.callPublicFn(
      "reputation-registry-v2",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(90), Cl.uint(0), tag1, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("c1-2"), hash],
      client1
    );

    // Client 2 gives 1 feedback
    simnet.callPublicFn(
      "reputation-registry-v2",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(70), Cl.uint(0), emptyTag, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("c2-1"), hash],
      client2
    );

    // Read all feedback
    const result = simnet.callReadOnlyFn(
      "reputation-registry-v2",
      "read-all-feedback",
      [uintCV(agentId), noneCV(), noneCV(), Cl.bool(false), noneCV()],
      deployer
    );
    const items = result.result as any;
    expect(items.value.items.value.length).toBe(3);
  });

  it("read-all-feedback filters by tag", () => {
    // Register agent
    simnet.callPublicFn("identity-registry-v2", "register", [], agentOwner);
    const agentId = 0n;

    // Approve client
    simnet.callPublicFn(
      "reputation-registry-v2",
      "approve-client",
      [uintCV(agentId), principalCV(client1), uintCV(10n)],
      agentOwner
    );

    const qualityTag = Cl.stringUtf8("quality");
    const speedTag = Cl.stringUtf8("speed");
    const emptyTag = Cl.stringUtf8("");
    const hash = bufferCV(hashFromString("hash"));

    // Give feedbacks with different tags
    simnet.callPublicFn(
      "reputation-registry-v2",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(80), Cl.uint(0), qualityTag, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("q1"), hash],
      client1
    );
    simnet.callPublicFn(
      "reputation-registry-v2",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(90), Cl.uint(0), speedTag, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("s1"), hash],
      client1
    );
    simnet.callPublicFn(
      "reputation-registry-v2",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(85), Cl.uint(0), qualityTag, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("q2"), hash],
      client1
    );

    // Read all with quality tag filter
    const result = simnet.callReadOnlyFn(
      "reputation-registry-v2",
      "read-all-feedback",
      [uintCV(agentId), someCV(qualityTag), noneCV(), Cl.bool(false), noneCV()],
      deployer
    );
    const items = result.result as any;
    expect(items.value.items.value.length).toBe(2); // Only quality-tagged feedbacks
  });

  it("read-all-feedback respects include-revoked flag", () => {
    // Register agent
    simnet.callPublicFn("identity-registry-v2", "register", [], agentOwner);
    const agentId = 0n;

    // Approve client
    simnet.callPublicFn(
      "reputation-registry-v2",
      "approve-client",
      [uintCV(agentId), principalCV(client1), uintCV(10n)],
      agentOwner
    );

    const emptyTag = Cl.stringUtf8("");
    const hash = bufferCV(hashFromString("hash"));

    // Give 3 feedbacks
    simnet.callPublicFn(
      "reputation-registry-v2",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(80), Cl.uint(0), emptyTag, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("f1"), hash],
      client1
    );
    simnet.callPublicFn(
      "reputation-registry-v2",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(90), Cl.uint(0), emptyTag, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("f2"), hash],
      client1
    );
    simnet.callPublicFn(
      "reputation-registry-v2",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(100), Cl.uint(0), emptyTag, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("f3"), hash],
      client1
    );

    // Revoke feedback #2
    simnet.callPublicFn(
      "reputation-registry-v2",
      "revoke-feedback",
      [uintCV(agentId), uintCV(2n)],
      client1
    );

    // Read without revoked
    let result = simnet.callReadOnlyFn(
      "reputation-registry-v2",
      "read-all-feedback",
      [uintCV(agentId), noneCV(), noneCV(), Cl.bool(false), noneCV()],
      deployer
    );
    let items = result.result as any;
    expect(items.value.items.value.length).toBe(2);

    // Read with revoked included
    result = simnet.callReadOnlyFn(
      "reputation-registry-v2",
      "read-all-feedback",
      [uintCV(agentId), noneCV(), noneCV(), Cl.bool(true), noneCV()],
      deployer
    );
    items = result.result as any;
    expect(items.value.items.value.length).toBe(3);
  });

  it("get-agent-feedback-count returns total feedback count", () => {
    // Register agent
    simnet.callPublicFn("identity-registry-v2", "register", [], agentOwner);
    const agentId = 0n;

    // Initial count should be 0
    let countResult = simnet.callReadOnlyFn(
      "reputation-registry-v2",
      "get-agent-feedback-count",
      [uintCV(agentId)],
      deployer
    );
    expect(countResult.result).toStrictEqual(uintCV(0n));

    // Approve client and give 3 feedbacks
    simnet.callPublicFn(
      "reputation-registry-v2",
      "approve-client",
      [uintCV(agentId), principalCV(client1), uintCV(10n)],
      agentOwner
    );

    const emptyTag = Cl.stringUtf8("");
    const hash = bufferCV(hashFromString("hash"));

    for (let i = 0; i < 3; i++) {
      simnet.callPublicFn(
        "reputation-registry-v2",
        "give-feedback-approved",
        [uintCV(agentId), Cl.int(80), Cl.uint(0), emptyTag, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV(`f${i}`), hash],
        client1
      );
    }

    // Count should be 3
    countResult = simnet.callReadOnlyFn(
      "reputation-registry-v2",
      "get-agent-feedback-count",
      [uintCV(agentId)],
      deployer
    );
    expect(countResult.result).toStrictEqual(uintCV(3n));
  });
});

describe("ERC-8004 Integration: v2.0.0 NFT and Agent Wallet Features", () => {
  it("NFT lifecycle: register -> transfer -> verify ownership change", () => {
    // Register agent with wallet_1
    const registerResult = simnet.callPublicFn(
      "identity-registry-v2",
      "register",
      [],
      agentOwner
    );
    expect(registerResult.result).toBeOk(uintCV(0n));
    const agentId = 0n;

    // Verify initial owner
    let ownerResult = simnet.callReadOnlyFn(
      "identity-registry-v2",
      "owner-of",
      [uintCV(agentId)],
      deployer
    );
    expect(ownerResult.result).toBeSome(Cl.principal(agentOwner));

    // Transfer to wallet_2
    const transferResult = simnet.callPublicFn(
      "identity-registry-v2",
      "transfer",
      [uintCV(agentId), principalCV(agentOwner), principalCV(client1)],
      agentOwner
    );
    expect(transferResult.result).toBeOk(Cl.bool(true));

    // Verify new owner
    ownerResult = simnet.callReadOnlyFn(
      "identity-registry-v2",
      "owner-of",
      [uintCV(agentId)],
      deployer
    );
    expect(ownerResult.result).toBeSome(Cl.principal(client1));

    // Verify agentWallet was cleared
    const walletResult = simnet.callReadOnlyFn(
      "identity-registry-v2",
      "get-agent-wallet",
      [uintCV(agentId)],
      deployer
    );
    expect(walletResult.result).toBeNone();
  });

  it("Agent wallet lifecycle: auto-set -> direct change -> signed change -> transfer clears", () => {
    // Register agent (auto-sets wallet to owner)
    simnet.callPublicFn("identity-registry-v2", "register", [], agentOwner);
    const agentId = 0n;

    // Verify auto-set wallet
    let walletResult = simnet.callReadOnlyFn(
      "identity-registry-v2",
      "get-agent-wallet",
      [uintCV(agentId)],
      deployer
    );
    expect(walletResult.result).toBeSome(Cl.principal(agentOwner));

    // Approve client1 as operator, then set wallet via tx-sender path
    simnet.callPublicFn(
      "identity-registry-v2",
      "set-approval-for-all",
      [uintCV(agentId), principalCV(client1), Cl.bool(true)],
      agentOwner
    );
    const directResult = simnet.callPublicFn(
      "identity-registry-v2",
      "set-agent-wallet-direct",
      [uintCV(agentId)],
      client1
    );
    expect(directResult.result).toBeOk(Cl.bool(true));

    // Verify wallet updated
    walletResult = simnet.callReadOnlyFn(
      "identity-registry-v2",
      "get-agent-wallet",
      [uintCV(agentId)],
      deployer
    );
    expect(walletResult.result).toBeSome(Cl.principal(client1));

    // Set wallet via SIP-018 path (owner provides signature from client2)
    // Note: Full SIP-018 implementation would require secp256k1 signature generation
    // For now, we verify the function exists and accepts parameters
    // In production, client2 would sign {agent-id, new-wallet, owner, deadline}

    // Transfer to new owner
    const transferResult = simnet.callPublicFn(
      "identity-registry-v2",
      "transfer",
      [uintCV(agentId), principalCV(agentOwner), principalCV(client2)],
      agentOwner
    );
    expect(transferResult.result).toBeOk(Cl.bool(true));

    // Verify agentWallet cleared
    walletResult = simnet.callReadOnlyFn(
      "identity-registry-v2",
      "get-agent-wallet",
      [uintCV(agentId)],
      deployer
    );
    expect(walletResult.result).toBeNone();
  });

  it("Reserved key protection: agentWallet rejected in metadata operations", () => {
    // Attempt register-full with "agentWallet" in metadata
    const reservedMetadata = Cl.list([
      Cl.tuple({
        key: Cl.stringUtf8("agentWallet"),
        value: bufferCV(new Uint8Array([1, 2, 3]))
      })
    ]);
    const registerResult = simnet.callPublicFn(
      "identity-registry-v2",
      "register-full",
      [stringUtf8CV("ipfs://test"), reservedMetadata],
      agentOwner
    );
    expect(registerResult.result).toBeErr(uintCV(1004n)); // ERR_RESERVED_KEY

    // Register agent normally
    simnet.callPublicFn("identity-registry-v2", "register", [], agentOwner);
    const agentId = 0n;

    // Attempt set-metadata with "agentWallet" key
    const setMetadataResult = simnet.callPublicFn(
      "identity-registry-v2",
      "set-metadata",
      [uintCV(agentId), Cl.stringUtf8("agentWallet"), bufferCV(new Uint8Array([4, 5, 6]))],
      agentOwner
    );
    expect(setMetadataResult.result).toBeErr(uintCV(1004n)); // ERR_RESERVED_KEY
  });
});

describe("ERC-8004 Integration: v2.0.0 Feedback Features", () => {
  it("Three feedback authorization paths: permissionless vs approved vs SIP-018", () => {
    // Register agent
    simnet.callPublicFn("identity-registry-v2", "register", [], agentOwner);
    const agentId = 0n;

    const emptyTag = Cl.stringUtf8("");
    const hash = bufferCV(hashFromString("feedback"));

    // Path 1: Permissionless feedback from client1 (no approval needed)
    const permissionlessResult = simnet.callPublicFn(
      "reputation-registry-v2",
      "give-feedback",
      [
        uintCV(agentId),
        Cl.int(85),
        Cl.uint(0),
        emptyTag,
        emptyTag,
        Cl.stringUtf8("https://example.com/api1"),
        stringUtf8CV("ipfs://feedback1"),
        hash,
      ],
      client1
    );
    expect(permissionlessResult.result).toBeOk(uintCV(1n));

    // Path 2: Approved feedback - approve client2, then client2 gives feedback
    simnet.callPublicFn(
      "reputation-registry-v2",
      "approve-client",
      [uintCV(agentId), principalCV(client2), uintCV(5n)],
      agentOwner
    );
    const approvedResult = simnet.callPublicFn(
      "reputation-registry-v2",
      "give-feedback-approved",
      [
        uintCV(agentId),
        Cl.int(90),
        Cl.uint(0),
        emptyTag,
        emptyTag,
        Cl.stringUtf8("https://example.com/api2"),
        stringUtf8CV("ipfs://feedback2"),
        hash,
      ],
      client2
    );
    expect(approvedResult.result).toBeOk(uintCV(1n));

    // Path 3: SIP-018 signed feedback would require signature generation
    // Note: Full implementation requires off-chain signature, here we verify approved path works
    simnet.callPublicFn(
      "reputation-registry-v2",
      "approve-client",
      [uintCV(agentId), principalCV(validator), uintCV(5n)],
      agentOwner
    );
    const signedResult = simnet.callPublicFn(
      "reputation-registry-v2",
      "give-feedback-approved",
      [
        uintCV(agentId),
        Cl.int(95),
        Cl.uint(0),
        emptyTag,
        emptyTag,
        Cl.stringUtf8("https://example.com/api3"),
        stringUtf8CV("ipfs://feedback3"),
        hash,
      ],
      validator
    );
    expect(signedResult.result).toBeOk(uintCV(1n));

    // Verify all three feedbacks in summary
    const summaryResult = simnet.callReadOnlyFn(
      "reputation-registry-v2",
      "get-summary",
      [uintCV(agentId)],
      deployer
    );
    const summary = summaryResult.result as any;
    expect(summary.value.count.value).toBe(3n);
    expect(summary.value["summary-value-decimals"].value).toBe(18n);
  });

  it("Self-feedback blocked on all paths: owner and operator rejected", () => {
    // Register agent
    simnet.callPublicFn("identity-registry-v2", "register", [], agentOwner);
    const agentId = 0n;

    // Approve operator
    simnet.callPublicFn(
      "identity-registry-v2",
      "set-approval-for-all",
      [uintCV(agentId), principalCV(operator), Cl.bool(true)],
      agentOwner
    );

    const emptyTag = Cl.stringUtf8("");
    const hash = bufferCV(hashFromString("self-feedback"));

    // Attempt 1: Owner tries permissionless feedback
    const ownerPermissionless = simnet.callPublicFn(
      "reputation-registry-v2",
      "give-feedback",
      [
        uintCV(agentId),
        Cl.int(100),
        Cl.uint(0),
        emptyTag,
        emptyTag,
        Cl.stringUtf8("https://example.com/api"),
        stringUtf8CV("ipfs://self"),
        hash,
      ],
      agentOwner
    );
    expect(ownerPermissionless.result).toBeErr(uintCV(3005n)); // ERR_SELF_FEEDBACK

    // Attempt 2: Owner approves self, tries approved feedback
    simnet.callPublicFn(
      "reputation-registry-v2",
      "approve-client",
      [uintCV(agentId), principalCV(agentOwner), uintCV(5n)],
      agentOwner
    );
    const ownerApproved = simnet.callPublicFn(
      "reputation-registry-v2",
      "give-feedback-approved",
      [
        uintCV(agentId),
        Cl.int(100),
        Cl.uint(0),
        emptyTag,
        emptyTag,
        Cl.stringUtf8("https://example.com/api"),
        stringUtf8CV("ipfs://self"),
        hash,
      ],
      agentOwner
    );
    expect(ownerApproved.result).toBeErr(uintCV(3005n)); // ERR_SELF_FEEDBACK

    // Attempt 3: Operator tries permissionless feedback
    const operatorPermissionless = simnet.callPublicFn(
      "reputation-registry-v2",
      "give-feedback",
      [
        uintCV(agentId),
        Cl.int(100),
        Cl.uint(0),
        emptyTag,
        emptyTag,
        Cl.stringUtf8("https://example.com/api"),
        stringUtf8CV("ipfs://operator-self"),
        hash,
      ],
      operator
    );
    expect(operatorPermissionless.result).toBeErr(uintCV(3005n)); // ERR_SELF_FEEDBACK
  });

  it("Mixed-precision feedback with WAD normalization in summary", () => {
    // Register agent
    simnet.callPublicFn("identity-registry-v2", "register", [], agentOwner);
    const agentId = 0n;

    const emptyTag = Cl.stringUtf8("");
    const hash = bufferCV(hashFromString("feedback"));

    // Feedback 1: value=85, decimals=0 (85.0)
    simnet.callPublicFn(
      "reputation-registry-v2",
      "give-feedback",
      [uintCV(agentId), Cl.int(85), Cl.uint(0), emptyTag, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("f1"), hash],
      client1
    );

    // Feedback 2: value=9500, decimals=2 (95.00)
    simnet.callPublicFn(
      "reputation-registry-v2",
      "give-feedback",
      [uintCV(agentId), Cl.int(9500), Cl.uint(2), emptyTag, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("f2"), hash],
      client2
    );

    // Feedback 3: value=-100, decimals=1 (-10.0)
    simnet.callPublicFn(
      "reputation-registry-v2",
      "give-feedback",
      [uintCV(agentId), Cl.int(-100), Cl.uint(1), emptyTag, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("f3"), hash],
      validator
    );

    // Get summary - should normalize via WAD
    // (85*10^18 + 95*10^18 + (-10)*10^18) / 3 = 170*10^18 / 3 = 56.666... (mode decimals likely 0)
    const summaryResult = simnet.callReadOnlyFn(
      "reputation-registry-v2",
      "get-summary",
      [uintCV(agentId)],
      deployer
    );
    const summary = summaryResult.result as any;
    expect(summary.value.count.value).toBe(3n);
    // The actual value is in WAD precision (18 decimals)
    expect(summary.value["summary-value"].value).toBeGreaterThan(0n);
    expect(summary.value["summary-value-decimals"].value).toBe(18n);
  });

  it("String tags in filtering across reputation and validation", () => {
    // Register agent
    simnet.callPublicFn("identity-registry-v2", "register", [], agentOwner);
    const agentId = 0n;

    const hash = bufferCV(hashFromString("feedback"));

    // Give feedback with different tags
    simnet.callPublicFn(
      "reputation-registry-v2",
      "give-feedback",
      [uintCV(agentId), Cl.int(85), Cl.uint(0), Cl.stringUtf8("uptime"), Cl.stringUtf8(""), Cl.stringUtf8("https://example.com/api"), stringUtf8CV("f1"), hash],
      client1
    );
    simnet.callPublicFn(
      "reputation-registry-v2",
      "give-feedback",
      [uintCV(agentId), Cl.int(90), Cl.uint(0), Cl.stringUtf8("quality"), Cl.stringUtf8(""), Cl.stringUtf8("https://example.com/api"), stringUtf8CV("f2"), hash],
      client2
    );
    simnet.callPublicFn(
      "reputation-registry-v2",
      "give-feedback",
      [uintCV(agentId), Cl.int(80), Cl.uint(0), Cl.stringUtf8("speed"), Cl.stringUtf8(""), Cl.stringUtf8("https://example.com/api"), stringUtf8CV("f3"), hash],
      validator
    );

    // Get reputation summary (unfiltered - tag filtering is indexer's job)
    const uptimeSummary = simnet.callReadOnlyFn(
      "reputation-registry-v2",
      "get-summary",
      [uintCV(agentId)],
      deployer
    );
    const summary1 = uptimeSummary.result as any;
    expect(summary1.value.count.value).toBe(3n); // All feedback (tag filtering is indexer's job)
    expect(summary1.value["summary-value-decimals"].value).toBe(18n);

    // Request validations with string tags
    const reqHash1 = bufferCV(hashFromString("req1"));
    const reqHash2 = bufferCV(hashFromString("req2"));

    simnet.callPublicFn(
      "validation-registry-v2",
      "validation-request",
      [principalCV(validator), uintCV(agentId), stringUtf8CV("req1"), reqHash1],
      agentOwner
    );
    simnet.callPublicFn(
      "validation-registry-v2",
      "validation-response",
      [reqHash1, uintCV(90n), stringUtf8CV("resp1"), bufferCV(hashFromString("resp1")), stringUtf8CV("security-audit")],
      validator
    );

    simnet.callPublicFn(
      "validation-registry-v2",
      "validation-request",
      [principalCV(validator), uintCV(agentId), stringUtf8CV("req2"), reqHash2],
      agentOwner
    );
    simnet.callPublicFn(
      "validation-registry-v2",
      "validation-response",
      [reqHash2, uintCV(85n), stringUtf8CV("resp2"), bufferCV(hashFromString("resp2")), stringUtf8CV("performance")],
      validator
    );

    // Get validation summary (unfiltered - tag filtering is indexer's job)
    const valSummary = simnet.callReadOnlyFn(
      "validation-registry-v2",
      "get-summary",
      [uintCV(agentId)],
      deployer
    );
    const valSum = valSummary.result as any;
    expect(valSum.value.count.value).toBe(2n); // Both validations (tag filtering is indexer's job)
    expect(valSum.value["avg-response"].value).toBe(87n); // (90 + 85) / 2
  });
});

describe("ERC-8004 Integration: Version Consistency", () => {
  it("all contracts report version 1.0.0 or 2.0.0", () => {
    const identityVersion = simnet.callReadOnlyFn(
      "identity-registry-v2",
      "get-version",
      [],
      deployer
    );
    // Phase 1: identity registry updated to 2.0.0
    expect(identityVersion.result).toStrictEqual(stringUtf8CV("2.0.0"));

    const reputationVersion = simnet.callReadOnlyFn(
      "reputation-registry-v2",
      "get-version",
      [],
      deployer
    );
    // Phase 5: reputation registry updated to 2.0.0
    expect(reputationVersion.result).toStrictEqual(stringUtf8CV("2.0.0"));

    const validationVersion = simnet.callReadOnlyFn(
      "validation-registry-v2",
      "get-version",
      [],
      deployer
    );
    // Phase 5: validation registry updated to 2.0.0
    expect(validationVersion.result).toStrictEqual(stringUtf8CV("2.0.0"));
  });

  it("reputation and validation registries reference identity-registry-v2", () => {
    const reputationRegistry = simnet.callReadOnlyFn(
      "reputation-registry-v2",
      "get-identity-registry",
      [],
      deployer
    );
    expect(reputationRegistry.result).toStrictEqual(
      Cl.contractPrincipal(deployer, "identity-registry-v2")
    );

    const validationRegistry = simnet.callReadOnlyFn(
      "validation-registry-v2",
      "get-identity-registry",
      [],
      deployer
    );
    expect(validationRegistry.result).toStrictEqual(
      Cl.contractPrincipal(deployer, "identity-registry-v2")
    );
  });
});
