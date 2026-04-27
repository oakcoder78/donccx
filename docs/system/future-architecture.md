# Future Architecture Considerations

This document aggregates possible architectural evolutions, aligned with the current structure (UI, Layout, Hooks, Contexts, Lib, Services, Donkie) and existing integrations.

---

## Backend Evolution

- **Current state:** System relies on Supabase as BaaS (auth, CRUD, storage).
- **Reason to evolve:** As user count and business‑logic complexity grow, may need to
  - Execute domain validations that don't fit in DB rules or simple Edge functions.
  - Orchestrate transactions involving multiple external services (Freshdesk, Donc API, OpenRouter).
  - Implement finer‑grained authorization policies.
- **Options:** Node.js with NestJS or Fastify, or advanced server‑side functions in Supabase Functions acting as a *backend façade* layer.
- **Benefits:** Centralized logic, better error control, middleware support, richer integration tests.

---

## Performance Optimization

- **Local data cache:** Use TanStack Query v5 with configured `staleTime` and `queryClient.setQueryData` to avoid redundant Supabase calls.
- **Query optimization:** Review PostgreSQL indexes (via Supabase) and use specific `select`/`eq` to reduce payload.
- **Lazy module loading:** Apply `React.lazy`/`Suspense` on less‑critical panels (e.g., reports, dashboards) to shrink initial bundle.
- **Render reduction:** Use `useDeferredValue`/`useTransition` on large lists, memoize UI component props, split large context into smaller ones.
- **When to apply:** When latency exceeds ~200 ms or scaling to thousands of records.

---

## Integration Scaling

- **External API expansion:** Build a generic wrapper in `src/lib/apiClient.js` handling base URL, headers, common error handling.
- **Async processing queue:** Introduce a broker (e.g., Supabase Edge Functions + PostgreSQL NOTIFY or RabbitMQ) for tasks requiring retries or batch processing (e.g., massive Freshdesk sync).
- **Automatic retries:** Implement exponential back‑off policy in `lib` helpers that call Freshdesk, Donc API or OpenRouter, using libraries like `axios‑retry` or custom logic.
- **Benefit:** Reduce transient failures, improve resiliency, ensure spikes don't knock out external services.

---

## Observability and Monitoring

- **Centralized logging:** Ship frontend logs (via `console.log` wrappers) and Edge function logs to an aggregation solution (e.g., Logflare, Sentry, or Supabase Logflare).
- **Error monitoring:** Configure Sentry (or equivalent) to capture unhandled exceptions in hooks, services and Donkie.
- **Usage metrics:** Measure response times of Supabase calls and external APIs; expose via internal dashboard or Grafana integration.
- **Automatic alerts:** Define thresholds (e.g., error rate > 2 %) and trigger email or Slack alerts.

---

## Security Enhancements

- **Granular permissions:** Evolve `AuthContext` model to include detailed *roles* and *scopes*, enabling row‑level resource control.
- **Action audit:** Persist critical events (login, entity create/update, IA calls) in an audit table on Supabase.
- **Unauthorized‑access protection:** Implement rate‑limiting on Edge functions, validate `origin`, and use CSP headers on Vercel.
- **Token security:** Rotate keys periodically and store secrets only in backend (or Functions), never expose them to the frontend.

---

## Modular Growth

- **New dashboards and reports:** Add UI/Layout modules that consume specific hooks, preserving responsibility separation.
- **New operational flows:** Example: a “Service Order” module interacting with Donc API and Freshdesk; added as a new *service* + *hook*.
- **Modular architecture scalability:** Current split between UI, Hooks, Services and Lib allows new features to be added without touching existing code; just add directories and export them in each layer's `index.js`.

---

## Testing Strategy

- **Unit tests:** Introduce Jest + React Testing Library for UI components and pure `lib` functions.
- **Integration tests:** Mock Supabase client and verify services correctly transform responses.
- **End‑to‑end tests:** Use Playwright or Cypress to exercise critical flows (login → create client → Freshdesk sync).
- **CI/CD:** Automate test execution in PR pipelines; block merges on failures.

---

## Summary

Current architecture is modular and growth‑ready, but natural evolutions include:

```text
backend dedicated
smart cache
processing queue
monitoring + logging
advanced security
modular expansion
robust test pipeline
```

These will be introduced incrementally as the user base, data volume and integration count increase. Each point can be added step‑by‑step, leveraging existing clear layer boundaries.
