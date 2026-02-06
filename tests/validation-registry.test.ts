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

  it("get-agent-validations() returns list of request hashes", () => {
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
      [uintCV(agentId)],
      deployer
    );

    // assert
    expect(result).toBeSome(listCV([bufferCV(hash1), bufferCV(hash2)]));
  });

  it("get-validator-requests() returns list of request hashes for validator", () => {
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
      [principalCV(address2)],
      deployer
    );

    // assert
    expect(result).toBeSome(listCV([bufferCV(hash1), bufferCV(hash2)]));
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
      [uintCV(agentId), noneCV(), noneCV()],
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

  it("get-summary() filters by validator", () => {
    // arrange
    const agentId = registerAgent(address1);
    const hash1 = hashFromString("filter-v-1");
    const hash2 = hashFromString("filter-v-2");
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

    // act - filter to only address2's validations
    const { result } = simnet.callReadOnlyFn(
      "validation-registry",
      "get-summary",
      [uintCV(agentId), someCV(listCV([principalCV(address2)])), noneCV()],
      deployer
    );

    // assert - only address2's score of 80
    expect(result).toStrictEqual(
      Cl.tuple({
        count: uintCV(1n),
        "avg-response": uintCV(80n),
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
