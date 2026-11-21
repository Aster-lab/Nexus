# WP12.4 — Hosting Options and Cost Planning

Date checked: 2026-11-21  
Currency: USD, before tax. Prices are provider-published or calculated from provider-published rates; actual bills depend on region, storage, traffic, and resource use.

## NEXUS deployment shape

The repository contains a Next.js application, PostgreSQL data store, and a FastAPI service with seven model artifacts. The user has chosen to keep MVP predictions marked unavailable because there is no approved NEXUS THB training dataset. Therefore, the Python service should not be part of the initial production bill until that decision changes. The future service must deploy with its artifacts and pinned dependencies.

Singapore is the closest listed Render region for a Thailand-based demonstration, and Render allows services and Postgres to be placed in that region and communicate on a shared private network. Region selection cannot be changed in-place, so create all production services in Singapore from the beginning.

## Options

| Option | Initial configuration | Indicative monthly cost | Fit |
| --- | --- | ---: | --- |
| Render, single platform | Next.js web service + managed Postgres in Singapore; defer Python until prediction is approved | About **$13** at the smallest listed web/database tiers ($7 + $6); those tiers have 512 MB web RAM and 256 MB database RAM, so treat this as a demo floor, not a performance recommendation. A 2 GB web service plus a 2 GB Postgres plan is about **$65** ($25 + $40), before storage and bandwidth. | Best fit for simple operations, a nearby region, and one place to deploy web, Python later, and PostgreSQL. |
| Railway, usage based | Next.js and Postgres in one project; Python can be added later | Example **about $30**: web at 0.5 vCPU/1 GB plus Postgres at 0.25 vCPU/0.5 GB, plus 1 GB volume and 5 GB egress. This is calculated from Railway's current CPU, memory, volume, and egress rates. Actual billing follows resource use; Hobby has a $5 monthly minimum and includes $5 of usage. | Flexible for a low-traffic demo, but the bill is less fixed and sizing/backup operations need deliberate review. |
| Vercel + separate data/runtime providers | Vercel Next.js Pro, an external managed Postgres, and (later) a separate Python host | **Starts at $20** for Vercel Pro, then adds database and Python hosting. Total depends on the other providers and runtime usage. | Strong Next.js workflow, but splits database, API, and model operations across services. |

Render's small-service pricing and Postgres examples come from its current pricing material; the provider lists a 512 MB web plan at $7 and a 2 GB web plan at $25. Its published September 2026 comparison lists a 256 MB Postgres tier at $6 and a 2 GB tier at $40. Render lists expandable Postgres storage at $0.30/GB-month and outbound bandwidth at $0.15/GB after the included allowance. [Render pricing](https://render.com/pricing), [Render compute plans](https://render.com/docs/compute-plans), [Render 2026 pricing examples](https://render.com/articles/production-rails-hosting-guide)

Railway currently publishes $5 Hobby and $20 Pro minimum monthly commitments with included usage, and per-second rates of $20 per vCPU-month, $10 per GB-month of memory, about $0.16 per GB-month of volumes, and $0.05/GB service egress. The estimate above uses those rates for an always-on workload and is not a quote. [Railway pricing](https://railway.com/pricing), [Railway billing guide](https://docs.railway.com/pricing/understanding-your-bill)

Vercel Pro is currently listed at $20/month and includes $20 of usage credit, while third-party PostgreSQL and the future Python service remain separate costs. [Vercel pricing](https://vercel.com/pricing)

## Recommendation for NEXUS

Use **Render in Singapore** for the first deployed demonstration, with one Next.js service and managed PostgreSQL. Keep the Python service disabled while predictions are marked unavailable. This minimizes service wiring and avoids paying for unused model compute. Select compute after measuring a representative build/runtime and connection count; the smallest $13 configuration is only a lower bound and likely too small for sustained use.

Before production provisioning, confirm the specific Postgres tier's backup/PITR retention, connection limit, and storage, and set an alert/spend ceiling. Add a private Python service only after model readiness; budget at least its published compute tier and validate memory with a real process measurement before deployment. No provider account, database, or paid service was created.

## Open deployment choices

1. Confirm whether Render is acceptable for the first hosted demonstration, or whether the user prefers Railway or Vercel plus external services.
2. Confirm the maximum monthly budget and whether the system must remain online continuously.
3. Confirm the public domain and HTTPS origin before setting HSTS/CSP deployment policy.
4. Decide backup retention and recovery objectives before choosing the production Postgres plan.

