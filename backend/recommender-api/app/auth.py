"""Shared-key verification for requests forwarded by Firebase Functions."""

import os
import secrets

from fastapi import HTTPException, Request

PUBLIC_PATHS = {"/health", "/metrics", "/docs", "/redoc", "/openapi.json"}
API_KEY_HEADER = "X-Deadline-Food-API-Key"


def verify_cloud_function(request: Request) -> None:
    """Reject application API calls that were not forwarded by a trusted function."""
    if request.url.path in PUBLIC_PATHS:
        return

    expected_key = os.environ.get("RECOMMENDER_API_KEY", "")
    if not expected_key:
        raise HTTPException(503, "Recommender API key is not configured")

    provided_key = request.headers.get(API_KEY_HEADER, "")
    if not secrets.compare_digest(provided_key, expected_key):
        raise HTTPException(401, "Verified cloud function request required")
