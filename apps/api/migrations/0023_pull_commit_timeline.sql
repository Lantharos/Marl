WITH RECURSIVE
source_history(pull_id, commit_id) AS (
  SELECT id, source_commit_id FROM pull_requests
  UNION
  SELECT source_history.pull_id, json_each.value
  FROM source_history
  JOIN pull_requests ON pull_requests.id=source_history.pull_id
  JOIN commits ON commits.repository_id=COALESCE(pull_requests.source_repository_id,pull_requests.repository_id) AND commits.id=source_history.commit_id
  JOIN json_each(commits.parent_ids)
),
target_history(pull_id, commit_id) AS (
  SELECT id, target_commit_id FROM pull_requests
  UNION
  SELECT target_history.pull_id, json_each.value
  FROM target_history
  JOIN pull_requests ON pull_requests.id=target_history.pull_id
  JOIN commits ON commits.repository_id=pull_requests.repository_id AND commits.id=target_history.commit_id
  JOIN json_each(commits.parent_ids)
),
ordered_commits AS (
  SELECT pull_requests.id AS pull_id, commits.id, commits.title
  FROM pull_requests
  JOIN source_history ON source_history.pull_id=pull_requests.id
  JOIN commits ON commits.repository_id=COALESCE(pull_requests.source_repository_id,pull_requests.repository_id) AND commits.id=source_history.commit_id
  LEFT JOIN target_history ON target_history.pull_id=pull_requests.id AND target_history.commit_id=commits.id
  WHERE target_history.commit_id IS NULL
  ORDER BY pull_requests.id,commits.authored_at,commits.id
),
commit_groups AS (
  SELECT pull_id,json_group_array(json_object('id',id,'title',title)) AS commits
  FROM ordered_commits
  GROUP BY pull_id
)
INSERT INTO pull_request_events (id,pull_request_id,actor_id,kind,details,created_at)
SELECT 'event_commit_history_' || substr(pull_requests.id,4),pull_requests.id,pull_requests.author_id,'commits_added',json_object('commits',json(commit_groups.commits),'owner',source_organizations.slug,'repository',source_repositories.name),pull_requests.created_at
FROM pull_requests
JOIN commit_groups ON commit_groups.pull_id=pull_requests.id
JOIN repositories AS source_repositories ON source_repositories.id=COALESCE(pull_requests.source_repository_id,pull_requests.repository_id)
JOIN organizations AS source_organizations ON source_organizations.id=source_repositories.organization_id
WHERE NOT EXISTS (SELECT 1 FROM pull_request_events WHERE pull_request_events.pull_request_id=pull_requests.id AND pull_request_events.kind='commits_added');
