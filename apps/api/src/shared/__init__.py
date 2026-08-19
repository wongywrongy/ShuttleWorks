"""Cross-domain domain logic: sport rules and engine glue.

Imported by two or more domains, so owned by none of them (SP-REORG-1 R1).
May import ``core``, ``db`` and ``scheduler_core``; never a domain package.
Import-linter contract 12 holds that direction.
"""
