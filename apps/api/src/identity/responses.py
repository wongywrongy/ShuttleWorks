"""Public identity responses, independent of either principal's storage model."""
from typing import Literal

from pydantic import BaseModel


class AcceptedDTO(BaseModel):
    status: Literal["accepted"] = "accepted"
