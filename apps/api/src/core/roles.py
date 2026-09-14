"""Server role vocabulary shared by membership checks and invite acceptance."""
from typing import Literal

Role = Literal["viewer", "operator", "owner"]
ROLE_LEVELS: dict[str, int] = {"viewer": 0, "operator": 1, "owner": 2}
