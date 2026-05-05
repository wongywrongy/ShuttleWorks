"""Pytest setup for scheduler_core.

The repo root is on sys.path via ``[tool.pytest.ini_options] pythonpath = ["."]``
in pyproject.toml, so test files can ``from scheduler_core import ...`` directly
whether or not the package is installed (``pip install -e .``).
"""
