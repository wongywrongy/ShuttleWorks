"""Put the simulator root on sys.path so ``tournament_sim`` imports under
bare ``pytest`` too (only ``python -m pytest`` adds the CWD itself)."""
import sys
from pathlib import Path

_SIM_ROOT = str(Path(__file__).resolve().parents[1])
if _SIM_ROOT not in sys.path:
    sys.path.insert(0, _SIM_ROOT)
