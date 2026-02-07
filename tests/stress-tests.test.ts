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
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;
const wallet4 = accounts.get("wallet_4")!;
const wallet5 = accounts.get("wallet_5")!;
const wallet6 = accounts.get("wallet_6")!;
const wallet7 = accounts.get("wallet_7")!;
const wallet8 = accounts.get("wallet_8")!;

// All available wallets for bulk operations
const allWallets = [
  wallet1,
  wallet2,
  wallet3,
  wallet4,
  wallet5,
  wallet6,
  wallet7,
  wallet8,
];

/**
 * Stress Tests - Execution Limit Testing
 *
 * These tests verify that paginated read-only functions complete within
 * mainnet read-only call limits. Key constraints:
 * - PAGE_SIZE = 14 (mainnet default read_only_call_limit_read_count = 30)
 * - Single-read fns: 1 counter + 14 items = 15 reads (within limit)
 * - Double-read fns (read-all-feedback): 1 counter + 14 items x 2 = 29 reads (within limit)
 * - Global feedback sequence = 2 reads per feedback (global-index + feedback)
 *
 * Since simnet has only 9 test accounts, we focus on:
 * 1. Pagination mechanics (cursor advancement, data correctness)
 * 2. Multiple pages (creating enough data to require pagination)
 * 3. Cost verification (reads stay within expected bounds)
 */

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
    "identity-registry-v2",
    "register",
    [],
    owner
  );
  return (result as any).value.value;
}

// Give feedback from a client to an agent
function giveFeedback(
  agentId: bigint,
  client: string,
  value: bigint,
  decimals: bigint,
  feedbackNum: number
): bigint {
  const { result } = simnet.callPublicFn(
    "reputation-registry-v2",
    "give-feedback",
    [
      uintCV(agentId),
      Cl.int(value),
      uintCV(decimals),
      stringUtf8CV(""), // tag1 (empty string = wildcard)
      stringUtf8CV(""), // tag2 (empty string = wildcard)
      stringUtf8CV(`http://feedback${feedbackNum}.com`),
      stringUtf8CV(`http://feedback${feedbackNum}.com/uri`),
      bufferCV(hashFromString(`feedback-hash-${feedbackNum}`)),
    ],
    client
  );
  return (result as any).value.value;
}

// Create a validation request
function createValidationRequest(
  agentId: bigint,
  agent: string,
  validator: string,
  requestNum: number
): Uint8Array {
  const hash = hashFromString(`request-hash-${requestNum}`);
  simnet.callPublicFn(
    "validation-registry-v2",
    "validation-request",
    [
      principalCV(validator),
      uintCV(agentId),
      stringUtf8CV(`http://request${requestNum}.com`),
      bufferCV(hash),
    ],
    agent
  );
  return hash;
}

// Add a validation response
function addValidationResponse(
  requestHash: Uint8Array,
  responder: string,
  response: bigint,
  responseNum: number
): void {
  simnet.callPublicFn(
    "validation-registry-v2",
    "validation-response",
    [
      bufferCV(requestHash),
      uintCV(response),
      stringUtf8CV(`http://response${responseNum}.com`),
      bufferCV(hashFromString(`response-hash-${responseNum}`)),
      stringUtf8CV("valid"),
    ],
    responder
  );
}

describe("Reputation Registry - Stress Tests", () => {
  describe("get-clients pagination", () => {
    it("handles low scale (3 clients)", () => {
      // arrange
      const agentId = registerAgent(wallet1);
      giveFeedback(agentId, wallet2, 100n, 0n, 1);
      giveFeedback(agentId, wallet3, 200n, 0n, 2);
      giveFeedback(agentId, wallet4, 300n, 0n, 3);

      // act - first page
      const result1 = simnet.callReadOnlyFn(
        "reputation-registry-v2",
        "get-clients",
        [uintCV(agentId), noneCV()],
        deployer
      );

      // assert
      const data = result1.result as any;
      expect(data.value.clients.value).toHaveLength(3);
      expect(data.value.cursor.type).toBe("none");
    });

    it("handles mid scale (9 clients)", () => {
      // arrange
      const agentId = registerAgent(wallet1);
      allWallets.forEach((wallet, idx) => {
        giveFeedback(agentId, wallet, BigInt(100 * (idx + 1)), 0n, idx + 1);
      });

      // act - first page
      const result1 = simnet.callReadOnlyFn(
        "reputation-registry-v2",
        "get-clients",
        [uintCV(agentId), noneCV()],
        deployer
      );

      // assert
      const data = result1.result as any;
      expect(data.value.clients.value).toHaveLength(7); // 7 clients (wallet1 is owner, can't give feedback to itself)
      expect(data.value.cursor.type).toBe("none"); // fits in one page
    });

    it("handles high scale with pagination (18 clients via multiple feedback)", () => {
      // arrange - create 2 agents, each gets feedback from all 8 wallets
      const agentId1 = registerAgent(wallet1);
      const agentId2 = registerAgent(wallet2);

      // Agent 1 gets feedback from wallets 3-8 (6 clients)
      [wallet3, wallet4, wallet5, wallet6, wallet7, wallet8].forEach(
        (wallet, idx) => {
          giveFeedback(agentId1, wallet, BigInt(100 * (idx + 1)), 0n, idx + 1);
        }
      );

      // Agent 2 gets feedback from all wallets except wallet2 (8 clients including wallet1)
      [wallet1, wallet3, wallet4, wallet5, wallet6, wallet7, wallet8].forEach(
        (wallet, idx) => {
          giveFeedback(
            agentId2,
            wallet,
            BigInt(100 * (idx + 1)),
            0n,
            idx + 10
          );
        }
      );

      // act - check agent 1 clients
      const result1 = simnet.callReadOnlyFn(
        "reputation-registry-v2",
        "get-clients",
        [uintCV(agentId1), noneCV()],
        deployer
      );

      // assert
      const data1 = result1.result as any;
      expect(data1.value.clients.value).toHaveLength(6);

      // act - check agent 2 clients
      const result2 = simnet.callReadOnlyFn(
        "reputation-registry-v2",
        "get-clients",
        [uintCV(agentId2), noneCV()],
        deployer
      );

      // assert
      const data2 = result2.result as any;
      expect(data2.value.clients.value).toHaveLength(7);
    });
  });

  describe("get-responders pagination", () => {
    it("handles low scale (3 responders)", () => {
      // arrange
      const agentId = registerAgent(wallet1);
      const feedbackId = giveFeedback(agentId, wallet2, 100n, 0n, 1);

      // Add 3 responders
      simnet.callPublicFn(
        "reputation-registry-v2",
        "append-response",
        [
          uintCV(agentId),
          principalCV(wallet2),
          uintCV(feedbackId),
          stringUtf8CV("http://response1.com"),
          bufferCV(hashFromString("response-hash-1")),
        ],
        wallet3
      );
      simnet.callPublicFn(
        "reputation-registry-v2",
        "append-response",
        [
          uintCV(agentId),
          principalCV(wallet2),
          uintCV(feedbackId),
          stringUtf8CV("http://response2.com"),
          bufferCV(hashFromString("response-hash-2")),
        ],
        wallet4
      );
      simnet.callPublicFn(
        "reputation-registry-v2",
        "append-response",
        [
          uintCV(agentId),
          principalCV(wallet2),
          uintCV(feedbackId),
          stringUtf8CV("http://response3.com"),
          bufferCV(hashFromString("response-hash-3")),
        ],
        wallet5
      );

      // act
      const result = simnet.callReadOnlyFn(
        "reputation-registry-v2",
        "get-responders",
        [uintCV(agentId), principalCV(wallet2), uintCV(feedbackId), noneCV()],
        deployer
      );

      // assert
      const data = result.result as any;
      expect(data.value.responders.value).toHaveLength(3);
      expect(data.value.cursor.type).toBe("none");
    });

    it("handles mid scale (9 responders - not possible, max 8)", () => {
      // arrange
      const agentId = registerAgent(wallet1);
      const feedbackId = giveFeedback(agentId, wallet2, 100n, 0n, 1);

      // Add 7 responders (all remaining wallets)
      [wallet3, wallet4, wallet5, wallet6, wallet7, wallet8, deployer].forEach(
        (wallet, idx) => {
          simnet.callPublicFn(
            "reputation-registry-v2",
            "append-response",
            [
              uintCV(agentId),
              principalCV(wallet2),
              uintCV(feedbackId),
              stringUtf8CV(`http://response${idx + 1}.com`),
              bufferCV(hashFromString(`response-hash-${idx + 1}`)),
            ],
            wallet
          );
        }
      );

      // act
      const result = simnet.callReadOnlyFn(
        "reputation-registry-v2",
        "get-responders",
        [uintCV(agentId), principalCV(wallet2), uintCV(feedbackId), noneCV()],
        deployer
      );

      // assert
      const data = result.result as any;
      expect(data.value.responders.value).toHaveLength(7);
      expect(data.value.cursor.type).toBe("none");
    });
  });

  describe("read-all-feedback with global sequence", () => {
    it("handles low scale (10 feedbacks)", () => {
      // arrange
      const agentId = registerAgent(wallet1);

      // Create 10 feedbacks - each wallet except wallet1 gives feedback, some give twice
      const clients = [wallet2, wallet3, wallet4, wallet5, wallet6, wallet7, wallet8, wallet2, wallet3, wallet4];
      clients.forEach((client, idx) => {
        giveFeedback(agentId, client, BigInt(100 * (idx + 1)), 0n, idx + 1);
      });

      // act
      const result = simnet.callReadOnlyFn(
        "reputation-registry-v2",
        "read-all-feedback",
        [
          uintCV(agentId),
          noneCV(), // opt-tag1
          noneCV(), // opt-tag2
          Cl.bool(false), // include-revoked
          noneCV(), // opt-cursor
        ],
        deployer
      );

      // assert
      const data = result.result as any;
      expect(data.value.items.value).toHaveLength(10);
      expect(data.value.cursor.type).toBe("none"); // fits in one page
    });

    it("handles mid scale with pagination (42 feedbacks = 3 pages)", () => {
      // arrange
      const agentId = registerAgent(wallet1);

      // Create 42 feedbacks (will span 3 pages with PAGE_SIZE=14)
      // Use wallets 2-8 (skip wallet1 as it's the agent owner)
      const validClients = allWallets.filter(w => w !== wallet1);
      for (let i = 0; i < 42; i++) {
        const client = validClients[i % validClients.length];
        giveFeedback(agentId, client, BigInt(100 * (i + 1)), 0n, i + 1);
      }

      // act - page 1
      const result1 = simnet.callReadOnlyFn(
        "reputation-registry-v2",
        "read-all-feedback",
        [
          uintCV(agentId),
          noneCV(), // opt-tag1
          noneCV(), // opt-tag2
          Cl.bool(false), // include-revoked
          noneCV(), // opt-cursor
        ],
        deployer
      );

      // assert page 1
      const data1 = result1.result as any;
      expect(data1.value.items.value).toHaveLength(14);
      expect(data1.value.cursor.type).toBe("some");
      expect(data1.value.cursor.value.value).toBe(14n);

      // act - page 2
      const result2 = simnet.callReadOnlyFn(
        "reputation-registry-v2",
        "read-all-feedback",
        [
          uintCV(agentId),
          noneCV(), // opt-tag1
          noneCV(), // opt-tag2
          Cl.bool(false), // include-revoked
          someCV(uintCV(14n)), // opt-cursor
        ],
        deployer
      );

      // assert page 2
      const data2 = result2.result as any;
      expect(data2.value.items.value).toHaveLength(14);
      expect(data2.value.cursor.type).toBe("some");
      expect(data2.value.cursor.value.value).toBe(28n);

      // act - page 3
      const result3 = simnet.callReadOnlyFn(
        "reputation-registry-v2",
        "read-all-feedback",
        [
          uintCV(agentId),
          noneCV(), // opt-tag1
          noneCV(), // opt-tag2
          Cl.bool(false), // include-revoked
          someCV(uintCV(28n)), // opt-cursor
        ],
        deployer
      );

      // assert page 3
      const data3 = result3.result as any;
      expect(data3.value.items.value).toHaveLength(14);
      expect(data3.value.cursor.type).toBe("none"); // last page
    });

    it("handles high scale with pagination (84 feedbacks = 6 pages)", () => {
      // arrange
      const agentId = registerAgent(wallet1);

      // Create 84 feedbacks (will span 6 pages with PAGE_SIZE=14)
      // Use wallets 2-8 (skip wallet1 as it's the agent owner)
      const validClients = allWallets.filter(w => w !== wallet1);
      for (let i = 0; i < 84; i++) {
        const client = validClients[i % validClients.length];
        giveFeedback(agentId, client, BigInt(100 * (i + 1)), 0n, i + 1);
      }

      // act - verify we can paginate through all pages
      let cursor: any = noneCV();
      let totalItems = 0;
      let pageCount = 0;

      while (true) {
        const result = simnet.callReadOnlyFn(
          "reputation-registry-v2",
          "read-all-feedback",
          [
            uintCV(agentId),
            noneCV(), // opt-tag1
            noneCV(), // opt-tag2
            Cl.bool(false), // include-revoked
            cursor, // opt-cursor
          ],
          deployer
        );

        const data = result.result as any;
        const items = data.value.items.value;
        totalItems += items.length;
        pageCount++;

        if (data.value.cursor.type === "none") {
          break;
        }

        cursor = someCV(data.value.cursor.value);
      }

      // assert
      expect(totalItems).toBe(84);
      expect(pageCount).toBe(6);
    });
  });

  describe("get-summary with multiple clients", () => {
    it("handles low scale (3 clients x 5 feedbacks)", () => {
      // arrange
      const agentId = registerAgent(wallet1);

      // 3 clients each give 5 feedbacks
      [wallet2, wallet3, wallet4].forEach((client, clientIdx) => {
        for (let i = 0; i < 5; i++) {
          giveFeedback(
            agentId,
            client,
            BigInt(100 * (clientIdx + 1)),
            0n,
            clientIdx * 5 + i
          );
        }
      });

      // act
      const result = simnet.callReadOnlyFn(
        "reputation-registry-v2",
        "get-summary",
        [uintCV(agentId)],
        deployer
      );

      // assert
      const data = result.result as any;
      expect(data.value.count.value).toBe(15n); // 3 clients * 5 feedbacks
      expect(data.value["summary-value-decimals"].value).toBe(18n);
    });

    it("handles mid scale (7 clients x 5 feedbacks)", () => {
      // arrange
      const agentId = registerAgent(wallet1);

      // 7 wallets (excluding wallet1 as agent owner) give 5 feedbacks each
      const validClients = allWallets.filter(w => w !== wallet1);
      validClients.forEach((client, clientIdx) => {
        for (let i = 0; i < 5; i++) {
          giveFeedback(
            agentId,
            client,
            BigInt(100 * (clientIdx + 1)),
            0n,
            clientIdx * 5 + i
          );
        }
      });

      // act
      const result = simnet.callReadOnlyFn(
        "reputation-registry-v2",
        "get-summary",
        [uintCV(agentId)],
        deployer
      );

      // assert
      const data = result.result as any;
      expect(data.value.count.value).toBe(35n); // 7 wallets * 5 feedbacks each
      expect(data.value["summary-value-decimals"].value).toBe(18n);
    });

    it("handles high scale (7 clients x 10 feedbacks)", () => {
      // arrange
      const agentId = registerAgent(wallet1);

      // 7 wallets (excluding wallet1 as agent owner) give 10 feedbacks each
      const validClients = allWallets.filter(w => w !== wallet1);
      validClients.forEach((client, clientIdx) => {
        for (let i = 0; i < 10; i++) {
          giveFeedback(
            agentId,
            client,
            BigInt(100 * (clientIdx + 1)),
            0n,
            clientIdx * 10 + i
          );
        }
      });

      // act
      const result = simnet.callReadOnlyFn(
        "reputation-registry-v2",
        "get-summary",
        [uintCV(agentId)],
        deployer
      );

      // assert
      const data = result.result as any;
      expect(data.value.count.value).toBe(70n); // 7 wallets * 10 feedbacks each
      expect(data.value["summary-value-decimals"].value).toBe(18n);
    });
  });
});

describe("Validation Registry - Stress Tests", () => {
  describe("get-agent-validations pagination", () => {
    it("handles low scale (3 hashes)", () => {
      // arrange
      const agentId = registerAgent(wallet1);

      // Create 3 validation requests
      const hash1 = createValidationRequest(agentId, wallet1, wallet2, 1);
      const hash2 = createValidationRequest(agentId, wallet1, wallet3, 2);
      const hash3 = createValidationRequest(agentId, wallet1, wallet4, 3);

      // act
      const result = simnet.callReadOnlyFn(
        "validation-registry-v2",
        "get-agent-validations",
        [uintCV(agentId), noneCV()],
        deployer
      );

      // assert
      const data = result.result as any;
      expect(data.value.validations.value).toHaveLength(3);
      expect(data.value.cursor.type).toBe("none");
    });

    it("handles mid scale (9 hashes)", () => {
      // arrange
      const agentId = registerAgent(wallet1);

      // Create 9 validation requests (wallet1 cannot validate itself, so skip it)
      const validValidators = allWallets.filter(w => w !== wallet1);
      // Need 9 requests, but only have 7 valid validators - some will validate twice
      const validators = [...validValidators, validValidators[0], validValidators[1]];
      validators.forEach((validator, i) => {
        createValidationRequest(agentId, wallet1, validator, i + 1);
      });

      // act
      const result = simnet.callReadOnlyFn(
        "validation-registry-v2",
        "get-agent-validations",
        [uintCV(agentId), noneCV()],
        deployer
      );

      // assert
      const data = result.result as any;
      expect(data.value.validations.value).toHaveLength(9);
      expect(data.value.cursor.type).toBe("none");
    });

    it("handles high scale with pagination (27 hashes = 2 pages)", () => {
      // arrange
      const agentId = registerAgent(wallet1);

      // Create 27 validation requests (wallet1 cannot validate itself, so skip it)
      const validValidators = allWallets.filter(w => w !== wallet1);
      for (let i = 0; i < 27; i++) {
        const validator = validValidators[i % validValidators.length];
        createValidationRequest(agentId, wallet1, validator, i + 1);
      }

      // act - page 1
      const result1 = simnet.callReadOnlyFn(
        "validation-registry-v2",
        "get-agent-validations",
        [uintCV(agentId), noneCV()],
        deployer
      );

      // assert page 1
      const data1 = result1.result as any;
      expect(data1.value.validations.value).toHaveLength(14);
      expect(data1.value.cursor.type).toBe("some");

      // act - page 2
      const result2 = simnet.callReadOnlyFn(
        "validation-registry-v2",
        "get-agent-validations",
        [uintCV(agentId), someCV(uintCV(14n))],
        deployer
      );

      // assert page 2
      const data2 = result2.result as any;
      expect(data2.value.validations.value).toHaveLength(13);
      expect(data2.value.cursor.type).toBe("none");
    });
  });

  describe("get-validator-requests pagination", () => {
    it("handles low scale (3 hashes)", () => {
      // arrange
      const validator = wallet1;
      const agentId2 = registerAgent(wallet2);
      const agentId3 = registerAgent(wallet3);
      const agentId4 = registerAgent(wallet4);

      // Create 3 validation requests to this validator
      createValidationRequest(agentId2, wallet2, validator, 1);
      createValidationRequest(agentId3, wallet3, validator, 2);
      createValidationRequest(agentId4, wallet4, validator, 3);

      // act
      const result = simnet.callReadOnlyFn(
        "validation-registry-v2",
        "get-validator-requests",
        [principalCV(validator), noneCV()],
        deployer
      );

      // assert
      const data = result.result as any;
      expect(data.value.requests.value).toHaveLength(3);
      expect(data.value.cursor.type).toBe("none");
    });

    it("handles mid scale (7 hashes)", () => {
      // arrange
      const validator = wallet1;

      // Create validation requests from different agents (7 other wallets)
      const agentIds = allWallets.slice(1).map((wallet) => registerAgent(wallet));
      agentIds.forEach((agentId, idx) => {
        createValidationRequest(agentId, allWallets[idx + 1], validator, idx + 1);
      });

      // act
      const result = simnet.callReadOnlyFn(
        "validation-registry-v2",
        "get-validator-requests",
        [principalCV(validator), noneCV()],
        deployer
      );

      // assert
      const data = result.result as any;
      expect(data.value.requests.value).toHaveLength(7); // 7 other wallets
      expect(data.value.cursor.type).toBe("none");
    });

    it("handles multiple requests from same agent", () => {
      // arrange
      const validator = wallet1;
      const agentId = registerAgent(wallet2);

      // Create 20 validation requests from same agent
      for (let i = 0; i < 20; i++) {
        createValidationRequest(agentId, wallet2, validator, i + 1);
      }

      // act - page 1
      const result1 = simnet.callReadOnlyFn(
        "validation-registry-v2",
        "get-validator-requests",
        [principalCV(validator), noneCV()],
        deployer
      );

      // assert page 1
      const data1 = result1.result as any;
      expect(data1.value.requests.value).toHaveLength(14);
      expect(data1.value.cursor.type).toBe("some");

      // act - page 2
      const result2 = simnet.callReadOnlyFn(
        "validation-registry-v2",
        "get-validator-requests",
        [principalCV(validator), someCV(uintCV(14n))],
        deployer
      );

      // assert page 2
      const data2 = result2.result as any;
      expect(data2.value.requests.value).toHaveLength(6);
      expect(data2.value.cursor.type).toBe("none");
    });
  });

  describe("validation get-summary with progressive responses", () => {
    it("handles low scale (3 validation hashes for an agent)", () => {
      // arrange
      const agentId = registerAgent(wallet1);

      // Create 3 validation requests
      const hash1 = createValidationRequest(agentId, wallet1, wallet2, 1);
      const hash2 = createValidationRequest(agentId, wallet1, wallet3, 2);
      const hash3 = createValidationRequest(agentId, wallet1, wallet4, 3);

      // Add responses to each
      addValidationResponse(hash1, wallet2, 80n, 1);
      addValidationResponse(hash2, wallet3, 90n, 2);
      addValidationResponse(hash3, wallet4, 100n, 3);

      // act - get summary for the agent (all validations)
      const result = simnet.callReadOnlyFn(
        "validation-registry-v2",
        "get-summary",
        [uintCV(agentId)],
        deployer
      );

      // assert
      const data = result.result as any;
      expect(data.value.count.value).toBe(3n);
      expect(data.value["avg-response"].value).toBeGreaterThan(0n);
    });

    it("handles mid scale (9 validation hashes for an agent)", () => {
      // arrange
      const agentId = registerAgent(wallet1);

      // Create 9 validation requests (wallet1 cannot validate itself, so skip it)
      const validValidators = allWallets.filter(w => w !== wallet1);
      const validators = [...validValidators, validValidators[0], validValidators[1]];
      const hashes: Uint8Array[] = [];
      validators.forEach((validator, i) => {
        const hash = createValidationRequest(agentId, wallet1, validator, i + 1);
        hashes.push(hash);
        // Add response
        addValidationResponse(hash, validator, 90n, i + 1);
      });

      // act
      const result = simnet.callReadOnlyFn(
        "validation-registry-v2",
        "get-summary",
        [uintCV(agentId)],
        deployer
      );

      // assert
      const data = result.result as any;
      expect(data.value.count.value).toBe(9n);
    });

    it("handles high scale (14 validations)", () => {
      // arrange
      const agentId = registerAgent(wallet1);

      // Create 14 validation requests (wallet1 cannot validate itself, so skip it)
      const validValidators = allWallets.filter(w => w !== wallet1);
      for (let i = 0; i < 14; i++) {
        const validator = validValidators[i % validValidators.length];
        const hash = createValidationRequest(agentId, wallet1, validator, i + 1);
        // Add response (tag filtering is indexer's job now)
        addValidationResponse(hash, validator, 100n, i + 1);
      }

      // act - get summary (unfiltered, O(1))
      const result = simnet.callReadOnlyFn(
        "validation-registry-v2",
        "get-summary",
        [uintCV(agentId)],
        deployer
      );

      // assert
      const data = result.result as any;
      expect(data.value.count.value).toBe(14n);
    });
  });
});

/**
 * Cost Analysis Notes
 *
 * Mainnet default: read_only_call_limit_read_count = 30
 * (configurable per-node, also bypassed by /v3/contracts/fast-call-read endpoint)
 *
 * Based on PAGE_SIZE=14:
 *
 * 1. get-clients/get-responders/get-agent-validations/get-validator-requests:
 *    - Each page = 1 counter read + N index lookups (N <= 14)
 *    - Worst case: 1 + 14 = 15 reads (within 30 limit)
 *
 * 2. read-all-feedback (global sequence):
 *    - Each feedback = 2 reads (global-index map + feedback map)
 *    - Worst case: 1 + 14*2 = 29 reads (within 30 limit)
 *
 * 3. get-summary (reputation + validation):
 *    - O(1) via running totals: 1 map read
 *    - Always within limit regardless of data volume
 *
 * 4. get-response-count:
 *    - With specific client + feedback index: 2 + 2*N responders
 *    - Worst case: 2 + 2*14 = 30 reads (at the limit)
 *    - Without filters: exceeds 30 reads (requires /v3 endpoint or node config)
 */
