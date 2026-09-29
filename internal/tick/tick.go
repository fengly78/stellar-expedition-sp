// Package tick is FROZEN as of IWO-20260919-003 (2026-09-20).
//
// Go backend is not wired to the frontend — web/src/game/state.ts is the
// canonical tick / game loop. Per code-review §4 P1-1, freeze (not delete,
// not align). Engine / StubStore / process logic here are kept as reference
// only. DO NOT add new code here.
//
// IWO-20260919-003 CLOSED by CR-20260921-001 (2026-09-21): superseded by
// baseline V1.3 §13 (PHP/Laravel queue workers + MariaDB). No unfreeze path.
package tick

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

type Event struct {
	ID        int64
	Type      string
	ExecuteAt time.Time
	Payload   []byte
}

type Store interface {
	Due(ctx context.Context, now time.Time, limit int64) ([]Event, error)
	Complete(ctx context.Context, id int64) error
	Enqueue(ctx context.Context, e Event) (int64, error)
}

type Handler func(ctx context.Context, e Event) error

type Engine struct {
	store    Store
	interval time.Duration
	mu       sync.Mutex
	handlers map[string]Handler
	stopCh   chan struct{}
	doneCh   chan struct{}
}

func NewEngine(store Store) *Engine {
	return &Engine{
		store:    store,
		interval: time.Second,
		handlers: map[string]Handler{},
		stopCh:   make(chan struct{}),
		doneCh:   make(chan struct{}),
	}
}

func (e *Engine) Register(eventType string, h Handler) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.handlers[eventType] = h
}

func (e *Engine) Start(parent context.Context) {
	go e.loop(parent)
}

func (e *Engine) loop(parent context.Context) {
	defer close(e.doneCh)
	ticker := time.NewTicker(e.interval)
	defer ticker.Stop()
	for {
		select {
		case <-parent.Done():
			return
		case <-e.stopCh:
			return
		case now := <-ticker.C:
			e.process(context.Background(), now)
		}
	}
}

func (e *Engine) process(ctx context.Context, now time.Time) {
	due, err := e.store.Due(ctx, now, 100)
	if err != nil {
		slog.Error("tick: fetch due events", "err", err)
		return
	}
	for _, ev := range due {
		e.mu.Lock()
		h, ok := e.handlers[ev.Type]
		e.mu.Unlock()
		if !ok {
			// 不标记完成：handler 可能稍后才注册，一旦标记，这条定时事件就永久丢失了
			// （建造完成、舰队抵达都不会再触发）。MVP 阶段保持挂起，下一轮 tick 重试。
			slog.Warn("tick: no handler registered, event left pending", "type", ev.Type, "event_id", ev.ID)
			continue
		}
		if err := h(ctx, ev); err != nil {
			// 失败同样不推进完成标记，下一轮 tick 重试。
			// 注意：MVP 没有重试上限，生产环境应加重试计数并转入死信表。
			slog.Error("tick: handler failed, will retry", "type", ev.Type, "event_id", ev.ID, "err", err)
			continue
		}
		if err := e.store.Complete(ctx, ev.ID); err != nil {
			slog.Error("tick: complete failed", "event_id", ev.ID, "err", err)
		}
	}
}

func (e *Engine) Stop() {
	close(e.stopCh)
	select {
	case <-e.doneCh:
	case <-time.After(5 * time.Second):
	}
}

// StubStore is an in-memory no-op Store; replace with a Postgres-backed
// implementation (see migrations/0001_init.sql events table).
type StubStore struct{}

func (s *StubStore) Due(ctx context.Context, now time.Time, limit int64) ([]Event, error) {
	return nil, nil
}

func (s *StubStore) Complete(ctx context.Context, id int64) error {
	return nil
}

func (s *StubStore) Enqueue(ctx context.Context, e Event) (int64, error) {
	return 0, nil
}
