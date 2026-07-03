# Story 001: Simple alerting for node and containers

Date: 2026-07-03
Status: Draft

## Story

As the operator of the big-equity EC2 instance, I want to be notified when the
node or one of its containers is unhealthy, so that I find out about outages
from an alert instead of from a user (or from running `scripts/monitor.sh`
after the fact).

## Context

Everything runs on a single t3.micro (916 MiB RAM) via docker-compose:
simulationAPI, simulationWeb, simulationDB, and FusionAuth. The box is
deliberately memory-tight — FusionAuth is capped at 640 MiB and swap is
already in use at idle — so the most likely failure modes are:

- a container OOM-killed or crash-looping (compose healthchecks already
  detect this locally, but nothing reports it)
- swap thrash: sustained disk I/O while the site is idle, showing up as
  latency before anything actually dies
- disk filling up (docker images/logs on a 20 GiB root volume)
- the instance itself hanging or failing status checks

Monitoring today is pull-only: `scripts/monitor.sh` gives a snapshot or live
view, but only when someone runs it. There is no push notification of any
kind. Keep it simple — no Grafana/Prometheus/Netdata; the box cannot spare
the memory, and the fleet is one instance.

## Acceptance criteria

- [ ] I receive an email (SNS subscription is fine) within ~5 minutes when:
  - [ ] **Node health:** the EC2 status check fails
  - [ ] **Node CPU:** average CPU exceeds 80% for 10 minutes
  - [ ] **Node memory:** available memory stays below 100 MiB for 10 minutes
  - [ ] **Node disk:** root volume usage exceeds 80%
  - [ ] **Container health:** any container reports `unhealthy` or restarts,
        including which container and when
- [ ] **Billing:** I receive an email when actual or forecasted monthly AWS
      spend exceeds a threshold (independent of instance health — catches
      surprise charges even when everything is "green")
- [ ] Alerts recover: I get an OK notification when the condition clears
- [ ] Zero resident footprint on the instance beyond a cron entry or
      equivalent — no long-running agent (the CloudWatch agent's ~50–80 MiB
      does not fit)
- [ ] All alerting resources (SNS topic, alarms, IAM permissions) are defined
      in Terraform under `infra/`, not clicked together in the console
- [ ] **No additional cost:** everything fits in the AWS always-free tier —
      at most 10 CloudWatch alarms, at most 10 custom metrics, under 1M
      `PutMetricData` calls/month, and under 1,000 SNS email
      notifications/month

## Out of scope

- Dashboards, log aggregation, tracing, uptime/SSL probes from outside AWS
- Paging/escalation (email is enough for now)
- Application-level metrics (request rates, latency percentiles)

## Implementation sketch (non-binding)

- CPU + status-check alarms need nothing on the box: native EC2 CloudWatch
  metrics + two alarms + an SNS topic with an email subscription.
- Memory, disk, and container health can be pushed by a small cron script on
  the instance (`aws cloudwatch put-metric-data` once a minute reading
  `/proc/meminfo`, `df`, and `docker ps --filter health=unhealthy`), with the
  instance profile granted `cloudwatch:PutMetricData`. Alarms on those custom
  metrics reuse the same SNS topic.
- Container restarts can be caught by alarming on a `container_unhealthy`
  metric > 0, or a `docker events` one-shot in the same cron.
- Billing: one `aws_budgets_budget` resource in Terraform with actual +
  forecasted notifications to the same email. No SNS or actions needed —
  Budgets emails directly, and email-only budgets are free.

## Free-tier budget

The always-free tier allows 10 alarms, 10 custom metrics, 1M
`PutMetricData` requests/month, and 1,000 SNS email deliveries/month.
Planned usage:

| Resource | Planned | Free limit |
|---|---|---|
| Alarms | 5 (status check, CPU, memory, disk, container health) | 10 |
| Custom metrics | 3 (`mem_available_mib`, `disk_used_pct`, `containers_unhealthy`) | 10 |
| `PutMetricData` calls | ~43k/month (1/min, batching all 3 metrics) | 1M |
| SNS emails | alarm transitions only (should be rare) | 1,000 |
| AWS Budgets | 1 cost budget, email notifications only | free (budgets without actions cost nothing; only *action-enabled* budgets are billed after the first two) |

Two constraints follow from this budget:

- **No per-container metric dimensions.** Each dimension combination counts
  as a separate custom metric, so per-container health metrics would burn
  4–6 of the 10 free metrics and grow with every new container. Publish one
  aggregate `containers_unhealthy` count instead, and put the container
  names in the metric-publishing cron's log (or a follow-up `docker ps` when
  the alert fires).
- **Standard resolution only.** High-resolution metrics/alarms are not in
  the free tier; 1-minute standard resolution is fine for a ~5-minute
  notification target.
