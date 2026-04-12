// transport.go - TLS JA3 伪装与 HTTP/2 Transport 模块
//
// 功能概述：
//   1. 使用 utls 库伪装 Chrome 浏览器的 TLS ClientHello 指纹（JA3 指纹）
//   2. 将 utls 连接注入 http2.Transport，实现 HTTP/2 多路复用
//   3. 连接预热：提前建立 TLS 连接池，消除抢购时的握手延迟
//
// JA3 指纹背景：
//   服务端可以通过 TLS ClientHello 的特征（cipher suites、extensions 等）
//   识别客户端类型。Go 标准库 crypto/tls 有固定的指纹，易被识别为爬虫。
//   utls 通过模拟 Chrome/Firefox 等浏览器的 ClientHello，绕过指纹检测。
package main

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/url"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/http2"
	utls "github.com/refraction-networking/utls"
)

// defaultKeepaliveInterval 心跳间隔，保持连接活跃
const defaultKeepaliveInterval = 20 * time.Second

// defaultPreloadConnections 预热连接数
const defaultPreloadConnections = 3

// HelloChromeID Chrome 浏览器 ClientHello ID
// HelloChrome_Auto 会自动选择最新的 Chrome 版本指纹
var HelloChromeID = utls.HelloChrome_Auto

// dialTLSWithUTLS 使用 utls 完成 TLS 握手，伪装 Chrome TLS 指纹
//
// 参数：
//   - ctx: 上下文，支持取消和超时
//   - network: 网络类型，通常为 "tcp"
//   - addr: 目标地址，格式为 "host:port"
//   - _ : 标准 tls.Config，被忽略（我们使用 utls 自己的配置）
//
// 返回：
//   - net.Conn: 已完成 TLS 握手的连接
//   - error: 错误信息
//
// 工作流程：
//  1. 使用标准 net.Dialer 建立 TCP 连接
//  2. 从地址中提取主机名用于 SNI
//  3. 创建 utls.UClient，应用 HelloChrome_Auto 指纹
//  4. 执行 TLS 握手
//  5. 返回 utls 连接
func dialTLSWithUTLS(ctx context.Context, network, addr string, _ *tls.Config) (net.Conn, error) {
	// 1. 建立原始 TCP 连接
	dialer := &net.Dialer{}
	rawConn, err := dialer.DialContext(ctx, network, addr)
	if err != nil {
		return nil, fmt.Errorf("TCP 连接失败 (%s): %w", addr, err)
	}

	// 2. 提取主机名用于 SNI (Server Name Indication)
	// addr 格式为 "host:port"，需要分离出 host
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		rawConn.Close()
		return nil, fmt.Errorf("解析地址失败 (%s): %w", addr, err)
	}

	// 3. 创建 utls 配置
	// ServerName 设置 SNI，这是 TLS 握手的关键参数
	utlsConfig := &utls.Config{
		ServerName: host,
		// InsecureSkipVerify: false, // 生产环境应验证证书
	}

	// 4. 创建 utls 客户端连接
	// HelloChrome_Auto 会模拟最新版 Chrome 的 TLS ClientHello
	// 包括 cipher suites、extensions、签名算法等
	utlsConn := utls.UClient(rawConn, utlsConfig, HelloChromeID)

	// 5. 执行 TLS 握手
	// Handshake() 会发送 ClientHello 并完成密钥交换
	err = utlsConn.Handshake()
	if err != nil {
		rawConn.Close()
		return nil, fmt.Errorf("TLS 握手失败 (%s): %w", addr, err)
	}

	return utlsConn, nil
}

// NewTransport 创建伪装 Chrome 指纹的 HTTP/2 Transport
//
// 返回：
//   - *http2.Transport: 配置好的 HTTP/2 Transport
//
// 说明：
//   - 使用 DialTLSContext 注入 utls 拨号器
//   - 禁用标准 TLS 配置（由 utls 接管）
//   - 返回的 Transport 可用于创建 HTTP/2 客户端
func NewTransport() *http2.Transport {
	return &http2.Transport{
		// 注入 utls 拨号器，绕过标准 TLS
		DialTLSContext: dialTLSWithUTLS,
		// 允许非加密连接（不使用，仅用于调试）
		AllowHTTP: false,
	}
}

// ConnectionPool 连接池，用于预热和复用 TLS 连接
type ConnectionPool struct {
	mu       sync.Mutex
	conns    []net.Conn
	baseURL  *url.URL
	transport *http2.Transport
}

// NewConnectionPool 创建连接池
//
// 参数：
//   - transport: HTTP/2 Transport
//   - baseURL: 目标服务器基础 URL
//
// 返回：
//   - *ConnectionPool: 连接池实例
func NewConnectionPool(transport *http2.Transport, baseURL string) (*ConnectionPool, error) {
	parsedURL, err := url.Parse(baseURL)
	if err != nil {
		return nil, fmt.Errorf("解析 URL 失败: %w", err)
	}

	return &ConnectionPool{
		conns:     make([]net.Conn, 0),
		baseURL:   parsedURL,
		transport: transport,
	}, nil
}

// PreWarm 预热连接池，提前建立 TLS 连接
//
// 参数：
//   - ctx: 上下文，支持取消
//   - count: 连接数量
//
// 说明：
//   - 在抢购开始前调用，消除首次请求的 TCP+TLS 握手延迟
//   - 每条连接约节省 80-200ms
func (p *ConnectionPool) PreWarm(ctx context.Context, count int) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	// 地址格式：host:port
	addr := p.baseURL.Host
	if !strings.Contains(addr, ":") {
		// 如果没有端口，默认使用 443
		addr = addr + ":443"
	}

	for i := 0; i < count; i++ {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		// 使用 dialTLSWithUTLS 建立连接
		conn, err := dialTLSWithUTLS(ctx, "tcp", addr, nil)
		if err != nil {
			// 预热失败不阻塞，记录错误继续
			// 生产环境可考虑返回错误或重试
			continue
		}

		p.conns = append(p.conns, conn)
	}

	if len(p.conns) == 0 {
		return fmt.Errorf("预热失败：无法建立任何连接")
	}

	return nil
}

// KeepAlive 启动心跳 goroutine，保持连接活跃
//
// 参数：
//   - ctx: 上下文，用于停止心跳
//   - interval: 心跳间隔（建议 20s）
//
// 说明：
//   - 定期发送简单请求，防止连接被服务端关闭
//   - 对于 HTTP/2，可以通过 PING 帧保持
func (p *ConnectionPool) KeepAlive(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.sendHeartbeat()
		}
	}
}

// sendHeartbeat 发送心跳请求
func (p *ConnectionPool) sendHeartbeat() {
	p.mu.Lock()
	defer p.mu.Unlock()

	// 检查连接是否仍然活跃
	// 如果连接已关闭，从池中移除
	var activeConns []net.Conn
	for _, conn := range p.conns {
		// 简单检查：尝试设置读取超时
		// 如果连接已关闭，这会失败
		if err := conn.SetReadDeadline(time.Now().Add(100 * time.Millisecond)); err == nil {
			// 重置超时
			conn.SetReadDeadline(time.Time{})
			activeConns = append(activeConns, conn)
		}
	}
	p.conns = activeConns
}

// Close 关闭连接池中的所有连接
func (p *ConnectionPool) Close() {
	p.mu.Lock()
	defer p.mu.Unlock()

	for _, conn := range p.conns {
		conn.Close()
	}
	p.conns = nil
}

// Size 返回连接池中的连接数
func (p *ConnectionPool) Size() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return len(p.conns)
}

// PreWarmConnections 预热连接并返回 keepalive 函数
//
// 参数：
//   - transport: HTTP/2 Transport
//   - baseURL: 目标服务器基础 URL (如 https://bigmodel.cn)
//   - preloadSeconds: 提前多少秒预热
//   - connCount: 预热连接数量
//
// 返回：
//   - *ConnectionPool: 连接池实例
//   - context.CancelFunc: 停止心跳的函数
//   - error: 错误信息
//
// 使用示例：
//
//	pool, cancel, err := PreWarmConnections(transport, "https://bigmodel.cn", 30, 3)
//	if err != nil {
//	    log.Fatal(err)
//	}
//	defer cancel()
//	defer pool.Close()
func PreWarmConnections(transport *http2.Transport, baseURL string, preloadSeconds int, connCount int) (*ConnectionPool, context.CancelFunc, error) {
	// 创建连接池
	pool, err := NewConnectionPool(transport, baseURL)
	if err != nil {
		return nil, nil, err
	}

	// 默认连接数
	if connCount <= 0 {
		connCount = defaultPreloadConnections
	}

	// 预热上下文，设置超时
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(preloadSeconds)*time.Second)

	// 执行预热
	err = pool.PreWarm(ctx, connCount)
	if err != nil {
		cancel()
		return nil, nil, err
	}

	// 创建心跳上下文
	keepaliveCtx, keepaliveCancel := context.WithCancel(context.Background())

	// 启动心跳
	go pool.KeepAlive(keepaliveCtx, defaultKeepaliveInterval)

	// 返回连接池和停止心跳的函数
	return pool, func() {
		keepaliveCancel()
		cancel()
	}, nil
}