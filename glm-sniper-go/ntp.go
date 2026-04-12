// ntp.go - NTP 时间校准模块
package main

import (
	"context"
	"fmt"
	"net"
	"sort"
	"sync/atomic"
	"time"

	"github.com/beevik/ntp"
)

// beijingLoc 北京时区 (Asia/Shanghai)
var beijingLoc *time.Location

// ntpOffset 存储 NTP 时间偏差（正值表示本机偏快），单位纳秒
// 使用 int64 + atomic 实现线程安全
var ntpOffset int64

func init() {
	var err error
	beijingLoc, err = time.LoadLocation("Asia/Shanghai")
	if err != nil {
		// 如果加载失败，使用固定偏移 UTC+8
		beijingLoc = time.FixedZone("CST", 8*60*60)
	}
}

// GetNTPOffset 向 pool.ntp.org 查询时间偏差
// 返回时间偏差（正值表示本机偏快），并将结果存入全局 ntpOffset
func GetNTPOffset() (offset time.Duration, err error) {
	// 使用 beevik/ntp 库查询 NTP 服务器
	// ntp.Query 返回响应，其中 ClockOffset 即为我们需要的时间偏差
	response, err := ntp.Query("pool.ntp.org")
	if err != nil {
		return 0, fmt.Errorf("NTP 查询失败: %w", err)
	}

	// ClockOffset: 正值表示本地时钟比 NTP 时钟快
	// 使用 atomic 存储纳秒值，确保线程安全
	atomic.StoreInt64(&ntpOffset, int64(response.ClockOffset))
	return response.ClockOffset, nil
}

// MeasureRTT 测量到目标主机 443 端口的 TCP RTT
// 建立 5 次 TCP 连接，返回中位数 RTT
func MeasureRTT(host string) (rtt time.Duration, err error) {
	address := net.JoinHostPort(host, "443")
	var rtts []time.Duration

	// 建立 5 次 TCP 连接
	for i := 0; i < 5; i++ {
		start := time.Now()
		conn, err := net.DialTimeout("tcp", address, 5*time.Second)
		if err != nil {
			return 0, fmt.Errorf("TCP 连接失败 (%s): %w", address, err)
		}
		elapsed := time.Since(start)
		conn.Close()
		rtts = append(rtts, elapsed)
	}

	// 排序后取中位数
	sort.Slice(rtts, func(i, j int) bool {
		return rtts[i] < rtts[j]
	})

	// 5 次取中间值（索引 2）
	return rtts[2], nil
}

// MeasureRTTWithContext 支持上下文的 RTT 测量
func MeasureRTTWithContext(ctx context.Context, host string) (rtt time.Duration, err error) {
	address := net.JoinHostPort(host, "443")
	var rtts []time.Duration

	dialer := &net.Dialer{
		Timeout: 5 * time.Second,
	}

	// 建立 5 次 TCP 连接
	for i := 0; i < 5; i++ {
		select {
		case <-ctx.Done():
			return 0, ctx.Err()
		default:
		}

		start := time.Now()
		conn, err := dialer.DialContext(ctx, "tcp", address)
		if err != nil {
			return 0, fmt.Errorf("TCP 连接失败 (%s): %w", address, err)
		}
		elapsed := time.Since(start)
		conn.Close()
		rtts = append(rtts, elapsed)
	}

	// 排序后取中位数
	sort.Slice(rtts, func(i, j int) bool {
		return rtts[i] < rtts[j]
	})

	// 5 次取中间值（索引 2）
	return rtts[2], nil
}

// BeiJingNow 返回校准后的北京时间
// 使用 NTP 偏差修正本机时钟
func BeiJingNow() time.Time {
	// 当前时间减去 NTP 偏差（正值表示本机偏快，需要减去）
	// 然后转换为北京时间
	// 使用 atomic 读取，确保线程安全
	offset := time.Duration(atomic.LoadInt64(&ntpOffset))
	return time.Now().Add(-offset).In(beijingLoc)
}

// FireAt 计算 RTT 补偿后的开火时刻
// fireAt = saleTime - RTT/2
// 目的：让请求在 saleTime 时刻到达服务端
func FireAt(saleTime time.Time, rtt time.Duration) time.Time {
	return saleTime.Add(-rtt / 2)
}