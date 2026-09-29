// Package main is FROZEN as of IWO-20260919-003 (2026-09-20).
//
// This Go backend was never wired to the frontend — web/src/state.ts is the
// canonical game state machine; the only integration is the :8080/healthz
// heartbeat. Per code-review §4 P1-1, the strategic decision was freeze
// (NOT delete, NOT align to web v2). Unfreeze only if/when a P2P route is
// chosen — then re-derive /v2/contracts from web v2 source of truth.
//
// DO NOT add new code here without unfreezing the IWO.
// DO NOT delete without an explicit re-architecture decision.
//
// IWO-20260919-003 CLOSED by CR-20260921-001 (2026-09-21): superseded by
// baseline V1.3 §13 (PHP/Laravel + Rust + Web/PWA + MariaDB). No unfreeze
// path remains; this file is kept as history only.
package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"ogame/internal/tick"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	engine := tick.NewEngine(&tick.StubStore{})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	engine.Start(ctx)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	srv := &http.Server{Addr: ":8080", Handler: mux}

	serverErr := make(chan error, 1)
	go func() {
		serverErr <- srv.ListenAndServe()
	}()
	logger.Info("server listening", "addr", srv.Addr)

	heartbeat := time.NewTicker(5 * time.Second)
	defer heartbeat.Stop()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)

	for {
		select {
		case err := <-serverErr:
			logger.Error("server exited", "err", err)
			cancel()
			engine.Stop()
			return
		case <-heartbeat.C:
			logger.Info("heartbeat")
		case sig := <-sigCh:
			logger.Info("shutting down", "signal", sig.String())
			cancel()
			engine.Stop()
			shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer shutdownCancel()
			if err := srv.Shutdown(shutdownCtx); err != nil {
				logger.Error("shutdown", "err", err)
			}
			return
		}
	}
}
