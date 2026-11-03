# Foundation packaging and gated AWS validation

Foundation ships definitions and local verification only. No AWS resource, model call, real mail delivery or public hosting is claimed. `npm run infra:validate` installs a checksum-pinned Terraform CLI under ignored cache, initializes without a backend, validates and runs only mocked plan tests. It strips AWS/token environment credentials for those child processes. The allowlist excludes modules, cloud data lookups, NAT gateways, load balancers, RDS, Kubernetes and extra instances. Tests cannot establish real AMI availability, account permissions, actual cloud behavior or a budget fit.

## Local production smoke

`npm run test:containers` builds multi-stage API/worker/migration/web images, creates a unique local project and private data volume, generates a local certificate/key, validates HTTPS using that certificate as its explicit trust anchor, checks static/API routing, secure cookies, CSRF, restricted DB-role permissions and non-root processes, and removes only that generated project/volume. Docker configuration and temporary files stay under .cache. Generated provider caches, state, plans, env files and private keys are excluded from image context. The development database and Mailpit volumes are preserved. Use a normal non-root host user; web UID/GID follows the key owner during smoke.

For a manually managed hosted profile, use `infra/production/compose.yml` with injected POSTGRES_PASSWORD (owner/migration only), APP_DATABASE_PASSWORD (DML-only app/worker role), CSRF_SECRET, HTTPS WEB_ORIGIN, and TKA_TLS_DIRECTORY containing cert.pem/full certificate chain and key.pem. Use URL-safe randomly generated hex secrets; do not store real values in Terraform, source or image layers. Set TKA_TLS_HOSTNAME to the certificate hostname, TKA_WEB_UID/GID to the non-root key owner, TKA_BIND_ADDRESS=0.0.0.0 and TKA_HTTPS_PORT=443 only for a separately authorized deployment. Local defaults publish web only on 127.0.0.1:8443. Never publish PostgreSQL, API or Mailpit. Keep keys mode 600, mount read-only, and supply a trusted hostname/certificate before using real credentials. The isolated smoke's self-signed fixture is not a trusted public deployment certificate.

Bootstrap uses a separate owner role for schema migrations and grants the app role only public-schema DML. App cannot create roles/databases/schema objects or write migration metadata. The migration service must complete before API starts; stop workers during schema changes. AI_PROVIDER is fixed disabled in this profile. The private service route is denied at the public proxy. Mailpit is an internal synthetic sink, not a working production SMTP provider.

## Paid-action gate — do not apply during foundation

Before any real plan/apply, obtain explicit deployment instruction and record AWS account, region, verified Ubuntu 24.04 x86_64 AMI, existing SSH key, operator /32, cleanup owner and deadline. Recheck current official region-specific EC2, EBS, IPv4, transfer, mail/log and model prices, taxes/currency, previous spend and credits. Complete the worksheet below with conservative headroom under the combined INR 500 ceiling. If it does not fit, reduce scope/duration or stop. Budget alerts and delayed bills are not a hard cap.

| Cost component             | Current official source/date | Quantity × duration       | Conservative INR estimate |
| -------------------------- | ---------------------------- | ------------------------- | ------------------------- |
| Compute                    | Fill after authorization     | Selected type × max hours | Pending                   |
| Root/data disk             | Fill after authorization     | 16 GiB × retained time    | Pending                   |
| Public IPv4                | Fill after authorization     | Address × retained time   | Pending                   |
| Transfer/images/backups    | Fill after authorization     | Expected bytes            | Pending                   |
| Mail/log/storage extras    | Fill after authorization     | Explicit services only    | Pending                   |
| Model/embedding sample     | M11 authorization required   | Capped requests/tokens    | Not enabled               |
| Prior spend/taxes/headroom | Verify before apply          | Combined ceiling INR 500  | Pending                   |

No exact current price is asserted here. Terraform defaults are a topology, not proof of affordability. Official starting points for later verification: https://aws.amazon.com/ec2/pricing/ and https://aws.amazon.com/ebs/pricing/ . Bedrock availability, data handling, permissions and prices are M11 decisions.

## Separately authorized deployment runbook

1. Confirm the paid gate and create a dedicated private working directory/state path for this project. Never reuse another project's state. Back up source data locally using docs/BACKUP.md. Keep state/vars outside Git and encrypt stored backups.
2. Set explicit inputs: region, AMI, existing key name, operator /32, owner and RFC3339 expires_at. Review the seven-resource shape with one instance, encrypted removable root disk and operator-only SSH/HTTPS. Use an isolated local backend path via `terraform init -backend-config=path=<private-project-state>` only after authorization. Review a saved real plan against the account and cost worksheet; apply only that reviewed plan when authorized.
3. The Ubuntu bootstrap installs Docker/Compose and schedules shutdown before package work. Compute stops in one hour by default (maximum two); this is not teardown. Verify actual timer/bootstrap output after launch. Root IAM instance profile is intentionally absent; no application AWS permissions are granted by foundation.
4. Import locally verified images or build only within the approved duration/resources. Inject protected env values and trusted TLS files, start the hosted Compose profile, check HTTPS certificate, readiness, cookie flags, private boundary and real Mailpit-only synthetic registration/knowledge smoke. Do not claim real email until a provider is configured and tested separately. Do not copy real employer data.
5. Export only permitted synthetic evidence/backups before the deadline. Stop app writes/workers, then destroy only resources in the dedicated project state after the separately authorized test. Check instance, root/extra volumes, snapshots, public/elastic IPs, network resources, logs, secrets and state artifacts by Project/Owner tags and exact IDs. Never sweep unrelated resources. Verify the residual inventory and later billing; a stopped VM may still incur disk/address charges.

A teardown failure leaves an explicit blocker and named residual resources; never equate VM stop with deletion. No destroy/apply command has been executed in foundation.

## Scaling and later attachment

One node is not highly available. Scale API replicas behind a same-origin proxy with shared PostgreSQL sessions, independent bounded workers and pooled DB connections. Move to managed DB/replicas only after workload/cost evidence. Future indexes must preserve tenant/source/version/generation and recheck eligibility at read time. Define external adapters and future scoped grants behind the existing capability/source boundary; source metadata never grants access automatically. AI-assisted page drafting stays deferred and would require explicit human publication.

A future Bedrock attachment uses a separate backend-only scoped identity restricted to approved region/model ARNs and actions. Do not add wildcard model invocation, browser keys, hidden model startup or an unapproved provider. M11–M14 retain feasibility, RAG, MCP/two skills/one bounded agent and evaluation gates. Foundation does not implement them.
