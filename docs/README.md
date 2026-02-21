# Documentation Index

Detailed documentation for the Resume Tailor system.

| Document | What It Covers |
|----------|---------------|
| [Architecture](architecture.md) | System design, request lifecycle, module map, data flow |
| [Error Handling](error-handling.md) | Request ID middleware, global exception handlers, error response format |
| [Resilience](resilience.md) | Fallback prompts, LLM provider failover, graceful degradation |
| [Security](security.md) | CORS, rate limiting, security headers, input validation, Docker hardening |
| [Deployment](deployment.md) | Docker, CI/CD pipeline, health check, environment variables |
| [Testing](testing.md) | Test strategy, coverage enforcement, mocking patterns, test organization |
| [Prompts](prompts.md) | Langfuse prompt management, fallback prompts, prompt push script |
| [Troubleshooting](troubleshooting.md) | CORS errors, missing pdflatex, Langfuse down, SSE issues, common fixes |
| [SSE Streaming](sse.md) | What SSE is, why we chose it, backend queue-bridge pattern, frontend stream consumer, 20 checks and balances |
| [Design Decisions](design-decisions.md) | Why we chose each pattern: ASGI middleware, asyncio.Queue SSE, contextvars, LLM fallback, marker-based LaTeX, and more |

## Quick Reference

```bash
make help          # Show all available commands
make test          # Run backend + frontend tests
make test-cov      # Run backend tests with coverage report
make dev-backend   # Start backend (port 8001)
make dev-frontend  # Start frontend (port 3001)
make docker-build  # Build backend Docker image
```
