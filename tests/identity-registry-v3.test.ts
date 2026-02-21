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

  describe("clear-agent-wallet (via unset-agent-wallet)", () => {
    it("clears both agent-wallets and reverse lookup", () => {
      simnet.callPublicFn(CONTRACT, "register", [], wallet1);

      // Verify both maps are set
      let reverse = simnet.callReadOnlyFn(
        CONTRACT,
        "get-agent-id-by-owner",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(reverse.result).toBeSome(uintCV(0n));

      let wallet = simnet.callReadOnlyFn(
        CONTRACT,
        "get-agent-wallet",
        [Cl.uint(0)],
        wallet1
      );
      expect(wallet.result).toBeSome(Cl.principal(wallet1));

      // Unset agent wallet
      simnet.callPublicFn(CONTRACT, "unset-agent-wallet", [Cl.uint(0)], wallet1);

      // Both maps should be cleared
      reverse = simnet.callReadOnlyFn(
        CONTRACT,
        "get-agent-id-by-owner",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(reverse.result).toBeNone();

      wallet = simnet.callReadOnlyFn(
        CONTRACT,
        "get-agent-wallet",
        [Cl.uint(0)],
        wallet1
      );
      expect(wallet.result).toBeNone();
    });

    it("is idempotent — calling unset twice does not error", () => {
      simnet.callPublicFn(CONTRACT, "register", [], wallet1);
      simnet.callPublicFn(CONTRACT, "unset-agent-wallet", [Cl.uint(0)], wallet1);

      // Second unset should still succeed (wallet already cleared)
      const { result } = simnet.callPublicFn(
        CONTRACT,
        "unset-agent-wallet",
        [Cl.uint(0)],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));

      // Both maps still cleared
      const reverse = simnet.callReadOnlyFn(
        CONTRACT,
        "get-agent-id-by-owner",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(reverse.result).toBeNone();
    });

    it("re-establishes both maps after set-agent-wallet-direct", () => {
      simnet.callPublicFn(CONTRACT, "register", [], wallet1);

      // Clear wallet
      simnet.callPublicFn(CONTRACT, "unset-agent-wallet", [Cl.uint(0)], wallet1);

      // Re-set wallet via set-agent-wallet-direct
      simnet.callPublicFn(
        CONTRACT,
        "set-agent-wallet-direct",
        [Cl.uint(0)],
        wallet1
      );

      // agent-wallets should be restored
      const wallet = simnet.callReadOnlyFn(
        CONTRACT,
        "get-agent-wallet",
        [Cl.uint(0)],
        wallet1
      );
      expect(wallet.result).toBeSome(Cl.principal(wallet1));

      // reverse lookup should be restored
      const reverse = simnet.callReadOnlyFn(
        CONTRACT,
        "get-agent-id-by-owner",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(reverse.result).toBeSome(uintCV(0n));
    });
  });

  describe("set-agent-wallet-direct clears old wallet mapping", () => {
    it("clears old wallet reverse lookup when operator sets new wallet", () => {
      // wallet1 registers (wallet1 is owner + wallet)
      simnet.callPublicFn(CONTRACT, "register", [], wallet1);

      // wallet1 approves wallet2 as operator
      simnet.callPublicFn(
        CONTRACT,
        "set-approval-for-all",
        [Cl.uint(0), Cl.principal(wallet2), Cl.bool(true)],
        wallet1
      );

      // wallet2 (operator) sets itself as the new agent wallet
      simnet.callPublicFn(
        CONTRACT,
        "set-agent-wallet-direct",
        [Cl.uint(0)],
        wallet2
      );

      // Old wallet (wallet1) reverse lookup should be cleared
      const oldReverse = simnet.callReadOnlyFn(
        CONTRACT,
        "get-agent-id-by-owner",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(oldReverse.result).toBeNone();

      // New wallet (wallet2) reverse lookup should be set
      const newReverse = simnet.callReadOnlyFn(
        CONTRACT,
        "get-agent-id-by-owner",
        [Cl.principal(wallet2)],
        wallet2
      );
      expect(newReverse.result).toBeSome(uintCV(0n));

      // agent-wallets should point to wallet2
      const agentWallet = simnet.callReadOnlyFn(
        CONTRACT,
        "get-agent-wallet",
        [Cl.uint(0)],
        wallet1
      );
      expect(agentWallet.result).toBeSome(Cl.principal(wallet2));
    });

    it("handles set-agent-wallet-direct when no prior wallet exists", () => {
      simnet.callPublicFn(CONTRACT, "register", [], wallet1);

      // Clear wallet first
      simnet.callPublicFn(CONTRACT, "unset-agent-wallet", [Cl.uint(0)], wallet1);

      // Now set wallet2 as wallet (wallet1 is still owner)
      simnet.callPublicFn(
        CONTRACT,
        "set-approval-for-all",
        [Cl.uint(0), Cl.principal(wallet2), Cl.bool(true)],
        wallet1
      );
      simnet.callPublicFn(
        CONTRACT,
        "set-agent-wallet-direct",
        [Cl.uint(0)],
        wallet2
      );

      // wallet2 should be the wallet with reverse lookup
      const wallet = simnet.callReadOnlyFn(
        CONTRACT,
        "get-agent-wallet",
        [Cl.uint(0)],
        wallet1
      );
      expect(wallet.result).toBeSome(Cl.principal(wallet2));

      const reverse = simnet.callReadOnlyFn(
        CONTRACT,
        "get-agent-id-by-owner",
        [Cl.principal(wallet2)],
        wallet2
      );
      expect(reverse.result).toBeSome(uintCV(0n));
    });
  });

  describe("transfer updates reverse lookup", () => {
    it("clears agent-wallet and sender reverse lookup, sets recipient reverse lookup", () => {
      // wallet1 registers
      simnet.callPublicFn(CONTRACT, "register", [], wallet1);

      // Transfer from wallet1 to wallet2
      simnet.callPublicFn(
        CONTRACT,
        "transfer",
        [Cl.uint(0), Cl.principal(wallet1), Cl.principal(wallet2)],
        wallet1
      );

      // agent-wallet should be cleared (clear-agent-wallet runs before transfer)
      const agentWallet = simnet.callReadOnlyFn(
        CONTRACT,
        "get-agent-wallet",
        [Cl.uint(0)],
        wallet1
      );
      expect(agentWallet.result).toBeNone();

      // wallet1 reverse lookup should be cleared
      const result1 = simnet.callReadOnlyFn(
        CONTRACT,
        "get-agent-id-by-owner",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(result1.result).toBeNone();

      // wallet2 reverse lookup should be set
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

  describe("wallet collision prevention", () => {
    it("set-agent-wallet-direct rejects if wallet already assigned to another agent", () => {
      const wallet3 = accounts.get("wallet_3")!;
      // wallet1 registers agent 0, wallet2 registers agent 1
      simnet.callPublicFn(CONTRACT, "register", [], wallet1);
      simnet.callPublicFn(CONTRACT, "register", [], wallet2);

      // wallet1 approves wallet2 as operator for agent 0
      simnet.callPublicFn(
        CONTRACT,
        "set-approval-for-all",
        [Cl.uint(0), Cl.principal(wallet2), Cl.bool(true)],
        wallet1
      );

      // wallet2 tries to set itself as wallet for agent 0,
      // but wallet2 is already wallet for agent 1 → should fail with ERR_WALLET_CONFLICT (u1009)
      const { result } = simnet.callPublicFn(
        CONTRACT,
        "set-agent-wallet-direct",
        [Cl.uint(0)],
        wallet2
      );
      expect(result).toBeErr(Cl.uint(1009));
    });

    it("set-agent-wallet-direct allows same wallet to re-set on same agent", () => {
      // wallet1 registers agent 0
      simnet.callPublicFn(CONTRACT, "register", [], wallet1);

      // wallet1 unsets wallet, then re-sets — should succeed (same agent)
      simnet.callPublicFn(CONTRACT, "unset-agent-wallet", [Cl.uint(0)], wallet1);
      const { result } = simnet.callPublicFn(
        CONTRACT,
        "set-agent-wallet-direct",
        [Cl.uint(0)],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("transfer clears sender reverse lookup even when sender owns multiple agents", () => {
      // wallet1 registers agent 0 and agent 1 (reverse lookup points to agent 1 — last-write-wins)
      simnet.callPublicFn(CONTRACT, "register", [], wallet1);
      simnet.callPublicFn(CONTRACT, "register", [], wallet1);

      // Transfer agent 0 to wallet2
      simnet.callPublicFn(
        CONTRACT,
        "transfer",
        [Cl.uint(0), Cl.principal(wallet1), Cl.principal(wallet2)],
        wallet1
      );

      // wallet2 should have reverse lookup for agent 0
      const r2 = simnet.callReadOnlyFn(
        CONTRACT,
        "get-agent-id-by-owner",
        [Cl.principal(wallet2)],
        wallet2
      );
      expect(r2.result).toBeSome(uintCV(0n));

      // wallet1 still owns agent 1 but reverse lookup was cleared by transfer
      // This is a known limitation of single-value reverse lookup
      const r1 = simnet.callReadOnlyFn(
        CONTRACT,
        "get-agent-id-by-owner",
        [Cl.principal(wallet1)],
        wallet1
      );
      // reverse lookup was deleted since sender's entry was cleared
      expect(r1.result).toBeNone();
    });
  });
});
