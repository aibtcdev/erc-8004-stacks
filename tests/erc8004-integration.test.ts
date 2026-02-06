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

function tagFromString(s: string): Uint8Array {
  const tag = new Uint8Array(32);
  const bytes = new TextEncoder().encode(s);
  tag.set(bytes.slice(0, 32));
  return tag;
}

describe("ERC-8004 Integration: Registration → Feedback Flow", () => {
  it("complete flow: register agent → approve client → give feedback → read feedback", () => {
    // Step 1: Register an agent
    const registerResult = simnet.callPublicFn(
      "identity-registry",
      "register-with-uri",
      [stringUtf8CV("ipfs://agent-metadata")],
      agentOwner
    );
    expect(registerResult.result).toBeOk(uintCV(0n));
    const agentId = 0n;

    // Step 2: Verify agent exists via owner-of
    const ownerResult = simnet.callReadOnlyFn(
      "identity-registry",
      "owner-of",
      [uintCV(agentId)],
      deployer
    );
    expect(ownerResult.result).toBeSome(Cl.principal(agentOwner));

    // Step 3: Approve a client to give feedback (limit: 5 feedbacks)
    const approveResult = simnet.callPublicFn(
      "reputation-registry",
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
      "reputation-registry",
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
      "reputation-registry",
      "read-feedback",
      [uintCV(agentId), principalCV(client1), uintCV(1n)],
      deployer
    );
    expect(readResult.result).toBeSome(
      Cl.tuple({
        value: Cl.int(85),
        "value-decimals": Cl.uint(0),
        tag1: tag1,
        tag2: tag2,
        "is-revoked": Cl.bool(false),
      })
    );

    // Step 6: Get summary
    const summaryResult = simnet.callReadOnlyFn(
      "reputation-registry",
      "get-summary",
      [uintCV(agentId), noneCV(), noneCV(), noneCV()],
      deployer
    );
    const summary = summaryResult.result as any;
    expect(summary.value.count.value).toBe(1n);
    expect(summary.value["summary-value"].value).toBe(85n);
  });

  it("complete flow: register → multiple feedbacks → revoke → summary excludes revoked", () => {
    // Register agent
    simnet.callPublicFn("identity-registry", "register", [], agentOwner);
    const agentId = 0n;

    // Approve client for multiple feedbacks
    simnet.callPublicFn(
      "reputation-registry",
      "approve-client",
      [uintCV(agentId), principalCV(client1), uintCV(10n)],
      agentOwner
    );

    const emptyTag = Cl.stringUtf8("");
    const hash = bufferCV(hashFromString("hash"));

    // Give 3 feedbacks
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(80), Cl.uint(0), emptyTag, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("uri1"), hash],
      client1
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(90), Cl.uint(0), emptyTag, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("uri2"), hash],
      client1
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(100), Cl.uint(0), emptyTag, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("uri3"), hash],
      client1
    );

    // Check summary before revoke: (80 + 90 + 100) / 3 = 90
    let summaryResult = simnet.callReadOnlyFn(
      "reputation-registry",
      "get-summary",
      [uintCV(agentId), noneCV(), noneCV(), noneCV()],
      deployer
    );
    let summary = summaryResult.result as any;
    expect(summary.value.count.value).toBe(3n);
    expect(summary.value["summary-value"].value).toBe(90n);

    // Revoke feedback #2
    const revokeResult = simnet.callPublicFn(
      "reputation-registry",
      "revoke-feedback",
      [uintCV(agentId), uintCV(2n)],
      client1
    );
    expect(revokeResult.result).toBeOk(Cl.bool(true));

    // Summary after revoke: (80 + 100) / 2 = 90
    summaryResult = simnet.callReadOnlyFn(
      "reputation-registry",
      "get-summary",
      [uintCV(agentId), noneCV(), noneCV(), noneCV()],
      deployer
    );
    summary = summaryResult.result as any;
    expect(summary.value.count.value).toBe(2n);
    expect(summary.value["summary-value"].value).toBe(90n);
  });

  it("complete flow: register → feedback → append response", () => {
    // Register agent
    simnet.callPublicFn("identity-registry", "register", [], agentOwner);
    const agentId = 0n;

    // Approve and give feedback
    simnet.callPublicFn(
      "reputation-registry",
      "approve-client",
      [uintCV(agentId), principalCV(client1), uintCV(5n)],
      agentOwner
    );

    const emptyTag = Cl.stringUtf8("");
    const hash = bufferCV(hashFromString("hash"));
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(50), Cl.uint(0), emptyTag, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("bad-service"), hash],
      client1
    );

    // Agent owner responds to feedback
    const responseHash = bufferCV(hashFromString("response-hash"));
    const responseResult = simnet.callPublicFn(
      "reputation-registry",
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
      "reputation-registry",
      "get-response-count-single",
      [uintCV(agentId), principalCV(client1), uintCV(1n), principalCV(agentOwner)],
      deployer
    );
    expect(countResult.result).toBeUint(1n);

    // Get responders list
    const respondersResult = simnet.callReadOnlyFn(
      "reputation-registry",
      "get-responders",
      [uintCV(agentId), principalCV(client1), uintCV(1n)],
      deployer
    );
    expect(respondersResult.result).toBeSome(
      listCV([principalCV(agentOwner)])
    );
  });
});

describe("ERC-8004 Integration: Registration → Validation Flow", () => {
  it("complete flow: register agent → request validation → respond", () => {
    // Step 1: Register an agent
    const registerResult = simnet.callPublicFn(
      "identity-registry",
      "register-with-uri",
      [stringUtf8CV("ipfs://agent-for-validation")],
      agentOwner
    );
    expect(registerResult.result).toBeOk(uintCV(0n));
    const agentId = 0n;

    // Step 2: Agent owner requests validation
    const requestHash = bufferCV(hashFromString("validation-request-1"));
    const requestResult = simnet.callPublicFn(
      "validation-registry",
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
      "validation-registry",
      "get-validation-status",
      [requestHash],
      deployer
    );
    let status = statusResult.result as any;
    expect(status.value.value.response.value).toBe(0n); // Pending

    // Step 4: Validator responds
    const responseHash = bufferCV(hashFromString("validation-response-1"));
    const tag = bufferCV(tagFromString("security-audit"));
    const responseResult = simnet.callPublicFn(
      "validation-registry",
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
      "validation-registry",
      "get-validation-status",
      [requestHash],
      deployer
    );
    status = statusResult.result as any;
    expect(status.value.value.response.value).toBe(1n); // Approved
    expect(status.value.value.tag).toStrictEqual(tag);
  });

  it("complete flow: multiple validations → get summary", () => {
    // Register agent
    simnet.callPublicFn("identity-registry", "register", [], agentOwner);
    const agentId = 0n;

    const tag = bufferCV(tagFromString("audit"));
    const emptyTag = Cl.stringUtf8("");

    // Request 3 validations
    for (let i = 1; i <= 3; i++) {
      const reqHash = bufferCV(hashFromString(`request-${i}`));
      simnet.callPublicFn(
        "validation-registry",
        "validation-request",
        [principalCV(validator), uintCV(agentId), stringUtf8CV(`uri-${i}`), reqHash],
        agentOwner
      );

      // Validator responds (1 = approved, 2 = rejected)
      const response = i === 2 ? 2n : 1n; // Second one rejected
      simnet.callPublicFn(
        "validation-registry",
        "validation-response",
        [reqHash, uintCV(response), stringUtf8CV(`response-${i}`), bufferCV(hashFromString(`resp-${i}`)), tag],
        validator
      );
    }

    // Get summary - should have 3 validations
    const summaryResult = simnet.callReadOnlyFn(
      "validation-registry",
      "get-summary",
      [uintCV(agentId), noneCV(), noneCV()],
      deployer
    );
    const summary = summaryResult.result as any;
    expect(summary.value.count.value).toBe(3n);
    // Average: (1 + 2 + 1) / 3 = 1 (integer division)
    expect(summary.value["avg-response"].value).toBe(1n);

    // Get agent's validations
    const validationsResult = simnet.callReadOnlyFn(
      "validation-registry",
      "get-agent-validations",
      [uintCV(agentId)],
      deployer
    );
    const validations = validationsResult.result as any;
    expect(validations.value.value.length).toBe(3);
  });
});

describe("ERC-8004 Integration: Operator Permissions", () => {
  it("operator can approve clients and request validations on behalf of owner", () => {
    // Register agent
    simnet.callPublicFn("identity-registry", "register", [], agentOwner);
    const agentId = 0n;

    // Set operator approval
    const approvalResult = simnet.callPublicFn(
      "identity-registry",
      "set-approval-for-all",
      [uintCV(agentId), principalCV(operator), Cl.bool(true)],
      agentOwner
    );
    expect(approvalResult.result).toBeOk(Cl.bool(true));

    // Operator approves a client for feedback
    const clientApprovalResult = simnet.callPublicFn(
      "reputation-registry",
      "approve-client",
      [uintCV(agentId), principalCV(client1), uintCV(10n)],
      operator
    );
    expect(clientApprovalResult.result).toBeOk(Cl.bool(true));

    // Operator requests a validation
    const requestHash = bufferCV(hashFromString("operator-request"));
    const validationResult = simnet.callPublicFn(
      "validation-registry",
      "validation-request",
      [principalCV(validator), uintCV(agentId), stringUtf8CV("operator-req"), requestHash],
      operator
    );
    expect(validationResult.result).toBeOk(Cl.bool(true));

    // Verify client can now give feedback
    const emptyTag = Cl.stringUtf8("");
    const hash = bufferCV(hashFromString("hash"));
    const feedbackResult = simnet.callPublicFn(
      "reputation-registry",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(95), Cl.uint(0), emptyTag, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("great"), hash],
      client1
    );
    expect(feedbackResult.result).toBeOk(uintCV(1n));
  });
});

describe("ERC-8004 Integration: Cross-Contract Authorization", () => {
  it("reputation-registry correctly checks identity-registry for ownership", () => {
    // Register agent
    simnet.callPublicFn("identity-registry", "register", [], agentOwner);
    const agentId = 0n;

    // Unauthorized user cannot approve clients
    const unauthorizedApproval = simnet.callPublicFn(
      "reputation-registry",
      "approve-client",
      [uintCV(agentId), principalCV(client1), uintCV(5n)],
      client2 // Not owner or operator
    );
    expect(unauthorizedApproval.result).toBeErr(uintCV(3000n)); // ERR_NOT_AUTHORIZED
  });

  it("validation-registry correctly checks identity-registry for ownership", () => {
    // Register agent
    simnet.callPublicFn("identity-registry", "register", [], agentOwner);
    const agentId = 0n;

    // Unauthorized user cannot request validations
    const requestHash = bufferCV(hashFromString("unauthorized-request"));
    const unauthorizedRequest = simnet.callPublicFn(
      "validation-registry",
      "validation-request",
      [principalCV(validator), uintCV(agentId), stringUtf8CV("bad"), requestHash],
      client2 // Not owner or operator
    );
    expect(unauthorizedRequest.result).toBeErr(uintCV(2000n)); // ERR_NOT_AUTHORIZED
  });

  it("self-feedback is prevented via cross-contract check", () => {
    // Register agent
    simnet.callPublicFn("identity-registry", "register", [], agentOwner);
    const agentId = 0n;

    // Owner tries to approve themselves
    simnet.callPublicFn(
      "reputation-registry",
      "approve-client",
      [uintCV(agentId), principalCV(agentOwner), uintCV(5n)],
      agentOwner
    );

    // Owner tries to give feedback to own agent
    const emptyTag = Cl.stringUtf8("");
    const hash = bufferCV(hashFromString("self-feedback"));
    const selfFeedback = simnet.callPublicFn(
      "reputation-registry",
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
    simnet.callPublicFn("identity-registry", "register", [], agentOwner);
    const agentId = 0n;

    // Approve two clients
    simnet.callPublicFn(
      "reputation-registry",
      "approve-client",
      [uintCV(agentId), principalCV(client1), uintCV(5n)],
      agentOwner
    );
    simnet.callPublicFn(
      "reputation-registry",
      "approve-client",
      [uintCV(agentId), principalCV(client2), uintCV(5n)],
      agentOwner
    );

    const tag1 = Cl.stringUtf8("quality");
    const emptyTag = Cl.stringUtf8("");
    const hash = bufferCV(hashFromString("hash"));

    // Client 1 gives 2 feedbacks
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(80), Cl.uint(0), tag1, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("c1-1"), hash],
      client1
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(90), Cl.uint(0), tag1, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("c1-2"), hash],
      client1
    );

    // Client 2 gives 1 feedback
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(70), Cl.uint(0), emptyTag, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("c2-1"), hash],
      client2
    );

    // Read all feedback
    const result = simnet.callReadOnlyFn(
      "reputation-registry",
      "read-all-feedback",
      [uintCV(agentId), noneCV(), noneCV(), noneCV(), Cl.bool(false)],
      deployer
    );
    const items = result.result as any;
    expect(items.value.length).toBe(3);
  });

  it("read-all-feedback filters by tag", () => {
    // Register agent
    simnet.callPublicFn("identity-registry", "register", [], agentOwner);
    const agentId = 0n;

    // Approve client
    simnet.callPublicFn(
      "reputation-registry",
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
      "reputation-registry",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(80), Cl.uint(0), qualityTag, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("q1"), hash],
      client1
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(90), Cl.uint(0), speedTag, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("s1"), hash],
      client1
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(85), Cl.uint(0), qualityTag, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("q2"), hash],
      client1
    );

    // Read all with quality tag filter
    const result = simnet.callReadOnlyFn(
      "reputation-registry",
      "read-all-feedback",
      [uintCV(agentId), noneCV(), someCV(qualityTag), noneCV(), Cl.bool(false)],
      deployer
    );
    const items = result.result as any;
    expect(items.value.length).toBe(2); // Only quality-tagged feedbacks
  });

  it("read-all-feedback respects include-revoked flag", () => {
    // Register agent
    simnet.callPublicFn("identity-registry", "register", [], agentOwner);
    const agentId = 0n;

    // Approve client
    simnet.callPublicFn(
      "reputation-registry",
      "approve-client",
      [uintCV(agentId), principalCV(client1), uintCV(10n)],
      agentOwner
    );

    const emptyTag = Cl.stringUtf8("");
    const hash = bufferCV(hashFromString("hash"));

    // Give 3 feedbacks
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(80), Cl.uint(0), emptyTag, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("f1"), hash],
      client1
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(90), Cl.uint(0), emptyTag, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("f2"), hash],
      client1
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(100), Cl.uint(0), emptyTag, emptyTag, Cl.stringUtf8("https://example.com/api"), stringUtf8CV("f3"), hash],
      client1
    );

    // Revoke feedback #2
    simnet.callPublicFn(
      "reputation-registry",
      "revoke-feedback",
      [uintCV(agentId), uintCV(2n)],
      client1
    );

    // Read without revoked
    let result = simnet.callReadOnlyFn(
      "reputation-registry",
      "read-all-feedback",
      [uintCV(agentId), noneCV(), noneCV(), noneCV(), Cl.bool(false)],
      deployer
    );
    let items = result.result as any;
    expect(items.value.length).toBe(2);

    // Read with revoked included
    result = simnet.callReadOnlyFn(
      "reputation-registry",
      "read-all-feedback",
      [uintCV(agentId), noneCV(), noneCV(), noneCV(), Cl.bool(true)],
      deployer
    );
    items = result.result as any;
    expect(items.value.length).toBe(3);
  });
});

describe("ERC-8004 Integration: Version Consistency", () => {
  it("all contracts report version 1.0.0 or 2.0.0", () => {
    const identityVersion = simnet.callReadOnlyFn(
      "identity-registry",
      "get-version",
      [],
      deployer
    );
    // Phase 1: identity registry updated to 2.0.0
    expect(identityVersion.result).toStrictEqual(stringUtf8CV("2.0.0"));

    const reputationVersion = simnet.callReadOnlyFn(
      "reputation-registry",
      "get-version",
      [],
      deployer
    );
    // Phase 2+: reputation registry still at 1.0.0
    expect(reputationVersion.result).toStrictEqual(stringUtf8CV("1.0.0"));

    const validationVersion = simnet.callReadOnlyFn(
      "validation-registry",
      "get-version",
      [],
      deployer
    );
    // Phase 5: validation registry still at 1.0.0
    expect(validationVersion.result).toStrictEqual(stringUtf8CV("1.0.0"));
  });

  it("reputation and validation registries reference identity-registry", () => {
    const reputationRegistry = simnet.callReadOnlyFn(
      "reputation-registry",
      "get-identity-registry",
      [],
      deployer
    );
    expect(reputationRegistry.result).toStrictEqual(
      Cl.contractPrincipal(deployer, "identity-registry")
    );

    const validationRegistry = simnet.callReadOnlyFn(
      "validation-registry",
      "get-identity-registry",
      [],
      deployer
    );
    expect(validationRegistry.result).toStrictEqual(
      Cl.contractPrincipal(deployer, "identity-registry")
    );
  });
});
