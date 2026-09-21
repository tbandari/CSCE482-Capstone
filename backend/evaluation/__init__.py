"""
Place-resolution evaluation harness.

Self-contained on purpose: everything here works from JSONL label files and
plain dataclasses, so it never touches the database, the routers or the ORM.
The only dependency on the rest of the backend is `app.ml.types`, the shared
contract.
"""
