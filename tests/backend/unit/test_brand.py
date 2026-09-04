import json
from pathlib import Path

from core.brand import (
    BRAND_SIGNATURE,
    COMPANY_DOMAIN,
    COMPANY_NAME,
    ENTRANT_HOSTNAME,
    OPERATOR_HOSTNAME,
    PRODUCT_NAME,
    PUBLIC_PRODUCT_NAME,
)


def test_python_brand_constants_match_the_cross_surface_manifest():
    root = Path(__file__).parents[3]
    manifest = json.loads((root / "packages/brand/brand.json").read_text())

    assert PRODUCT_NAME == manifest["productName"] == "ShuttleWorks"
    assert PUBLIC_PRODUCT_NAME == manifest["publicProductName"]
    assert COMPANY_NAME == manifest["companyName"] == "Yunavero"
    assert COMPANY_DOMAIN == manifest["companyDomain"] == "yunavero.com"
    assert BRAND_SIGNATURE == "ShuttleWorks by Yunavero"
    assert OPERATOR_HOSTNAME == "app.yunavero.com"
    assert ENTRANT_HOSTNAME == "play.yunavero.com"
    assert OPERATOR_HOSTNAME != ENTRANT_HOSTNAME
