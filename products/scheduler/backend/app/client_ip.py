"""Real client IP resolution behind a trusted reverse proxy.

``request.client.host`` is the *immediate peer*. When the API sits
behind a Cloudflare Tunnel that peer is the cloudflared connector for
every request on the internet, so anything keyed on it — the credential
throttle above all — silently becomes global rather than per-client.

``CF-Connecting-IP`` carries the real address, but a forwarded header is
only as trustworthy as the hop that set it. This module therefore
honours it **only when the immediate peer is a configured trusted
proxy**. Trusting it unconditionally would be strictly worse than
ignoring it: an attacker could rotate the header per request and never
exhaust a throttle bucket, turning a security control into a bypass.

The default is an empty trust list, so local mode never consults the
header and behaves exactly as it did before this seam existed (Rule 1).

This lives in ``app/`` rather than beside the auth router because it is
security infrastructure that any rate-shaped or audit-shaped surface
should share, not an auth implementation detail.

**Do not add uvicorn's ``--proxy-headers`` alongside this.** That flag
rewrites ``request.client.host`` from ``X-Forwarded-For``, so the peer
this module compares against ``trusted_proxy_ips`` would become the
claimed client address rather than the connector — the trust check would
never match and the header would be silently ignored again. The two
mechanisms solve the same problem and must not be stacked. ``--proxy-
headers`` exists mainly to fix ``request.url.scheme``, and this codebase
branches on the scheme nowhere (SP-CLOUD-3 audit 0.F.1), so it buys
nothing here.
"""
from __future__ import annotations

import ipaddress
from functools import lru_cache

from app.config import settings

# Cloudflare sets this on every proxied request and strips any
# client-supplied copy at the edge, so behind a Cloudflare Tunnel it is
# authoritative. Behind a different proxy, configure that proxy to set
# the same header (or extend this module) rather than trusting
# ``X-Forwarded-For``, whose multi-hop list needs its own parsing and
# trust-depth rules.
_REAL_IP_HEADER = "CF-Connecting-IP"

# Returned when the ASGI scope carries no client at all (some test
# transports, some unix-socket setups). A stable sentinel keeps throttle
# keys well-formed instead of raising or producing ``ip:None``.
_UNKNOWN = "unknown"


@lru_cache(maxsize=8)
def _parse_trusted(entries: tuple[str, ...]) -> tuple[list, list[str]]:
    """Split the configured trust list into networks and literal strings.

    Entries are accepted as either a bare address (``172.18.0.4``) or a
    CIDR block (``172.18.0.0/16``). CIDR matters in practice because
    Docker assigns container addresses from the compose network's pool
    and they change on ``--force-recreate`` — pinning a single literal IP
    is a configuration that silently stops matching, and a trust check
    that stops matching fails *open* into one global throttle bucket.

    Anything unparseable is kept as a literal for exact comparison, so a
    typo degrades to "never matches" rather than raising at import.
    """
    nets: list = []
    literals: list[str] = []
    for raw in entries:
        entry = raw.strip()
        if not entry:
            continue
        try:
            nets.append(ipaddress.ip_network(entry, strict=False))
        except ValueError:
            literals.append(entry)
    return nets, literals


def _is_trusted(peer: str) -> bool:
    nets, literals = _parse_trusted(tuple(settings.trusted_proxy_ips))
    if peer in literals:
        return True
    if not nets:
        return False
    try:
        addr = ipaddress.ip_address(peer)
    except ValueError:
        return False
    return any(addr in net for net in nets)


def client_ip(request) -> str:
    """The caller's address, as trustworthy as configuration allows.

    Returns the ``CF-Connecting-IP`` value when the immediate peer is in
    ``settings.trusted_proxy_ips``; otherwise the socket peer. Never
    raises — callers use this to build throttle keys on paths that must
    not fail open *or* error out.
    """
    peer = getattr(getattr(request, "client", None), "host", None)
    if not peer:
        return _UNKNOWN

    if _is_trusted(peer):
        forwarded = request.headers.get(_REAL_IP_HEADER)
        if forwarded:
            # Take the first entry defensively: the header is
            # single-valued by contract, but a misconfigured chain can
            # append, and a comma-joined value would otherwise become a
            # single unbounded bucket key.
            candidate = forwarded.split(",")[0].strip()
            if candidate:
                return candidate
    return peer
