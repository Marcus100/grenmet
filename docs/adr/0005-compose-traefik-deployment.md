# ADR-0005: Deploy With Docker Compose And Traefik On Dedicated Droplets

## Status

Accepted

## Context

GrenMet needs staging and production deployments without the operational overhead of Kubernetes.

## Decision

Deploy staging and production as Docker Compose stacks on dedicated DigitalOcean droplets. Use Traefik for HTTPS, host-based routing, and dashboard protection. Use GitHub Actions self-hosted runners for deployment.

## Consequences

- Operational complexity stays lower than Kubernetes for the current scale.
- Each environment needs runner, DNS, firewall, Docker, and secret setup.
- Traefik owns TLS termination and HTTP-to-HTTPS redirect behavior.
- Scaling is primarily vertical or manual per service until a different platform decision is made.

