# GLM Sniper Go 版 — 设计文档

**日期：** 2026-04-12  
**目标：** 用 Go 重写抢购核心，利用 HTTP/2 + utls JA3 伪装 + 连接预热 + NTP/RTT 补偿，将端到端延迟压到 < 15ms

---

## 背景

Python/Playwright 版本每轮需要完整页面渲染（reload），实际轮询间隔受限于浏览器渲染耗时（100-500ms）。Go 版本直接调用后端 API，绕过浏览器，单次请求延迟 < 5ms。

### 已确认的 API 链路

通过逆向 bigmodel.cn 的 JS Bundle（`ClaudeCode.2a197054.js`、`ClaudeCode~subscribe-overview.e7fb46b3.js`）确认：

| 接口 | Method | Path | 说明 |
|---|---|---|---|
| 轮询开售 | GET | `/api/biz/product/isLimitBuy` | `data.isLimitBuy == true` 即开售 |
| 价格预览 | POST | `/api/biz/pay/preview` | 获取 `bizId` |
| 创建订单 | POST | `/api/biz/pay/create-sign` | 返回支付跳转 URL + `orderId` |
| 产品列表 | GET | `/api/biz/product/info` | 零参数，需 Bearer Token |

**认证方式：** `Authorization: Bearer <JWT>`，token 来自浏览器 Cookie `bigmodel_token_production`，无 nonce/timestamp 签名（已通过 interceptor 源码确认）。

**AES 加密说明：** bundle 中 `AESEncryptFn` 是对支付跳转 URL 的本地处理，不涉及 HTTP 请求签名。

---

## 项目结构

```
glm-sniper-go/
├── main.go        # 入口：初始化、预热、启动抢购
├── config.go      # 配置结构，读取 config.yaml
├── ntp.go         # NTP 校时 + RTT 测量
├── transport.go   # utls TLS（Chrome JA3）+ HTTP/2 Transport
├── client.go      # HTTP 客户端：Header 注入、重试
├── api.go         # isLimitBuy / payPreview / createSign
├── sniper.go      # 核心抢购逻辑
├── go.mod
└── config.yaml    # 用户配置
```

---

## 模块设计

### config.go

```yaml
# config.yaml 结构
token: "eyJhbGci..."   # 浏览器 Cookie bigmodel_token_production

plan_code:   "lite"    # lite / pro / max
pay_type:    "alipay"  # alipay / wechat
biz_id:      ""        # 留空则运行时从 product/info 自动获取

sale_hour:   10
sale_minute: 0
sale_second: 0

preload_seconds:  30   # 提前多少秒开始轮询
poll_interval_ms: 50   # 轮询间隔
workers:          5    # 并发 goroutine 数
```

### transport.go — JA3 伪装 + HTTP/2

- 使用 `github.com/refraction-networking/utls`，spec 为 `HelloChrome_Auto`
- 将 utls 的 `UClient` 注入 `golang.org/x/net/http2.Transport.DialTLSContext`
- 不使用标准 `crypto/tls`（其 JA3 指纹可被服务端识别为 Go 客户端）

```go
// DialTLSContext 使用 utls 完成握手，伪装 Chrome TLS 指纹
func dialTLSWithUTLS(ctx context.Context, network, addr string, _ *tls.Config) (net.Conn, error) {
    rawConn, err := (&net.Dialer{}).DialContext(ctx, network, addr)
    // ... utls.UClient + ApplyPreset(HelloChrome_Auto) + Handshake
}
```

### ntp.go — 时间校准

1. 向 `pool.ntp.org` 查询偏差 `offset`（与 Python 版相同）
2. 向 `bigmodel.cn:443` 建 5 次 TCP 连接，取中位数 RTT
3. `fireAt = saleTime.Add(-rtt/2)` — 动态补偿，让请求在 T 时刻到达服务端

```go
// BeiJingNow 返回 NTP 校准后的北京时间
func BeiJingNow() time.Time {
    return time.Now().Add(-ntpOffset).In(beijingLoc)
}
```

### transport.go — 连接预热

- 开售前 `preload_seconds` 秒建立 N 条 TLS 连接（HTTP/2）
- 每 20s 发一次 `isLimitBuy` 心跳，保持连接活跃
- 目的：消除抢购时刻的 TCP+TLS 握手延迟（约 80-200ms）

### api.go — API 封装

```go
// buildHeaders 构造请求 Header
// 如果将来确认需要 nonce/timestamp，在此统一添加
func (c *Client) buildHeaders() http.Header {
    h := http.Header{}
    h.Set("Authorization", "Bearer "+c.token)
    h.Set("Content-Type", "application/json")
    h.Set("Referer", "https://bigmodel.cn/glm-coding")
    h.Set("Origin", "https://bigmodel.cn")
    // h.Set("X-Nonce", uuid.New().String())         // 如需 nonce，取消注释
    // h.Set("X-Timestamp", strconv.FormatInt(...))  // 如需 timestamp，取消注释
    return h
}
```

三个 API 函数：
- `IsLimitBuy() (bool, error)` — 轮询是否开售
- `PayPreview(planCode, payType string) (bizId string, err error)` — 价格预览
- `CreateSign(bizId, payType, agreementNo string) (payURL, orderId string, err error)` — 创建订单

### sniper.go — 核心抢购逻辑

```
1. 等待至 fireAt（= saleTime - RTT/2）
2. 启动 workers 个 goroutine，各自独立轮询 isLimitBuy
3. sync.Once 保证 createSign 只调用一次（防重复下单）
4. 获得支付 URL 后：
   - 打印到终端
   - 调用 open 命令在浏览器打开
   - 播放系统提示音
```

---

## 关键依赖

| 库 | 用途 |
|---|---|
| `github.com/refraction-networking/utls` | TLS JA3 伪装 |
| `golang.org/x/net/http2` | HTTP/2 Transport |
| `github.com/beevik/ntp` | NTP 校时 |
| `gopkg.in/yaml.v3` | 读取 config.yaml |

---

## 与 Python 版的关系

- **登录**：继续用 Python 脚本（`auth.py`）完成微信扫码登录，登录后导出 Cookie 到 `config.yaml`
- **抢购**：完全由 Go 版本接管
- **工具脚本**：`tools/` 目录下的 JS 分析工具保留，用于下次开售前验证 API 是否有变化

---

## 不在范围内

- Go 版本实现微信登录（复杂度高，收益低）
- 自动完成付款
- 多账号并发（单 token 场景）
- 部署到服务器（本机运行）

---

## 验证方式

1. 用 `tools/intercept_requests.js` 在下次开售前抓取真实请求，确认 Header 格式
2. 在非开售时段手动调用 `isLimitBuy`，验证认证和网络层正常
3. 开售时运行 Go 版本，观察 RTT 补偿是否命中目标时刻（日志输出 `fireAt`）
