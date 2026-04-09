# utils.py
import ntplib
import time
import os
import platform
from datetime import datetime
from zoneinfo import ZoneInfo

_ntp_offset: float = 0.0

def get_ntp_offset() -> float:
    """向 NTP 服务器查询时间偏差（秒），正值表示本机偏快。"""
    global _ntp_offset
    try:
        client = ntplib.NTPClient()
        response = client.request("pool.ntp.org", version=3)
        _ntp_offset = response.offset
    except Exception:
        _ntp_offset = 0.0
    return _ntp_offset

def beijing_now() -> datetime:
    """返回当前北京时间（含 NTP 偏差修正）。"""
    ts = time.time() - _ntp_offset
    return datetime.fromtimestamp(ts, tz=ZoneInfo("Asia/Shanghai"))

def beep():
    """发出系统提示音。"""
    if platform.system() == "Darwin":
        os.system("afplay /System/Library/Sounds/Glass.aiff")
    elif platform.system() == "Windows":
        import winsound
        winsound.Beep(1000, 500)
    else:
        print("\a")
