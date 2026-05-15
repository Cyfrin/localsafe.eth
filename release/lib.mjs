import { CID } from "multiformats/cid";
import { concat, keccak256, numberToHex, toBytes, toHex } from "viem";

// IPFS CIDv1 → EIP-1577 contenthash (the 0xe301 prefix is the IPFS codec).
export function cidToContenthash(cidString) {
  const v1 = CID.parse(cidString).toV1();
  return toHex(new Uint8Array([0xe3, 0x01, ...v1.bytes]));
}

// EIP-1577 contenthash → IPFS CIDv1 string, or null if not an IPFS contenthash
// (e.g. IPNS or Swarm, or a malformed value).
export function contenthashToCid(contenthashHex) {
  if (!contenthashHex || contenthashHex === "0x") return null;
  const bytes = toBytes(contenthashHex);
  if (bytes.length < 2 || bytes[0] !== 0xe3 || bytes[1] !== 0x01) return null;
  try {
    return CID.decode(bytes.slice(2)).toString();
  } catch {
    return null;
  }
}

// ERC-8213 calldata digest: keccak256( uint256(len(calldata)) ‖ calldata ).
// https://erc8213.eth.limo/
export function calldataDigest(calldataHex) {
  const bytes = toBytes(calldataHex);
  const lenWord = numberToHex(bytes.length, { size: 32 });
  return keccak256(concat([toBytes(lenWord), bytes]));
}

// Deterministic JSON serialization for Safe TX Builder batch checksum.
// Sorts keys and emits keys-then-values, matching safe-react-apps.
const stringifyReplacer = (_, value) => (value === undefined ? null : value);

export function serializeJsonObject(json) {
  if (Array.isArray(json)) {
    return `[${json.map(serializeJsonObject).join(",")}]`;
  }
  if (typeof json === "object" && json !== null) {
    const keys = Object.keys(json).sort();
    let acc = `{${JSON.stringify(keys, stringifyReplacer)}`;
    for (const k of keys) {
      acc += `${serializeJsonObject(json[k])},`;
    }
    return `${acc}}`;
  }
  return JSON.stringify(json, stringifyReplacer);
}

// Safe TX Builder batch checksum: keccak256 of the canonical serialization,
// with meta.name stripped to null (matches safe-react-apps tx-builder).
export function safeBatchChecksum(batchFile) {
  const stripped = { ...batchFile, meta: { ...batchFile.meta, name: null } };
  return keccak256(toBytes(serializeJsonObject(stripped)));
}
