# tests/test_utils.py
import time
from unittest.mock import patch, MagicMock
from utils import get_ntp_offset, beijing_now

def test_get_ntp_offset_returns_float():
    # 用真实 NTP（需要网络），允许偏差在 ±60 秒内
    offset = get_ntp_offset()
    assert isinstance(offset, float)
    assert -60 < offset < 60

def test_beijing_now_returns_correct_tzinfo():
    import zoneinfo
    now = beijing_now()
    assert now.tzinfo is not None
    assert "Asia/Shanghai" in str(now.tzinfo) or now.utcoffset().seconds == 8 * 3600
