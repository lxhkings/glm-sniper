// client.go - HTTP 客户端封装模块
//
// 功能概述：
//   1. 封装 HTTP/2 客户端，自动注入必要的请求头
//   2. 携带正确的 Authorization、Referer、Origin 等头部
//   3. 使用 utls Transport 伪装 Chrome 浏览器指纹
package main

import (
	"fmt"
	"net/http"
	"time"

	"golang.org/x/net/http2"
)

// Client HTTP 客户端，封装请求头发送逻辑
type Client struct {
	httpClient *http.Client  // HTTP 客户端，使用 http2.Transport
	token      string        // JWT 认证令牌
	baseURL    string        // 基础 URL，如 https://bigmodel.cn
}

// NewClient 创建 HTTP 客户端
//
// 参数：
//   - cfg: 配置结构体，包含 token 等信息
//   - transport: HTTP/2 Transport，由 transport.go 提供
//
// 返回：
//   - *Client: 配置好的客户端实例
func NewClient(cfg *Config, transport *http2.Transport) *Client {
	return &Client{
		httpClient: &http.Client{
			Transport: transport,
			Timeout:   30 * time.Second,
		},
		token:   cfg.Token,
		baseURL: "https://bigmodel.cn",
	}
}

// buildHeaders 构建请求头
//
// 返回：
//   - http.Header: 包含所有必要头部的 Header 对象
//
// 请求头说明：
//   - Authorization: Bearer {token} — JWT 认证令牌
//   - Content-Type: application/json — 请求体格式
//   - Referer: https://bigmodel.cn/glm-coding — 请求来源页面
//   - Origin: https://bigmodel.cn — 请求来源域名
//
// 预留扩展（根据需要添加）：
//   - nonce: 随机字符串，用于防重放
//   - timestamp: 时间戳，用于签名验证
func (c *Client) buildHeaders() http.Header {
	headers := make(http.Header)
	headers.Set("Authorization", fmt.Sprintf("Bearer %s", c.token))
	headers.Set("Content-Type", "application/json")
	headers.Set("Referer", "https://bigmodel.cn/glm-coding")
	headers.Set("Origin", "https://bigmodel.cn")
	// 预留 nonce/timestamp 位置
	// headers.Set("nonce", generateNonce())
	// headers.Set("timestamp", fmt.Sprintf("%d", time.Now().Unix()))
	return headers
}

// Do 执行 HTTP 请求，自动注入请求头
//
// 参数：
//   - req: HTTP 请求对象
//
// 返回：
//   - *http.Response: HTTP 响应
//   - error: 错误信息
//
// 说明：
//   - 此方法会自动设置所有必要的请求头
//   - 如果请求已有头部，会追加/覆盖同名字段
func (c *Client) Do(req *http.Request) (*http.Response, error) {
	// 获取预配置的请求头
	headers := c.buildHeaders()

	// 合并请求头到请求对象
	for key, values := range headers {
		// 如果请求已有同名头部，先删除再设置
		req.Header.Del(key)
		for _, value := range values {
			req.Header.Add(key, value)
		}
	}

	return c.httpClient.Do(req)
}

// GetBaseURL 获取基础 URL
func (c *Client) GetBaseURL() string {
	return c.baseURL
}

// GetToken 获取当前 Token
func (c *Client) GetToken() string {
	return c.token
}

// SetToken 更新 Token（用于 token 刷新场景）
func (c *Client) SetToken(token string) {
	c.token = token
}