/**
 * IPv4 containment, for asking a trust list the only question worth asking:
 * **can it ever match the network it will run on?**
 *
 * A test that asserts `TRUSTED_PROXY_IPS` is *set* is a control that cannot
 * fail — `.env.selfhost.example` shipped `172.20.0.3` for a stack pinned to
 * `10.201.0.0/24` and every "is it configured" check stayed green while the
 * credential throttle ran as one global bucket. So the checks that use this
 * module compare the configured value against the subnet the compose file
 * actually declares, in both directions: wide enough to match the proxy, and
 * no wider than the network it lives on.
 *
 * IPv4 only, because every address in these stacks is one, and a bare
 * address is a `/32` — exactly how `backend/app/client_ip.py` reads it.
 */

function parse(cidr: string): { base: number; bits: number } {
  const [addr, prefix] = cidr.trim().split('/');
  const octets = addr.split('.').map(Number);
  if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) {
    throw new Error(`not an IPv4 address or CIDR block: ${cidr}`);
  }
  const bits = prefix === undefined ? 32 : Number(prefix);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) {
    throw new Error(`not an IPv4 prefix length: ${cidr}`);
  }
  const value = octets.reduce((acc, o) => acc * 256 + o, 0);
  return { base: mask(value, bits), bits };
}

/** `value` with everything below the prefix cleared, as an unsigned int. */
function mask(value: number, bits: number): number {
  if (bits === 0) return 0;
  return (value & ((0xffffffff << (32 - bits)) >>> 0)) >>> 0;
}

/** Is every address `inner` can be also an address `outer` covers? */
export function contains(outer: string, inner: string): boolean {
  const o = parse(outer);
  const i = parse(inner);
  // A wider block cannot be contained in a narrower one.
  if (i.bits < o.bits) return false;
  return mask(i.base, o.bits) === o.base;
}

/** The `n`th address of a block. `hostAt(subnet, 1)` is Docker's gateway. */
export function hostAt(cidr: string, n: number): string {
  const { base } = parse(cidr);
  const value = base + n;
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 0xff).join('.');
}
