# GitHub PR Link Copier

A Tampermonkey userscript that adds a copy icon next to the title on GitHub pull request pages. The copied text can be customized with a template.

The copied content is a rich-text link. Pasting into Slack, Notion, Google Docs, or other rich-text editors produces a link with the display text:

> [example-org/example-repo#123 Pull request title](https://github.com/example-org/example-repo/pull/123)

Plain-text fields receive the rendered template as is:

```text
[example-org/example-repo#123 Pull request title](https://github.com/example-org/example-repo/pull/123)
```

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open [github-pr-link-copier.user.js](https://raw.githubusercontent.com/ecto0310/github_pr_link_copier/main/github-pr-link-copier.user.js).
3. Select **Install** in Tampermonkey.

## Usage

- Click the copy icon next to a PR title to copy the formatted link.
- Right-click the icon to edit the template.
- The template can also be changed or reset from the Tampermonkey menu.

## Template

Default:

```text
[{{org_name}}/{{repo_name}}#{{pr_num}} {{pr_title}}]({{url}})
```

| Variable | Value |
| --- | --- |
| `{{org_name}}` | Repository owner or organization |
| `{{repo_name}}` | Repository name |
| `{{pr_num}}` | Pull request number |
| `{{pr_title}}` | Pull request title |
| `{{author}}` | Pull request author's login |
| `{{url}}` | Pull request URL |
| `{{repo_url}}` | Repository URL |
| `{{org_url}}` | Repository owner URL |

| Filter | Description |
| --- | --- |
| `urlencode` | Encodes the value as a URL component |
| `lower` | Converts the value to lowercase |
| `upper` | Converts the value to uppercase |

### Links

`[text](url)` in the template becomes a clickable link when pasted into a rich-text editor. Text outside the brackets is pasted as plain text. The plain-text version keeps the `[text](url)` notation, so it also works as Markdown.

Example with the author outside the link:

```text
[{{org_name}}/{{repo_name}}#{{pr_num}} {{pr_title}}]({{url}}) by @{{author}}
```
