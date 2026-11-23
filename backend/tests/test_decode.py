import base64
import json
import zlib

import pytest

from f1live.decode import DecodeError, decode_topic, decode_z, encode_z, plain_topic


def _feed_style(obj) -> str:
    """Compress exactly like the feed: raw deflate (no header), base64."""
    co = zlib.compressobj(wbits=-15)
    return base64.b64encode(co.compress(json.dumps(obj).encode()) + co.flush()).decode()


def test_decode_raw_deflate_payload():
    obj = {"Entries": [{"Utc": "2026-01-01T00:00:00Z", "Cars": {"1": {"Channels": {"2": 301}}}}]}
    assert decode_z(_feed_style(obj)) == obj


def test_encode_roundtrip_and_bytes_input():
    obj = {"Position": [{"Timestamp": "x", "Entries": {"44": {"X": -1, "Y": 2, "Z": 3}}}]}
    enc = encode_z(obj)
    assert decode_z(enc) == obj
    assert decode_z(enc.encode()) == obj


def test_zlib_header_payload_is_rejected():
    # A zlib-wrapped stream (wbits=15) is not what the feed sends; it must
    # fail loudly rather than return garbage.
    payload = base64.b64encode(zlib.compress(b'{"a":1}')).decode()
    with pytest.raises(DecodeError):
        decode_z(payload)


@pytest.mark.parametrize("bad", ["", "!!!notbase64", base64.b64encode(b"plain text").decode(), "é"])
def test_malformed_payloads_raise_decode_error(bad):
    with pytest.raises(DecodeError):
        decode_z(bad)


def test_decode_topic_names_and_passthrough():
    assert plain_topic("CarData.z") == "CarData"
    assert plain_topic("TimingData") == "TimingData"
    assert decode_topic("TimingData", {"a": 1}) == ("TimingData", {"a": 1})
    assert decode_topic("Position.z", encode_z({"b": 2})) == ("Position", {"b": 2})
    # Already-decoded payloads (e.g. from a converter) pass through.
    assert decode_topic("CarData.z", {"Entries": []}) == ("CarData", {"Entries": []})
