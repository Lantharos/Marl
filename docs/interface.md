# Interface principles

Marl keeps the work readable without turning every piece of metadata into an alert.
Open Runde, the warm neutral canvas, and terracotta actions carry across public pages,
repositories, and account settings. Light and dark appearances use the same hierarchy.
Marl follows the device appearance until someone picks Light or Dark from the account menu;
that choice is remembered and applied before the page first paints.

## Reading and navigation

Page titles name the destination. Descriptions earn their space by explaining a consequence
or a choice, not by repeating the title. The icon-based global navigation keeps labels
available on hover and keyboard focus;
on small screens the menu names the same destinations. Search remains available from
the header and with Ctrl K. In a repository's code view, T opens Go to file and / focuses code search. While writing, Ctrl . inserts a saved reply. Pressing ? lists every
keyboard shortcut; pull pages add shortcuts for moving through tabs, changed files, and open
conversations, issue and pull lists add J and K to move between rows and Enter to open one, and
the Inbox adds J and K to move between items, Enter to open one, and E to mark it done.

What someone is looking at lives in the address. A pull's Overview, Changes, Commits, and Checks
sections, the overview document, and the code browser's branch, path, and Markdown view each have
their own URL, so links, refresh, and back and forward return to the same view. Marking Inbox items
read or done updates the list immediately and restores it if the change fails.

Navigation reuses the current tab's shell for up to a minute instead of fetching the same
profile and repository list on every page change. Account, repository, and organization
changes refresh it immediately; sign-in changes also refresh other open tabs. This cache
is held in browser memory only. The home dashboard still loads current activity on each visit.

Text follows one scale: 11, 12, 13, 14, 15, 17, 20, 24, 30, and 38 px. Working content
reads at 14 px, controls and field labels at 13 px, and supporting metadata at 12 px, never
below 11 px. Page titles use 24–30 px. Code has its own monospace scale and horizontal
scrolling. Do not shrink a filename, command, or comment to fit a narrow screen.
Headings use the 600 weight, including headings inside Markdown. Corners use the
6, 8, 10, 14, and 18 px radii; small inline code is the only exception.

Code, branch names, commit hashes, and other literal text use Maple Mono, whose rounded
terminals sit comfortably beside Open Runde. Both families are served from Marl itself.
The common Latin files load first; accented Latin, Greek, and Cyrillic files load only on
pages that use those characters. The wordmark is drawn from Maple Mono's outlines, so it
looks the same before fonts load and on every system.

Issue references use `#` and pull references use `!`, as in Markdown. The sign is set in the
monospace face and dimmed, so `!7` cannot be misread as 17 in lists, timelines, or titles.

Muted text is for supporting metadata and faint text for the quietest hints and placeholders.
Both meet AA contrast on every surface in both appearances.

## Workspace

`/next` previews Marl as a workspace rather than a page per object. A slim rail on the left holds
the Inbox with its unread count, Pulls, Issues, Runs, the first few repositories, search, and the
account menu. The middle canvas shows the object itself, and the details pane on the right keeps its
state, people, labels, checks, linked work, and actions in the same place for every pull and issue.
] shows or hides the details pane, and the choice is remembered on that device. A small breadcrumb
above the canvas is the only location chrome; there are no headers, tabs, or footers.

The Inbox is the home of the workspace. Items are grouped by why they reached you: review requested,
mentioned, assigned, your pull, your issue, your failed run, and following. J and K open the next or
previous item next to the list without leaving it, E marks an item done with an undo below the list
(Z also undoes), U toggles unread, Enter moves into the opened item, and Esc returns to the list.
Pulls and issues that were opened once stay loaded while you move around, so returning to them is
instant, and changes made in one place show up everywhere the item appears.

Review is a mode of a pull, at `/next/owner/repo/pulls/7/review`. The canvas splits into the changed
files as a tree, one file's diff at a time, and the pull's conversation with the review composer.
The revision bar across the top compares any two revisions: pick the base from its menu and the head
by clicking a revision, or use All changes and Since your review. Viewed files are remembered per
revision on that device. N and P move between files, J and K between changes and conversations, the
arrow keys between lines (Shift extends the selection), C comments on the current line, V marks the
file viewed, A switches the review to Approve, Ctrl Enter submits, and Esc leaves review.

A repository's home in the workspace is its code, at `/next/owner/repo`; folders and files live at
`/next/owner/repo/tree/branch/path` and `/next/owner/repo/blob/branch/path`. Clicking a repository
in the rail opens it there, and Ctrl K offers Code for the repository you are in. The file tree takes
the list's place and can be resized by dragging its edge, the folder or file fills the canvas, and the
home opens on the README, selected in the tree. The details pane holds the repository itself: its
description, stars and forks, the branch picker, the clone address, the latest release, and links to
the repository's pulls, issues, and runs in the workspace. With a file open it also shows the file's
latest change and History. The tree stays as it is while you move between files, follows back and
forward, and starts loading an entry as soon as you point at it. T opens Go to file, and the arrow
keys move through the tree. On phones the tree and the opened file take turns, like a list and its
item.

Reading surfaces, such as descriptions and discussions, keep a measured line length and more space.
Working surfaces, such as lists, file trees, and diffs, stay dense and lean on the code font. On
phones the rail becomes a bottom bar, the list and the opened item take turns, and details open as a
sheet.

## Code browser

The Code tab reads like an editor. On wide screens a file tree sits beside the content, with the
branch picker, branch count, code search, and Go to file at its top; the tree stays in view while the
content scrolls. Folders open in place and load their entries the first time they open. Everything
already opened stays loaded while someone moves around the repository, and pointing at or moving to
an entry starts loading it before it is chosen. The tree follows the address: opening a file
highlights it and expands its folders, and back and forward leave the tree as it was. Only the
visible rows are drawn, so folders with thousands of entries scroll as smoothly as small ones.

The arrow keys move through the tree, Right and Left open and close folders, Enter opens the
highlighted entry, and typing the start of a name jumps to it. Dragging the tree's edge resizes it,
and hiding it gives the content the full width; both choices are remembered on that device. On phones
and narrow windows the tree opens as a sheet from the Show files button, and the content keeps the
full width.

The Code tab opens on the repository's README, selected in the tree, since the overview already
shows it rendered beside the other documents; a repository without one opens on its file list. A
folder lists its entries with the latest commit for each. A file shows its latest commit and History
above the content, with its path, Raw, copy, and download on the line below. Markdown files open rendered, with a switch to the source. Line links such as `#L10-L20`
select lines in any source view. Images preview inline, other binary files offer a download, and very
large files show their first 1 MiB with the original a click away.

## Page widths

Every page has exactly one main landmark, and a Skip to content link leads to it. Working
pages, including repositories, pulls, issues, settings, lists, and the home dashboard, share
one frame up to 1280 px wide with 16, 24, or 32 px gutters, so their content lines up with the
repository header. Inside that frame, reading stays at a comfortable measure: an issue's discussion
sits directly beside its sidebar, settings content caps at 880 px, and policies at 720 px. Forms and
other single-task pages use a 720 px column. A pull keeps its summary column at 360 px, or
420 px on wide screens, so short titles fit on one line; the conversation and diff take the rest.

The policy and status links live in the landing page's footer; working pages have no footer.
Pages don't repeat the browser's back button with their own back links.

Hide scrollbars across pages and nested panels without disabling scrolling. Wheel, trackpad,
touch, and keyboard navigation remain available, including horizontal scrolling through code.

Agents carry a small bot icon beside their name everywhere they appear; imported authors carry an
import icon and are not linked. Report is a quiet option in menus and headers, never a prominent
button.

## Grouping

A shared surface means the contents belong together: a conversation, file list, form,
revision, or list of repositories, pulls, or runs. Lists share one surface with rounded,
hover-highlighted rows; grouped lists, such as issues by date or pulls by readiness, put each
group's heading on the canvas above its own surface. Settings groups do not get a surface: a group heading sits on the
canvas above rows separated by hairlines. Use spacing between independent groups. Avoid repeated
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
General settings keep the icon and description together, then group code and visibility,
ownership, and lifecycle operations. Each operation opens its own dialog; visibility, archiving,
and detaching a fork confirm their consequences first.

Branch rules group review requirements separately from merge preferences. Each row
opens a focused editor; changing one setting preserves the other rules. Branches without their
own rule show the all-branches policy they inherit. Secrets use a compact list with separate
add and change dialogs, and confirmation before deletion.

Settings navigation groups related pages with space rather than headings: on an account, profile
and communication, then sign-in and devices, then developer access, then data and deletion.
Credentials, devices, saved replies, and secrets share one row layout: an icon, a name, quiet
details, and actions on the right. Sessions mark the current browser and offer to sign out every
other session at once.

Account pages use the same groups and spacing. Email and SSH-key creation open focused
dialogs; existing credentials and devices remain the primary content. The authenticator QR
code stays dark on light in both appearances so every camera can read it.

## Signing in

Sign in, account creation, password recovery, and two-factor pages place a single column of
fields on the canvas, above the arched doorway from the access error artwork. The doorway
is anchored to the bottom edge and never sits behind a field. On phones the column comes
first and a smaller image follows. Sign in offers saved
passkeys directly from the username field's autofill, alongside the Use a passkey button.

## Profile repositories

User and organization profiles highlight the seven most recently updated active public repositories.
All repositories opens a public, owner-scoped browser with search and All, Active, and Archived
filters. Repository lists load more as the reader scrolls, with retry available after an error.
Search and filters stay in the URL; private and deleted repositories never appear in public lists.

## Releases

The release list is a timeline. Versions and dates line up in their own column, the marker shows
which release is latest, a prerelease, or a draft, and the state is written as a word rather than
a badge. Each release has a direct route to its downloads. Detail pages separate reading from
downloading: notes fill the main column, with downloads and source archives alongside. On small
screens, downloads come before the notes. Long filenames wrap, and releases with many files offer
filename search. Source archives stay separate from the files uploaded by the maintainer.

The release editor gives the notes a tall composer and groups tag, target, and release type
beside them, with Publish release and Save draft as separate actions. Files drop onto the editor
and show their own progress. Publication, draft visibility, and upload behavior do not depend on
the layout.

## Runs

Run lists are status first: the outcome icon, name, trigger, branch, duration, and time share one
dense row. A run's jobs appear as a small graph of their dependencies, and the selected job's log
groups output by step. Logs use the code font at a fixed line height and scroll sideways instead
of wrapping, so long output stays aligned and only the visible lines are drawn.

## Review discussions

See [Writing Markdown](markdown.md) for document images, formatting, footnotes, diagrams,
and the differences between overview documents and compact discussion media.

A pull uses two columns on desktop: title, author, branches, brief, merge status, and metadata
on the left; section chips and revisions on the right. The two columns align at the top. Smaller
screens stack them, with assignees and labels behind an explicit disclosure. Use the available
width for code and conversation instead of repeating metadata above the revisions. Branches read
in merge direction, target first: `main ← feature`.

Merge status is one panel nested in the summary, not a row of competing statuses. Its headline
names the outcome: Ready to merge, Not ready to merge, Waiting on checks, Draft, Merged, or
Closed. Below it, a short checklist covers reviews, checks, conversations, and conflicts, each
stated in words beside an icon; failing checks link to the Checks section and unresolved
conversations jump to the next open one. Something a branch rule does not require, such as a
failing optional check, is marked in amber without holding back the headline. Merge, queue, and
lifecycle actions sit at the bottom of the same panel and never post a comment draft.

Revisions organize the conversation column. Each revision is a container whose header summarizes
it: number, latest commit title and hash, who pushed it and when, commit count, the check outcome
on the current revision, conversation and unresolved counts, and each reviewer's avatar marked
with their latest outcome. The current revision stays open, listing its commits when there is
more than one, then the composer and its activity. Earlier revisions collapse to their header and
also name their review outcome. Administrative changes — labels, assignment, title and
description edits, locks, pushes, queue changes, and mentions — sit between discussions as quiet
one-line notes rather than contained entries. Consecutive label or assignee changes by the same
person share a line, and long runs fold behind a count of further updates. Merges, closures,
reopenings, force pushes, and stopped queue merges keep their color and stay visible.

Changes, Commits, and Checks open with the same nested header. Commits are grouped by the revision
that introduced them; commits replaced by a force push stay listed as replaced.

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

Issue lists favor scanning. Each issue is one line on wide screens: state, number, title, and up to
three labels on the left; author, assignees, comment count, and last update in aligned columns on the
right. Phones keep the title on its own line with the number, activity, and labels beneath it. Issues
are grouped by when they last changed (today, the past week, the past month, and older), which follows
the list's newest-first order. State, discussion filter, labels, and search share one toolbar that stays
below the header while the list scrolls. Open and closed counts sit beside their filters when the
repository provides them.

Opening an issue starts from the writing itself: the repository sits above a large title field, and the
description fills about half the window and grows with its content while the actions stay pinned below
it. Ctrl Enter opens the issue from anywhere in the description.

Issues favor reading and conversation: the opening report and discussion form a wide main column,
with a quiet right sidebar for the conclusion, linked pulls, labels, and people. Following, closing or
reopening, and reporting sit with the title. The report expands inline, retaining screenshots and
reproduction steps. Comment bodies align with their author's name, so the avatar column marks where
each contribution starts. Keep chronological order within the discussion and group replies one level
deep inside their conversation's surface. Reply sits beside each comment's time; selected text can be
quoted without nesting another full post, and each conversation ends with a quiet prompt to continue it.
New top-level thoughts use the composer at the end. On narrow screens the sidebar is available through
a disclosure above the report.

Open and Closed describe the issue's actual state. Do not infer urgency or a pending decision from
assignment or comment counts. Administrative changes, state changes, and mentions appear in their
chronological place as compact rows inside one muted container per run of activity. Label changes show
the label itself. When a run holds more than two administrative changes, they collapse into a single
summary row that expands in place; closing, reopening, and mentions always stay visible. Optional
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
Every menu, dropdown, and popover opens in the top layer, stays attached to its control while the page
scrolls, and flips to the side with room when it would leave the screen, so animated modals never offset or
clip their options. Clicking outside or pressing Escape closes it and returns focus to the control that
opened it. Menus move between options with the arrow keys, Home, and End, and jump to an option when its
first letters are typed. Account menu links and buttons use the same type size and row spacing.

Icon-only controls and shortened text explain themselves with a tooltip after a short pause on hover or
keyboard focus. Keyboard hints use one key style everywhere.

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
commands, Codeberg’s AI policy, revision-based pulls, and GitHub’s fee for self-hosted runners
beside Marl’s own runs. Keep the criticism specific and source-linked. Separate its headings through pacing and wording, not editorial cards.
Keep copy on the canvas and reserve surfaces for code and conversations.
Product previews should show the interaction without a sidebar
of incidental metadata, repeated status labels, or captions explaining what is visible.
The pull preview keeps the current revision open and earlier discussions expandable.
Its reviews group the summary above the line conversations, just as they do in a pull.
The run preview places a workflow file beside the finished run it produced. Choosing a job
shows its log and highlights that job in the file; nothing moves until the reader chooses.
The hero artwork loads first. Other scenes wait until the reader approaches them and download
only the artwork for the current appearance.

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
