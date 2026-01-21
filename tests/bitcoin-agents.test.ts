import { describe, expect, it, beforeEach } from "vitest";
import { Cl, ClarityType } from "@stacks/transactions";
// ClarityType used for type checking on optional/tuple results

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

describe("bitcoin-agents", () => {
  describe("mint-agent", () => {
    it("should mint a new agent with initial stats", () => {
      const { result } = simnet.callPublicFn(
        "bitcoin-agents",
        "mint-agent",
        [Cl.stringUtf8("TestAgent")],
        wallet1
      );
      expect(result).toBeOk(Cl.uint(0));

      // Check agent data
      const { result: agent } = simnet.callReadOnlyFn(
        "bitcoin-agents",
        "get-agent",
        [Cl.uint(0)],
        wallet1
      );
      expect(agent).toBeSome(
        Cl.tuple({
          owner: Cl.principal(wallet1),
          name: Cl.stringUtf8("TestAgent"),
          hunger: Cl.uint(100),
          health: Cl.uint(100),
          xp: Cl.uint(0),
          "birth-block": Cl.uint(simnet.blockHeight),
          "last-fed": Cl.uint(simnet.blockHeight),
          "total-fed-count": Cl.uint(0),
          alive: Cl.bool(true),
        })
      );
    });

    it("should mint multiple agents with sequential IDs", () => {
      const { result: result1 } = simnet.callPublicFn(
        "bitcoin-agents",
        "mint-agent",
        [Cl.stringUtf8("Agent1")],
        wallet1
      );
      expect(result1).toBeOk(Cl.uint(0));

      const { result: result2 } = simnet.callPublicFn(
        "bitcoin-agents",
        "mint-agent",
        [Cl.stringUtf8("Agent2")],
        wallet2
      );
      expect(result2).toBeOk(Cl.uint(1));

      // Verify stats
      const { result: stats } = simnet.callReadOnlyFn(
        "bitcoin-agents",
        "get-stats",
        [],
        wallet1
      );
      // Direct tuple: .value["field"].value for the actual value
      const statsData = (stats as any).value;
      expect(statsData["total-agents"].value).toBe(2n);
    });
  });

  describe("feed-agent", () => {
    beforeEach(() => {
      // Mint an agent first
      simnet.callPublicFn(
        "bitcoin-agents",
        "mint-agent",
        [Cl.stringUtf8("HungryAgent")],
        wallet1
      );
    });

    it("should feed agent with basic food", () => {
      // Advance some blocks to cause hunger decay
      simnet.mineEmptyBlocks(50);

      const { result } = simnet.callPublicFn(
        "bitcoin-agents",
        "feed-agent",
        [Cl.uint(0), Cl.uint(1)], // agent 0, basic food tier
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));

      // Check agent was fed
      const { result: agent } = simnet.callReadOnlyFn(
        "bitcoin-agents",
        "get-agent",
        [Cl.uint(0)],
        wallet1
      );
      // Access optional tuple: (some {tuple}) -> .value.value["field"]
      const agentData = (agent as any).value.value;
      expect(agentData.hunger.value).toBe(100n);
      expect(agentData.xp.value).toBe(10n); // XP_FEED_BASIC
      expect(agentData["total-fed-count"].value).toBe(1n);
    });

    it("should feed agent with premium food for more XP", () => {
      const { result } = simnet.callPublicFn(
        "bitcoin-agents",
        "feed-agent",
        [Cl.uint(0), Cl.uint(2)], // premium food tier
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));

      const { result: agent } = simnet.callReadOnlyFn(
        "bitcoin-agents",
        "get-agent",
        [Cl.uint(0)],
        wallet1
      );
      const agentData = (agent as any).value.value;
      expect(agentData.xp.value).toBe(25n); // XP_FEED_PREMIUM
    });

    it("should fail if not owner", () => {
      const { result } = simnet.callPublicFn(
        "bitcoin-agents",
        "feed-agent",
        [Cl.uint(0), Cl.uint(1)],
        wallet2 // Not the owner
      );
      expect(result).toBeErr(Cl.uint(4000)); // ERR_NOT_AUTHORIZED
    });

    it("should fail with invalid food tier", () => {
      const { result } = simnet.callPublicFn(
        "bitcoin-agents",
        "feed-agent",
        [Cl.uint(0), Cl.uint(99)], // Invalid tier
        wallet1
      );
      expect(result).toBeErr(Cl.uint(4004)); // ERR_INVALID_FOOD_TIER
    });
  });

  describe("hunger decay and computed state", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        "bitcoin-agents",
        "mint-agent",
        [Cl.stringUtf8("DecayTestAgent")],
        wallet1
      );
    });

    it("should compute hunger decay over time", () => {
      // Initially at 100 hunger
      const { result: initial } = simnet.callReadOnlyFn(
        "bitcoin-agents",
        "get-computed-state",
        [Cl.uint(0)],
        wallet1
      );
      // Direct tuple: .value["field"].value
      const initialData = (initial as any).value;
      expect(initialData.hunger.value).toBe(100n);
      expect(initialData.health.value).toBe(100n);

      // Advance 144 blocks (~1 day) = 10 hunger decay
      simnet.mineEmptyBlocks(144);

      const { result: afterDay } = simnet.callReadOnlyFn(
        "bitcoin-agents",
        "get-computed-state",
        [Cl.uint(0)],
        wallet1
      );
      const afterDayData = (afterDay as any).value;
      expect(afterDayData.hunger.value).toBe(90n);
      expect(afterDayData.health.value).toBe(100n); // Health unchanged while hunger > 0
    });

    it("should compute health decay when starving", () => {
      // Advance 15 days worth of blocks - 10 to deplete hunger, 5 more to decay health
      // At day 10, hunger hits 0. Days 11-15 cause health to decay at 5/day = 25 health lost
      simnet.mineEmptyBlocks(144 * 15);

      const { result } = simnet.callReadOnlyFn(
        "bitcoin-agents",
        "get-computed-state",
        [Cl.uint(0)],
        wallet1
      );
      const data = (result as any).value;
      expect(data.hunger.value).toBe(0n);
      // Health should have decayed (100 - 5 days * 5/day = 75)
      expect(Number(data.health.value) < 100).toBe(true);
      expect(data.health.value).toBe(75n);
    });
  });

  describe("check-death", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        "bitcoin-agents",
        "mint-agent",
        [Cl.stringUtf8("MortalAgent")],
        wallet1
      );
    });

    it("should not kill healthy agent", () => {
      const { result } = simnet.callPublicFn(
        "bitcoin-agents",
        "check-death",
        [Cl.uint(0)],
        wallet2 // Anyone can call
      );
      expect(result).toBeOk(Cl.bool(false)); // Agent still alive
    });

    it("should kill starved agent", () => {
      // Advance enough blocks to kill the agent (hunger depletes, then health)
      // 10 days for hunger to hit 0, then ~20 days for health (at 5/day decay)
      simnet.mineEmptyBlocks(144 * 30);

      const { result } = simnet.callPublicFn(
        "bitcoin-agents",
        "check-death",
        [Cl.uint(0)],
        wallet2
      );
      expect(result).toBeOk(Cl.bool(true)); // Agent died

      // Verify death certificate
      const { result: cert } = simnet.callReadOnlyFn(
        "bitcoin-agents",
        "get-death-certificate",
        [Cl.uint(0)],
        wallet1
      );
      expect(cert.type).toBe(ClarityType.OptionalSome);
      const certData = (cert as any).value.value;
      expect(certData.cause).toStrictEqual(Cl.stringUtf8("starvation"));
    });

    it("should fail on already dead agent", () => {
      // Kill the agent first
      simnet.mineEmptyBlocks(144 * 30);
      simnet.callPublicFn("bitcoin-agents", "check-death", [Cl.uint(0)], wallet2);

      // Try to kill again
      const { result } = simnet.callPublicFn(
        "bitcoin-agents",
        "check-death",
        [Cl.uint(0)],
        wallet2
      );
      expect(result).toBeErr(Cl.uint(4002)); // ERR_AGENT_ALREADY_DEAD
    });
  });

  describe("write-epitaph", () => {
    beforeEach(() => {
      // Create and kill an agent
      simnet.callPublicFn(
        "bitcoin-agents",
        "mint-agent",
        [Cl.stringUtf8("FallenAgent")],
        wallet1
      );
      simnet.mineEmptyBlocks(144 * 30);
      simnet.callPublicFn("bitcoin-agents", "check-death", [Cl.uint(0)], wallet2);
    });

    it("should allow owner to write epitaph", () => {
      const { result } = simnet.callPublicFn(
        "bitcoin-agents",
        "write-epitaph",
        [Cl.uint(0), Cl.stringUtf8("Here lies a brave agent, gone too soon.")],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));

      const { result: cert } = simnet.callReadOnlyFn(
        "bitcoin-agents",
        "get-death-certificate",
        [Cl.uint(0)],
        wallet1
      );
      const certData = (cert as any).value.value;
      expect(certData.epitaph).toStrictEqual(
        Cl.stringUtf8("Here lies a brave agent, gone too soon.")
      );
    });

    it("should fail if not owner", () => {
      const { result } = simnet.callPublicFn(
        "bitcoin-agents",
        "write-epitaph",
        [Cl.uint(0), Cl.stringUtf8("Not my agent")],
        wallet2
      );
      expect(result).toBeErr(Cl.uint(4000)); // ERR_NOT_AUTHORIZED
    });

    it("should fail if epitaph already set", () => {
      simnet.callPublicFn(
        "bitcoin-agents",
        "write-epitaph",
        [Cl.uint(0), Cl.stringUtf8("First epitaph")],
        wallet1
      );

      const { result } = simnet.callPublicFn(
        "bitcoin-agents",
        "write-epitaph",
        [Cl.uint(0), Cl.stringUtf8("Second epitaph")],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(4006)); // ERR_EPITAPH_ALREADY_SET
    });
  });

  describe("XP and evolution", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        "bitcoin-agents",
        "mint-agent",
        [Cl.stringUtf8("EvolvingAgent")],
        wallet1
      );
    });

    it("should start at level 0 (Hatchling)", () => {
      const { result } = simnet.callReadOnlyFn(
        "bitcoin-agents",
        "get-agent-level",
        [Cl.uint(0)],
        wallet1
      );
      expect(result).toBeUint(0);

      const { result: name } = simnet.callReadOnlyFn(
        "bitcoin-agents",
        "get-level-name",
        [Cl.uint(0)],
        wallet1
      );
      expect(name).toStrictEqual(Cl.stringUtf8("Hatchling"));
    });

    it("should add XP via add-xp function", () => {
      const { result } = simnet.callPublicFn(
        "bitcoin-agents",
        "add-xp",
        [Cl.uint(0), Cl.uint(100)],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));

      const { result: agent } = simnet.callReadOnlyFn(
        "bitcoin-agents",
        "get-agent",
        [Cl.uint(0)],
        wallet1
      );
      const agentData = (agent as any).value.value;
      expect(agentData.xp.value).toBe(100n);
    });

    it("should level up to Junior at 500 XP", () => {
      simnet.callPublicFn(
        "bitcoin-agents",
        "add-xp",
        [Cl.uint(0), Cl.uint(500)],
        wallet1
      );

      const { result } = simnet.callReadOnlyFn(
        "bitcoin-agents",
        "get-agent-level",
        [Cl.uint(0)],
        wallet1
      );
      expect(result).toBeUint(1); // LEVEL_JUNIOR
    });

    it("should calculate XP to next level", () => {
      // At 0 XP, need 500 to reach Junior
      const { result: toJunior } = simnet.callReadOnlyFn(
        "bitcoin-agents",
        "get-xp-to-next-level",
        [Cl.uint(0)],
        wallet1
      );
      expect(toJunior).toBeUint(500);

      // Add 100 XP, now need 400
      simnet.callPublicFn("bitcoin-agents", "add-xp", [Cl.uint(0), Cl.uint(100)], wallet1);

      const { result: afterXp } = simnet.callReadOnlyFn(
        "bitcoin-agents",
        "get-xp-to-next-level",
        [Cl.uint(0)],
        wallet1
      );
      expect(afterXp).toBeUint(400);
    });
  });

  describe("tier-based access control", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        "bitcoin-agents",
        "mint-agent",
        [Cl.stringUtf8("AccessAgent")],
        wallet1
      );
    });

    it("should check if agent can perform action based on level", () => {
      // Hatchling (level 0) cannot do level 1 action
      const { result: cannotJunior } = simnet.callReadOnlyFn(
        "bitcoin-agents",
        "can-perform-action",
        [Cl.uint(0), Cl.uint(1)], // Required level 1
        wallet1
      );
      expect(cannotJunior).toBeBool(false);

      // But can do level 0 action
      const { result: canHatchling } = simnet.callReadOnlyFn(
        "bitcoin-agents",
        "can-perform-action",
        [Cl.uint(0), Cl.uint(0)],
        wallet1
      );
      expect(canHatchling).toBeBool(true);

      // Level up to Junior
      simnet.callPublicFn("bitcoin-agents", "add-xp", [Cl.uint(0), Cl.uint(500)], wallet1);

      // Now can do level 1 action
      const { result: canJunior } = simnet.callReadOnlyFn(
        "bitcoin-agents",
        "can-perform-action",
        [Cl.uint(0), Cl.uint(1)],
        wallet1
      );
      expect(canJunior).toBeBool(true);
    });
  });

  describe("global stats", () => {
    it("should track global statistics", () => {
      // Initial stats
      const { result: initial } = simnet.callReadOnlyFn(
        "bitcoin-agents",
        "get-stats",
        [],
        wallet1
      );
      const initialData = (initial as any).value;
      expect(initialData["total-agents"].value).toBe(0n);
      expect(initialData["total-deaths"].value).toBe(0n);
      expect(initialData["total-feedings"].value).toBe(0n);

      // Mint an agent
      simnet.callPublicFn("bitcoin-agents", "mint-agent", [Cl.stringUtf8("StatsAgent")], wallet1);

      // Feed it
      simnet.callPublicFn("bitcoin-agents", "feed-agent", [Cl.uint(0), Cl.uint(1)], wallet1);
      simnet.callPublicFn("bitcoin-agents", "feed-agent", [Cl.uint(0), Cl.uint(2)], wallet1);

      const { result: afterFeeds } = simnet.callReadOnlyFn(
        "bitcoin-agents",
        "get-stats",
        [],
        wallet1
      );
      const afterData = (afterFeeds as any).value;
      expect(afterData["total-agents"].value).toBe(1n);
      expect(afterData["total-feedings"].value).toBe(2n);

      // Kill it
      simnet.mineEmptyBlocks(144 * 30);
      simnet.callPublicFn("bitcoin-agents", "check-death", [Cl.uint(0)], wallet2);

      const { result: afterDeath } = simnet.callReadOnlyFn(
        "bitcoin-agents",
        "get-stats",
        [],
        wallet1
      );
      const deathData = (afterDeath as any).value;
      expect(deathData["total-deaths"].value).toBe(1n);
      expect(deathData["alive-count"].value).toBe(0n);
    });
  });

  describe("food tier data", () => {
    it("should return correct food tier data", () => {
      const { result: basic } = simnet.callReadOnlyFn(
        "bitcoin-agents",
        "get-food-data",
        [Cl.uint(1)],
        wallet1
      );
      expect(basic).toBeOk(
        Cl.tuple({
          cost: Cl.uint(100),
          xp: Cl.uint(10),
          name: Cl.stringUtf8("Basic"),
        })
      );

      const { result: premium } = simnet.callReadOnlyFn(
        "bitcoin-agents",
        "get-food-data",
        [Cl.uint(2)],
        wallet1
      );
      expect(premium).toBeOk(
        Cl.tuple({
          cost: Cl.uint(500),
          xp: Cl.uint(25),
          name: Cl.stringUtf8("Premium"),
        })
      );

      const { result: gourmet } = simnet.callReadOnlyFn(
        "bitcoin-agents",
        "get-food-data",
        [Cl.uint(3)],
        wallet1
      );
      expect(gourmet).toBeOk(
        Cl.tuple({
          cost: Cl.uint(1000),
          xp: Cl.uint(50),
          name: Cl.stringUtf8("Gourmet"),
        })
      );

      const { result: invalid } = simnet.callReadOnlyFn(
        "bitcoin-agents",
        "get-food-data",
        [Cl.uint(99)],
        wallet1
      );
      expect(invalid).toBeErr(Cl.uint(4004)); // ERR_INVALID_FOOD_TIER
    });
  });

  describe("version", () => {
    it("should return contract version", () => {
      const { result } = simnet.callReadOnlyFn(
        "bitcoin-agents",
        "get-version",
        [],
        wallet1
      );
      expect(result).toStrictEqual(Cl.stringUtf8("1.0.0"));
    });
  });
});
