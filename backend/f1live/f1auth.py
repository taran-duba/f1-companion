"""Sign in to F1 TV with an email and password and get back the subscription token.

The dashboard sends the credentials here once; this module posts them to F1's
authentication API and returns only the token it gets back. The password is never
stored, logged or echoed in an error, and the token goes through ``credentials.save``
like a pasted one.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

log = logging.getLogger(__name__)

AUTH_URL = "https://api.formula1.com/v2/account/subscriber/authenticate/by-password"
# The public API key F1's own web client sends with the same request.
API_KEY = "fCUCjWrKPu9ylJwRAv8BpGLEgiAuThx7"
# F1's bot filtering turns away script user agents (python-httpx, curl), so look like a browser.
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
TIMEOUT = 15.0


class LoginError(Exception):
    """A sign-in failure whose message is safe to show the user."""

    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status


def _token_from(body: Any) -> str | None:
    data = body.get("data") if isinstance(body, dict) else None
    token = data.get("subscriptionToken") if isinstance(data, dict) else None
    return token if isinstance(token, str) and token else None


async def login(email: str, password: str, *, transport: httpx.AsyncBaseTransport | None = None) -> str:
    """Return the F1 TV subscription token for this account, or raise ``LoginError``."""
    headers = {"Content-Type": "application/json", "apikey": API_KEY, "User-Agent": USER_AGENT}
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, transport=transport) as client:
            r = await client.post(AUTH_URL, headers=headers, json={"Login": email, "Password": password})
    except httpx.HTTPError as exc:
        log.warning("F1 sign-in request failed: %s", type(exc).__name__)
        raise LoginError("Couldn't reach F1's sign-in service. Check your connection and try again.", 502) from exc

    if r.status_code in (400, 401, 403):
        raise LoginError("F1 didn't accept that email and password.", 401)
    if r.status_code == 429:
        raise LoginError("F1 is rate-limiting sign-ins. Wait a few minutes and try again.", 429)
    if r.status_code != 200:
        log.warning("F1 sign-in returned HTTP %s", r.status_code)
        raise LoginError(f"F1's sign-in service answered with an error (HTTP {r.status_code}).", 502)
    try:
        token = _token_from(r.json())
    except ValueError:
        token = None
    if not token:
        raise LoginError("F1 signed you in but didn't return a token. Paste one manually instead.", 502)
    return token
