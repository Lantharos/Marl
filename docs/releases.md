# Releases

Release lists read as a timeline: each version shows its tag, date, and a short preview of the
notes, with a direct link to its files and their total downloads. The marker on the timeline and
a word beside the date set the latest release, prereleases, and drafts apart. More versions load
as you scroll.

A release keeps its notes beside the download panel; on small screens, downloads appear first.
Each file shows its size and download count, and a filename search appears when a release has
more than six files. Generated source archives sit below the uploaded files with the commit they
were built from. When a release includes a checksum file, such as `checksums.txt`, `SHA256SUMS`,
or `app.tar.gz.sha256`, Show checksums reads it and places each SHA-256 or SHA-512 digest under
its file with a copy button. Reading the checksum file counts as one of its downloads.

The editor gives the notes most of the page. Tag, target, and release type sit together beside
them: choosing an existing tag uses its commit, and a new tag is created from the chosen branch
when the release is published. Files can be dropped onto the editor or chosen from disk, and each
one shows its own progress and errors. Publish release and Save draft are separate actions, and a
published release can no longer return to a draft.

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
