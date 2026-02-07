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
const address4 = accounts.get("wallet_4")!; // Additional client for multi-client tests

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

describe("reputation-registry give-feedback (permissionless)", () => {
  it("give-feedback() succeeds without approval", () => {
    // arrange
    const agentId = registerAgent(address1);

    // act
    const { result } = simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [
        uintCV(agentId),
        Cl.int(85),
        Cl.uint(0),
        Cl.stringUtf8("quality"),
        Cl.stringUtf8("responsive"),
        stringUtf8CV("https://example.com/api"),
        stringUtf8CV("ipfs://feedback"),
        bufferCV(hashFromString("feedback-hash")),
      ],
      address2
    );

    // assert
    expect(result).toBeOk(uintCV(1n)); // First feedback, index 1
  });

  it("give-feedback() accepts positive values with decimals", () => {
    // arrange
    const agentId = registerAgent(address1);

    // act - value: 9977, decimals: 2 = 99.77
    const { result } = simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [
        uintCV(agentId),
        Cl.int(9977),
        Cl.uint(2),
        Cl.stringUtf8("quality"),
        Cl.stringUtf8("responsive"),
        stringUtf8CV("https://example.com/api"),
        stringUtf8CV("ipfs://feedback"),
        bufferCV(hashFromString("feedback-hash")),
      ],
      address2
    );

    // assert
    expect(result).toBeOk(uintCV(1n));
  });

  it("give-feedback() accepts negative values", () => {
    // arrange
    const agentId = registerAgent(address1);

    // act - value: -32, decimals: 1 = -3.2
    const { result } = simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [
        uintCV(agentId),
        Cl.int(-32),
        Cl.uint(1),
        Cl.stringUtf8("quality"),
        Cl.stringUtf8("responsive"),
        stringUtf8CV("https://example.com/api"),
        stringUtf8CV("ipfs://feedback"),
        bufferCV(hashFromString("feedback-hash")),
      ],
      address2
    );

    // assert
    expect(result).toBeOk(uintCV(1n));
  });

  it("give-feedback() accepts zero value", () => {
    // arrange
    const agentId = registerAgent(address1);

    // act
    const { result } = simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [
        uintCV(agentId),
        Cl.int(0),
        Cl.uint(0),
        Cl.stringUtf8("quality"),
        Cl.stringUtf8("responsive"),
        stringUtf8CV("https://example.com/api"),
        stringUtf8CV("ipfs://feedback"),
        bufferCV(hashFromString("feedback-hash")),
      ],
      address2
    );

    // assert
    expect(result).toBeOk(uintCV(1n));
  });

  it("give-feedback() fails if valueDecimals > 18", () => {
    // arrange
    const agentId = registerAgent(address1);

    // act
    const { result } = simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [
        uintCV(agentId),
        Cl.int(100),
        Cl.uint(19),
        Cl.stringUtf8("quality"),
        Cl.stringUtf8("responsive"),
        stringUtf8CV("https://example.com/api"),
        stringUtf8CV("ipfs://feedback"),
        bufferCV(hashFromString("feedback-hash")),
      ],
      address2
    );

    // assert
    expect(result).toBeErr(uintCV(3011n)); // ERR_INVALID_DECIMALS
  });

  it("give-feedback() fails if owner tries self-feedback", () => {
    // arrange
    const agentId = registerAgent(address1);

    // act
    const { result } = simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [
        uintCV(agentId),
        Cl.int(100),
        Cl.uint(0),
        Cl.stringUtf8("quality"),
        Cl.stringUtf8("responsive"),
        stringUtf8CV("https://example.com/api"),
        stringUtf8CV("ipfs://feedback"),
        bufferCV(hashFromString("feedback-hash")),
      ],
      address1
    );

    // assert
    expect(result).toBeErr(uintCV(3005n)); // ERR_SELF_FEEDBACK
  });

  it("give-feedback() fails if approved operator tries to give feedback", () => {
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
      "give-feedback",
      [
        uintCV(agentId),
        Cl.int(100),
        Cl.uint(0),
        Cl.stringUtf8("quality"),
        Cl.stringUtf8("responsive"),
        stringUtf8CV("https://example.com/api"),
        stringUtf8CV("ipfs://feedback"),
        bufferCV(hashFromString("feedback-hash")),
      ],
      address3
    );

    // assert
    expect(result).toBeErr(uintCV(3005n)); // ERR_SELF_FEEDBACK
  });
});

describe("reputation-registry give-feedback-approved (on-chain approval)", () => {
  it("give-feedback-approved() succeeds with on-chain approval", () => {
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
      "give-feedback-approved",
      [
        uintCV(agentId),
        Cl.int(85),
        Cl.uint(0),
        Cl.stringUtf8("quality"),
        Cl.stringUtf8("responsive"),
        stringUtf8CV("https://example.com/api"),
        stringUtf8CV("ipfs://feedback"),
        bufferCV(hashFromString("feedback-hash")),
      ],
      address2
    );

    // assert
    expect(result).toBeOk(uintCV(1n)); // First feedback, index 1
  });

  it("give-feedback-approved() fails without approval", () => {
    // arrange
    const agentId = registerAgent(address1);

    // act
    const { result } = simnet.callPublicFn(
      "reputation-registry",
      "give-feedback-approved",
      [
        uintCV(agentId),
        Cl.int(85),
        Cl.uint(0),
        Cl.stringUtf8("quality"),
        Cl.stringUtf8("responsive"),
        stringUtf8CV("https://example.com/api"),
        stringUtf8CV("ipfs://feedback"),
        bufferCV(hashFromString("feedback-hash")),
      ],
      address2
    );

    // assert
    expect(result).toBeErr(uintCV(3009n)); // ERR_INDEX_LIMIT_EXCEEDED
  });

  it("give-feedback-approved() fails for non-existent agent", () => {
    // act
    const { result } = simnet.callPublicFn(
      "reputation-registry",
      "give-feedback-approved",
      [
        uintCV(999n),
        Cl.int(85),
        Cl.uint(0),
        Cl.stringUtf8("quality"),
        Cl.stringUtf8("responsive"),
        stringUtf8CV("https://example.com/api"),
        stringUtf8CV("ipfs://feedback"),
        bufferCV(hashFromString("feedback-hash")),
      ],
      address2
    );

    // assert
    expect(result).toBeErr(uintCV(3001n)); // ERR_AGENT_NOT_FOUND
  });

  it("give-feedback-approved() respects index limit", () => {
    // arrange
    const agentId = registerAgent(address1);
    simnet.callPublicFn(
      "reputation-registry",
      "approve-client",
      [uintCV(agentId), principalCV(address2), uintCV(2n)],
      address1
    );

    // First two feedbacks should succeed
    const tag = Cl.stringUtf8("tag");
    const hash = bufferCV(hashFromString("feedback-hash"));

    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(80), Cl.uint(0), tag, tag, stringUtf8CV("https://example.com/api"), stringUtf8CV("uri1"), hash],
      address2
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(90), Cl.uint(0), tag, tag, stringUtf8CV("https://example.com/api"), stringUtf8CV("uri2"), hash],
      address2
    );

    // Third should fail (limit is 2)
    const { result } = simnet.callPublicFn(
      "reputation-registry",
      "give-feedback-approved",
      [uintCV(agentId), Cl.int(100), Cl.uint(0), tag, tag, stringUtf8CV("https://example.com/api"), stringUtf8CV("uri3"), hash],
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
      "give-feedback",
      [
        uintCV(agentId),
        Cl.int(85),
        Cl.uint(0),
        Cl.stringUtf8("quality"),
        Cl.stringUtf8("responsive"),
        stringUtf8CV("https://example.com/api"),
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
      "give-feedback",
      [
        uintCV(agentId),
        Cl.int(85),
        Cl.uint(0),
        Cl.stringUtf8("quality"),
        Cl.stringUtf8("responsive"),
        stringUtf8CV("https://example.com/api"),
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
      "give-feedback",
      [
        uintCV(agentId),
        Cl.int(85),
        Cl.uint(0),
        Cl.stringUtf8("quality"),
        Cl.stringUtf8("responsive"),
        stringUtf8CV("https://example.com/api"),
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
      "give-feedback",
      [
        uintCV(agentId),
        Cl.int(85),
        Cl.uint(0),
        Cl.stringUtf8("quality"),
        Cl.stringUtf8("responsive"),
        stringUtf8CV("https://example.com/api"),
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
      "get-response-count-single", [uintCV(agentId), principalCV(address2), uintCV(1n), principalCV(address1)],
      deployer
    ).result;
    expect(count).toStrictEqual(uintCV(1n));
  });

  it("append-response() increments count for multiple responses", () => {
    // arrange
    const agentId = registerAgent(address1);
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [
        uintCV(agentId),
        Cl.int(85),
        Cl.uint(0),
        Cl.stringUtf8("quality"),
        Cl.stringUtf8("responsive"),
        stringUtf8CV("https://example.com/api"),
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
        bufferCV(hashFromString("response-hash1")),
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
        bufferCV(hashFromString("response-hash2")),
      ],
      address1
    );

    // verify response count is 2
    const count = simnet.callReadOnlyFn(
      "reputation-registry",
      "get-response-count-single", [uintCV(agentId), principalCV(address2), uintCV(1n), principalCV(address1)],
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
      "give-feedback",
      [
        uintCV(agentId),
        Cl.int(85),
        Cl.uint(0),
        Cl.stringUtf8("quality"),
        Cl.stringUtf8("responsive"),
        stringUtf8CV("https://example.com/api"),
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
  it("read-feedback() returns feedback data with value and decimals", () => {
    // arrange
    const agentId = registerAgent(address1);
    const tag1 = Cl.stringUtf8("quality");
    const tag2 = Cl.stringUtf8("responsive");
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [
        uintCV(agentId),
        Cl.int(9977),
        Cl.uint(2),
        tag1,
        tag2,
        stringUtf8CV("https://example.com/api"),
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
    expect(fb.value).toStrictEqual(Cl.int(9977));
    expect(fb["value-decimals"]).toStrictEqual(Cl.uint(2));
    expect(fb["is-revoked"]).toStrictEqual(Cl.bool(false));
  });

  it("get-last-index() returns correct index", () => {
    // arrange
    const agentId = registerAgent(address1);
    const tag = Cl.stringUtf8("tag");
    const hash = bufferCV(hashFromString("feedback-hash"));
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), Cl.int(80), Cl.uint(0), tag, tag, stringUtf8CV("https://example.com/api"), stringUtf8CV("uri1"), hash],
      address2
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), Cl.int(90), Cl.uint(0), tag, tag, stringUtf8CV("https://example.com/api"), stringUtf8CV("uri2"), hash],
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

  it("get-clients() returns paginated list of clients", () => {
    // arrange
    const agentId = registerAgent(address1);
    const tag = Cl.stringUtf8("tag");
    const hash = bufferCV(hashFromString("feedback-hash"));
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), Cl.int(80), Cl.uint(0), tag, tag, stringUtf8CV("https://example.com/api"), stringUtf8CV("uri1"), hash],
      address2
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), Cl.int(90), Cl.uint(0), tag, tag, stringUtf8CV("https://example.com/api"), stringUtf8CV("uri2"), hash],
      address3
    );

    // act
    const { result } = simnet.callReadOnlyFn(
      "reputation-registry",
      "get-clients",
      [uintCV(agentId), Cl.none()],
      deployer
    );

    // assert
    expect(result).toStrictEqual(
      Cl.tuple({
        clients: listCV([principalCV(address2), principalCV(address3)]),
        cursor: Cl.none()
      })
    );
  });

  it("get-summary() returns count and summary-value in WAD precision", () => {
    // arrange
    const agentId = registerAgent(address1);
    const tag = Cl.stringUtf8("tag");
    const hash = bufferCV(hashFromString("feedback-hash"));
    // Two feedbacks: 80 and 100 (decimals=0), average = 90 in WAD = 90 * 10^18
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), Cl.int(80), Cl.uint(0), tag, tag, stringUtf8CV("https://example.com/api"), stringUtf8CV("uri1"), hash],
      address2
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), Cl.int(100), Cl.uint(0), tag, tag, stringUtf8CV("https://example.com/api"), stringUtf8CV("uri2"), hash],
      address3
    );

    // act
    const { result } = simnet.callReadOnlyFn(
      "reputation-registry",
      "get-summary",
      [uintCV(agentId)],
      deployer
    );

    // assert
    expect(result).toStrictEqual(
      Cl.tuple({
        count: uintCV(2n),
        "summary-value": Cl.int(90000000000000000000n), // 90 * 10^18
        "summary-value-decimals": Cl.uint(18),
      })
    );
  });

  it("get-summary() excludes revoked feedback", () => {
    // arrange
    const agentId = registerAgent(address1);
    const tag = Cl.stringUtf8("tag");
    const hash = bufferCV(hashFromString("feedback-hash"));
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), Cl.int(80), Cl.uint(0), tag, tag, stringUtf8CV("https://example.com/api"), stringUtf8CV("uri1"), hash],
      address2
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), Cl.int(100), Cl.uint(0), tag, tag, stringUtf8CV("https://example.com/api"), stringUtf8CV("uri2"), hash],
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
      [uintCV(agentId)],
      deployer
    );

    // assert - only the second feedback (100) should count, in WAD precision
    expect(result).toStrictEqual(
      Cl.tuple({
        count: uintCV(1n),
        "summary-value": Cl.int(100000000000000000000n), // 100 * 10^18
        "summary-value-decimals": Cl.uint(18),
      })
    );
  });

  it("get-summary() returns empty summary for agent with no feedback", () => {
    // arrange
    const agentId = registerAgent(address1);
    // No feedback given

    // act
    const { result } = simnet.callReadOnlyFn(
      "reputation-registry",
      "get-summary",
      [uintCV(agentId)],
      deployer
    );

    // assert - returns zeros for agent with no feedback
    expect(result).toStrictEqual(
      Cl.tuple({
        count: uintCV(0n),
        "summary-value": Cl.int(0),
        "summary-value-decimals": Cl.uint(18),
      })
    );
  });

  it("get-summary() calculates average with same-precision feedback", () => {
    // arrange
    const agentId = registerAgent(address1);
    const tag = Cl.stringUtf8("quality");
    const hash = bufferCV(hashFromString("feedback-hash"));
    // Three feedbacks: 80, 90, 95 (all decimals=0), average = 88 (truncated)
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), Cl.int(80), Cl.uint(0), tag, tag, stringUtf8CV("https://example.com/api"), stringUtf8CV("uri1"), hash],
      address2
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), Cl.int(90), Cl.uint(0), tag, tag, stringUtf8CV("https://example.com/api"), stringUtf8CV("uri2"), hash],
      address3
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), Cl.int(95), Cl.uint(0), tag, tag, stringUtf8CV("https://example.com/api"), stringUtf8CV("uri3"), hash],
      address4
    );

    // act
    const { result } = simnet.callReadOnlyFn(
      "reputation-registry",
      "get-summary",
      [uintCV(agentId)],
      deployer
    );

    // assert - average in WAD precision = 88.333... * 10^18
    expect(result).toStrictEqual(
      Cl.tuple({
        count: uintCV(3n),
        "summary-value": Cl.int(88333333333333333333n),
        "summary-value-decimals": Cl.uint(18),
      })
    );
  });

  it("get-summary() calculates average with negative same-precision values", () => {
    // arrange
    const agentId = registerAgent(address1);
    const tag = Cl.stringUtf8("penalty");
    const hash = bufferCV(hashFromString("feedback-hash"));
    // Three feedbacks: -10, -20, -30 (all decimals=0), average = -20
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), Cl.int(-10), Cl.uint(0), tag, tag, stringUtf8CV("https://example.com/api"), stringUtf8CV("uri1"), hash],
      address2
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), Cl.int(-20), Cl.uint(0), tag, tag, stringUtf8CV("https://example.com/api"), stringUtf8CV("uri2"), hash],
      address3
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), Cl.int(-30), Cl.uint(0), tag, tag, stringUtf8CV("https://example.com/api"), stringUtf8CV("uri3"), hash],
      address4
    );

    // act
    const { result } = simnet.callReadOnlyFn(
      "reputation-registry",
      "get-summary",
      [uintCV(agentId)],
      deployer
    );

    // assert - average in WAD precision = -20 * 10^18
    expect(result).toStrictEqual(
      Cl.tuple({
        count: uintCV(3n),
        "summary-value": Cl.int(-20000000000000000000n),
        "summary-value-decimals": Cl.uint(18),
      })
    );
  });

  it("get-summary() normalizes mixed-precision feedback with WAD", () => {
    // arrange
    const agentId = registerAgent(address1);
    const tag = Cl.stringUtf8("mixed");
    const hash = bufferCV(hashFromString("feedback-hash"));
    // Mixed precision feedback:
    // Client 1: value=85, decimals=0 (represents 85) -> WAD: 85 * 10^18
    // Client 2: value=9977, decimals=2 (represents 99.77) -> WAD: 9977 * 10^16
    // Client 3: value=-32, decimals=1 (represents -3.2) -> WAD: -32 * 10^17
    // WAD sum = 85*10^18 + 9977*10^16 + (-32)*10^17 = 181570000000000000000
    // WAD avg = 181570000000000000000 / 3 = 60523333333333333333
    // Mode decimals = 0 (most frequent)
    // Scaled back = 60523333333333333333 / 10^18 = 60 (truncated)
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), Cl.int(85), Cl.uint(0), tag, tag, stringUtf8CV("https://example.com/api"), stringUtf8CV("uri1"), hash],
      address2
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), Cl.int(9977), Cl.uint(2), tag, tag, stringUtf8CV("https://example.com/api"), stringUtf8CV("uri2"), hash],
      address3
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), Cl.int(-32), Cl.uint(1), tag, tag, stringUtf8CV("https://example.com/api"), stringUtf8CV("uri3"), hash],
      address4
    );

    // act
    const { result } = simnet.callReadOnlyFn(
      "reputation-registry",
      "get-summary",
      [uintCV(agentId)],
      deployer
    );

    // assert - WAD average = 60523333333333333333 (WAD precision, decimals=18)
    expect(result).toStrictEqual(
      Cl.tuple({
        count: uintCV(3n),
        "summary-value": Cl.int(60523333333333333333n),
        "summary-value-decimals": Cl.uint(18),
      })
    );
  });

  it("get-summary() returns mode decimals for all same non-zero decimals", () => {
    // arrange
    const agentId = registerAgent(address1);
    const tag = Cl.stringUtf8("decimals-test");
    const hash = bufferCV(hashFromString("feedback-hash"));
    // All feedback with decimals=2: 8000, 9000, 10000 (represents 80.00, 90.00, 100.00)
    // Average = (8000 + 9000 + 10000) / 3 = 9000 (in decimals=2)
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), Cl.int(8000), Cl.uint(2), tag, tag, stringUtf8CV("https://example.com/api"), stringUtf8CV("uri1"), hash],
      address2
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), Cl.int(9000), Cl.uint(2), tag, tag, stringUtf8CV("https://example.com/api"), stringUtf8CV("uri2"), hash],
      address3
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), Cl.int(10000), Cl.uint(2), tag, tag, stringUtf8CV("https://example.com/api"), stringUtf8CV("uri3"), hash],
      address4
    );

    // act
    const { result } = simnet.callReadOnlyFn(
      "reputation-registry",
      "get-summary",
      [uintCV(agentId)],
      deployer
    );

    // assert - WAD average = 90 * 10^18 (decimals=18 always in WAD)
    expect(result).toStrictEqual(
      Cl.tuple({
        count: uintCV(3n),
        "summary-value": Cl.int(90000000000000000000n),
        "summary-value-decimals": Cl.uint(18),
      })
    );
  });

  it("get-summary() selects mode decimals when mixed", () => {
    // arrange
    const agentId = registerAgent(address1);
    const tag = Cl.stringUtf8("mode-test");
    const hash = bufferCV(hashFromString("feedback-hash"));
    // Mixed decimals: decimals=0 appears once, decimals=1 appears twice (mode)
    // Values: 80 (decimals=0), 850 (decimals=1 = 85.0), 950 (decimals=1 = 95.0)
    // WAD: 80*10^18, 850*10^17, 950*10^17
    // Mode = 1 (appears 2 times)
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), Cl.int(80), Cl.uint(0), tag, tag, stringUtf8CV("https://example.com/api"), stringUtf8CV("uri1"), hash],
      address2
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), Cl.int(850), Cl.uint(1), tag, tag, stringUtf8CV("https://example.com/api"), stringUtf8CV("uri2"), hash],
      address3
    );
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), Cl.int(950), Cl.uint(1), tag, tag, stringUtf8CV("https://example.com/api"), stringUtf8CV("uri3"), hash],
      address4
    );

    // act
    const { result } = simnet.callReadOnlyFn(
      "reputation-registry",
      "get-summary",
      [uintCV(agentId)],
      deployer
    );

    // assert - WAD average = 86.666... * 10^18 (decimals=18 always in WAD)
    expect(result).toStrictEqual(
      Cl.tuple({
        count: uintCV(3n),
        "summary-value": Cl.int(86666666666666666666n),
        "summary-value-decimals": Cl.uint(18),
      })
    );
  });

  // Tag filtering is now an off-chain indexer concern, removed from on-chain get-summary

  // NOTE: Tests for tag filtering removed - this is now handled by off-chain indexers
  // via read-all-feedback with tag filters for reconstruction

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
    expect(result).toStrictEqual(Cl.stringUtf8("2.0.0"));
  });
});

describe("reputation-registry pagination", () => {
  it("get-clients() paginates correctly with 20 clients", () => {
    // arrange
    const agentId = registerAgent(address1);
    const tag = Cl.stringUtf8("tag");
    const hash = bufferCV(hashFromString("feedback-hash"));

    // Create 20 clients using deployer and wallet_1 through wallet_8, repeated
    const clientAddresses = [
      deployer,
      address1,
      address2,
      address3,
      address4,
      accounts.get("wallet_5")!,
      accounts.get("wallet_6")!,
      accounts.get("wallet_7")!,
      accounts.get("wallet_8")!,
    ];

    // Give feedback from 20 different clients (cycling through available wallets)
    for (let i = 0; i < 20; i++) {
      const clientAddr = clientAddresses[i % clientAddresses.length];
      // Skip if this is the agent owner (would cause self-feedback error)
      if (clientAddr === address1) continue;

      simnet.callPublicFn(
        "reputation-registry",
        "give-feedback",
        [uintCV(agentId), Cl.int(50 + i), Cl.uint(0), tag, tag, stringUtf8CV("https://example.com/api"), stringUtf8CV(`uri${i}`), hash],
        clientAddr
      );
    }

    // act - get first page (up to 14 clients)
    const page1Result = simnet.callReadOnlyFn(
      "reputation-registry",
      "get-clients",
      [uintCV(agentId), Cl.none()],
      deployer
    );

    // Extract fields from Clarity tuple using 'as any' to access internal structure
    const page1 = page1Result.result as any;
    const clientsList1 = page1.value.clients.value;
    const cursor1 = page1.value.cursor;

    // assert - we have 8 unique clients (9 addresses minus owner) and no more pages
    expect(clientsList1.length).toBe(8);
    expect(cursor1.type).toBe('none'); // All clients fit in first page
  });

  it("get-responders() paginates correctly with 20 responders", () => {
    // arrange
    const agentId = registerAgent(address1);
    const tag = Cl.stringUtf8("tag");
    const hash = bufferCV(hashFromString("feedback-hash"));

    // Give one feedback from address2
    simnet.callPublicFn(
      "reputation-registry",
      "give-feedback",
      [uintCV(agentId), Cl.int(75), Cl.uint(0), tag, tag, stringUtf8CV("https://example.com/api"), stringUtf8CV("uri"), hash],
      address2
    );

    // Have 20 responders respond to that feedback
    const responderAddresses = [
      deployer,
      address1,
      address3,
      address4,
      accounts.get("wallet_5")!,
      accounts.get("wallet_6")!,
      accounts.get("wallet_7")!,
      accounts.get("wallet_8")!,
    ];

    for (let i = 0; i < 20; i++) {
      const responderAddr = responderAddresses[i % responderAddresses.length];
      simnet.callPublicFn(
        "reputation-registry",
        "append-response",
        [uintCV(agentId), principalCV(address2), uintCV(1n), stringUtf8CV(`response-uri-${i}`), bufferCV(hashFromString(`response-${i}`))],
        responderAddr
      );
    }

    // act - get first page (up to 14 responders)
    const page1Result = simnet.callReadOnlyFn(
      "reputation-registry",
      "get-responders",
      [uintCV(agentId), principalCV(address2), uintCV(1n), Cl.none()],
      deployer
    );
    const page1 = page1Result.result as any;
    const respondersList1 = page1.value.responders.value;
    const cursor1 = page1.value.cursor;

    // assert - we have 8 unique responders (8 addresses) and no more pages
    expect(respondersList1.length).toBe(8);
    expect(cursor1.type).toBe('none'); // All responders fit in first page
  });
});
