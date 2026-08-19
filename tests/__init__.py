"""Test package root.

SP-REORG-1 moved the backend suite from ``products/scheduler/tests`` to
``tests/backend``. The suite's 28 absolute imports name their own package
(``from tests.backend._helpers import ...``), which resolved only while THIS
directory was that package. Marking ``tests`` as a package and rewriting
those imports to ``tests.backend`` keeps them absolute and unambiguous,
and makes the import path mirror the directory path again.

Without this file pytest would root the chain at ``tests/`` and name the
package ``backend`` - importable, but a top-level module called
``backend`` in a repository whose service is called ``api``.
"""
