# config.py

# 要抢的套餐名称（页面卡片标题开头文字，区分大小写）
# 可选值: "Lite" | "Pro" | "Max"
PLAN_NAME = "Lite"

# 订阅周期（页面 Tab 上的关键字，匹配即可）
# 可选值: "包月" | "包季" | "包年"
PLAN_PERIOD = "包年"

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
