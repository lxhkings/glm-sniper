# config.py
import os
from dotenv import load_dotenv

load_dotenv()

GLM_PHONE: str = os.getenv("GLM_PHONE", "")
GLM_PASSWORD: str = os.getenv("GLM_PASSWORD", "")

if not GLM_PHONE:
    raise ValueError("GLM_PHONE 未设置，请检查 .env 文件")
if not GLM_PASSWORD:
    raise ValueError("GLM_PASSWORD 未设置，请检查 .env 文件")

# 目标商品页 URL（根据实际页面调整）
PRODUCT_URL = "https://bigmodel.cn/glm-coding?utm_source=bigModel&utm_medium=Special&utm_content=glm-code&utm_campaign=Platform_Ops&_channel_track_key=8BAeCdUS"

# 开售时间：北京时间 10:00:00
SALE_HOUR = 10
SALE_MINUTE = 0
SALE_SECOND = 0

# 提前多少秒开始轮询
PRELOAD_SECONDS = 10

# 轮询间隔（毫秒）
POLL_INTERVAL_MS = 100
