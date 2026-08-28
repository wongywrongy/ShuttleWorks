# How this documentation is organised

Two rules. Both are enforced, not encouraged.

## 1. Every page names a quadrant

The four top-level directories are the [Diátaxis](https://diataxis.fr) quadrants,
and a page belongs to exactly one:

| Directory | Orientation | The question it answers |
| --- | --- | --- |
| `tutorials/` | learning | *Take me through it the first time.* |
| `how-to/` | task | *I know what I want; what are the steps?* |
| `reference/` | information | *What is the exact name / shape / value?* |
| `explanation/` | understanding | *Why is it like this?* |

The quadrants exist because those four questions are asked in different moods,
and a page that tries to answer two of them answers neither. A tutorial that
stops to justify a design decision loses the reader who is trying to get
something running; a reference page that walks you through a scenario stops
being scannable.

**The acceptance test:** if you cannot say which quadrant a page is in, it is not
a page. See rule 2.

## 2. Anything that cannot name a quadrant belongs in Git history

Dated program ledgers, audits, change logs, and retired pages are not maintained
beside current product documentation. Distil active decisions and open debt into
the live quadrants, then let Git retain the original record.

History is a genre, not a claim about completion — an in-flight program ledger
belongs there too, because it is a working record rather than a page about the
product.

**Historical records are not rewritten.** A dated record silently edited to
describe a layout it never saw is worth less than no record. Recover it from the
commit that created it when provenance is needed.

Two things that look like history and are not, and so live in `reference/`:

- **`reference/debt-log.md`** — consulted forward-looking, before starting work.
  It is a ledger you *query*, not a record of what happened.
- **`reference/repo-layout.md`** — a map of the tree as it is now.

## Not quadrants

`examples/` and `templates/` are meta-material — inputs to the product rather
than pages about it — and stay at the top level. `.vitepress/` and `Dockerfile`
build and serve the site.

## Gates

`npm run docs:paths` fails on a missing repository-relative path named by a live
page, and `npm run docs:build` fails on a broken internal link. Together they are
the blocking docs gates in `make check` and CI. `npm run docs:freshness` compares
each area's last doc commit against the last commit to the source it documents;
it remains an advisory timestamp signal. Its area→source map is in
`tools/docs-freshness.mjs` — extend it when a page starts documenting a new part
of the tree, or the fail-closed manifest check will reject the missing root.
