# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project does

GLM Sniper 是一个抢购脚本，用于在智谱 AI（bigmodel.cn）GLM Coding Plan 限量开售时自动完成：微信扫码登录 → 等待开售时间 → 轮询购买按钮 → 自动点击下单。

## Setup

```bash
pip install -r requirements.txt
playwright install chromium
cp .env.example .env   # .env 目前无需填写（已改为微信扫码登录）
```

## Run

```bash
python sniper.py
```

## Tests

```bash
pytest                        # 全部测试
pytest tests/test_utils.py   # 单个文件
```

`test_config.py` 中的测试已过时（测试的是旧版手机号/密码逻辑，config.py 已不再有这些字段），跑时会失败，可忽略或删除。

## Architecture

入口 `sniper.py` 串联三个模块：

```
sniper.py
├── auth.py      # 微信扫码登录，等待 page URL 离开 /login
├── buyer.py     # wait_until_ready() 等待开售时间
│               # poll_and_buy() 每 100ms 刷新，切换 Tab + 点击套餐按钮
│               # _proceed_to_order() 走完弹窗/跳转到订单确认页
└── utils.py     # NTP 校时、北京时间、系统提示音
```

配置全在 `config.py`，无需改代码：

| 变量 | 说明 |
|---|---|
| `PLAN_NAME` | 要抢的套餐：`"Lite"` / `"Pro"` / `"Max"` |
| `PLAN_PERIOD` | 订阅周期：`"包月"` / `"包季"` / `"包年"` |
| `SALE_HOUR/MINUTE/SECOND` | 开售时间（北京时间） |
| `PRELOAD_SECONDS` | 提前多少秒开始轮询 |
| `POLL_INTERVAL_MS` | 轮询间隔，默认 100ms |

## Key implementation details

**套餐定位**：页面有三张 `.package-card`，通过 `textContent.trim().startsWith(PLAN_NAME)` 精确匹配目标卡片；周期通过点击 `.switch-tab-item` 切换（每次刷新后都重新切换，因为页面默认恢复到"包季"Tab）。

**限流处理**：URL 含 `rate-limit` 时直接 `goto` 回商品页，而非 `reload`。

**NTP 校时**：`utils.get_ntp_offset()` 在启动时调用一次，之后 `beijing_now()` 用偏差修正本机时钟，避免因本机时间不准导致提前/延迟开始轮询。
