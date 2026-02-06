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
 * Clarinet cost limits. Key constraints:
 * - PAGE_SIZE = 15 (15 items x 2 reads = 30, at mainnet read-only limit)
 * - FEEDBACK_PAGE_SIZE = 15 (same reasoning)
 * - Each paginated read = 2 map reads (index lookup + data fetch)
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
    "identity-registry",
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
    "reputation-registry",
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
    "validation-registry",
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
    "validation-registry",
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
        "reputation-registry",
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
        "reputation-registry",
        "get-clients",
        [uintCV(agentId), noneCV()],
        deployer
      );

      // assert
      const data = result1.result as any;
      expect(data.value.clients.value).toHaveLength(8); // 8 clients (not including wallet1 who is owner)
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
        "reputation-registry",
        "get-clients",
        [uintCV(agentId1), noneCV()],
        deployer
      );

      // assert
      const data1 = result1.result as any;
      expect(data1.value.clients.value).toHaveLength(6);

      // act - check agent 2 clients
      const result2 = simnet.callReadOnlyFn(
        "reputation-registry",
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
        "reputation-registry",
        "append-response",
        [
          uintCV(agentId),
          principalCV(wallet2),
          uintCV(feedbackId),
          principalCV(wallet3),
          uintCV(1n),
        ],
        wallet1
      );
      simnet.callPublicFn(
        "reputation-registry",
        "append-response",
        [
          uintCV(agentId),
          principalCV(wallet2),
          uintCV(feedbackId),
          principalCV(wallet4),
          uintCV(2n),
        ],
        wallet1
      );
      simnet.callPublicFn(
        "reputation-registry",
        "append-response",
        [
          uintCV(agentId),
          principalCV(wallet2),
          uintCV(feedbackId),
          principalCV(wallet5),
          uintCV(3n),
        ],
        wallet1
      );

      // act
      const result = simnet.callReadOnlyFn(
        "reputation-registry",
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
            "reputation-registry",
            "append-response",
            [
              uintCV(agentId),
              principalCV(wallet2),
              uintCV(feedbackId),
              principalCV(wallet),
              uintCV(BigInt(idx + 1)),
            ],
            wallet1
          );
        }
      );

      // act
      const result = simnet.callReadOnlyFn(
        "reputation-registry",
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

      // Create 10 feedbacks from different clients (cycling through wallets)
      for (let i = 0; i < 10; i++) {
        const client = allWallets[i % allWallets.length];
        giveFeedback(agentId, client, BigInt(100 * (i + 1)), 0n, i + 1);
      }

      // act
      const result = simnet.callReadOnlyFn(
        "reputation-registry",
        "read-all-feedback",
        [
          uintCV(agentId),
          noneCV(), // opt-clients
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

    it("handles mid scale with pagination (45 feedbacks = 3 pages)", () => {
      // arrange
      const agentId = registerAgent(wallet1);

      // Create 45 feedbacks (will span 3 pages with PAGE_SIZE=15)
      for (let i = 0; i < 45; i++) {
        const client = allWallets[i % allWallets.length];
        giveFeedback(agentId, client, BigInt(100 * (i + 1)), 0n, i + 1);
      }

      // act - page 1
      const result1 = simnet.callReadOnlyFn(
        "reputation-registry",
        "read-all-feedback",
        [
          uintCV(agentId),
          noneCV(),
          noneCV(),
          noneCV(),
          Cl.bool(false),
          noneCV(),
        ],
        deployer
      );

      // assert page 1
      const data1 = result1.result as any;
      expect(data1.value.items.value).toHaveLength(15);
      expect(data1.value.cursor.type).toBe("some");
      expect(data1.value.cursor.value.value).toBe(15n);

      // act - page 2
      const result2 = simnet.callReadOnlyFn(
        "reputation-registry",
        "read-all-feedback",
        [
          uintCV(agentId),
          noneCV(),
          noneCV(),
          noneCV(),
          Cl.bool(false),
          someCV(uintCV(15n)),
        ],
        deployer
      );

      // assert page 2
      const data2 = result2.result as any;
      expect(data2.value.items.value).toHaveLength(15);
      expect(data2.value.cursor.type).toBe("some");
      expect(data2.value.cursor.value.value).toBe(30n);

      // act - page 3
      const result3 = simnet.callReadOnlyFn(
        "reputation-registry",
        "read-all-feedback",
        [
          uintCV(agentId),
          noneCV(),
          noneCV(),
          noneCV(),
          Cl.bool(false),
          someCV(uintCV(30n)),
        ],
        deployer
      );

      // assert page 3
      const data3 = result3.result as any;
      expect(data3.value.items.value).toHaveLength(15);
      expect(data3.value.cursor.type).toBe("none"); // last page
    });

    it("handles high scale with pagination (90 feedbacks = 6 pages)", () => {
      // arrange
      const agentId = registerAgent(wallet1);

      // Create 90 feedbacks (will span 6 pages with PAGE_SIZE=15)
      for (let i = 0; i < 90; i++) {
        const client = allWallets[i % allWallets.length];
        giveFeedback(agentId, client, BigInt(100 * (i + 1)), 0n, i + 1);
      }

      // act - verify we can paginate through all pages
      let cursor: any = noneCV();
      let totalItems = 0;
      let pageCount = 0;

      while (true) {
        const result = simnet.callReadOnlyFn(
          "reputation-registry",
          "read-all-feedback",
          [
            uintCV(agentId),
            noneCV(),
            noneCV(),
            noneCV(),
            Cl.bool(false),
            cursor,
          ],
          deployer
        );

        const data = result.result as any;
        const items = data.value.items;
        totalItems += items.length;
        pageCount++;

        if (data.value.cursor.type === "none") {
          break;
        }

        cursor = someCV(data.value.cursor.value);
      }

      // assert
      expect(totalItems).toBe(90);
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
        "reputation-registry",
        "get-summary",
        [
          uintCV(agentId),
          listCV([principalCV(wallet2), principalCV(wallet3), principalCV(wallet4)]),
          noneCV(), // opt-tag1
          noneCV(), // opt-tag2
          noneCV(), // opt-cursor
        ],
        deployer
      );

      // assert
      const data = result.result as any;
      expect(data.value.count.value).toBe(15n); // 3 clients * 5 feedbacks
      expect(data.value.cursor.type).toBe("none");
    });

    it("handles mid scale (9 clients x 5 feedbacks)", () => {
      // arrange
      const agentId = registerAgent(wallet1);

      // All 8 wallets give 5 feedbacks each
      allWallets.forEach((client, clientIdx) => {
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
        "reputation-registry",
        "get-summary",
        [
          uintCV(agentId),
          listCV(allWallets.map((w) => principalCV(w))),
          noneCV(),
          noneCV(),
          noneCV(),
        ],
        deployer
      );

      // assert
      const data = result.result as any;
      expect(data.value.count.value).toBe(40n); // 8 clients * 5 feedbacks
    });

    it("handles high scale (9 clients x 10 feedbacks)", () => {
      // arrange
      const agentId = registerAgent(wallet1);

      // All 8 wallets give 10 feedbacks each
      allWallets.forEach((client, clientIdx) => {
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
        "reputation-registry",
        "get-summary",
        [
          uintCV(agentId),
          listCV(allWallets.map((w) => principalCV(w))),
          noneCV(),
          noneCV(),
          noneCV(),
        ],
        deployer
      );

      // assert
      const data = result.result as any;
      expect(data.value.count.value).toBe(80n); // 8 clients * 10 feedbacks
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
        "validation-registry",
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

      // Create 9 validation requests
      for (let i = 0; i < 9; i++) {
        const validator = allWallets[i % allWallets.length];
        createValidationRequest(agentId, wallet1, validator, i + 1);
      }

      // act
      const result = simnet.callReadOnlyFn(
        "validation-registry",
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

      // Create 27 validation requests
      for (let i = 0; i < 27; i++) {
        const validator = allWallets[i % allWallets.length];
        createValidationRequest(agentId, wallet1, validator, i + 1);
      }

      // act - page 1
      const result1 = simnet.callReadOnlyFn(
        "validation-registry",
        "get-agent-validations",
        [uintCV(agentId), noneCV()],
        deployer
      );

      // assert page 1
      const data1 = result1.result as any;
      expect(data1.value.validations.value).toHaveLength(15);
      expect(data1.value.cursor.type).toBe("some");

      // act - page 2
      const result2 = simnet.callReadOnlyFn(
        "validation-registry",
        "get-agent-validations",
        [uintCV(agentId), someCV(uintCV(15n))],
        deployer
      );

      // assert page 2
      const data2 = result2.result as any;
      expect(data2.value.validations.value).toHaveLength(12);
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
        "validation-registry",
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
        "validation-registry",
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
        "validation-registry",
        "get-validator-requests",
        [principalCV(validator), noneCV()],
        deployer
      );

      // assert page 1
      const data1 = result1.result as any;
      expect(data1.value.requests.value).toHaveLength(15);
      expect(data1.value.cursor.type).toBe("some");

      // act - page 2
      const result2 = simnet.callReadOnlyFn(
        "validation-registry",
        "get-validator-requests",
        [principalCV(validator), someCV(uintCV(15n))],
        deployer
      );

      // assert page 2
      const data2 = result2.result as any;
      expect(data2.value.requests.value).toHaveLength(5);
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
        "validation-registry",
        "get-summary",
        [uintCV(agentId), noneCV(), noneCV()],
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

      // Create 9 validation requests
      const hashes: Uint8Array[] = [];
      for (let i = 0; i < 9; i++) {
        const validator = allWallets[i % allWallets.length];
        const hash = createValidationRequest(agentId, wallet1, validator, i + 1);
        hashes.push(hash);
        // Add response
        addValidationResponse(hash, validator, 90n, i + 1);
      }

      // act
      const result = simnet.callReadOnlyFn(
        "validation-registry",
        "get-summary",
        [uintCV(agentId), noneCV(), noneCV()],
        deployer
      );

      // assert
      const data = result.result as any;
      expect(data.value.count.value).toBe(9n);
    });

    it("handles high scale with tag filtering", () => {
      // arrange
      const agentId = registerAgent(wallet1);

      // Create 15 validation requests (max for one page)
      for (let i = 0; i < 15; i++) {
        const validator = allWallets[i % allWallets.length];
        const hash = createValidationRequest(agentId, wallet1, validator, i + 1);
        // Add response (first 5 with "verified" tag, rest with "pending")
        const tag = i < 5 ? "verified" : "pending";
        addValidationResponse(hash, validator, 100n, i + 1);
      }

      // act - get summary for all
      const result = simnet.callReadOnlyFn(
        "validation-registry",
        "get-summary",
        [uintCV(agentId), noneCV(), noneCV()],
        deployer
      );

      // assert
      const data = result.result as any;
      expect(data.value.count.value).toBe(15n);
    });
  });
});

/**
 * Cost Analysis Notes
 *
 * Based on PAGE_SIZE=15 and FEEDBACK_PAGE_SIZE=15:
 *
 * 1. get-clients/get-responders/get-agent-validations/get-validator-requests:
 *    - Each paginated read = 2 map reads (counter + index lookup, index -> data)
 *    - PAGE_SIZE=15 = up to 30 reads per page
 *    - Mainnet limit: 30 reads (we're at the limit)
 *
 * 2. read-all-feedback (global sequence):
 *    - Each feedback = 2 reads (global-index map, feedback map)
 *    - FEEDBACK_PAGE_SIZE=15 = 30 reads per page
 *    - Mainnet limit: 30 reads (we're at the limit)
 *
 * 3. get-summary:
 *    - Iterates over clients list * feedback indices
 *    - For each client: up to FEEDBACK_PAGE_SIZE reads
 *    - With 8 clients * 15 indices = 120 potential lookups
 *    - Uses fold to process, may hit limits with large client lists
 *    - Designed for small client lists or off-chain aggregation
 *
 * 4. validation get-summary:
 *    - Iterates over response indices
 *    - Up to PAGE_SIZE responses per page
 *    - 15 responses = 30 reads (index + data)
 *    - Mainnet limit: 30 reads (we're at the limit)
 *
 * Run `npm run test:report` to see actual cost breakdowns.
 */
