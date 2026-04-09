# tests/test_config.py
import os
import pytest

def test_config_loads_phone_and_password(monkeypatch):
    monkeypatch.setenv("GLM_PHONE", "18600000000")
    monkeypatch.setenv("GLM_PASSWORD", "testpass")
    import importlib
    import config
    importlib.reload(config)
    assert config.GLM_PHONE == "18600000000"
    assert config.GLM_PASSWORD == "testpass"

def test_config_raises_if_phone_missing(monkeypatch):
    monkeypatch.delenv("GLM_PHONE", raising=False)
    monkeypatch.delenv("GLM_PASSWORD", raising=False)
    monkeypatch.setattr("dotenv.load_dotenv", lambda **kwargs: None)
    import importlib
    import config
    with pytest.raises(ValueError, match="GLM_PHONE"):
        importlib.reload(config)
