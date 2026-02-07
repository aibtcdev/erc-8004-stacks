import { describe, expect, it, beforeEach } from "vitest";

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
const address1 = accounts.get("wallet_1")!;
const address2 = accounts.get("wallet_2")!;
const address3 = accounts.get("wallet_3")!;
const address4 = accounts.get("wallet_4")!;

// Helper to create a 32-byte buffer from a string (for request/response hashes)
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

describe("validation-registry public functions", () => {
  it("validation-request() creates a new validation request by owner", () => {
    // arrange
    const agentId = registerAgent(address1);
    const requestHash = bufferCV(hashFromString("request-hash-1"));
    const requestUri = stringUtf8CV("ipfs://request-uri");

    // act
    const { result } = simnet.callPublicFn(
      "validation-registry",
      "validation-request",
      [principalCV(address2), uintCV(agentId), requestUri, requestHash],
      address1
    );

    // assert
    expect(result).toBeOk(Cl.bool(true));
  });

  it("validation-request() creates a new validation request by approved operator", () => {
    // arrange
    const agentId = registerAgent(address1);
    simnet.callPublicFn(
      "identity-registry",
      "set-approval-for-all",
      [uintCV(agentId), principalCV(address3), Cl.bool(true)],
      address1
    );
    const requestHash = bufferCV(hashFromString("request-hash-2"));
    const requestUri = stringUtf8CV("ipfs://request-uri");

    // act
    const { result } = simnet.callPublicFn(
      "validation-registry",
      "validation-request",
      [principalCV(address2), uintCV(agentId), requestUri, requestHash],
      address3
    );

    // assert
    expect(result).toBeOk(Cl.bool(true));
  });

  it("validation-request() fails if caller is not authorized", () => {
    // arrange
    const agentId = registerAgent(address1);
    const requestHash = bufferCV(hashFromString("request-hash-3"));
    const requestUri = stringUtf8CV("ipfs://request-uri");

    // act
    const { result } = simnet.callPublicFn(
      "validation-registry",
      "validation-request",
      [principalCV(address3), uintCV(agentId), requestUri, requestHash],
      address2
    );

    // assert
    expect(result).toBeErr(uintCV(2000n)); // ERR_NOT_AUTHORIZED
  });

  it("validation-request() fails if request-hash already exists", () => {
    // arrange
    const agentId = registerAgent(address1);
    const requestHash = bufferCV(hashFromString("duplicate-hash"));
    const requestUri = stringUtf8CV("ipfs://request-uri");

    simnet.callPublicFn(
      "validation-registry",
      "validation-request",
      [principalCV(address2), uintCV(agentId), requestUri, requestHash],
      address1
    );

    // act - try to create with same hash
    const { result } = simnet.callPublicFn(
      "validation-registry",
      "validation-request",
      [principalCV(address3), uintCV(agentId), requestUri, requestHash],
      address1
    );

    // assert
    expect(result).toBeErr(uintCV(2003n)); // ERR_VALIDATION_EXISTS
  });

  it("validation-request() fails if validator is caller", () => {
    // arrange
    const agentId = registerAgent(address1);
    const requestHash = bufferCV(hashFromString("self-validate"));
    const requestUri = stringUtf8CV("ipfs://request-uri");

    // act
    const { result } = simnet.callPublicFn(
      "validation-registry",
      "validation-request",
      [principalCV(address1), uintCV(agentId), requestUri, requestHash],
      address1
    );

    // assert
    expect(result).toBeErr(uintCV(2004n)); // ERR_INVALID_VALIDATOR
  });

  it("validation-response() allows validator to respond", () => {
    // arrange
    const agentId = registerAgent(address1);
    const requestHash = bufferCV(hashFromString("response-test"));
    const requestUri = stringUtf8CV("ipfs://request-uri");
    const responseUri = stringUtf8CV("ipfs://response-uri");
    const responseHash = bufferCV(hashFromString("response-hash"));
    const tag = stringUtf8CV("verified");

    simnet.callPublicFn(
      "validation-registry",
      "validation-request",
      [principalCV(address2), uintCV(agentId), requestUri, requestHash],
      address1
    );

    // act
    const { result } = simnet.callPublicFn(
      "validation-registry",
      "validation-response",
      [requestHash, uintCV(85n), responseUri, responseHash, tag],
      address2
    );

    // assert
    expect(result).toBeOk(Cl.bool(true));
  });

  it("validation-response() fails if caller is not the validator", () => {
    // arrange
    const agentId = registerAgent(address1);
    const requestHash = bufferCV(hashFromString("wrong-validator"));
    const requestUri = stringUtf8CV("ipfs://request-uri");
    const responseUri = stringUtf8CV("ipfs://response-uri");
    const responseHash = bufferCV(hashFromString("response-hash"));
    const tag = stringUtf8CV("verified");

    simnet.callPublicFn(
      "validation-registry",
      "validation-request",
      [principalCV(address2), uintCV(agentId), requestUri, requestHash],
      address1
    );

    // act - address3 tries to respond but address2 is the validator
    const { result } = simnet.callPublicFn(
      "validation-registry",
      "validation-response",
      [requestHash, uintCV(85n), responseUri, responseHash, tag],
      address3
    );

    // assert
    expect(result).toBeErr(uintCV(2000n)); // ERR_NOT_AUTHORIZED
  });

  it("validation-response() fails if response > 100", () => {
    // arrange
    const agentId = registerAgent(address1);
    const requestHash = bufferCV(hashFromString("invalid-response"));
    const requestUri = stringUtf8CV("ipfs://request-uri");
    const responseUri = stringUtf8CV("ipfs://response-uri");
    const responseHash = bufferCV(hashFromString("response-hash"));
    const tag = stringUtf8CV("verified");

    simnet.callPublicFn(
      "validation-registry",
      "validation-request",
      [principalCV(address2), uintCV(agentId), requestUri, requestHash],
      address1
    );

    // act
    const { result } = simnet.callPublicFn(
      "validation-registry",
      "validation-response",
      [requestHash, uintCV(101n), responseUri, responseHash, tag],
      address2
    );

    // assert
    expect(result).toBeErr(uintCV(2005n)); // ERR_INVALID_RESPONSE
  });

  it("validation-response() fails if request-hash not found", () => {
    // arrange
    const requestHash = bufferCV(hashFromString("nonexistent"));
    const responseUri = stringUtf8CV("ipfs://response-uri");
    const responseHash = bufferCV(hashFromString("response-hash"));
    const tag = stringUtf8CV("verified");

    // act
    const { result } = simnet.callPublicFn(
      "validation-registry",
      "validation-response",
      [requestHash, uintCV(85n), responseUri, responseHash, tag],
      address2
    );

    // assert
    expect(result).toBeErr(uintCV(2002n)); // ERR_VALIDATION_NOT_FOUND
  });

  it("validation-response() allows updating response multiple times", () => {
    // arrange
    const agentId = registerAgent(address1);
    const requestHash = bufferCV(hashFromString("multi-response"));
    const requestUri = stringUtf8CV("ipfs://request-uri");
    const responseUri1 = stringUtf8CV("ipfs://response-1");
    const responseUri2 = stringUtf8CV("ipfs://response-2");
    const responseHash = bufferCV(hashFromString("response-hash"));
    const tag = stringUtf8CV("verified");

    simnet.callPublicFn(
      "validation-registry",
      "validation-request",
      [principalCV(address2), uintCV(agentId), requestUri, requestHash],
      address1
    );

    // act - first response
    simnet.callPublicFn(
      "validation-registry",
      "validation-response",
      [requestHash, uintCV(50n), responseUri1, responseHash, tag],
      address2
    );

    // act - update response
    const { result } = simnet.callPublicFn(
      "validation-registry",
      "validation-response",
      [requestHash, uintCV(100n), responseUri2, responseHash, tag],
      address2
    );

    // assert
    expect(result).toBeOk(Cl.bool(true));

    // verify updated value
    const status = simnet.callReadOnlyFn(
      "validation-registry",
      "get-validation-status",
      [requestHash],
      deployer
    ).result;
    // Result is (some {tuple}): .value is the TupleCV, .value.value is the fields object
    expect((status as any).value.value.response).toStrictEqual(uintCV(100n));
  });

  it("validation-response() progressive validation with different tags", () => {
    // arrange
    const agentId = registerAgent(address1);
    const requestHash = bufferCV(hashFromString("progressive-tags"));
    const requestUri = stringUtf8CV("ipfs://request-uri");
    const responseHash = bufferCV(hashFromString("response-hash"));

    simnet.callPublicFn(
      "validation-registry",
      "validation-request",
      [principalCV(address2), uintCV(agentId), requestUri, requestHash],
      address1
    );

    // act - preliminary response
    simnet.callPublicFn(
      "validation-registry",
      "validation-response",
      [requestHash, uintCV(50n), stringUtf8CV("r1"), responseHash, stringUtf8CV("preliminary")],
      address2
    );

    // act - final response with different tag
    const { result } = simnet.callPublicFn(
      "validation-registry",
      "validation-response",
      [requestHash, uintCV(85n), stringUtf8CV("r2"), responseHash, stringUtf8CV("final")],
      address2
    );

    // assert
    expect(result).toBeOk(Cl.bool(true));

    // verify final tag is stored
    const status = simnet.callReadOnlyFn(
      "validation-registry",
      "get-validation-status",
      [requestHash],
      deployer
    ).result;
    const resultValue = (status as any).value.value;
    expect(resultValue.response).toStrictEqual(uintCV(85n));
    expect(resultValue.tag).toStrictEqual(stringUtf8CV("final"));
    expect(resultValue["has-response"]).toStrictEqual(Cl.bool(true));
  });

  it("validation-response() allows response to decrease (no monotonic guard)", () => {
    // arrange
    const agentId = registerAgent(address1);
    const requestHash = bufferCV(hashFromString("decrease-response"));
    const requestUri = stringUtf8CV("ipfs://request-uri");
    const responseHash = bufferCV(hashFromString("response-hash"));
    const tag = stringUtf8CV("verified");

    simnet.callPublicFn(
      "validation-registry",
      "validation-request",
      [principalCV(address2), uintCV(agentId), requestUri, requestHash],
      address1
    );

    // act - high response first
    simnet.callPublicFn(
      "validation-registry",
      "validation-response",
      [requestHash, uintCV(100n), stringUtf8CV("r1"), responseHash, tag],
      address2
    );

    // act - decrease response
    const { result } = simnet.callPublicFn(
      "validation-registry",
      "validation-response",
      [requestHash, uintCV(50n), stringUtf8CV("r2"), responseHash, tag],
      address2
    );

    // assert - decrease is allowed
    expect(result).toBeOk(Cl.bool(true));

    // verify decreased value
    const status = simnet.callReadOnlyFn(
      "validation-registry",
      "get-validation-status",
      [requestHash],
      deployer
    ).result;
    expect((status as any).value.value.response).toStrictEqual(uintCV(50n));
  });

  it("get-summary() reflects progressive response updates accurately", () => {
    // arrange
    const agentId = registerAgent(address1);
    const hash1 = hashFromString("progressive-total-1");
    const hash2 = hashFromString("progressive-total-2");
    const responseHash = bufferCV(hashFromString("resp"));
    const tag = stringUtf8CV("verified");

    // Create 2 validation requests
    simnet.callPublicFn(
      "validation-registry",
      "validation-request",
      [principalCV(address2), uintCV(agentId), stringUtf8CV("uri1"), bufferCV(hash1)],
      address1
    );
    simnet.callPublicFn(
      "validation-registry",
      "validation-request",
      [principalCV(address3), uintCV(agentId), stringUtf8CV("uri2"), bufferCV(hash2)],
      address1
    );

    // Initial responses: 60 and 80 (avg = 70)
    simnet.callPublicFn(
      "validation-registry",
      "validation-response",
      [bufferCV(hash1), uintCV(60n), stringUtf8CV("r1"), responseHash, tag],
      address2
    );
    simnet.callPublicFn(
      "validation-registry",
      "validation-response",
      [bufferCV(hash2), uintCV(80n), stringUtf8CV("r2"), responseHash, tag],
      address3
    );

    // Check initial summary
    let result = simnet.callReadOnlyFn(
      "validation-registry",
      "get-summary",
      [uintCV(agentId)],
      deployer
    ).result;
    expect(result).toStrictEqual(
      Cl.tuple({
        count: uintCV(2n),
        "avg-response": uintCV(70n),
      })
    );

    // Progressive update: change hash1 from 60 to 90 (new avg = 85)
    simnet.callPublicFn(
      "validation-registry",
      "validation-response",
      [bufferCV(hash1), uintCV(90n), stringUtf8CV("r1-updated"), responseHash, tag],
      address2
    );

    // act - check updated summary
    result = simnet.callReadOnlyFn(
      "validation-registry",
      "get-summary",
      [uintCV(agentId)],
      deployer
    ).result;

    // assert - total should be 90 + 80 = 170, count still 2, avg = 85
    expect(result).toStrictEqual(
      Cl.tuple({
        count: uintCV(2n),
        "avg-response": uintCV(85n),
      })
    );
  });

  it("get-summary() only counts validations with has-response: true", () => {
    // arrange
    const agentId = registerAgent(address1);
    const hash1 = hashFromString("no-response-1");
    const hash2 = hashFromString("with-response-2");
    const hash3 = hashFromString("no-response-3");
    const tag = stringUtf8CV("verified");
    const responseHash = bufferCV(hashFromString("resp"));

    // Create 3 validation requests
    simnet.callPublicFn(
      "validation-registry",
      "validation-request",
      [principalCV(address2), uintCV(agentId), stringUtf8CV("uri1"), bufferCV(hash1)],
      address1
    );
    simnet.callPublicFn(
      "validation-registry",
      "validation-request",
      [principalCV(address3), uintCV(agentId), stringUtf8CV("uri2"), bufferCV(hash2)],
      address1
    );
    simnet.callPublicFn(
      "validation-registry",
      "validation-request",
      [principalCV(address2), uintCV(agentId), stringUtf8CV("uri3"), bufferCV(hash3)],
      address1
    );

    // Only respond to hash2
    simnet.callPublicFn(
      "validation-registry",
      "validation-response",
      [bufferCV(hash2), uintCV(90n), stringUtf8CV("r2"), responseHash, tag],
      address3
    );

    // act
    const { result } = simnet.callReadOnlyFn(
      "validation-registry",
      "get-summary",
      [uintCV(agentId)],
      deployer
    );

    // assert - only counts the one with response
    expect(result).toStrictEqual(
      Cl.tuple({
        count: uintCV(1n),
        "avg-response": uintCV(90n),
      })
    );
  });
});

describe("validation-registry read-only functions", () => {
  it("get-validation-status() returns validation data", () => {
    // arrange
    const agentId = registerAgent(address1);
    const requestHash = bufferCV(hashFromString("status-test"));
    const requestUri = stringUtf8CV("ipfs://request-uri");

    simnet.callPublicFn(
      "validation-registry",
      "validation-request",
      [principalCV(address2), uintCV(agentId), requestUri, requestHash],
      address1
    );

    // act
    const { result } = simnet.callReadOnlyFn(
      "validation-registry",
      "get-validation-status",
      [requestHash],
      deployer
    );

    // assert - check key fields, not exact block height
    // Result is (some {tuple}): .value is the TupleCV, .value.value is the fields object
    const resultValue = (result as any).value.value;
    expect(resultValue.validator).toStrictEqual(principalCV(address2));
    expect(resultValue["agent-id"]).toStrictEqual(uintCV(agentId));
    expect(resultValue.response).toStrictEqual(uintCV(0n));
    expect(resultValue["response-hash"]).toStrictEqual(bufferCV(new Uint8Array(32)));
    expect(resultValue.tag).toStrictEqual(stringUtf8CV(""));
    expect(resultValue["has-response"]).toStrictEqual(Cl.bool(false));
  });

  it("get-validation-status() returns none for non-existent hash", () => {
    // arrange
    const requestHash = bufferCV(hashFromString("nonexistent"));

    // act
    const { result } = simnet.callReadOnlyFn(
      "validation-registry",
      "get-validation-status",
      [requestHash],
      deployer
    );

    // assert
    expect(result).toBeNone();
  });

  it("get-agent-validations() returns paginated list of request hashes", () => {
    // arrange
    const agentId = registerAgent(address1);
    const hash1 = hashFromString("agent-val-1");
    const hash2 = hashFromString("agent-val-2");

    simnet.callPublicFn(
      "validation-registry",
      "validation-request",
      [
        principalCV(address2),
        uintCV(agentId),
        stringUtf8CV("uri1"),
        bufferCV(hash1),
      ],
      address1
    );
    simnet.callPublicFn(
      "validation-registry",
      "validation-request",
      [
        principalCV(address3),
        uintCV(agentId),
        stringUtf8CV("uri2"),
        bufferCV(hash2),
      ],
      address1
    );

    // act
    const { result } = simnet.callReadOnlyFn(
      "validation-registry",
      "get-agent-validations",
      [uintCV(agentId), Cl.none()],
      deployer
    );

    // assert
    expect(result).toStrictEqual(
      Cl.tuple({
        validations: listCV([bufferCV(hash1), bufferCV(hash2)]),
        cursor: Cl.none()
      })
    );
  });

  it("get-validator-requests() returns paginated list of request hashes for validator", () => {
    // arrange
    const agentId1 = registerAgent(address1);
    const agentId2 = registerAgent(address1);
    const hash1 = hashFromString("validator-req-1");
    const hash2 = hashFromString("validator-req-2");

    simnet.callPublicFn(
      "validation-registry",
      "validation-request",
      [
        principalCV(address2),
        uintCV(agentId1),
        stringUtf8CV("uri1"),
        bufferCV(hash1),
      ],
      address1
    );
    simnet.callPublicFn(
      "validation-registry",
      "validation-request",
      [
        principalCV(address2),
        uintCV(agentId2),
        stringUtf8CV("uri2"),
        bufferCV(hash2),
      ],
      address1
    );

    // act
    const { result } = simnet.callReadOnlyFn(
      "validation-registry",
      "get-validator-requests",
      [principalCV(address2), Cl.none()],
      deployer
    );

    // assert
    expect(result).toStrictEqual(
      Cl.tuple({
        requests: listCV([bufferCV(hash1), bufferCV(hash2)]),
        cursor: Cl.none()
      })
    );
  });

  it("get-summary() returns count and average for agent validations", () => {
    // arrange
    const agentId = registerAgent(address1);
    const hash1 = hashFromString("summary-1");
    const hash2 = hashFromString("summary-2");
    const tag = stringUtf8CV("verified");
    const responseHash = bufferCV(hashFromString("resp"));

    simnet.callPublicFn(
      "validation-registry",
      "validation-request",
      [
        principalCV(address2),
        uintCV(agentId),
        stringUtf8CV("uri1"),
        bufferCV(hash1),
      ],
      address1
    );
    simnet.callPublicFn(
      "validation-registry",
      "validation-request",
      [
        principalCV(address3),
        uintCV(agentId),
        stringUtf8CV("uri2"),
        bufferCV(hash2),
      ],
      address1
    );

    // Respond with scores 80 and 100
    simnet.callPublicFn(
      "validation-registry",
      "validation-response",
      [bufferCV(hash1), uintCV(80n), stringUtf8CV("r1"), responseHash, tag],
      address2
    );
    simnet.callPublicFn(
      "validation-registry",
      "validation-response",
      [bufferCV(hash2), uintCV(100n), stringUtf8CV("r2"), responseHash, tag],
      address3
    );

    // act
    const { result } = simnet.callReadOnlyFn(
      "validation-registry",
      "get-summary",
      [uintCV(agentId)],
      deployer
    );

    // assert - average of 80 and 100 = 90
    expect(result).toStrictEqual(
      Cl.tuple({
        count: uintCV(2n),
        "avg-response": uintCV(90n),
      })
    );
  });

  it("get-identity-registry() returns identity registry principal", () => {
    // act
    const { result } = simnet.callReadOnlyFn(
      "validation-registry",
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
      "validation-registry",
      "get-version",
      [],
      deployer
    );

    // assert
    expect(result).toStrictEqual(Cl.stringUtf8("2.0.0"));
  });
});

describe("validation-registry pagination", () => {
  it("get-agent-validations() paginates correctly with 20 validations", () => {
    // arrange
    const agentId = registerAgent(address1);
    const validators = [
      address2,
      address3,
      address4,
      accounts.get("wallet_5")!,
      accounts.get("wallet_6")!,
    ];

    // Create 20 validation requests
    for (let i = 0; i < 20; i++) {
      const validatorAddr = validators[i % validators.length];
      const hash = hashFromString(`validation-${i}`);
      simnet.callPublicFn(
        "validation-registry",
        "validation-request",
        [
          principalCV(validatorAddr),
          uintCV(agentId),
          stringUtf8CV(`uri-${i}`),
          bufferCV(hash),
        ],
        address1
      );
    }

    // act - get first page (up to 14 validations)
    const page1Result = simnet.callReadOnlyFn(
      "validation-registry",
      "get-agent-validations",
      [uintCV(agentId), Cl.none()],
      deployer
    );
    const page1 = page1Result.result as any;
    const validationsList1 = page1.value.validations.value;
    const cursor1 = page1.value.cursor;

    // assert - first page has 14 validations and a cursor
    expect(validationsList1.length).toBe(14);
    expect(cursor1.type).toBe('some');

    // act - get second page
    const page2Result = simnet.callReadOnlyFn(
      "validation-registry",
      "get-agent-validations",
      [uintCV(agentId), cursor1],
      deployer
    );
    const page2 = page2Result.result as any;

    // assert - second page has remaining validations and no cursor
    expect(page2.value.validations.value.length).toBe(6);
    expect(page2.value.cursor.type).toBe('none');
  });

  it("get-validator-requests() paginates correctly with 20 requests", () => {
    // arrange
    const agents = [
      registerAgent(address1),
      registerAgent(address1),
      registerAgent(address1),
      registerAgent(address1),
      registerAgent(address1),
    ];

    // Create 20 validation requests all for address2 as validator
    for (let i = 0; i < 20; i++) {
      const agentId = agents[i % agents.length];
      const hash = hashFromString(`request-${i}`);
      simnet.callPublicFn(
        "validation-registry",
        "validation-request",
        [
          principalCV(address2),
          uintCV(agentId),
          stringUtf8CV(`uri-${i}`),
          bufferCV(hash),
        ],
        address1
      );
    }

    // act - get first page (up to 14 requests)
    const page1Result = simnet.callReadOnlyFn(
      "validation-registry",
      "get-validator-requests",
      [principalCV(address2), Cl.none()],
      deployer
    );
    const page1 = page1Result.result as any;
    const requestsList1 = page1.value.requests.value;
    const cursor1 = page1.value.cursor;

    // assert - first page has 14 requests and a cursor
    expect(requestsList1.length).toBe(14);
    expect(cursor1.type).toBe('some');

    // act - get second page
    const page2Result = simnet.callReadOnlyFn(
      "validation-registry",
      "get-validator-requests",
      [principalCV(address2), cursor1],
      deployer
    );
    const page2 = page2Result.result as any;

    // assert - second page has remaining requests and no cursor
    expect(page2.value.requests.value.length).toBe(6);
    expect(page2.value.cursor.type).toBe('none');
  });
});
