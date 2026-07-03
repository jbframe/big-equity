# Tech stack defaults

## Language and frameworks

My default is TypeScript end to end, and it's boring on purpose. One language across the front and back end means less context switching, one set of build and test tooling, and types that follow the data from the database call to the rendered component. I break that default when the problem demands it: Go or Rust for a genuinely high performance backend, React for a large front end with the hiring pool to match, and Svelte for a small one that should ship less code. On the backend framework I pick by team — NestJS when a large team needs structure out of the box, Fastify when a smaller service just needs speed and clean types.

## Data

My data default is PostgreSQL, and with JSONB it covers most of what people reach to a document store for, so I add MongoDB, Redis, or Neo4j only when the access pattern actually calls for it.

## Managed vs. custom

I make the same managed versus custom call on the backend: a provider like AWS Amplify or Firebase for mostly CRUD work to skip undifferentiated plumbing, custom when the business logic gets real with complex authorization, heavy integrations, or hard lock-in concerns. Auth follows the same pattern — a TypeScript-first library like Better Auth as the default, since it infers session types and ships passkeys and rate limiting as typed plugins while keeping the user data in my hands, and a provider like WorkOS or Auth0 the moment a B2B client needs enterprise SSO and SCIM.

## Testing

I lean on a real pyramid weighted toward integration, since heavy unit mocking gives confidence that disappears the moment the pieces talk to each other. I get the most value from integration and end to end coverage on the critical paths with tools like Cypress and WebDriverIO, and reserve fast unit tests for the gnarly logic.

## Deployment and infrastructure

I want everything in CI from the first commit — building, testing, and shipping a containerized artifact to Kubernetes through a pipeline anyone can read — which gives me a consistent target, room to scale a workload against its cost, and clean canary rollouts. I keep the infrastructure itself in code with Terraform, so environments are reproducible and reviewed in a pull request instead of clicked together by hand and impossible to rebuild. I ship small and often behind feature flags, which is how my team at Charter put out 50 releases in a year with no rollbacks.

## The one opinion

If I had to compress all of this into one opinion: the best stack is the most boring one that solves the problem. Novelty has a maintenance bill, and it always comes due later.
