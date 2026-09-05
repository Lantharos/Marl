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

Use 13–14 px for readable working content, 12 px for controls and field labels, and at
least 11 px for supporting metadata. Code has its own monospace scale and horizontal
scrolling. Do not shrink a filename, command, or comment to fit a narrow screen.

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

## Showing the product

The landing page explains Marl and offers an account action in its opening section.
An explicitly labeled, expandable review example shows how revision history works before
the page discusses the reasons for building Marl. Git publication guarantees remain
specific and separate from availability claims.

## Research behind these choices

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
