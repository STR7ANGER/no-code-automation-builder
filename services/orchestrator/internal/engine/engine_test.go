package engine

import (
	"errors"
	"testing"
	"time"
)

func TestDAGOrder(t *testing.T) {
	now := time.Now()
	e := New(Step{ID: "a"}, Step{ID: "b", DependsOn: []string{"a"}})
	a, _ := e.Claim("w", now, time.Minute)
	if a.StepID != "a" {
		t.Fatal(a)
	}
	_ = e.Complete(a, "w", now, nil)
	b, _ := e.Claim("w", now, time.Minute)
	if b.StepID != "b" {
		t.Fatal(b)
	}
	_ = e.Complete(b, "w", now, nil)
	if e.Status != Succeeded {
		t.Fatal(e.Status)
	}
}

func TestRetryBackoffAndTerminalFailure(t *testing.T) {
	now := time.Now()
	e := New(Step{ID: "a", MaxAttempts: 2})
	first, _ := e.Claim("w", now, time.Minute)
	_ = e.Complete(first, "w", now, errors.New("boom"))
	if _, ok := e.Claim("w", now, time.Minute); ok {
		t.Fatal("claimed before delay")
	}
	second, ok := e.Claim("w", now.Add(time.Second), time.Minute)
	if !ok {
		t.Fatal("retry not ready")
	}
	_ = e.Complete(second, "w", now.Add(time.Second), errors.New("boom"))
	if e.Status != Failed {
		t.Fatal(e.Status)
	}
}

func TestExpiredLeaseIsRecoveredAndFenced(t *testing.T) {
	now := time.Now()
	e := New(Step{ID: "a"})
	old, _ := e.Claim("old", now, time.Second)
	fresh, ok := e.Claim("new", now.Add(2*time.Second), time.Minute)
	if !ok || fresh.Generation <= old.Generation {
		t.Fatal(fresh)
	}
	if !errors.Is(e.Complete(old, "old", now.Add(2*time.Second), nil), ErrStaleLease) {
		t.Fatal("old worker was not fenced")
	}
}

func TestCancellationWinsCompletionRace(t *testing.T) {
	now := time.Now()
	e := New(Step{ID: "a"})
	lease, _ := e.Claim("w", now, time.Minute)
	e.Cancel()
	if !errors.Is(e.Complete(lease, "w", now, nil), ErrStaleLease) || e.Status != Cancelled {
		t.Fatal(e.Status)
	}
}
