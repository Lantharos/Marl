use serde::{Deserialize, Serialize};
use serde_json::json;
use worker::{
    Context, Env, MessageBatch, MessageExt, Queue, QueueRetryOptionsBuilder, Result, console_error,
};

use crate::request_context::Database;

pub(crate) const WEBHOOK_QUEUE_BINDING: &str = "STY_WEBHOOK_QUEUE";
pub(crate) const CI_QUEUE_BINDING: &str = "STY_CI_QUEUE";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(crate) enum WorkQueueMessage {
    WebhookEvent {
        tenant: String,
        project: String,
        event: String,
        data: serde_json::Value,
    },
    WebhookDelivery {
        tenant: String,
        project: String,
        hook_id: String,
        event: String,
        payload: serde_json::Value,
    },
    CiReadyHead {
        tenant: String,
        project: String,
        workspace: String,
        head: String,
    },
}

#[worker::event(queue)]
pub async fn queue(batch: MessageBatch<WorkQueueMessage>, env: Env, _ctx: Context) -> Result<()> {
    let database = env.d1("STY_DB")?.with_session(Some("first-primary"))?;
    let webhook_queue = env.queue(WEBHOOK_QUEUE_BINDING).ok();
    let retry = QueueRetryOptionsBuilder::new()
        .with_delay_seconds(retry_delay_seconds(&batch.queue()))
        .build();
    for message in batch.iter() {
        let message = message?;
        match process_message(&env, &database, webhook_queue.as_ref(), message.body()).await {
            Ok(()) => message.ack(),
            Err(error) => {
                console_error!("sty queue message failed: {}", error);
                message.retry_with_options(&retry);
            }
        }
    }
    Ok(())
}

pub(crate) async fn send_webhook_event(
    queue: &Queue,
    tenant: &str,
    project: &str,
    event: &str,
    data: serde_json::Value,
) -> Result<()> {
    queue
        .send(WorkQueueMessage::WebhookEvent {
            tenant: tenant.to_string(),
            project: project.to_string(),
            event: event.to_string(),
            data,
        })
        .await
}

pub(crate) async fn send_webhook_delivery(
    queue: &Queue,
    tenant: &str,
    project: &str,
    hook_id: &str,
    event: &str,
    payload: serde_json::Value,
) -> Result<()> {
    queue
        .send(WorkQueueMessage::WebhookDelivery {
            tenant: tenant.to_string(),
            project: project.to_string(),
            hook_id: hook_id.to_string(),
            event: event.to_string(),
            payload,
        })
        .await
}

pub(crate) async fn send_ci_ready_head(
    queue: &Queue,
    tenant: &str,
    project: &str,
    workspace: &str,
    head: &str,
) -> Result<()> {
    queue
        .send(WorkQueueMessage::CiReadyHead {
            tenant: tenant.to_string(),
            project: project.to_string(),
            workspace: workspace.to_string(),
            head: head.to_string(),
        })
        .await
}

pub(crate) async fn send_webhook_delivery_batch(
    queue: &Queue,
    messages: Vec<WorkQueueMessage>,
) -> Result<()> {
    if messages.is_empty() {
        return Ok(());
    }
    queue.send_batch(messages).await
}

async fn process_message(
    env: &Env,
    database: &Database,
    webhook_queue: Option<&Queue>,
    message: &WorkQueueMessage,
) -> Result<()> {
    match message {
        WorkQueueMessage::WebhookEvent {
            tenant,
            project,
            event,
            data,
        } => {
            crate::webhooks::dispatch_project_event(
                database,
                webhook_queue,
                tenant,
                project,
                event,
                data.clone(),
            )
            .await
        }
        WorkQueueMessage::WebhookDelivery {
            tenant,
            project,
            hook_id,
            event,
            payload,
        } => {
            crate::webhooks::deliver_webhook_delivery(
                database, tenant, project, hook_id, event, payload,
            )
            .await
        }
        WorkQueueMessage::CiReadyHead {
            tenant,
            project,
            workspace,
            head,
        } => {
            let jobs = crate::routes::ci::materialize_ci_for_ready_head(
                env, database, tenant, project, workspace, head,
            )
            .await?;
            if !jobs.is_empty() {
                let _ =
                    crate::ci_runner_pool::notify_runners(env, tenant, project, jobs.len()).await;
                crate::webhooks::dispatch_project_event(
                    database,
                    webhook_queue,
                    tenant,
                    project,
                    "ci.jobs_queued",
                    json!({ "workspace": workspace, "head": head, "jobs": jobs }),
                )
                .await?;
            }
            Ok(())
        }
    }
}

fn retry_delay_seconds(queue: &str) -> u32 {
    if queue.contains("webhook") { 60 } else { 30 }
}
