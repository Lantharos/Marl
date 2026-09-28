# Repository recovery and deletion

Deleting a repository immediately hides it and revokes normal repository access. Pending and running jobs using it are cancelled and their leases revoked. The name remains reserved for the 30-day recovery period. Administrators can restore it from Repositories → Recently deleted after confirming their identity. Restoration preserves its previous archived state and does not restart cancelled jobs.

The API's hourly scheduled task claims expired repositories before touching storage. Once claimed, restoration is disabled. Each pass processes at most ten repositories and bounded batches of objects and job uploads. Failed passes log the repository ID and retry on the next schedule.

The Git edge first writes a durable deletion marker that rejects later state reads and writes. It waits an hour before removing R2 Git objects, allowing in-flight work to drain. Repository storage accounting is released with an idempotent adjustment, then state tables are cleared while the deletion marker remains. The local Git gateway removes the corresponding bare repository directory.

After Git storage confirms completion, the API removes logs, artifacts, multipart uploads, release assets, attachments, icons, and database rows. References from other repositories are detached; the organization audit history remains. Configure an R2 lifecycle rule to abort abandoned multipart uploads as an additional storage backstop.

The gateway-authenticated `POST /api/v1/maintenance/purge` runs the same task manually. `GET /api/v1/maintenance/readiness` checks D1 and object storage; `/health` remains a cheap liveness endpoint. Readiness does not test Git publication or every storage region. Alert on repeated purge errors and overdue deletions, and qualify the R2 and Durable Object cleanup path in staging before public launch.
