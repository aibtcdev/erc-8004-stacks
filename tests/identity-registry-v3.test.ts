import { describe, it, expect, beforeEach } from "vitest";
import { Cl, uintCV } from "@stacks/transactions";

const CONTRACT = "identity-registry-v3";

describe("identity-registry-v3 reverse lookup", () => {
  const accounts = simnet.getAccounts();
  const wallet1 = accounts.get("wallet_1")!;
  const wallet2 = accounts.get("wallet_2")!;

  describe("get-agent-id-by-owner", () => {
    it("returns none for unregistered owner", () => {
      const { result } = simnet.callReadOnlyFn(
        CONTRACT,
        "get-agent-id-by-owner",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(result).toBeNone();
    });

    it("returns agent-id after registration", () => {
      simnet.callPublicFn(CONTRACT, "register", [], wallet1);
      const { result } = simnet.callReadOnlyFn(
        CONTRACT,
        "get-agent-id-by-owner",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(result).toBeSome(uintCV(0n));
    });

    it("returns agent-id after register-with-uri", () => {
      simnet.callPublicFn(
        CONTRACT,
        "register-with-uri",
        [Cl.stringUtf8("https://example.com/agent")],
        wallet1
      );
      const { result } = simnet.callReadOnlyFn(
        CONTRACT,
        "get-agent-id-by-owner",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(result).toBeSome(uintCV(0n));
    });

    it("returns agent-id after register-full", () => {
      simnet.callPublicFn(
        CONTRACT,
        "register-full",
        [
          Cl.stringUtf8("https://example.com/agent"),
          Cl.list([
            Cl.tuple({
              key: Cl.stringUtf8("name"),
              value: Cl.buffer(Buffer.from("test-agent")),
            }),
          ]),
        ],
        wallet1
      );
      const { result } = simnet.callReadOnlyFn(
        CONTRACT,
        "get-agent-id-by-owner",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(result).toBeSome(uintCV(0n));
    });

    it("updates to latest agent-id on multiple registrations", () => {
      // First registration
      simnet.callPublicFn(CONTRACT, "register", [], wallet1);
      // Second registration by same owner
      simnet.callPublicFn(CONTRACT, "register", [], wallet1);

      const { result } = simnet.callReadOnlyFn(
        CONTRACT,
        "get-agent-id-by-owner",
        [Cl.principal(wallet1)],
        wallet1
      );
      // Should be the latest (agent-id 1)
      expect(result).toBeSome(uintCV(1n));
    });

    it("tracks different owners independently", () => {
      simnet.callPublicFn(CONTRACT, "register", [], wallet1);
      simnet.callPublicFn(CONTRACT, "register", [], wallet2);

      const result1 = simnet.callReadOnlyFn(
        CONTRACT,
        "get-agent-id-by-owner",
        [Cl.principal(wallet1)],
        wallet1
      );
      const result2 = simnet.callReadOnlyFn(
        CONTRACT,
        "get-agent-id-by-owner",
        [Cl.principal(wallet2)],
        wallet2
      );

      expect(result1.result).toBeSome(uintCV(0n));
      expect(result2.result).toBeSome(uintCV(1n));
    });
  });

  describe("unset-agent-wallet clears reverse lookup", () => {
    it("clears reverse lookup when wallet is unset", () => {
      simnet.callPublicFn(CONTRACT, "register", [], wallet1);

      // Verify reverse lookup is set
      let result = simnet.callReadOnlyFn(
        CONTRACT,
        "get-agent-id-by-owner",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(result.result).toBeSome(uintCV(0n));

      // Unset agent wallet
      simnet.callPublicFn(CONTRACT, "unset-agent-wallet", [Cl.uint(0)], wallet1);

      // Reverse lookup should be cleared
      result = simnet.callReadOnlyFn(
        CONTRACT,
        "get-agent-id-by-owner",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(result.result).toBeNone();
    });
  });

  describe("transfer updates reverse lookup", () => {
    it("updates reverse lookup on transfer", () => {
      // wallet1 registers
      simnet.callPublicFn(CONTRACT, "register", [], wallet1);

      // Transfer from wallet1 to wallet2
      simnet.callPublicFn(
        CONTRACT,
        "transfer",
        [Cl.uint(0), Cl.principal(wallet1), Cl.principal(wallet2)],
        wallet1
      );

      // wallet1 should no longer have an agent
      const result1 = simnet.callReadOnlyFn(
        CONTRACT,
        "get-agent-id-by-owner",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(result1.result).toBeNone();

      // wallet2 should now own agent 0
      const result2 = simnet.callReadOnlyFn(
        CONTRACT,
        "get-agent-id-by-owner",
        [Cl.principal(wallet2)],
        wallet2
      );
      expect(result2.result).toBeSome(uintCV(0n));
    });

    it("preserves other agents when transferring one", () => {
      // Both wallets register
      simnet.callPublicFn(CONTRACT, "register", [], wallet1);
      simnet.callPublicFn(CONTRACT, "register", [], wallet2);

      // wallet2 transfers agent 1 to wallet1
      simnet.callPublicFn(
        CONTRACT,
        "transfer",
        [Cl.uint(1), Cl.principal(wallet2), Cl.principal(wallet1)],
        wallet2
      );

      // wallet1's reverse lookup should now point to agent 1 (last-write-wins)
      const result1 = simnet.callReadOnlyFn(
        CONTRACT,
        "get-agent-id-by-owner",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(result1.result).toBeSome(uintCV(1n));

      // wallet2's reverse lookup should be cleared
      const result2 = simnet.callReadOnlyFn(
        CONTRACT,
        "get-agent-id-by-owner",
        [Cl.principal(wallet2)],
        wallet2
      );
      expect(result2.result).toBeNone();
    });
  });
});
