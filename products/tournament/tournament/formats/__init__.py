"""Tournament format generators."""
from tournament.formats.round_robin import generate_round_robin
from tournament.formats.single_elimination import generate_single_elimination

__all__ = ["generate_round_robin", "generate_single_elimination"]
