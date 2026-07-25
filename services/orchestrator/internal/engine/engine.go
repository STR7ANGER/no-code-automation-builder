package engine

import (
	"errors"
	"sort"
	"time"
)

type Status string

const (
	Queued    Status = "QUEUED"
	Running   Status = "RUNNING"
	Waiting   Status = "WAITING"
	Succeeded Status = "SUCCEEDED"
	Failed    Status = "FAILED"
	Cancelled Status = "CANCELLED"
)

var ErrStaleLease = errors.New("stale or expired lease")

type Step struct {
	ID                                string
	DependsOn                         []string
	Status                            Status
	Attempts, MaxAttempts, Generation int
	ReadyAt                           time.Time
	LeaseOwner                        string
	LeaseUntil                        time.Time
}

type Execution struct {
	Status Status
	Steps  map[string]*Step
}
type Lease struct {
	StepID     string
	Generation int
}

func New(steps ...Step) *Execution {
	e := &Execution{Status: Queued, Steps: map[string]*Step{}}
	for i := range steps {
		s := steps[i]
		if s.MaxAttempts < 1 {
			s.MaxAttempts = 1
		}
		s.Status = Queued
		e.Steps[s.ID] = &s
	}
	return e
}

func (e *Execution) Claim(worker string, now time.Time, ttl time.Duration) (Lease, bool) {
	if e.Status == Cancelled || e.Status == Failed || e.Status == Succeeded {
		return Lease{}, false
	}
	e.Recover(now)
	ids := make([]string, 0, len(e.Steps))
	for id := range e.Steps {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		s := e.Steps[id]
		if s.Status != Queued || now.Before(s.ReadyAt) || !e.dependenciesSucceeded(s) {
			continue
		}
		s.Status, s.LeaseOwner, s.LeaseUntil = Running, worker, now.Add(ttl)
		s.Generation++
		s.Attempts++
		e.Status = Running
		return Lease{StepID: id, Generation: s.Generation}, true
	}
	return Lease{}, false
}

func (e *Execution) Complete(lease Lease, worker string, now time.Time, failure error) error {
	s := e.Steps[lease.StepID]
	if s == nil || s.Status != Running || s.LeaseOwner != worker || s.Generation != lease.Generation || !now.Before(s.LeaseUntil) {
		return ErrStaleLease
	}
	if e.Status == Cancelled {
		return ErrStaleLease
	}
	s.LeaseOwner = ""
	s.LeaseUntil = time.Time{}
	if failure == nil {
		s.Status = Succeeded
	} else if s.Attempts < s.MaxAttempts {
		s.Status = Queued
		s.ReadyAt = now.Add(time.Second * time.Duration(1<<(s.Attempts-1)))
	} else {
		s.Status = Failed
		e.Status = Failed
	}
	e.refreshStatus()
	return nil
}

func (e *Execution) Cancel() {
	if e.Status == Succeeded || e.Status == Failed {
		return
	}
	e.Status = Cancelled
	for _, s := range e.Steps {
		if s.Status == Queued || s.Status == Running || s.Status == Waiting {
			s.Status = Cancelled
		}
	}
}

func (e *Execution) Recover(now time.Time) {
	for _, s := range e.Steps {
		if s.Status == Running && !now.Before(s.LeaseUntil) {
			s.Status = Queued
			s.LeaseOwner = ""
		}
	}
}

func (e *Execution) dependenciesSucceeded(s *Step) bool {
	for _, id := range s.DependsOn {
		d := e.Steps[id]
		if d == nil || d.Status != Succeeded {
			return false
		}
	}
	return true
}
func (e *Execution) refreshStatus() {
	all := true
	for _, s := range e.Steps {
		if s.Status == Failed {
			e.Status = Failed
			return
		}
		if s.Status != Succeeded {
			all = false
		}
	}
	if all {
		e.Status = Succeeded
	}
}
