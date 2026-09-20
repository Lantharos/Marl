# Interface principles

Marl keeps the work readable without turning every piece of metadata into an alert.
Open Runde, the warm neutral canvas, and terracotta actions carry across public pages,
repositories, and account settings. Light and dark appearances use the same hierarchy.

## Reading and navigation

Page titles name the destination. Descriptions earn their space by explaining a consequence
or a choice, not by repeating the title. The icon-based global navigation keeps labels
available on hover and keyboard focus;
on small screens the menu names the same destinations. Search remains available from
the header and with Ctrl K.

Navigation reuses the current tab's shell for up to a minute instead of fetching the same
profile and repository list on every page change. Account, repository, and organization
changes refresh it immediately; sign-in changes also refresh other open tabs. This cache
is held in browser memory only. The home dashboard still loads current activity on each visit.

Use 13–14 px for readable working content, 12 px for controls and field labels, and at
least 11 px for supporting metadata. Code has its own monospace scale and horizontal
scrolling. Do not shrink a filename, command, or comment to fit a narrow screen.

Hide scrollbars across pages and nested panels without disabling scrolling. Wheel, trackpad,
touch, and keyboard navigation remain available, including horizontal scrolling through code.

## Grouping

A shared surface means the contents belong together: a conversation, file list, form,
revision, or settings operation. Use spacing between independent groups. Avoid repeated
rules inside a group unless they clarify a real boundary. Repository navigation uses its
connected island treatment. Filters and document selectors
use rounded chips; the overview document stays on the canvas. Status colors describe
outcomes, not decoration.

Related fields and their actions stay together. Destructive actions retain explicit
labels and confirmation flows. Menus, form errors, empty states, and saved feedback are
part of the interface, not exceptions to it.

## Settings

Account signing preferences live with sign-in and security. Repository signing and approval
for outside contributors' checks live with access and security. Each policy row shows its current
value beside an explicit Change action. Choice dialogs show each option and its effect together.
General settings keep description saving beside the field and default-branch changes in a
separate confirmation modal.

Branch rules group merge requirements separately from review and merge preferences. Each row
opens a focused editor; changing one setting preserves the other rules. Branches without their
own rule show the all-branches policy they inherit. Secrets use a compact list with separate
add and change dialogs, and confirmation before deletion.

Account pages use the same spacing and list surfaces. Email and SSH-key creation open focused
dialogs; existing credentials and devices remain the primary content. The default branch name
is itself the button that opens its editor.

## Profile repositories

User and organization profiles highlight the seven most recently updated active public repositories.
All repositories opens a public, owner-scoped browser with search and All, Active, and Archived
filters. Repository lists load more as the reader scrolls, with retry available after an error.
Search and filters stay in the URL; private and deleted repositories never appear in public lists.

## Releases

The release list keeps versions, dates, and draft or prerelease state scannable. Each release
has a direct route to its downloads. Detail pages separate reading from downloading: notes fill
the main column, with downloads and source archives alongside. On small screens, downloads
come before the notes. Long filenames wrap, and releases with many files offer filename search.
Source archives stay separate from the files uploaded by the maintainer.

The release editor groups tag, target, and publishing choices beside the notes and attachments.
Publication, draft visibility, and upload behavior do not depend on the layout.

## Review discussions

See [Writing Markdown](markdown.md) for document images, formatting, footnotes, diagrams,
and the differences between overview documents and compact discussion media.

A pull uses two columns on desktop: title, brief, one current status, metadata, and lifecycle
actions on the left; section chips, composer, revisions, and discussion on the right. The two
columns align at the top. Smaller screens stack them, with assignees and labels behind an
explicit disclosure. Use the available width for code and conversation instead of repeating
metadata above the timeline. Merge requirements are a disclosure, not a row of competing statuses.
Lifecycle actions do not post a comment draft.

The brief previews three lines at the panel's current width, with Read more inline at the
end of the paragraph. It opens the author's
full Markdown in a reading modal, including code and attachments. The edit modal uses the same
720px reading width. Review menus use short
action labels; approvals use muted green and requested changes use amber, not destructive red.

Resolution belongs to the thread, not to a new timeline entry, and is restricted to maintainers
and owners. Comment deletion remains available to its author even when replies are locked.
Maintainers can moderate other comments; deleting review text retains the review decision and
its conversations. Confirm destructive actions in place and keep failures visible.


Each submitted review groups its summary and the reviewer's preceding line conversations
on that revision into one surface. The submission sets the boundary: comments after it
stay separate until that reviewer submits another review. Other reviewers' conversations,
general pull comments, and feedback on another revision are never folded into that group.
Approvals and comment-only reviews use the same structure as requested changes.

Reviews and their line conversations are newest first, while replies within a conversation
read in discussion order. The summary stays above its conversations. Code context, replies,
editing, and resolution remain available inside the group, and resolved conversations stay
collapsed. Earlier revisions load their grouped discussion when expanded.
Unsent replies and edits stay with their thread when a new submission groups it.

## Issue discussions

Issues favor reading and conversation: the opening report and discussion form a wide main column,
with a quiet right sidebar for the conclusion, linked pulls, labels, and people. The report expands
inline, retaining screenshots and reproduction steps. Keep chronological order within the discussion
and group replies one level deep. Reply opens a composer beside its conversation; selected text can
be quoted without nesting another full post. New top-level thoughts use the composer at the end.
On narrow screens the sidebar is available through a disclosure above the discussion.

Open and Closed describe the issue's actual state. Do not infer urgency or a pending decision from
assignment or comment counts. Administrative changes belong in expandable history. Optional
conclusions are human-authored and link back to a source comment when promoted. Resume and Latest
provide navigation without changing the reading order.

Linked work uses the item's title as the primary line, with its reference below it. Link a pull
searches existing pulls in the repository; it does not start another creation flow. Explicit
links remain independent of references in the report or comments. On both issues and pulls,
linked work comes before assignees, labels, and the conversation controls.

Shared composers support paste, drop, and an attachment button. Show upload progress and an explicit
retry beside failures; keep unsent text intact. Posting waits for uploads to finish. Image viewers
and video controls follow the same keyboard, focus, and surface conventions as the rest of Marl.
Discussion images and videos share a 560-pixel preview width, shrinking together to fit narrow
threads. Images retain their proportions and open in the full-size viewer; videos can go fullscreen.
Repository documents retain their larger media layout.
Videos near the viewport load a paused first-frame preview; videos farther down the page wait
until approached. Playback always remains explicit. Dialogs occupy the browser's modal layer,
above repository navigation, and return focus when dismissed. Popovers and the command palette
share rounded inset options and short, reversible scale-and-slide transitions. Keep their text
rendering consistent as the animation settles; reduced-motion preferences skip the animation.
Nested dropdowns use the top layer so animated modals do not offset or clip their options. Account menu links
and buttons use the same type size and row spacing.

## Showing the product

The landing page opens with a viewport-height composition: a left-aligned statement and
account action beside a right-hand atelier. Its walkway enters from off-screen left and
curves up beneath the copy, with a finished lower silhouette instead of a cropped foreground.
The statement uses the open middle of the scene without overlapping the architecture. The composition
fits in the first viewport. On small screens, the statement sits above the architecture.
An open courtyard accompanies the contribution policy; a close-up
of branching terracotta in stone anchors the bottom edge. These scenes share raw, porous limestone and rough terracotta materials
but use different scales and compositions. Keep artwork out of text and control areas.
Competitor criticism and product sections alternate: GitHub availability, familiar Git
commands, Codeberg’s AI policy, and revision-based pulls. Keep the criticism specific and
source-linked. Separate its headings through pacing and wording, not editorial cards.
Keep copy on the canvas and reserve surfaces for code and conversations.
Product previews should show the interaction without a sidebar
of incidental metadata, repeated status labels, or captions explaining what is visible.
The pull preview keeps the current revision open and earlier discussions expandable.
Its reviews group the summary above the line conversations, just as they do in a pull.

## Imagery and attention

Across Marl, useful content takes priority over visual decoration. Give code, conversations,
filenames, and actions enough room to read at their natural size. Images that explain a
feature belong beside that feature; decorative artwork must not stand in for product
evidence or compete with recovery actions. Do not add captions that repeat what a preview
already shows, fake controls, perpetual motion, or illustrations to every working surface.

Use scale and spacing to establish reading order. Keep related information together and
vary public-page compositions without moving primary actions away from their content.
Illustrations use theme-matched, responsive assets with reserved dimensions; below-the-fold
artwork loads lazily. Essential copy and navigation remain available without images.
The landing headline sits below the atelier roof, with its actions above the left-hand path.
The hero fits the first viewport; smaller screens keep the copy above the illustration.

## Error pages

Missing pages, access errors, rate limits, timeouts, removed pages, server failures, and
other failed requests each have a wide architectural illustration in warm paper,
charcoal, and terracotta. Use the matching light or dark artwork, with a smaller image
on phones. Error pages omit the global header
and anchor their artwork to the bottom edge without a footer gap. Back to Marl is always
available; add Sign in or Try again only when relevant. Keep the saved appearance even
without the navigation shell. The illustration is decorative;
the status, heading, and recovery actions remain readable without it. Keep recovery
specific: sign in for an authentication error, retry a server failure, or return to Marl.
Timeouts also offer a retry. Rate limits use a slowdown scene without an invented countdown
or an automatic retry that would add more requests.

Headlines are short and conversational, with no explanatory subtitle. Keep action labels
literal: Sign in, Try again, and Back to Marl. Browser titles match the page headline.

During local development, open `/__error-preview?status=404` to review an error page.
Change the status to `400`, `401`, `403`, `408`, `410`, `429`, `500`, `503`, `504`, or another HTTP
error code to inspect its artwork and recovery actions. The preview returns the selected
HTTP status and uses the real error layout. It is disabled in production, where the preview
address always returns 404.

## Connection failures

After a successful visit, Marl saves a small, standalone recovery page on the device.
If a later page navigation cannot reach the server, that page appears at the requested
address. Its only action, Try again, reloads the same address, including its query and
fragment. There is no automatic polling or retry loop. Open `/offline` to preview the recovery screen;
visiting that address online also installs offline recovery in that browser.

The recovery page shares the error-page typography, controls, artwork, and saved light
or dark appearance. Its offline icon, headline, and Try again button form a centered column.
Its HTML includes the styles and minimal recovery script, so it does
not depend on the application loading. Only that document, its fonts, favicon, and artwork
are cached; repository content, account data, API responses, and form submissions are not.
Normal HTTP responses, including 403, 404, and server errors, keep their original status
and page. The offline fallback is used only when a document request fails to connect,
whether the browser rejects the request or returns a network-error response.

This requires a prior successful visit on HTTPS or localhost, service-worker support,
and the browser retaining the cache. It cannot replace a browser connection screen on a
first visit or after site storage has been cleared. Clearing site data removes the saved
page; new deployments replace the recovery cache without caching the application itself.

To verify offline recovery, visit Marl online and wait for the service worker to activate
in the same browser and at the same origin (including the port) you intend to test.
Stop the server, reload a page, then close and reopen the browser and visit an unvisited
address. Check the artwork and Try again action, restart the server, and retry. Check
Firefox and Chromium against both the production build and development preview.

## Research behind these choices

- [Images as web content](https://www.nngroup.com/articles/photos-as-web-content/)
  reports stronger attention to relevant, information-bearing images than to decorative
  filler. It informs prominent, legible product previews and restrained illustration use;
  it does not establish a conversion improvement for Marl.
- [Common region](https://www.nngroup.com/articles/common-region/) explains why a shared
  background can establish a group, and why excessive boundaries add clutter.
- [Recognition and recall](https://www.nngroup.com/articles/recognition-and-recall/)
  informs identifiable controls and keeping relevant context beside an action.
- [Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/)
  informs collapsed revision history: retain a useful summary and make the contents
  straightforward to open.
- [Reading on the web](https://www.nngroup.com/articles/how-users-read-on-the-web/)
  motivates descriptive headings and concise, scannable text.
- [Target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
  informs usable control dimensions and spacing. Keyboard focus remains visible.

Developer reports about [buried review comments](https://github.com/orgs/community/discussions/39260)
and [hard-to-follow reviews](https://www.reddit.com/r/github/comments/1g0s5to/code_review_in_github_is_horrendous/)
are useful qualitative signals, not representative evidence about every developer.
These principles still need observation with contributors and maintainers completing real
tasks. They do not establish a measured productivity improvement or accessibility certification.
