from __future__ import annotations

import json
import logging
from functools import lru_cache

from .config import get_settings

logger = logging.getLogger("nirmanam.features")

FEATURE_AUDIT_LOG = "audit_log"
FEATURE_CATEGORIES = "categories"
FEATURE_NOTES = "notes"
FEATURE_SIGNUP = "signup"

# Every feature ships enabled. A deployment can switch any of them off by
# pointing the FEATURE_FLAGS environment variable at a JSON object, e.g.
#   FEATURE_FLAGS='{"audit_log": false, "notes": false}'
DEFAULT_FEATURES: dict[str, bool] = {
    FEATURE_AUDIT_LOG: True,
    FEATURE_CATEGORIES: True,
    FEATURE_NOTES: True,
    FEATURE_SIGNUP: True,
}


@lru_cache
def get_features() -> dict[str, bool]:
    """Resolve the effective feature flags: defaults merged with env overrides."""
    features = dict(DEFAULT_FEATURES)
    raw = (get_settings().feature_flags or "").strip()
    if not raw:
        return features
    try:
        overrides = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.warning("FEATURE_FLAGS is not valid JSON (%s); ignoring overrides", exc)
        return features
    if not isinstance(overrides, dict):
        logger.warning("FEATURE_FLAGS must be a JSON object; ignoring overrides")
        return features
    for key, value in overrides.items():
        if key not in features:
            logger.warning("Ignoring unknown feature flag '%s'", key)
            continue
        if not isinstance(value, bool):
            logger.warning("Feature flag '%s' must be true or false; ignoring", key)
            continue
        features[key] = value
    return features


def is_enabled(feature: str) -> bool:
    return get_features().get(feature, False)
