"""In-memory stand-in for the parts of supabase-py that the API uses.

Test-only. Columns and defaults mirror supabase/migrations/: when a migration
adds a column, table or relation, add it here too. Unknown names raise, so a
missing mirror fails loudly instead of passing silently.
"""
from __future__ import annotations

import copy
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

REQUIRED = object()  # not-null column without a default


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def _in_a_week() -> str:
    return (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()


SCHEMA: dict[str, dict] = {
    "profiles": {"id": REQUIRED, "full_name": "", "email": "", "phone": None, "role": "supervisor", "avatar_url": None, "created_at": now, "updated_at": now},
    "sites": {"id": new_id, "owner_id": REQUIRED, "name": REQUIRED, "description": None, "location": None, "client_name": None, "budget": None, "start_date": None, "expected_end_date": None, "status": "active", "created_at": now, "updated_at": now},
    "site_members": {"id": new_id, "site_id": REQUIRED, "user_id": REQUIRED, "role": "supervisor", "invited_by": REQUIRED, "joined_at": None, "created_at": now},
    "invitations": {"id": new_id, "site_id": REQUIRED, "email": REQUIRED, "role": "supervisor", "token": lambda: uuid.uuid4().hex, "invited_by": REQUIRED, "status": "pending", "expires_at": _in_a_week, "accepted_at": None, "created_at": now},
    "categories": {"id": new_id, "site_id": None, "name": REQUIRED, "type": "expense", "is_default": False, "is_active": True, "created_by": None, "created_at": now},
    "ledger_entries": {"id": new_id, "site_id": REQUIRED, "entry_type": REQUIRED, "category_id": REQUIRED, "amount": REQUIRED, "entry_date": lambda: date.today().isoformat(), "paid_to": None, "description": "", "payment_method": None, "reference": None, "created_by": REQUIRED, "updated_by": None, "created_at": now, "updated_at": now, "deleted_at": None},
    "notes": {"id": new_id, "site_id": REQUIRED, "ledger_entry_id": None, "created_by": REQUIRED, "content": REQUIRED, "created_at": now, "updated_at": now},
    "attachments": {"id": new_id, "site_id": REQUIRED, "ledger_entry_id": None, "uploaded_by": REQUIRED, "file_name": REQUIRED, "storage_path": REQUIRED, "mime_type": None, "file_size": None, "created_at": now},
    "audit_logs": {"id": new_id, "site_id": REQUIRED, "actor_id": REQUIRED, "action": REQUIRED, "entity_type": REQUIRED, "entity_id": None, "description": REQUIRED, "metadata": dict, "created_at": now},
}
NUMERIC = {("sites", "budget"), ("ledger_entries", "amount")}
UNIQUE = {"site_members": [("site_id", "user_id")]}

# (table, relation) -> (other table, local column, remote column, many)
RELATIONS = {
    ("ledger_entries", "categories"): ("categories", "category_id", "id", False),
    ("ledger_entries", "notes"): ("notes", "id", "ledger_entry_id", True),
    ("ledger_entries", "attachments"): ("attachments", "id", "ledger_entry_id", True),
    ("ledger_entries", "profiles"): ("profiles", "created_by", "id", False),
    ("site_members", "profiles"): ("profiles", "user_id", "id", False),
    ("notes", "profiles"): ("profiles", "created_by", "id", False),
    ("notes", "ledger_entries"): ("ledger_entries", "ledger_entry_id", "id", False),
    ("audit_logs", "profiles"): ("profiles", "actor_id", "id", False),
    ("audit_logs", "sites"): ("sites", "site_id", "id", False),
}

# Seeded for every new builder (migration 202609080001_user_categories).
DEFAULT_CATEGORIES = [(name, "expense") for name in ("Materials", "Labour", "Equipment", "Transport", "Subcontractor", "Permits and Fees", "Utilities", "Miscellaneous")] + [(name, "income") for name in ("Client payment", "Advance", "Loan", "Refund")]


def _split(select: str) -> list[str]:
    parts, depth, current = [], 0, ""
    for char in select:
        depth += {"(": 1, ")": -1}.get(char, 0)
        if char == "," and depth == 0:
            parts.append(current.strip())
            current = ""
        else:
            current += char
    return [part for part in [*parts, current.strip()] if part]


def _like(value, pattern: str) -> bool:
    regex = ".*".join(re.escape(piece) for piece in re.split(r"[%*]", pattern))
    return value is not None and re.fullmatch(regex, str(value), re.IGNORECASE | re.DOTALL) is not None


class Query:
    def __init__(self, store: "Store", table: str):
        if table not in SCHEMA:
            raise ValueError(f"fake backend: unknown table '{table}' (update tests/fake_backend/store.py)")
        self.store, self.table = store, table
        self.action, self.payload, self.conflict = "select", None, None
        self.columns, self.count = "*", None
        self.filters, self.orders = [], []
        self.window: tuple[int, int] | None = None
        self.one: str | None = None

    def _column(self, name: str) -> str:
        if name not in SCHEMA[self.table]:
            raise ValueError(f"fake backend: unknown column '{self.table}.{name}'")
        return name

    def _where(self, column: str, test):
        self._column(column)
        self.filters.append(lambda row: test(row[column]))
        return self

    def select(self, columns: str = "*", count: str | None = None):
        self.columns, self.count = columns, count
        return self

    def insert(self, payload):
        self.action, self.payload = "insert", payload
        return self

    def update(self, payload):
        self.action, self.payload = "update", payload
        return self

    def upsert(self, payload, on_conflict: str = "id"):
        self.action, self.payload, self.conflict = "upsert", payload, on_conflict.split(",")
        return self

    def delete(self):
        self.action = "delete"
        return self

    def eq(self, column, value):
        return self._where(column, lambda v: v is not None and str(v) == str(value))

    def neq(self, column, value):
        return self._where(column, lambda v: v is not None and str(v) != str(value))

    def in_(self, column, values):
        wanted = {str(value) for value in values}
        return self._where(column, lambda v: str(v) in wanted)

    def is_(self, column, value):
        if value != "null":
            raise ValueError("fake backend: is_ only supports 'null'")
        return self._where(column, lambda v: v is None)

    def gte(self, column, value):
        return self._where(column, lambda v: v is not None and v >= value)

    def lte(self, column, value):
        return self._where(column, lambda v: v is not None and v <= value)

    def ilike(self, column, pattern):
        return self._where(column, lambda v: _like(v, pattern))

    def or_(self, expression: str):
        tests = []
        for clause in expression.split(","):
            column, operator, pattern = clause.split(".", 2)
            if operator != "ilike":
                raise ValueError("fake backend: or_ only supports ilike")
            tests.append((self._column(column), pattern))
        self.filters.append(lambda row: any(_like(row[c], p) for c, p in tests))
        return self

    def order(self, column, desc: bool = False):
        self.orders.append((self._column(column), desc))
        return self

    def range(self, start: int, end: int):
        self.window = (start, end + 1)
        return self

    def limit(self, size: int):
        self.window = (0, size)
        return self

    def maybe_single(self):
        self.one = "maybe"
        return self

    def single(self):
        self.one = "single"
        return self

    def execute(self):
        rows = self.store.tables[self.table]
        matched = [row for row in rows if all(test(row) for test in self.filters)]
        if self.action == "insert":
            items = self.payload if isinstance(self.payload, list) else [self.payload]
            return SimpleNamespace(data=[copy.deepcopy(self.store.insert(self.table, item)) for item in items], count=None)
        if self.action == "upsert":
            existing = next((row for row in rows if all(str(row[k]) == str(self.payload.get(k)) for k in self.conflict)), None)
            row = self.store.update(self.table, existing, self.payload) if existing else self.store.insert(self.table, self.payload)
            return SimpleNamespace(data=[copy.deepcopy(row)], count=None)
        if self.action == "update":
            return SimpleNamespace(data=[copy.deepcopy(self.store.update(self.table, row, self.payload)) for row in matched], count=None)
        if self.action == "delete":
            for row in matched:
                rows.remove(row)
            return SimpleNamespace(data=copy.deepcopy(matched), count=None)
        for column, desc in reversed(self.orders):
            matched.sort(key=lambda row: (row[column] is not None, row[column] if row[column] is not None else ""), reverse=desc)
        total = len(matched) if self.count else None
        if self.window:
            matched = matched[slice(*self.window)]
        data = [self.store.project(self.table, row, self.columns) for row in matched]
        if self.one:
            if not data and self.one == "maybe":
                return None  # supabase-py does the same
            if len(data) != 1:
                raise ValueError(f"fake backend: expected one row from {self.table}, got {len(data)}")
            return SimpleNamespace(data=data[0], count=total)
        return SimpleNamespace(data=data, count=total)


class Bucket:
    def __init__(self, files: dict, name: str):
        self.files, self.name = files, name

    def upload(self, path: str, content: bytes, options: dict | None = None):
        self.files[f"{self.name}/{path}"] = (content, (options or {}).get("content-type", "application/octet-stream"))

    def create_signed_url(self, path: str, expires_in: int):
        return {"signedURL": f"/fake-storage/{self.name}/{path}"}


class Store:
    def __init__(self):
        self.tables: dict[str, list[dict]] = {name: [] for name in SCHEMA}
        self.files: dict[str, tuple[bytes, str]] = {}
        self.storage = SimpleNamespace(from_=lambda name: Bucket(self.files, name))
        self.auth = None  # set by auth.FakeAuth

    def table(self, name: str) -> Query:
        return Query(self, name)

    def _clean(self, table: str, values: dict) -> dict:
        unknown = set(values) - set(SCHEMA[table])
        if unknown:
            raise ValueError(f"fake backend: unknown column(s) {sorted(unknown)} on '{table}'")
        clean = {}
        for key, value in values.items():
            if value is not None and (table, key) in NUMERIC:
                value = float(value)
            elif isinstance(value, uuid.UUID):
                value = str(value)
            clean[key] = copy.deepcopy(value)
        return clean

    def insert(self, table: str, values: dict) -> dict:
        values = self._clean(table, values)
        row = {}
        for column, default in SCHEMA[table].items():
            if column in values:
                row[column] = values[column]
            elif default is REQUIRED:
                raise ValueError(f"fake backend: '{table}.{column}' is required")
            else:
                row[column] = default() if callable(default) else default
        for keys in UNIQUE.get(table, []):
            if any(all(other[k] == row[k] for k in keys) for other in self.tables[table]):
                raise ValueError(f"fake backend: duplicate {keys} in '{table}'")
        self.tables[table].append(row)
        if table == "profiles" and row["role"] == "builder":
            for name, kind in DEFAULT_CATEGORIES:
                self.insert("categories", {"name": name, "type": kind, "is_default": True, "created_by": row["id"]})
        return row

    def update(self, table: str, row: dict, values: dict) -> dict:
        row.update(self._clean(table, values))
        if "updated_at" in SCHEMA[table] and "updated_at" not in values:
            row["updated_at"] = now()
        return row

    def project(self, table: str, row: dict, select: str) -> dict:
        result: dict = {}
        for part in _split(select):
            if part == "*":
                result.update(row)
            elif "(" in part:
                head, inner = part.split("(", 1)
                name = head.split("!")[0].strip()
                if (table, name) not in RELATIONS:
                    raise ValueError(f"fake backend: unknown relation '{table}' -> '{name}'")
                other, local, remote, many = RELATIONS[(table, name)]
                related = [self.project(other, item, inner[:-1]) for item in self.tables[other] if row[local] is not None and item[remote] == row[local]]
                result[name] = related if many else (related[0] if related else None)
            else:
                if part not in row:
                    raise ValueError(f"fake backend: unknown column '{table}.{part}'")
                result[part] = row[part]
        return copy.deepcopy(result)
