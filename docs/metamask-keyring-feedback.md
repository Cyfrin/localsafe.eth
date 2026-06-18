# MetaMask feedback: keyring-snap contract accounts (multisigs) as tx & signature targets

## Summary

When a keyring (account-management) Snap registers a **smart-contract account** — e.g. a Safe
multisig — as a MetaMask account, MetaMask's "internal account" safety guards (designed for EOAs)
block legitimate, necessary operations on that account **from the same MetaMask**:

1. **Executing a Safe transaction** (`execTransaction`) is rejected:
   > External transactions to internal accounts cannot include data

   (an `eth_sendTransaction` whose `to` is the Safe, carrying calldata, is blocked because the Safe
   is a registered "internal account".)

2. **Signing a Safe (EIP-1271) message** is rejected:
   > External signature requests cannot use internal accounts as the verifying contract

   (an `eth_signTypedData_v4` whose EIP-712 `domain.verifyingContract` is the Safe is blocked for the
   same reason.)

Both guards assume the internal account is an **EOA** ("don't send data to / sign for your own
key"). They are wrong for **contract accounts**, where calling the contract with data
(`execTransaction`) and using it as an EIP-712 `verifyingContract` (EIP-1271) are exactly how the
account is meant to be operated.

## Why it matters

A Safe owner who registers their Safe in MetaMask (so dApps can target it) then **cannot use that
same MetaMask** to sign the SafeMessage or execute the Safe transaction — the two core operations.
Current workarounds are both poor UX: (a) use a *different* wallet/profile for owner operations, or
(b) remove the Safe from MetaMask, operate, then re-add it.

## Root cause

- The account is registered as `EthAccountType.Eoa` (`eip155:eoa`) — currently the only non-4337 EVM
  account type the Keyring API offers — so MetaMask applies EOA-centric guards to it.
- There is no first-class "contract account / smart account (non-4337)" type for a multisig like a
  Safe, so it cannot be modeled as what it actually is.

## Requested change (any one of)

1. **Relax the guards for keyring-snap contract accounts**: when the internal account is provided by
   a keyring Snap and is a contract, allow `eth_sendTransaction` with data to it and EIP-712 with it
   as `verifyingContract`.
2. **Add a contract-account type** (beyond ERC-4337) to the Keyring API so multisigs/Safes can be
   modeled accurately, and scope the EOA guards to actual EOAs.
3. At minimum, provide an explicit per-account "advanced" override for these two guards.

## Reproduction

The LocalSafe (Cyfrin) keyring Snap registers a Safe as a MetaMask account. With that Safe
registered, attempt to execute any Safe transaction or sign any EIP-1271 message from the same
MetaMask — both fail with the messages above.

## Context

Raised by the LocalSafe team (Cyfrin). Note: keyring-snap allowlisting for Custom EVM Account snaps
is currently paused, so this is Flask-only today.
