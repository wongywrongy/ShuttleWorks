#!/usr/bin/env bash
set -euo pipefail

# Validate operator-provided TLS material before Docker Compose tries to
# create the proxy. This script never creates, copies, or prints key material.
cert_file=${LAN_TLS_CERT_FILE:-}
key_file=${LAN_TLS_KEY_FILE:-}

if [[ -z "$cert_file" || -z "$key_file" ]]; then
  echo "LAN TLS requires LAN_TLS_CERT_FILE and LAN_TLS_KEY_FILE" >&2
  exit 2
fi
[[ -f "$cert_file" ]] || { echo "certificate is not a regular file: $cert_file" >&2; exit 2; }
[[ -f "$key_file" ]] || { echo "private key is not a regular file: $key_file" >&2; exit 2; }

openssl x509 -in "$cert_file" -noout >/dev/null || {
  echo "certificate is not a readable PEM certificate" >&2; exit 2;
}
openssl x509 -in "$cert_file" -checkend 604800 -noout >/dev/null || {
  echo "certificate expires within seven days" >&2; exit 2;
}
san_text=$(openssl x509 -in "$cert_file" -noout -text)
grep -Eq 'DNS:shuttleworks\.local([,[:space:]]|$)' <<<"$san_text" &&
grep -Eq 'DNS:shuttleworks-play\.local([,[:space:]]|$)' <<<"$san_text" || {
  echo "certificate SAN must include both shuttleworks.local and shuttleworks-play.local" >&2; exit 2;
}

cert_public=$(openssl x509 -in "$cert_file" -pubkey -noout | openssl pkey -pubin -outform DER | openssl sha256)
key_public=$(openssl pkey -in "$key_file" -pubout -outform DER 2>/dev/null | openssl sha256 || true)
[[ -n "$key_public" && "$cert_public" == "$key_public" ]] || {
  echo "certificate and private key do not match (or key is unreadable)" >&2; exit 2;
}

echo "LAN TLS preflight passed; certificate and key were not modified."
