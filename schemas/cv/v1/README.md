# Canonical CV schema

The versioned JSON schema describes Base CV facts, claim provenance, employment, education, skills, optional sections, enrichment, document layout and privacy choices. Portable content excludes tenant identifiers and private storage keys; database envelopes enforce ownership.

Run `python3 schemas/cv/v1/validate.py` with Python and `jsonschema` installed. The validator checks referential integrity, dates, source evidence, confirmation and export privacy beyond the JSON shape. Fixtures include minimal and complete CVs plus two successive synthetic profile versions.

The active editor transport is maintained separately in `packages/contracts/src/editor`. Native database tests cover publication and restoration of the canonical representation.
