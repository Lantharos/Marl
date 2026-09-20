# Writing Markdown

Overview documents, issue discussions, pull reviews, and release notes share Marl's Markdown
renderer. It supports GitHub Flavored Markdown tables, task lists, strikethrough, autolinks,
headings, nested lists, quotes, fenced code, and safe HTML. Comments preserve single line breaks;
Markdown files follow the usual paragraph rules.

## Images and banners

Store a banner in your repository and reference it from the README:

```md
![Project banner](./assets/banner.svg)
```

Markdown images and HTML image attributes resolve against the document's folder and revision.
A leading slash means the repository root. Encoded filenames and parent-directory references
work in images, links, and image source sets. Absolute HTTPS image URLs also work.

For a banner that changes with Marl's appearance setting:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/banner-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="./assets/banner-light.svg">
  <img alt="Project banner" src="./assets/banner-light.svg" width="100%">
</picture>
```

The `#gh-dark-mode-only` and `#gh-light-mode-only` image URL suffixes also work. HTML image
dimensions, centered paragraphs, linked badges, and aligned images are preserved. Documents
keep author-specified image sizes within the available width; discussion attachments use
the shared compact media width.

Repository PNG, JPEG, GIF, WebP, AVIF, and SVG images are supported. SVGs can render as images,
but direct navigation downloads them, and their response policy blocks scripts and external
resources. An SVG's own inline styles are allowed. External images load from their original
host; Marl does not operate a GitHub Camo-style image proxy.

## References and footnotes

Headings get link anchors, including repeated headings. Custom `<a name="section">` anchors
and links such as `[Details](#section)` work. Following a link into a collapsed section opens it.
Footnote IDs are scoped to each document or comment, so separate discussions cannot steal
each other's links.

```md
Some useful context[^source].

[^source]: A footnote with **formatting** and [a link](https://example.com).
```

Unicode emoji shortcodes such as `:wave:` and `:rocket:` are supported. `@username` links to a
Marl profile; `#12` links to an issue and `!12` to a pull. Cross-repository references use
`owner/repository#12` or `owner/repository!12`. Commit hashes link to the repository's commit
view; abbreviated hashes must identify exactly one accessible commit. Rendering a mention
does not by itself send a notification or check that the account exists.

## Alerts and collapsed sections

```md
> [!NOTE]
> Context worth keeping close to the code.
```

The five alert types are `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, and `CAUTION`.
Use `<details><summary>Details</summary>…</details>` for a collapsed section, with blank lines
around Markdown inside it. Inline color codes show a small swatch.

## Code, math, and diagrams

Give a fenced code block its language to enable syntax highlighting. Code blocks have a copy
action. Unknown languages remain readable as plain code. Highlighting follows Marl's appearance
setting and loads only when the code is near the viewport.

Inline math supports `$E = mc^2$` and dollar-delimited backtick expressions. Display math uses
`$$` delimiters or a fenced `math` block. Expressions are rendered with KaTeX; unsafe commands
that embed arbitrary HTML or external resources are disabled. KaTeX and GitHub's MathJax do
not implement exactly the same TeX command set.

Fenced `mermaid`, `geojson`, `topojson`, and ASCII `stl` blocks render diagrams, maps, and 3D models.
Each preview keeps its source in a disclosure and offers zoom controls. Maps show the supplied
geometry on a geographic grid without downloading third-party map tiles. Drag an STL model to
rotate it, or focus it and use arrow keys; `+`, `-`, and Home control its view from the keyboard.

Preview libraries load on demand. Mermaid is limited to 50,000 characters and 500 edges;
map and STL source is limited to 500,000 characters. Math expressions are limited to 10,000
characters and code highlighting to 100,000 characters. Oversized or invalid content retains
its readable source. Model rendering stops when idle and releases its resources on navigation.

## Safety and compatibility

Scripts, event handlers, arbitrary CSS, embedded frames, forms, and active inline SVG are not
accepted in Markdown. Use an image URL for SVG artwork. Mermaid uses strict security settings;
its result is displayed as an isolated image, so diagram click handlers are not enabled.

The syntax follows [GitHub's writing guide](https://docs.github.com/en/get-started/writing-on-github)
and the [GFM specification](https://github.github.com/gfm/). GitHub-specific account notifications,
issue numbering, custom emoji artwork, and external-service previews are not reproduced.
