import { describe, expect, it } from "vitest";

import {
  bufferCV,
  bufferCVFromString,
  Cl,
  listCV,
  principalCV,
  stringUtf8CV,
  tupleCV,
  uintCV,
} from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const address1 = accounts.get("wallet_1")!;
const address2 = accounts.get("wallet_2")!;

/*
  The test below is an example. To learn more, read the testing documentation here:
  https://docs.hiro.so/stacks/clarinet-js-sdk
*/

describe("identity-registry public functions", () => {
  it("register() registers a new agent successfully", () => {
    // arrange

    // act
    const { result } = simnet.callPublicFn(
      "identity-registry",
      "register",
      [],
      address1
    );

    // assert
    expect(result).toBeOk(uintCV(0n));
  });

  it("register-with-uri() registers a new agent with custom URI successfully", () => {
    // arrange

    // act
    const uri = stringUtf8CV("ipfs://test-uri");
    const { result } = simnet.callPublicFn(
      "identity-registry",
      "register-with-uri",
      [uri],
      address1
    );

    // assert
    expect(result).toBeOk(uintCV(0n));
  });

  it("register-full() registers a new agent with URI and metadata successfully", () => {
    // arrange
    const uri = stringUtf8CV("ipfs://full");
    const testKey = stringUtf8CV("test-key");
    const testValue = bufferCV(Buffer.from("test-value", "utf8"));
    const metadataEntry = tupleCV({ key: testKey, value: testValue });
    const metadata = listCV([metadataEntry]);

    // act
    const { result } = simnet.callPublicFn(
      "identity-registry",
      "register-full",
      [uri, metadata],
      address1
    );

    // assert
    expect(result).toBeOk(uintCV(0n));
  });

  it("set-agent-uri() allows owner to update agent URI", () => {
    // arrange
    simnet.callPublicFn("identity-registry", "register", [], address1);

    // act
    const newUri = stringUtf8CV("ipfs://updated");
    const { result } = simnet.callPublicFn(
      "identity-registry",
      "set-agent-uri",
      [uintCV(0n), newUri],
      address1
    );

    // assert
    expect(result).toBeOk(Cl.bool(true));
  });

  it("set-metadata() allows owner to set agent metadata", () => {
    // arrange
    simnet.callPublicFn("identity-registry", "register", [], address1);

    // act
    const key = stringUtf8CV("color");
    const value = bufferCVFromString("blue");
    const { result } = simnet.callPublicFn(
      "identity-registry",
      "set-metadata",
      [uintCV(0n), key, value],
      address1
    );

    // assert
    expect(result).toBeOk(Cl.bool(true));
  });

  it("set-approval-for-all() allows owner to approve operator", () => {
    // arrange
    simnet.callPublicFn("identity-registry", "register", [], address1);

    // act
    const { result } = simnet.callPublicFn(
      "identity-registry",
      "set-approval-for-all",
      [uintCV(0n), principalCV(address2), Cl.bool(true)],
      address1
    );

    // assert
    expect(result).toBeOk(Cl.bool(true));
  });

  it("set-agent-uri() fails if caller not authorized", () => {
    // arrange
    simnet.callPublicFn("identity-registry", "register", [], address1);

    // act
    const newUri = stringUtf8CV("ipfs://updated");
    const { result } = simnet.callPublicFn(
      "identity-registry",
      "set-agent-uri",
      [uintCV(0n), newUri],
      address2
    );

    // assert
    expect(result).toBeErr(uintCV(1000n));
  });

  it("set-metadata() fails if caller not authorized", () => {
    // arrange
    simnet.callPublicFn("identity-registry", "register", [], address1);

    // act
    const key = stringUtf8CV("color");
    const value = bufferCV(Buffer.from("blue", "utf8"));
    const { result } = simnet.callPublicFn(
      "identity-registry",
      "set-metadata",
      [uintCV(0n), key, value],
      address2
    );

    // assert
    expect(result).toBeErr(uintCV(1000n));
  });

  it("set-approval-for-all() fails if caller not owner", () => {
    // arrange
    simnet.callPublicFn("identity-registry", "register", [], address1);

    // act
    const { result } = simnet.callPublicFn(
      "identity-registry",
      "set-approval-for-all",
      [uintCV(0n), principalCV(address2), Cl.bool(true)],
      address2
    );

    // assert
    expect(result).toBeErr(uintCV(1000n));
  });

  it("register() registers multiple agents with incrementing IDs", () => {
    // act
    const { result: r1 } = simnet.callPublicFn(
      "identity-registry",
      "register",
      [],
      address1
    );
    const { result: r2 } = simnet.callPublicFn(
      "identity-registry",
      "register",
      [],
      address2
    );

    // assert
    expect(r1).toBeOk(uintCV(0n));
    expect(r2).toBeOk(uintCV(1n));

    const owner0 = simnet.callReadOnlyFn(
      "identity-registry",
      "owner-of",
      [uintCV(0n)],
      deployer
    ).result;
    expect(owner0).toBeSome(principalCV(address1));

    const owner1 = simnet.callReadOnlyFn(
      "identity-registry",
      "owner-of",
      [uintCV(1n)],
      deployer
    ).result;
    expect(owner1).toBeSome(principalCV(address2));
  });

  it("set-agent-uri() succeeds when called by approved operator", () => {
    // arrange
    simnet.callPublicFn("identity-registry", "register", [], address1);
    simnet.callPublicFn(
      "identity-registry",
      "set-approval-for-all",
      [uintCV(0n), principalCV(address2), Cl.bool(true)],
      address1
    );

    // act
    const newUri = stringUtf8CV("ipfs://operator-updated");
    const { result } = simnet.callPublicFn(
      "identity-registry",
      "set-agent-uri",
      [uintCV(0n), newUri],
      address2
    );

    // assert
    expect(result).toBeOk(Cl.bool(true));
  });
});

describe("identity-registry SIP-009 NFT functions", () => {
  it("get-last-token-id() returns correct ID after registrations", () => {
    // arrange - register 3 agents
    simnet.callPublicFn("identity-registry", "register", [], address1);
    simnet.callPublicFn("identity-registry", "register", [], address1);
    simnet.callPublicFn("identity-registry", "register", [], address2);

    // act
    const { result } = simnet.callReadOnlyFn(
      "identity-registry",
      "get-last-token-id",
      [],
      deployer
    );

    // assert
    expect(result).toBeOk(uintCV(2n));
  });

  it("get-last-token-id() handles no registrations", () => {
    // act
    const { result } = simnet.callReadOnlyFn(
      "identity-registry",
      "get-last-token-id",
      [],
      deployer
    );

    // assert - should error when no tokens minted
    expect(result).toBeErr(uintCV(1001n));
  });

  it("get-token-uri() returns URI wrapped in ok", () => {
    // arrange
    const testUri = stringUtf8CV("ipfs://test-uri");
    simnet.callPublicFn(
      "identity-registry",
      "register-with-uri",
      [testUri],
      address1
    );

    // act
    const { result } = simnet.callReadOnlyFn(
      "identity-registry",
      "get-token-uri",
      [uintCV(0n)],
      deployer
    );

    // assert - SIP-009 wraps in ok
    expect(result).toBeOk(Cl.some(testUri));
  });

  it("get-owner() returns owner principal wrapped in ok", () => {
    // arrange
    simnet.callPublicFn("identity-registry", "register", [], address1);

    // act
    const { result } = simnet.callReadOnlyFn(
      "identity-registry",
      "get-owner",
      [uintCV(0n)],
      deployer
    );

    // assert - SIP-009 wraps in ok
    expect(result).toBeOk(Cl.some(Cl.principal(address1)));
  });

  it("transfer() allows owner to transfer NFT", () => {
    // arrange
    simnet.callPublicFn("identity-registry", "register", [], address1);

    // act
    const { result } = simnet.callPublicFn(
      "identity-registry",
      "transfer",
      [uintCV(0n), principalCV(address1), principalCV(address2)],
      address1
    );

    // assert
    expect(result).toBeOk(Cl.bool(true));

    // verify new owner
    const ownerResult = simnet.callReadOnlyFn(
      "identity-registry",
      "get-owner",
      [uintCV(0n)],
      deployer
    );
    expect(ownerResult.result).toBeOk(Cl.some(Cl.principal(address2)));
  });

  it("transfer() fails when sender is not tx-sender", () => {
    // arrange
    simnet.callPublicFn("identity-registry", "register", [], address1);

    // act - address1 tries to transfer but claims sender is address2
    const { result } = simnet.callPublicFn(
      "identity-registry",
      "transfer",
      [uintCV(0n), principalCV(address2), principalCV(address1)],
      address1
    );

    // assert
    expect(result).toBeErr(uintCV(1005n)); // ERR_INVALID_SENDER
  });

  it("transfer() fails when sender is not owner", () => {
    // arrange
    simnet.callPublicFn("identity-registry", "register", [], address1);

    // act - address2 tries to transfer address1's NFT
    const { result } = simnet.callPublicFn(
      "identity-registry",
      "transfer",
      [uintCV(0n), principalCV(address2), principalCV(address1)],
      address2
    );

    // assert
    expect(result).toBeErr(uintCV(1000n)); // ERR_NOT_AUTHORIZED
  });

  it("transfer() fails for non-existent token", () => {
    // act
    const { result } = simnet.callPublicFn(
      "identity-registry",
      "transfer",
      [uintCV(999n), principalCV(address1), principalCV(address2)],
      address1
    );

    // assert
    expect(result).toBeErr(uintCV(1001n)); // ERR_AGENT_NOT_FOUND
  });
});

describe("identity-registry read-only functions", () => {
  it("owner-of() returns the owner of an agent (legacy)", () => {
    // arrange
    simnet.callPublicFn("identity-registry", "register", [], address1);

    // act
    const { result } = simnet.callReadOnlyFn(
      "identity-registry",
      "owner-of",
      [uintCV(0n)],
      deployer
    );

    // assert
    expect(result).toBeSome(principalCV(address1));
  });

  it("get-uri() returns the URI of an agent", () => {
    // arrange
    const testUri = stringUtf8CV("ipfs://test");
    simnet.callPublicFn(
      "identity-registry",
      "register-with-uri",
      [testUri],
      address1
    );

    // act
    const { result } = simnet.callReadOnlyFn(
      "identity-registry",
      "get-uri",
      [uintCV(0n)],
      deployer
    );

    // assert
    expect(result).toBeSome(testUri);
  });

  it("get-metadata() returns the metadata value for a key", () => {
    // arrange
    simnet.callPublicFn("identity-registry", "register", [], address1);
    const key = stringUtf8CV("color");
    const value = bufferCV(Buffer.from("blue", "utf8"));
    simnet.callPublicFn(
      "identity-registry",
      "set-metadata",
      [uintCV(0n), key, value],
      address1
    );

    // act
    const { result } = simnet.callReadOnlyFn(
      "identity-registry",
      "get-metadata",
      [uintCV(0n), key],
      deployer
    );

    // assert
    expect(result).toBeSome(value);
  });

  it("is-approved-for-all() returns true if operator is approved", () => {
    // arrange
    simnet.callPublicFn("identity-registry", "register", [], address1);
    simnet.callPublicFn(
      "identity-registry",
      "set-approval-for-all",
      [uintCV(0n), principalCV(address2), Cl.bool(true)],
      address1
    );

    // act
    const { result } = simnet.callReadOnlyFn(
      "identity-registry",
      "is-approved-for-all",
      [uintCV(0n), principalCV(address2)],
      deployer
    );

    // assert
    expect(result).toBeBool(true);
  });

  it("get-version() returns the contract version", () => {
    // arrange

    // act
    const { result } = simnet.callReadOnlyFn(
      "identity-registry",
      "get-version",
      [],
      deployer
    );

    // assert
    expect(result).toStrictEqual(Cl.stringUtf8("2.0.0"));
  });

  it("is-approved-for-all() returns false by default", () => {
    // arrange
    simnet.callPublicFn("identity-registry", "register", [], address1);

    // act
    const { result } = simnet.callReadOnlyFn(
      "identity-registry",
      "is-approved-for-all",
      [uintCV(0n), principalCV(address2)],
      deployer
    );

    // assert
    expect(result).toBeBool(false);
  });

  it("owner-of() returns none for non-existent agent", () => {
    // act
    const { result } = simnet.callReadOnlyFn(
      "identity-registry",
      "owner-of",
      [uintCV(999n)],
      deployer
    );

    // assert
    expect(result).toBeNone();
  });
});

describe("identity-registry agent-wallet feature", () => {
  it("register() auto-sets agent-wallet to owner", () => {
    // act
    simnet.callPublicFn("identity-registry", "register", [], address1);
    const { result } = simnet.callReadOnlyFn(
      "identity-registry",
      "get-agent-wallet",
      [uintCV(0n)],
      deployer
    );

    // assert
    expect(result).toBeSome(principalCV(address1));
  });

  it("register-with-uri() auto-sets agent-wallet to owner", () => {
    // act
    const uri = stringUtf8CV("ipfs://test");
    simnet.callPublicFn("identity-registry", "register-with-uri", [uri], address1);
    const { result } = simnet.callReadOnlyFn(
      "identity-registry",
      "get-agent-wallet",
      [uintCV(0n)],
      deployer
    );

    // assert
    expect(result).toBeSome(principalCV(address1));
  });

  it("register-full() auto-sets agent-wallet to owner", () => {
    // act
    const uri = stringUtf8CV("ipfs://full");
    const metadata = listCV([]);
    simnet.callPublicFn("identity-registry", "register-full", [uri, metadata], address1);
    const { result } = simnet.callReadOnlyFn(
      "identity-registry",
      "get-agent-wallet",
      [uintCV(0n)],
      deployer
    );

    // assert
    expect(result).toBeSome(principalCV(address1));
  });

  it("set-metadata() rejects agentWallet reserved key", () => {
    // arrange
    simnet.callPublicFn("identity-registry", "register", [], address1);

    // act
    const key = stringUtf8CV("agentWallet");
    const value = bufferCVFromString("test");
    const { result } = simnet.callPublicFn(
      "identity-registry",
      "set-metadata",
      [uintCV(0n), key, value],
      address1
    );

    // assert - ERR_RESERVED_KEY is u1004
    expect(result).toBeErr(uintCV(1004n));
  });

  it("register-full() rejects metadata with agentWallet key", () => {
    // act
    const uri = stringUtf8CV("ipfs://test");
    const testKey = stringUtf8CV("agentWallet");
    const testValue = bufferCV(Buffer.from("test-value", "utf8"));
    const metadataEntry = tupleCV({ key: testKey, value: testValue });
    const metadata = listCV([metadataEntry]);
    const { result } = simnet.callPublicFn(
      "identity-registry",
      "register-full",
      [uri, metadata],
      address1
    );

    // assert - ERR_RESERVED_KEY is u1004 (more specific than ERR_METADATA_SET_FAILED)
    expect(result).toBeErr(uintCV(1004n));
  });

  it("get-agent-wallet() returns none for non-existent agent", () => {
    // act
    const { result } = simnet.callReadOnlyFn(
      "identity-registry",
      "get-agent-wallet",
      [uintCV(999n)],
      deployer
    );

    // assert
    expect(result).toBeNone();
  });

  it("set-agent-wallet-direct() allows approved operator to set wallet", () => {
    // arrange
    simnet.callPublicFn("identity-registry", "register", [], address1);
    // approve address2 as operator
    simnet.callPublicFn(
      "identity-registry",
      "set-approval-for-all",
      [uintCV(0n), principalCV(address2), Cl.bool(true)],
      address1
    );

    // act - address2 (approved operator) calls to set itself as wallet
    const { result } = simnet.callPublicFn(
      "identity-registry",
      "set-agent-wallet-direct",
      [uintCV(0n)],
      address2
    );

    // assert
    expect(result).toBeOk(Cl.bool(true));
    const { result: wallet } = simnet.callReadOnlyFn(
      "identity-registry",
      "get-agent-wallet",
      [uintCV(0n)],
      deployer
    );
    expect(wallet).toBeSome(principalCV(address2));
  });

  it("set-agent-wallet-direct() rejects unauthorized caller", () => {
    // arrange
    simnet.callPublicFn("identity-registry", "register", [], address1);

    // act - address2 (not owner/operator) tries to set wallet
    const { result } = simnet.callPublicFn(
      "identity-registry",
      "set-agent-wallet-direct",
      [uintCV(0n)],
      address2
    );

    // assert - ERR_NOT_AUTHORIZED is u1000
    expect(result).toBeErr(uintCV(1000n));
  });

  it("set-agent-wallet-direct() rejects if caller is already the wallet", () => {
    // arrange
    simnet.callPublicFn("identity-registry", "register", [], address1);
    // address1 is already the wallet from registration

    // act - address1 tries to set itself again
    const { result } = simnet.callPublicFn(
      "identity-registry",
      "set-agent-wallet-direct",
      [uintCV(0n)],
      address1
    );

    // assert - ERR_WALLET_ALREADY_SET is u1006
    expect(result).toBeErr(uintCV(1006n));
  });

  it("set-agent-wallet-direct() rejects for non-existent agent", () => {
    // act
    const { result } = simnet.callPublicFn(
      "identity-registry",
      "set-agent-wallet-direct",
      [uintCV(999n)],
      address1
    );

    // assert - ERR_AGENT_NOT_FOUND is u1001
    expect(result).toBeErr(uintCV(1001n));
  });

  it("set-agent-wallet-signed() exists with correct parameters", () => {
    // Note: Full signature testing requires integration tests with real keys
    // This test verifies the function exists and has correct error handling

    // arrange
    simnet.callPublicFn("identity-registry", "register", [], address1);

    // act - call with dummy signature and expired deadline
    const agentId = uintCV(0n);
    const newWallet = principalCV(address2);
    const deadline = uintCV(0n); // Expired
    const signature = bufferCV(Buffer.alloc(65)); // Dummy signature
    const { result } = simnet.callPublicFn(
      "identity-registry",
      "set-agent-wallet-signed",
      [agentId, newWallet, deadline, signature],
      address1
    );

    // assert - should reject expired deadline (ERR_EXPIRED_SIGNATURE is u1007)
    expect(result).toBeErr(uintCV(1007n));
  });

  it("set-agent-wallet-signed() rejects non-authorized caller", () => {
    // arrange
    simnet.callPublicFn("identity-registry", "register", [], address1);

    // act - address2 (not owner/operator) tries to set wallet
    const agentId = uintCV(0n);
    const newWallet = principalCV(address2);
    const deadline = uintCV(999999n); // Far future
    const signature = bufferCV(Buffer.alloc(65));
    const { result } = simnet.callPublicFn(
      "identity-registry",
      "set-agent-wallet-signed",
      [agentId, newWallet, deadline, signature],
      address2
    );

    // assert - ERR_NOT_AUTHORIZED is u1000
    expect(result).toBeErr(uintCV(1000n));
  });

  it("set-agent-wallet-signed() rejects for non-existent agent", () => {
    // act
    const agentId = uintCV(999n);
    const newWallet = principalCV(address2);
    const deadline = uintCV(999999n);
    const signature = bufferCV(Buffer.alloc(65));
    const { result } = simnet.callPublicFn(
      "identity-registry",
      "set-agent-wallet-signed",
      [agentId, newWallet, deadline, signature],
      address1
    );

    // assert - ERR_AGENT_NOT_FOUND is u1001
    expect(result).toBeErr(uintCV(1001n));
  });

  it("unset-agent-wallet() allows owner to clear wallet", () => {
    // arrange
    simnet.callPublicFn("identity-registry", "register", [], address1);

    // act
    const { result } = simnet.callPublicFn(
      "identity-registry",
      "unset-agent-wallet",
      [uintCV(0n)],
      address1
    );

    // assert
    expect(result).toBeOk(Cl.bool(true));
    const { result: wallet } = simnet.callReadOnlyFn(
      "identity-registry",
      "get-agent-wallet",
      [uintCV(0n)],
      deployer
    );
    expect(wallet).toBeNone();
  });

  it("unset-agent-wallet() rejects non-authorized caller", () => {
    // arrange
    simnet.callPublicFn("identity-registry", "register", [], address1);

    // act - address2 (not owner/operator) tries to unset
    const { result } = simnet.callPublicFn(
      "identity-registry",
      "unset-agent-wallet",
      [uintCV(0n)],
      address2
    );

    // assert - ERR_NOT_AUTHORIZED is u1000
    expect(result).toBeErr(uintCV(1000n));
  });

  it("unset-agent-wallet() allows approved operator to clear wallet", () => {
    // arrange
    simnet.callPublicFn("identity-registry", "register", [], address1);
    simnet.callPublicFn(
      "identity-registry",
      "set-approval-for-all",
      [uintCV(0n), principalCV(address2), Cl.bool(true)],
      address1
    );

    // act
    const { result } = simnet.callPublicFn(
      "identity-registry",
      "unset-agent-wallet",
      [uintCV(0n)],
      address2
    );

    // assert
    expect(result).toBeOk(Cl.bool(true));
  });

  it("transfer() clears agent-wallet before transferring", () => {
    // arrange
    simnet.callPublicFn("identity-registry", "register", [], address1);
    const { result: walletBefore } = simnet.callReadOnlyFn(
      "identity-registry",
      "get-agent-wallet",
      [uintCV(0n)],
      deployer
    );
    expect(walletBefore).toBeSome(principalCV(address1));

    // act - transfer to address2
    simnet.callPublicFn(
      "identity-registry",
      "transfer",
      [uintCV(0n), principalCV(address1), principalCV(address2)],
      address1
    );

    // assert - wallet should be cleared
    const { result: walletAfter } = simnet.callReadOnlyFn(
      "identity-registry",
      "get-agent-wallet",
      [uintCV(0n)],
      deployer
    );
    expect(walletAfter).toBeNone();
  });

  it("is-authorized-or-owner() returns true for owner", () => {
    // arrange
    simnet.callPublicFn("identity-registry", "register", [], address1);

    // act
    const { result } = simnet.callReadOnlyFn(
      "identity-registry",
      "is-authorized-or-owner",
      [principalCV(address1), uintCV(0n)],
      deployer
    );

    // assert
    expect(result).toBeOk(Cl.bool(true));
  });

  it("is-authorized-or-owner() returns true for approved operator", () => {
    // arrange
    simnet.callPublicFn("identity-registry", "register", [], address1);
    simnet.callPublicFn(
      "identity-registry",
      "set-approval-for-all",
      [uintCV(0n), principalCV(address2), Cl.bool(true)],
      address1
    );

    // act
    const { result } = simnet.callReadOnlyFn(
      "identity-registry",
      "is-authorized-or-owner",
      [principalCV(address2), uintCV(0n)],
      deployer
    );

    // assert
    expect(result).toBeOk(Cl.bool(true));
  });

  it("is-authorized-or-owner() returns false for others", () => {
    // arrange
    simnet.callPublicFn("identity-registry", "register", [], address1);

    // act
    const { result } = simnet.callReadOnlyFn(
      "identity-registry",
      "is-authorized-or-owner",
      [principalCV(address2), uintCV(0n)],
      deployer
    );

    // assert
    expect(result).toBeOk(Cl.bool(false));
  });

  it("is-authorized-or-owner() returns error for non-existent agent", () => {
    // act
    const { result } = simnet.callReadOnlyFn(
      "identity-registry",
      "is-authorized-or-owner",
      [principalCV(address1), uintCV(999n)],
      deployer
    );

    // assert - ERR_AGENT_NOT_FOUND is u1001
    expect(result).toBeErr(uintCV(1001n));
  });
});
