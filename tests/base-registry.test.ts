import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet_1 = accounts.get("wallet_1")!;
const wallet_2 = accounts.get("wallet_2")!;

const deployDummyAgent = () => {
  const agentCode = `(define-read-only (ping) (ok u1))`;
  const deployResult = simnet.deployContract(
    "dummy-agent",
    agentCode,
    deployer.address
  );
  expect(deployResult.result).toBeOk();
  return deployResult.value!.address;
};

describe("base-registry", () => {
  it("is initialized", () => {
    expect(simnet.blockHeight).toBeUint(0);
  });

  it("registers an agent successfully", () => {
    const agentAddr = deployDummyAgent();

    const name = stringUtf8CV("MyAgent");
    const desc = stringUtf8CV("Trades BTC");

    const { result } = simnet.callPublicFn(
      "base-registry",
      "register-agent",
      [principalCV(agentAddr), name, desc],
      wallet_1.address
    );
    expect(result).toBeOk().toBeHexString();

    const ownerToAgent = simnet.getMapEntry("base-registry", "OwnerToAgent", [
      principalCV(wallet_1.address),
    ]);
    expect(ownerToAgent).toBeSome(principalCV(agentAddr));

    const agentToOwner = simnet.getMapEntry("base-registry", "AgentToOwner", [
      principalCV(agentAddr),
    ]);
    expect(agentToOwner).toBeSome(principalCV(wallet_1.address));

    const details = simnet.getMapEntry("base-registry", "AgentDetails", [
      principalCV(agentAddr),
    ]);
    expect(details).toBeSome();
  });

  it("fails to register second agent for same owner", () => {
    const agent1 = deployDummyAgent();

    const name = stringUtf8CV("MyAgent");
    const desc = stringUtf8CV("Trades BTC");

    // first register
    const firstCall = simnet.callPublicFn(
      "base-registry",
      "register-agent",
      [principalCV(agent1), name, desc],
      wallet_1.address
    );
    expect(firstCall.result).toBeOk().toBeHexString();

    const agent2 = deployDummyAgent();
    const name2 = stringUtf8CV("MyAgent2");
    const desc2 = stringUtf8CV("Trades BTC2");

    // second register
    const secondCall = simnet.callPublicFn(
      "base-registry",
      "register-agent",
      [principalCV(agent2), name2, desc2],
      wallet_1.address
    );
    expect(secondCall.result).toBeErr(u100);
  });

  it("owner can deregister agent", () => {
    const agentAddr = deployDummyAgent();

    const name = stringUtf8CV("MyAgent");
    const desc = stringUtf8CV("Trades BTC");

    const regResult = simnet.callPublicFn(
      "base-registry",
      "register-agent",
      [principalCV(agentAddr), name, desc],
      wallet_1.address
    );
    expect(regResult.result).toBeOk().toBeHexString();

    const { result } = simnet.callPublicFn(
      "base-registry",
      "deregister-agent",
      [principalCV(agentAddr)],
      wallet_1.address
    );
    expect(result).toBeOk();

    const details = simnet.getMapEntry("base-registry", "AgentDetails", [
      principalCV(agentAddr),
    ]);
    expect(details).toBeNone();
  });

  it("non-owner cannot deregister", () => {
    const agentAddr = deployDummyAgent();

    const name = stringUtf8CV("MyAgent");
    const desc = stringUtf8CV("Trades BTC");

    const regResult = simnet.callPublicFn(
      "base-registry",
      "register-agent",
      [principalCV(agentAddr), name, desc],
      wallet_1.address
    );
    expect(regResult.result).toBeOk().toBeHexString();

    const { result } = simnet.callPublicFn(
      "base-registry",
      "deregister-agent",
      [principalCV(agentAddr)],
      wallet_2.address
    );
    expect(result).toBeErr(u101);
  });

  it("fails to register bare principal as agent", () => {
    const name = stringUtf8CV("test");
    const desc = stringUtf8CV("test");

    const { result } = simnet.callPublicFn(
      "base-registry",
      "register-agent",
      [principalCV(wallet_2.address), name, desc],
      wallet_1.address
    );
    expect(result).toBeErr(u103);
  });

  it("read-only functions work", () => {
    const agentAddr = deployDummyAgent();

    const name = stringUtf8CV("MyAgent");
    const desc = stringUtf8CV("Trades BTC");

    const regResult = simnet.callPublicFn(
      "base-registry",
      "register-agent",
      [principalCV(agentAddr), name, desc],
      wallet_1.address
    );
    expect(regResult.result).toBeOk().toBeHexString();

    const roOwner = simnet.callReadOnlyFn(
      "base-registry",
      "get-agent-by-owner",
      [principalCV(wallet_1.address)],
      deployer.address
    );
    expect(roOwner.result).toBeSome(principalCV(agentAddr));

    const roInfo = simnet.callReadOnlyFn(
      "base-registry",
      "get-agent-info",
      [principalCV(agentAddr)],
      deployer.address
    );
    expect(roInfo.result).toBeSome();
  });
});
