from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def test_lan_tls_is_opt_in_and_loopback_by_default():
    compose = (ROOT / "infra/compose/docker-compose.lan-tls.yml").read_text()
    assert "profiles: [lan-tls]" in compose
    assert 'LAN_TLS_BIND_ADDR:-127.0.0.1' in compose
    assert "LAN_TLS_CERT_FILE:?" in compose
    assert "LAN_TLS_KEY_FILE:?" in compose
    assert "ports: !override" in compose
    assert '127.0.0.1:${FRONTEND_HOST_PORT:-80}:8080' in compose
    assert "SESSION_COOKIE_SECURE=true" in compose


def test_lan_tls_proxy_is_https_only_and_forwards_both_tiers():
    config = (ROOT / "infra/nginx/lan-tls.conf").read_text()
    assert "listen 8443 ssl" in config
    assert "listen 8444 ssl" in config
    assert "proxy_pass http://shuttleworks_operator" in config
    assert "proxy_pass http://shuttleworks_play" in config
    assert "X-Forwarded-Proto https" in config
    assert "listen 80" not in config


def test_preflight_does_not_create_or_print_private_material():
    script = (ROOT / "tools/lan-tls-preflight.sh").read_text()
    assert "openssl x509" in script
    assert "openssl pkey" in script
    assert "chmod" not in script
    assert "cat \"$key_file\"" not in script
