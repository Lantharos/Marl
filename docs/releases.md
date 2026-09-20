# Releases

Release lists show a short preview of the notes and a direct link to downloads. More versions
load as you scroll. A release keeps its notes beside the download panel; on small screens,
downloads appear first. Uploaded files are separate from generated source archives, and a
filename search appears when a release has more than six files.

This separation addresses recurring reports about [finding release downloads](https://github.com/orgs/community/discussions/6163)
and [downloads buried below changelogs](https://www.reddit.com/r/github/comments/dlihnt/).
These reports informed the layout; they are not a measured usability result for Marl.

Repository collaborators with push access can draft and publish releases. Every release selects
an existing branch or full commit identifier and owns one repository-unique Git tag. Drafts can
change that tag and target until publication. Published tags are immutable; release notes,
prerelease state, attached assets, and latest status remain editable.

Publishing creates and verifies the Git tag before exposing the release. Tags created outside the
release screen remain available as release targets, and publishing against an existing tag is
idempotent only when it already resolves to the selected commit. One non-draft, non-prerelease
release can be marked latest per repository. Deleting a release removes its metadata and assets,
but does not rewrite Git history or delete its tag.

Every published release provides source archives generated directly from its immutable commit:

- ZIP
- tar.gz

Release assets are stored in the API's R2 bucket under immutable internal keys. A release supports
up to 100 assets. Each asset may be at most 2 GiB and uploads in 8 MiB parts, with an exact final
part size. Incomplete uploads expire after 24 hours and are aborted before their reserved name can
be reused. Downloads use the original safe filename and increment a per-asset count.

Files can be selected while creating a release; Marl first saves a recoverable draft, uploads every
file, and only then publishes the tag. Self-hosted workflows can publish releases with
`marl/release@v1`. Runner assets are copied into release-owned storage after the declared job
succeeds, while the original run artifacts remain available from the run.

Draft releases and their assets require repository push access. Published release visibility and
downloads follow repository read access. All create, publish, edit, asset, and delete mutations are
recorded in the repository audit log.
