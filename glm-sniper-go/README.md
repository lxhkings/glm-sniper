# GLM Sniper Go

Go 版本抢购脚本，使用 HTTP/2 + utls JA3 伪装 + NTP/RTT 补偿，实现极致性能。

## 特性

- HTTP/2 原生支持，绕过浏览器渲染延迟
- TLS JA3 指纹伪装 (Chrome)
- NTP 时间校准 + RTT 动态补偿
- 连接预热，消除握手延迟

## 快速开始

```bash
# 1. 安装依赖
go mod tidy

# 2. 配置
cp config.yaml.example config.yaml
# 编辑 config.yaml，填入 token（从浏览器 Cookie bigmodel_token_production 导出）

# 3. 运行
go run .
```

## 配置说明

| 字段 | 说明 |
|---|---|
| token | JWT Token，从浏览器 Cookie 导出 |
| plan_code | 套餐: lite / pro / max |
| pay_type | 支付方式: alipay / wechat |
| sale_hour/minute/second | 开售时间 (北京时间) |
| preload_seconds | 提前多少秒开始轮询 |
| poll_interval_ms | 轮询间隔 (毫秒) |
| workers | 并发 goroutine 数 |

## 获取 Token

1. 运行 Python 版 `python sniper.py` 完成微信扫码登录
2. 打开浏览器开发者工具 -> Application -> Cookies
3. 找到 `bigmodel_token_production`，复制值到 `config.yaml`

## 相关文档

详细设计文档: `docs/superpowers/specs/2026-04-12-go-sniper-design.md`