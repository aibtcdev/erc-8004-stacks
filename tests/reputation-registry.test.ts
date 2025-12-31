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
const address1 = accounts.get("wallet_1")!; // Agent owner
const address2 = accounts.get("wallet_2")!; // Client
const address3 = accounts.get("wallet_3")!; // Another client / responder

// Helper to create a 32-byte buffer from a string
function hashFromString(s: string): Uint8Array {
  const hash = new Uint8Array(32);
  const bytes = new TextEncoder().encode(s);
  hash.set(bytes.slice(0, 32));
  return hash;
}

// Register an agent and return its ID
function registerAgent(owner: string): bigint {
  const { result } = simnet.callPublicFn(
    "identity-registry",
    "register",
    [],
    owner
  );
  return (result as any).value.value;
}

describe("reputation-registry on-chain approval", () => {
  it("approve-client() allows owner to approve a client", () => {
    // arrange
    const agentId = registerAgent(address1);

    // act
    const { result } = simnet.callPublicFn(
      "reputation-registry",
      "approve-client",
      [uintCV(agentId), principalCV(address2), uintCV(5n)],
      address1
    );

    // assert
    expect(result).toBeOk(Cl.bool(true));

    // verify approval limit
    const limit = simnet.callReadOnlyFn(
      "reputation-registry",
      "get-approved-limit",
      [uintCV(agentId), principalCV(address2)],
      deployer
    ).result;
    expect(limit).toStrictEqual(uintCV(5n));
  });

  it("approve-client() allows approved operator to approve a client", () => {
    // arrange
    const agentId = registerAgent(address1);
    simnet.callPublicFn(
      "identity-registry",
      "set-approval-for-all",
      [uintCV(agentId), principalCV(address3), Cl.bool(true)],
      address1
    );

    // act
    const { result } = simnet.callPublicFn(
      "reputation-registry",
      "approve-client",
      [uintCV(agentId), principalCV(address2), uintCV(10n)],
      address3
    );

    // assert
    expect(result).toBeOk(Cl.bool(true));
  });

  it("approve-client() fails for non-owner/operator", () => {
    // arrange
    const agentId = registerAgent(address1);

    // act
    const { result } = simnet.callPublicFn(
      "reputation-registry",
      "approve-client",
      [uintCV(agentId), principalCV(address3), uintCV(5n)],
      address2
    );

    // assert
    expect(result).toBeErr(uintCV(3000n)); // ERR_NOT_AUTHORIZED
  });
});

describe("reputation-registry give-feedback", () => {
  it("give-feedback() succeeds with on-chain approval", () => {
    // arrange
    const agentId = registerAgent(address1);
    simnet.callPublicFn(
      "reputation-registry",
      "approve-client",
      [uintCV(agentId), principalCV(address2), uintCV(5n)],
      address1
    );

    // act
    const { result } = simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [
        uintCV(agentId),
        uintCV(85n),
        bufferCV(hashFromString("quality")),
        bufferCV(hashFromString("responsive")),
        stringUtf8CV("ipfs://feedback"),
        bufferCV(hashFromString("feedback-hash")),
      ],
      address2
    );

    // assert
    expect(result).toBeOk(uintCV(1n)); // First feedback, index 1
  });

  it("give-feedback() fails without approval", () => {
    // arrange
    const agentId = registerAgent(address1);

    // act
    const { result } = simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [
        uintCV(agentId),
        uintCV(85n),
        bufferCV(hashFromString("quality")),
        bufferCV(hashFromString("responsive")),
        stringUtf8CV("ipfs://feedback"),
        bufferCV(hashFromString("feedback-hash")),
      ],
      address2
    );

    // assert
    expect(result).toBeErr(uintCV(3009n)); // ERR_INDEX_LIMIT_EXCEEDED
  });

  it("give-feedback() fails if owner tries self-feedback", () => {
    // arrange
    const agentId = registerAgent(address1);
    simnet.callPublicFn(
      "reputation-registry",
      "approve-client",
      [uintCV(agentId), principalCV(address1), uintCV(5n)],
      address1
    );

    // act
    const { result } = simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [
        uintCV(agentId),
        uintCV(100n),
        bufferCV(hashFromString("quality")),
        bufferCV(hashFromString("responsive")),
        stringUtf8CV("ipfs://feedback"),
        bufferCV(hashFromString("feedback-hash")),
      ],
      address1
    );

    // assert
    expect(result).toBeErr(uintCV(3005n)); // ERR_SELF_FEEDBACK
  });

  it("give-feedback() fails if score > 100", () => {
    // arrange
    const agentId = registerAgent(address1);
    simnet.callPublicFn(
      "reputation-registry",
      "approve-client",
      [uintCV(agentId), principalCV(address2), uintCV(5n)],
      address1
    );

    // act
    const { result } = simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [
        uintCV(agentId),
        uintCV(101n),
        bufferCV(hashFromString("quality")),
        bufferCV(hashFromString("responsive")),
        stringUtf8CV("ipfs://feedback"),
        bufferCV(hashFromString("feedback-hash")),
      ],
      address2
    );

    // assert
    expect(result).toBeErr(uintCV(3004n)); // ERR_INVALID_SCORE
  });

  it("give-feedback() fails for non-existent agent", () => {
    // act
    const { result } = simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [
        uintCV(999n),
        uintCV(85n),
        bufferCV(hashFromString("quality")),
        bufferCV(hashFromString("responsive")),
        stringUtf8CV("ipfs://feedback"),
        bufferCV(hashFromString("feedback-hash")),
      ],
      address2
    );

    // assert
    expect(result).toBeErr(uintCV(3001n)); // ERR_AGENT_NOT_FOUND
  });

  it("give-feedback() respects index limit", () => {
    // arrange
    const agentId = registerAgent(address1);
    simnet.callPublicFn(
      "reputation-registry",
      "approve-client",
      [uintCV(agentId), principalCV(address2), uintCV(2n)],
      address1
    );

    // First two feedbacks should succeed
    const tag = bufferCV(hashFromString("tag"));
    const hash = bufferCV(hashFromString("hash"));

    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), uintCV(80n), tag, tag, stringUtf8CV("uri1"), hash],
      address2
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), uintCV(90n), tag, tag, stringUtf8CV("uri2"), hash],
      address2
    );

    // Third should fail (limit is 2)
    const { result } = simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), uintCV(100n), tag, tag, stringUtf8CV("uri3"), hash],
      address2
    );

    // assert
    expect(result).toBeErr(uintCV(3009n)); // ERR_INDEX_LIMIT_EXCEEDED
  });
});

describe("reputation-registry revoke-feedback", () => {
  it("revoke-feedback() allows client to revoke their feedback", () => {
    // arrange
    const agentId = registerAgent(address1);
    simnet.callPublicFn(
      "reputation-registry",
      "approve-client",
      [uintCV(agentId), principalCV(address2), uintCV(5n)],
      address1
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [
        uintCV(agentId),
        uintCV(85n),
        bufferCV(hashFromString("quality")),
        bufferCV(hashFromString("responsive")),
        stringUtf8CV("ipfs://feedback"),
        bufferCV(hashFromString("feedback-hash")),
      ],
      address2
    );

    // act
    const { result } = simnet.callPublicFn(
      "reputation-registry",
      "revoke-feedback",
      [uintCV(agentId), uintCV(1n)],
      address2
    );

    // assert
    expect(result).toBeOk(Cl.bool(true));

    // verify feedback is revoked
    const fb = simnet.callReadOnlyFn(
      "reputation-registry",
      "read-feedback",
      [uintCV(agentId), principalCV(address2), uintCV(1n)],
      deployer
    ).result;
    expect((fb as any).value.value["is-revoked"]).toStrictEqual(Cl.bool(true));
  });

  it("revoke-feedback() fails for other users", () => {
    // arrange
    const agentId = registerAgent(address1);
    simnet.callPublicFn(
      "reputation-registry",
      "approve-client",
      [uintCV(agentId), principalCV(address2), uintCV(5n)],
      address1
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [
        uintCV(agentId),
        uintCV(85n),
        bufferCV(hashFromString("quality")),
        bufferCV(hashFromString("responsive")),
        stringUtf8CV("ipfs://feedback"),
        bufferCV(hashFromString("feedback-hash")),
      ],
      address2
    );

    // act - address3 tries to revoke address2's feedback
    const { result } = simnet.callPublicFn(
      "reputation-registry",
      "revoke-feedback",
      [uintCV(agentId), uintCV(1n)],
      address3
    );

    // assert
    expect(result).toBeErr(uintCV(3002n)); // ERR_FEEDBACK_NOT_FOUND
  });

  it("revoke-feedback() fails if already revoked", () => {
    // arrange
    const agentId = registerAgent(address1);
    simnet.callPublicFn(
      "reputation-registry",
      "approve-client",
      [uintCV(agentId), principalCV(address2), uintCV(5n)],
      address1
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [
        uintCV(agentId),
        uintCV(85n),
        bufferCV(hashFromString("quality")),
        bufferCV(hashFromString("responsive")),
        stringUtf8CV("ipfs://feedback"),
        bufferCV(hashFromString("feedback-hash")),
      ],
      address2
    );
    simnet.callPublicFn(
      "reputation-registry",
      "revoke-feedback",
      [uintCV(agentId), uintCV(1n)],
      address2
    );

    // act - try to revoke again
    const { result } = simnet.callPublicFn(
      "reputation-registry",
      "revoke-feedback",
      [uintCV(agentId), uintCV(1n)],
      address2
    );

    // assert
    expect(result).toBeErr(uintCV(3003n)); // ERR_ALREADY_REVOKED
  });
});

describe("reputation-registry append-response", () => {
  it("append-response() allows anyone to respond", () => {
    // arrange
    const agentId = registerAgent(address1);
    simnet.callPublicFn(
      "reputation-registry",
      "approve-client",
      [uintCV(agentId), principalCV(address2), uintCV(5n)],
      address1
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [
        uintCV(agentId),
        uintCV(85n),
        bufferCV(hashFromString("quality")),
        bufferCV(hashFromString("responsive")),
        stringUtf8CV("ipfs://feedback"),
        bufferCV(hashFromString("feedback-hash")),
      ],
      address2
    );

    // act - agent owner responds
    const { result } = simnet.callPublicFn(
      "reputation-registry",
      "append-response",
      [
        uintCV(agentId),
        principalCV(address2),
        uintCV(1n),
        stringUtf8CV("ipfs://response"),
        bufferCV(hashFromString("response-hash")),
      ],
      address1
    );

    // assert
    expect(result).toBeOk(Cl.bool(true));

    // verify response count
    const count = simnet.callReadOnlyFn(
      "reputation-registry",
      "get-response-count",
      [uintCV(agentId), principalCV(address2), uintCV(1n), principalCV(address1)],
      deployer
    ).result;
    expect(count).toStrictEqual(uintCV(1n));
  });

  it("append-response() increments count for multiple responses", () => {
    // arrange
    const agentId = registerAgent(address1);
    simnet.callPublicFn(
      "reputation-registry",
      "approve-client",
      [uintCV(agentId), principalCV(address2), uintCV(5n)],
      address1
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [
        uintCV(agentId),
        uintCV(85n),
        bufferCV(hashFromString("quality")),
        bufferCV(hashFromString("responsive")),
        stringUtf8CV("ipfs://feedback"),
        bufferCV(hashFromString("feedback-hash")),
      ],
      address2
    );

    // Multiple responses
    simnet.callPublicFn(
      "reputation-registry",
      "append-response",
      [
        uintCV(agentId),
        principalCV(address2),
        uintCV(1n),
        stringUtf8CV("ipfs://response1"),
        bufferCV(hashFromString("hash1")),
      ],
      address1
    );
    simnet.callPublicFn(
      "reputation-registry",
      "append-response",
      [
        uintCV(agentId),
        principalCV(address2),
        uintCV(1n),
        stringUtf8CV("ipfs://response2"),
        bufferCV(hashFromString("hash2")),
      ],
      address1
    );

    // verify response count is 2
    const count = simnet.callReadOnlyFn(
      "reputation-registry",
      "get-response-count",
      [uintCV(agentId), principalCV(address2), uintCV(1n), principalCV(address1)],
      deployer
    ).result;
    expect(count).toStrictEqual(uintCV(2n));
  });

  it("append-response() fails for invalid index", () => {
    // arrange
    const agentId = registerAgent(address1);

    // act
    const { result } = simnet.callPublicFn(
      "reputation-registry",
      "append-response",
      [
        uintCV(agentId),
        principalCV(address2),
        uintCV(1n),
        stringUtf8CV("ipfs://response"),
        bufferCV(hashFromString("response-hash")),
      ],
      address1
    );

    // assert
    expect(result).toBeErr(uintCV(3002n)); // ERR_FEEDBACK_NOT_FOUND
  });

  it("append-response() fails with empty URI", () => {
    // arrange
    const agentId = registerAgent(address1);
    simnet.callPublicFn(
      "reputation-registry",
      "approve-client",
      [uintCV(agentId), principalCV(address2), uintCV(5n)],
      address1
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [
        uintCV(agentId),
        uintCV(85n),
        bufferCV(hashFromString("quality")),
        bufferCV(hashFromString("responsive")),
        stringUtf8CV("ipfs://feedback"),
        bufferCV(hashFromString("feedback-hash")),
      ],
      address2
    );

    // act
    const { result } = simnet.callPublicFn(
      "reputation-registry",
      "append-response",
      [
        uintCV(agentId),
        principalCV(address2),
        uintCV(1n),
        stringUtf8CV(""),
        bufferCV(hashFromString("response-hash")),
      ],
      address1
    );

    // assert
    expect(result).toBeErr(uintCV(3010n)); // ERR_EMPTY_URI
  });
});

describe("reputation-registry read-only functions", () => {
  it("read-feedback() returns feedback data", () => {
    // arrange
    const agentId = registerAgent(address1);
    simnet.callPublicFn(
      "reputation-registry",
      "approve-client",
      [uintCV(agentId), principalCV(address2), uintCV(5n)],
      address1
    );
    const tag1 = bufferCV(hashFromString("quality"));
    const tag2 = bufferCV(hashFromString("responsive"));
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [
        uintCV(agentId),
        uintCV(85n),
        tag1,
        tag2,
        stringUtf8CV("ipfs://feedback"),
        bufferCV(hashFromString("feedback-hash")),
      ],
      address2
    );

    // act
    const { result } = simnet.callReadOnlyFn(
      "reputation-registry",
      "read-feedback",
      [uintCV(agentId), principalCV(address2), uintCV(1n)],
      deployer
    );

    // assert
    const fb = (result as any).value.value;
    expect(fb.score).toStrictEqual(uintCV(85n));
    expect(fb["is-revoked"]).toStrictEqual(Cl.bool(false));
  });

  it("get-last-index() returns correct index", () => {
    // arrange
    const agentId = registerAgent(address1);
    simnet.callPublicFn(
      "reputation-registry",
      "approve-client",
      [uintCV(agentId), principalCV(address2), uintCV(5n)],
      address1
    );
    const tag = bufferCV(hashFromString("tag"));
    const hash = bufferCV(hashFromString("hash"));
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), uintCV(80n), tag, tag, stringUtf8CV("uri1"), hash],
      address2
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), uintCV(90n), tag, tag, stringUtf8CV("uri2"), hash],
      address2
    );

    // act
    const { result } = simnet.callReadOnlyFn(
      "reputation-registry",
      "get-last-index",
      [uintCV(agentId), principalCV(address2)],
      deployer
    );

    // assert
    expect(result).toStrictEqual(uintCV(2n));
  });

  it("get-clients() returns list of clients", () => {
    // arrange
    const agentId = registerAgent(address1);
    simnet.callPublicFn(
      "reputation-registry",
      "approve-client",
      [uintCV(agentId), principalCV(address2), uintCV(5n)],
      address1
    );
    simnet.callPublicFn(
      "reputation-registry",
      "approve-client",
      [uintCV(agentId), principalCV(address3), uintCV(5n)],
      address1
    );
    const tag = bufferCV(hashFromString("tag"));
    const hash = bufferCV(hashFromString("hash"));
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), uintCV(80n), tag, tag, stringUtf8CV("uri1"), hash],
      address2
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), uintCV(90n), tag, tag, stringUtf8CV("uri2"), hash],
      address3
    );

    // act
    const { result } = simnet.callReadOnlyFn(
      "reputation-registry",
      "get-clients",
      [uintCV(agentId)],
      deployer
    );

    // assert
    expect(result).toBeSome(
      listCV([principalCV(address2), principalCV(address3)])
    );
  });

  it("get-summary() returns count and average", () => {
    // arrange
    const agentId = registerAgent(address1);
    simnet.callPublicFn(
      "reputation-registry",
      "approve-client",
      [uintCV(agentId), principalCV(address2), uintCV(5n)],
      address1
    );
    simnet.callPublicFn(
      "reputation-registry",
      "approve-client",
      [uintCV(agentId), principalCV(address3), uintCV(5n)],
      address1
    );
    const tag = bufferCV(hashFromString("tag"));
    const hash = bufferCV(hashFromString("hash"));
    // Two feedbacks: 80 and 100, average = 90
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), uintCV(80n), tag, tag, stringUtf8CV("uri1"), hash],
      address2
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), uintCV(100n), tag, tag, stringUtf8CV("uri2"), hash],
      address3
    );

    // act
    const { result } = simnet.callReadOnlyFn(
      "reputation-registry",
      "get-summary",
      [uintCV(agentId), noneCV(), noneCV(), noneCV()],
      deployer
    );

    // assert
    expect(result).toStrictEqual(
      Cl.tuple({
        count: uintCV(2n),
        "average-score": uintCV(90n),
      })
    );
  });

  it("get-summary() excludes revoked feedback", () => {
    // arrange
    const agentId = registerAgent(address1);
    simnet.callPublicFn(
      "reputation-registry",
      "approve-client",
      [uintCV(agentId), principalCV(address2), uintCV(5n)],
      address1
    );
    const tag = bufferCV(hashFromString("tag"));
    const hash = bufferCV(hashFromString("hash"));
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), uintCV(80n), tag, tag, stringUtf8CV("uri1"), hash],
      address2
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), uintCV(100n), tag, tag, stringUtf8CV("uri2"), hash],
      address2
    );
    // Revoke first feedback
    simnet.callPublicFn(
      "reputation-registry",
      "revoke-feedback",
      [uintCV(agentId), uintCV(1n)],
      address2
    );

    // act
    const { result } = simnet.callReadOnlyFn(
      "reputation-registry",
      "get-summary",
      [uintCV(agentId), noneCV(), noneCV(), noneCV()],
      deployer
    );

    // assert - only the second feedback (100) should count
    expect(result).toStrictEqual(
      Cl.tuple({
        count: uintCV(1n),
        "average-score": uintCV(100n),
      })
    );
  });

  it("get-identity-registry() returns identity registry principal", () => {
    // act
    const { result } = simnet.callReadOnlyFn(
      "reputation-registry",
      "get-identity-registry",
      [],
      deployer
    );

    // assert
    expect(result).toStrictEqual(
      principalCV(`${deployer}.identity-registry`)
    );
  });

  it("get-version() returns contract version", () => {
    // act
    const { result } = simnet.callReadOnlyFn(
      "reputation-registry",
      "get-version",
      [],
      deployer
    );

    // assert
    expect(result).toStrictEqual(Cl.stringUtf8("1.0.0"));
  });
});
