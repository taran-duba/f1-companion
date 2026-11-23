"""Deep merge of partial live timing updates into local state.

The feed sends a full snapshot once and then partial updates. Updates are
nested dicts that must be merged recursively. Lists in the snapshot are
updated with *index-keyed objects*: ``{"Sectors": {"1": {"Value": "28.1"}}}``
patches element 1 of the ``Sectors`` list. An index equal to the list length
appends. A ``_deleted`` key lists keys (or indices) to remove.
"""

from __future__ import annotations

import copy
from typing import Any

DELETED_KEY = "_deleted"
KEYFRAME_KEY = "_kf"


def _index_keys(update: dict) -> list[int] | None:
    """Return the update's keys as ints if every key is a non-negative int."""
    out: list[int] = []
    for k in update:
        if k in (DELETED_KEY, KEYFRAME_KEY):
            continue
        if isinstance(k, int):
            idx = k
        elif isinstance(k, str) and k.isdigit():
            idx = int(k)
        else:
            return None
        out.append(idx)
    return out


def _clone(value: Any) -> Any:
    return copy.deepcopy(value) if isinstance(value, (dict, list)) else value


def _merge_into_list(target: list, update: dict) -> list:
    for raw_key, value in update.items():
        if raw_key in (DELETED_KEY, KEYFRAME_KEY):
            continue
        idx = int(raw_key)
        if idx < len(target):
            target[idx] = merge(target[idx], value)
        else:
            # Pad gaps with None so out-of-order indices keep their position.
            while len(target) < idx:
                target.append(None)
            target.append(_clone(value))
    deleted = update.get(DELETED_KEY)
    if isinstance(deleted, list):
        for idx in sorted((int(d) for d in deleted if str(d).isdigit()), reverse=True):
            if idx < len(target):
                target.pop(idx)
    return target


def merge(target: Any, update: Any) -> Any:
    """Merge ``update`` into ``target`` and return the merged value.

    Dicts are merged in place (the returned object is ``target``). Scalars and
    type mismatches are replaced by a copy of ``update``.
    """
    if isinstance(update, dict):
        if isinstance(target, list):
            if _index_keys(update) is not None:
                return _merge_into_list(target, update)
            target = {}
        elif not isinstance(target, dict):
            target = {}
        for key, value in update.items():
            if key == KEYFRAME_KEY:
                continue
            if key == DELETED_KEY and isinstance(value, list):
                for d in value:
                    target.pop(str(d), None)
                continue
            if key in target and isinstance(value, dict):
                target[key] = merge(target[key], value)
            else:
                # A fresh index-keyed object stays a dict: keys such as racing
                # numbers are digits too, so it can't be assumed to be a list.
                # Readers normalise with ``as_list`` where list order matters.
                target[key] = _clone(value)
        return target
    return _clone(update)


def merge_delta(base: dict, delta: dict) -> dict:
    """Combine two successive deltas into one (used to coalesce patches).

    Unlike :func:`merge`, list semantics are not applied: index keys stay
    keys, because the receiver applies the combined delta with :func:`merge`.
    """
    for key, value in delta.items():
        current = base.get(key)
        if isinstance(value, dict) and isinstance(current, dict):
            merge_delta(current, value)
        elif isinstance(value, dict) and isinstance(current, list):
            # A full list followed by an index patch is still a full list.
            base[key] = merge(current, value)
        else:
            base[key] = _clone(value)
    return base


def as_list(value: Any) -> list:
    """Normalise a list-or-index-keyed-dict into a list ordered by index."""
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        items = []
        for k, v in value.items():
            if isinstance(k, str) and k.isdigit():
                items.append((int(k), v))
        return [v for _, v in sorted(items)]
    return []
