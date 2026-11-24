from f1live import env


def test_parse_handles_comments_quotes_and_export():
    text = """
# a comment
F1_SOURCE=live
export F1TV_TOKEN="abc def"
F1_USERNAME='me@example.com'
F1_TRANSPORT=core  # trailing comment
not a setting
=novalue
"""
    assert env.parse(text) == {
        "F1_SOURCE": "live",
        "F1TV_TOKEN": "abc def",
        "F1_USERNAME": "me@example.com",
        "F1_TRANSPORT": "core",
    }


def test_load_keeps_real_environment_and_skips_blanks(tmp_path, monkeypatch):
    path = tmp_path / ".env"
    path.write_text("F1_SOURCE=live\nF1_TRANSPORT=legacy\nF1_USERNAME=\n")
    # A throwaway mapping, so nothing set here can leak into other tests.
    fake_environ = {"F1_SOURCE": "demo"}
    monkeypatch.setattr(env.os, "environ", fake_environ)

    assert env.load(path) == ["F1_TRANSPORT"]
    assert fake_environ == {"F1_SOURCE": "demo", "F1_TRANSPORT": "legacy"}


def test_load_without_file_is_a_no_op(tmp_path):
    assert env.load(tmp_path / "missing.env") == []
