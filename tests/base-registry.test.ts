
import { describe, expect, it, beforeEach } from "vitest";

import {
  principalCV,
  stringUtf8CV,
} from "@stacks/clarinet-sdk/lib/clarity";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet_1 = accounts.get("wallet_1")!;
const wallet_2 = accounts.get("wallet_2")!;

describe("base-registry", () => {
  beforeEach(() => {
    simnet.reset();
  });

  it("is initialized", () => {
    expect(simnet.blockHeight).toBeUint(0);
  });

  it("registers an agent successfully", () => {
    const agentCode = `(define-read-only (ping) (ok u1))`;
    const deployResult = simnet.deployContract("dummy-agent", agentCode, deployer.address);
    expect(deployResult.result).toBeOk();
    const agentAddr = deployResult.value!.address;

    const name = stringUtf8CV("MyAgent");
    const desc = stringUtf8CV("Trades BTC");

    const { result } = simnet.callPublicFn(
      "base-registry",
      "register-agent",
      [principalCV(agentAddr), name, desc],
      wallet_1.address
    );
    expect(result).toBeOk().toBeHexString();

    const ownerToAgent = simnet.getMapEntry(
      "base-registry",
      "OwnerToAgent",
      [principalCV(wallet_1.address)]
    );
    expect(ownerToAgent).toBeSome(principalCV(agentAddr));

    const agentToOwner = simnet.getMapEntry(
      "base-registry",
      "AgentToOwner",
      [principalCV(agentAddr)]
    );
    expect(agentToOwner).toBeSome(principalCV(wallet_1.address));

    const details = simnet.getMapEntry(
      "base-registry",
      "AgentDetails",
      [principalCV(agentAddr)]
    );
    expect(details).toBeSome();
  });

  it("fails to register duplicate agent for same owner", () => {
    const agentCode = `(define-read-only (ping) (ok u1))`;
    const deployResult = simnet.deployContract("dummy-agent", agentCode, deployer.address);
    expect(deployResult.result).toBeOk();
    const agentAddr = deployResult.value!.address;

    const name = stringUtf8CV("MyAgent");
    const desc = stringUtf8CV("Trades BTC");

    // first register
    const firstCall = simnet.callPublicFn(
      "base-registry",
      "register-agent",
      [principalCV(agentAddr), name, desc],
      wallet_1.address
    );
    expect(firstCall.result).toBeOk();

    // second register
    const secondCall = simnet.callPublicFn(
      "base-registry",
      "register-agent",
      [principalCV(agentAddr), name, desc],
      wallet_1.address
    );
    expect(secondCall.result).toBeErr(u100);
  });

  it("owner can deregister agent", () => {
    const agentCode = `(define-read-only (ping) (ok u1))`;
    const deployResult = simnet.deployContract("dummy-agent", agentCode, deployer.address);
    const agentAddr = deployResult.value!.address;

    const name = stringUtf8CV("MyAgent");
    const desc = stringUtf8CV("Trades BTC");

    simnet.callPublicFn(
      "base-registry",
      "register-agent",
      [principalCV(agentAddr), name, desc],
      wallet_1.address
    );

    const { result } = simnet.callPublicFn(
      "base-registry",
      "deregister-agent",
      [principalCV(agentAddr)],
      wallet_1.address
    );
    expect(result).toBeOk();

    const details = simnet.getMapEntry(
      "base-registry",
      "AgentDetails",
      [principalCV(agentAddr)]
    );
    expect(details).toBeNone();
  });

  it("non-owner cannot deregister", () => {
    const agentCode = `(define-read-only (ping) (ok u1))`;
    const deployResult = simnet.deployContract("dummy-agent", agentCode, deployer.address);
    const agentAddr = deployResult.value!.address;

    const name = stringUtf8CV("MyAgent");
    const desc = stringUtf8CV("Trades BTC");

    simnet.callPublicFn(
      "base-registry",
      "register-agent",
      [principalCV(agentAddr), name, desc],
      wallet_1.address
    );

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
    const agentCode = `(define-read-only (ping) (ok u1))`;
    const deployResult = simnet.deployContract("dummy-agent", agentCode, deployer.address);
    const agentAddr = deployResult.value!.address;

    const name = stringUtf8CV("MyAgent");
    const desc = stringUtf8CV("Trades BTC");

    simnet.callPublicFn(
      "base-registry",
      "register-agent",
      [principalCV(agentAddr), name, desc],
      wallet_1.address
    );

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
