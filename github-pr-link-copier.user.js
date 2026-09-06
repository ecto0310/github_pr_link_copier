// ==UserScript==
// @name         GitHub PR Link Copier
// @namespace    https://github.com/ecto0310/github_pr_link_copier
// @version      0.1.0
// @description  GitHubのPRタイトル横に、テンプレートで整形したPR情報のコピーボタンを追加します。
// @author       ecto0310
// @homepageURL  https://github.com/ecto0310/github_pr_link_copier
// @supportURL   https://github.com/ecto0310/github_pr_link_copier/issues
// @updateURL    https://raw.githubusercontent.com/ecto0310/github_pr_link_copier/main/github-pr-link-copier.user.js
// @downloadURL  https://raw.githubusercontent.com/ecto0310/github_pr_link_copier/main/github-pr-link-copier.user.js
// @match        https://github.com/*/*/pull/*
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @grant        GM_addStyle
// @grant        GM_deleteValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_ID = 'github-pr-link-copier';
  const TEMPLATE_STORAGE_KEY = `${SCRIPT_ID}:template`;
  const DEFAULT_TEMPLATE = '[{{org_name}}/{{repo_name}}#{{pr_num}} {{pr_title}}]({{url}})';
  const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)(?:\s*\|\s*([a-zA-Z][a-zA-Z0-9_]*))?\s*\}\}/g;
  const LINK_PATTERN = /\[([^[\]]+)\]\(([^()]+)\)/g;

  const VARIABLE_NAMES = Object.freeze([
    'org_name',
    'repo_name',
    'pr_num',
    'pr_title',
    'author',
    'url',
    'repo_url',
    'org_url',
  ]);

  const FILTERS = Object.freeze({
    urlencode(value) {
      return encodeURIComponent(value);
    },
    lower(value) {
      return value.toLocaleLowerCase();
    },
    upper(value) {
      return value.toLocaleUpperCase();
    },
  });

  let mountTimer;

  addStyles();
  registerMenuCommands();
  registerNavigationListeners();
  scheduleMount();

  function getPrRoute() {
    const match = window.location.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|$)/);
    if (!match) return null;

    try {
      return {
        orgName: decodeURIComponent(match[1]),
        repoName: decodeURIComponent(match[2]),
        prNumber: match[3],
      };
    } catch {
      return {
        orgName: match[1],
        repoName: match[2],
        prNumber: match[3],
      };
    }
  }

  function getPageMetadata(route) {
    const rawTitle =
      document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
      document.title;
    const metadataAuthor =
      document.querySelector('meta[property="og:author:username"]')?.getAttribute('content') || '';
    const suffix = ` · Pull Request #${route.prNumber} · ${route.orgName}/${route.repoName}`;

    if (!rawTitle.endsWith(suffix)) return { title: '', author: metadataAuthor };

    const titleAndAuthor = rawTitle.slice(0, -suffix.length);
    const separatorPosition = titleAndAuthor.lastIndexOf(' by ');
    if (separatorPosition < 0) return { title: titleAndAuthor.trim(), author: metadataAuthor };

    return {
      title: titleAndAuthor.slice(0, separatorPosition).trim(),
      author: metadataAuthor || titleAndAuthor.slice(separatorPosition + 4).trim(),
    };
  }

  function getTitleElement(route) {
    const selectors = [
      '.gh-header-title .js-issue-title',
      '#partial-discussion-header .js-issue-title',
      '[data-component="PH_Title"] [data-component="Text"]',
      '[data-component="PH_Title"] .markdown-title',
      '[data-testid="issue-title"] bdi',
      '[data-testid="issue-title"]',
      '.gh-header-title .markdown-title',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && cleanText(element.textContent)) return element;
    }

    const metadataTitle = getPageMetadata(route).title;
    const headings = Array.from(document.querySelectorAll('main h1'));
    return (
      headings.find((heading) => {
        const text = cleanText(heading.textContent);
        return metadataTitle && text.includes(metadataTitle);
      }) ||
      headings.find((heading) => cleanText(heading.textContent).includes(`#${route.prNumber}`)) ||
      null
    );
  }

  function getPrTitle(route) {
    const titleElement = getTitleElement(route);
    if (titleElement) {
      const clone = titleElement.cloneNode(true);
      clone.querySelector(`#${SCRIPT_ID}`)?.remove();
      clone.querySelectorAll('.f1-light, [data-testid="issue-number"]').forEach((element) => {
        element.remove();
      });

      const title = cleanText(clone.textContent).replace(
        new RegExp(`\\s*#${escapeRegExp(route.prNumber)}\\s*$`),
        '',
      );
      if (title) return title;
    }

    return getPageMetadata(route).title;
  }

  function getPrAuthor(route) {
    const selectors = [
      '.gh-header-meta a.author',
      '#partial-discussion-header a.author',
      '[data-testid="issue-metadata"] a[data-hovercard-type="user"]',
      '[data-testid="issue-body"] a[data-hovercard-type="user"]',
      '.js-discussion .TimelineItem-body a.author',
      '.timeline-comment-header a.author',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const author = getUserLogin(element);
      if (author) return author;
    }

    return getPageMetadata(route).author;
  }

  function getUserLogin(element) {
    if (!element) return '';

    const text = cleanText(element.textContent).replace(/^@/, '');
    if (text) return text;

    const href = element.getAttribute('href') || '';
    const match = href.match(/^\/([^/?#]+)\/?$/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  function buildTemplateValues(route) {
    const encodedOrg = encodeURIComponent(route.orgName);
    const encodedRepo = encodeURIComponent(route.repoName);
    const rootUrl = `${window.location.origin}/${encodedOrg}/${encodedRepo}`;

    return {
      org_name: route.orgName,
      repo_name: route.repoName,
      pr_num: route.prNumber,
      pr_title: getPrTitle(route),
      author: getPrAuthor(route),
      url: `${rootUrl}/pull/${route.prNumber}`,
      repo_url: rootUrl,
      org_url: `${window.location.origin}/${encodedOrg}`,
    };
  }

  function renderTemplate(template, values) {
    return template.replace(PLACEHOLDER_PATTERN, (placeholder, variableName, filterName) => {
      if (!VARIABLE_NAMES.includes(variableName)) return placeholder;

      const value = String(values[variableName] ?? '');
      if (!filterName) return value;

      const filter = FILTERS[filterName];
      return filter ? filter(value) : placeholder;
    });
  }

  // Slack や Notion などの入力欄はクリップボードの text/html を優先して読むため、
  // テンプレート内の [表示テキスト](URL) を <a> タグに変換した HTML も一緒にコピーする。
  function renderTemplateAsHtml(template, values) {
    let html = '';
    let lastIndex = 0;

    for (const match of template.matchAll(LINK_PATTERN)) {
      const [linkSyntax, labelTemplate, urlTemplate] = match;
      const href = renderTemplate(urlTemplate, values).trim();
      const label = renderTemplate(labelTemplate, values);

      html += escapeHtml(renderTemplate(template.slice(lastIndex, match.index), values));
      html += `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
      lastIndex = match.index + linkSyntax.length;
    }

    return html + escapeHtml(renderTemplate(template.slice(lastIndex), values));
  }

  function validateTemplate(template) {
    const errors = [];
    const placeholders = template.matchAll(PLACEHOLDER_PATTERN);

    for (const [, variableName, filterName] of placeholders) {
      if (!VARIABLE_NAMES.includes(variableName)) errors.push(`不明な変数: ${variableName}`);
      if (filterName && !FILTERS[filterName]) errors.push(`不明なフィルター: ${filterName}`);
    }

    return [...new Set(errors)];
  }

  function getTemplate() {
    const savedTemplate = GM_getValue(TEMPLATE_STORAGE_KEY, DEFAULT_TEMPLATE);
    return typeof savedTemplate === 'string' && savedTemplate ? savedTemplate : DEFAULT_TEMPLATE;
  }

  function configureTemplate() {
    const filterNames = Object.keys(FILTERS);
    const enteredTemplate = window.prompt(
      [
        'コピーする文字列のテンプレートを入力してください。',
        `変数: ${VARIABLE_NAMES.map((name) => `{{${name}}}`).join(', ')}`,
        `フィルター: ${filterNames.map((name) => `|${name}`).join(', ')}`,
        'リンク: [表示テキスト]({{url}}) はリッチテキスト対応の貼り付け先でリンクになります',
      ].join('\n'),
      getTemplate(),
    );

    if (enteredTemplate === null) return;
    if (!enteredTemplate) {
      window.alert('テンプレートは空にできません。');
      return;
    }

    const errors = validateTemplate(enteredTemplate);
    if (errors.length > 0) {
      window.alert(`テンプレートを保存できません。\n${errors.join('\n')}`);
      return;
    }

    GM_setValue(TEMPLATE_STORAGE_KEY, enteredTemplate);
    updateButtonPreview();
  }

  function resetTemplate() {
    if (!window.confirm('コピー形式をデフォルトに戻しますか？')) return;
    GM_deleteValue(TEMPLATE_STORAGE_KEY);
    updateButtonPreview();
  }

  function registerMenuCommands() {
    GM_registerMenuCommand('コピー形式を設定…', configureTemplate);
    GM_registerMenuCommand('コピー形式をデフォルトに戻す', resetTemplate);
  }

  function registerNavigationListeners() {
    document.addEventListener('turbo:load', scheduleMount);
    document.addEventListener('turbo:render', scheduleMount);
    document.addEventListener('pjax:end', scheduleMount);
    window.addEventListener('popstate', scheduleMount);

    const observer = new MutationObserver(() => {
      const route = getPrRoute();
      const buttonContainer = document.getElementById(SCRIPT_ID);
      const routeKey = route ? `${route.orgName}/${route.repoName}#${route.prNumber}` : '';
      if (
        (route && buttonContainer?.dataset.route !== routeKey) ||
        (!route && buttonContainer)
      ) {
        scheduleMount();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function scheduleMount() {
    window.clearTimeout(mountTimer);
    mountTimer = window.setTimeout(mountButton, 60);
  }

  function mountButton() {
    const route = getPrRoute();
    const currentContainer = document.getElementById(SCRIPT_ID);

    if (!route) {
      currentContainer?.remove();
      return;
    }

    const routeKey = `${route.orgName}/${route.repoName}#${route.prNumber}`;
    if (currentContainer?.dataset.route === routeKey) return;
    currentContainer?.remove();

    const titleElement = getTitleElement(route);
    if (!titleElement) return;

    const titleHeading = titleElement.closest('h1');
    const titleContainer =
      titleHeading?.matches('[data-component="PH_Title"]') && titleHeading.nextElementSibling
        ? titleHeading.parentElement
        : titleHeading || titleElement.parentElement;
    if (!titleContainer) return;

    const buttonContainer = document.createElement('span');
    buttonContainer.id = SCRIPT_ID;
    buttonContainer.dataset.route = routeKey;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${SCRIPT_ID}__button`;
    button.setAttribute('aria-label', 'PRリンクをコピー');
    button.innerHTML = [
      `<svg class="${SCRIPT_ID}__icon ${SCRIPT_ID}__icon--copy" aria-hidden="true" viewBox="0 0 16 16" width="16" height="16">`,
      '<path d="M0 6.75C0 5.784.784 5 1.75 5h5.5C8.216 5 9 5.784 9 6.75v7.5A1.75 1.75 0 0 1 7.25 16h-5.5A1.75 1.75 0 0 1 0 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h5.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path>',
      '<path d="M4.75 0h5.5C11.216 0 12 .784 12 1.75v7.5A1.75 1.75 0 0 1 10.25 11H10V9.5h.25a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25h-5.5a.25.25 0 0 0-.25.25V2H3v-.25C3 .784 3.784 0 4.75 0Z"></path>',
      '</svg>',
      `<svg class="${SCRIPT_ID}__icon ${SCRIPT_ID}__icon--success" aria-hidden="true" viewBox="0 0 16 16" width="16" height="16">`,
      '<path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path>',
      '</svg>',
      `<svg class="${SCRIPT_ID}__icon ${SCRIPT_ID}__icon--error" aria-hidden="true" viewBox="0 0 16 16" width="16" height="16">`,
      '<path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 0 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"></path>',
      '</svg>',
    ].join('');
    button.addEventListener('click', () => copyPrLink(button));
    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      configureTemplate();
    });

    buttonContainer.append(button);
    titleContainer.append(buttonContainer);
    updateButtonPreview();
  }

  async function copyPrLink(button) {
    const route = getPrRoute();
    if (!route) return;

    const template = getTemplate();
    const errors = validateTemplate(template);
    if (errors.length > 0) {
      showButtonState(button, '設定エラー', 'error');
      window.alert(`テンプレートにエラーがあります。\n${errors.join('\n')}`);
      return;
    }

    const values = buildTemplateValues(route);

    try {
      await copyToClipboard(renderTemplate(template, values), renderTemplateAsHtml(template, values));
      showButtonState(button, 'コピーしました', 'success');
    } catch (error) {
      console.error(`[${SCRIPT_ID}] Clipboard write failed`, error);
      showButtonState(button, 'コピー失敗', 'error');
    }
  }

  async function copyToClipboard(text, html) {
    if (navigator.clipboard?.write && typeof ClipboardItem === 'function') {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([text], { type: 'text/plain' }),
            'text/html': new Blob([html], { type: 'text/html' }),
          }),
        ]);
        return;
      } catch (error) {
        console.warn(`[${SCRIPT_ID}] navigator.clipboard.write failed, falling back`, error);
      }
    }

    if (copyWithExecCommand(text, html)) return;

    // 最後の手段。プレーンテキストしか書き込めないため、貼り付け先でリンクにはならない。
    if (typeof GM_setClipboard === 'function') {
      GM_setClipboard(text, 'text');
      return;
    }

    throw new Error('No clipboard API is available');
  }

  function copyWithExecCommand(text, html) {
    const handleCopy = (event) => {
      event.preventDefault();
      event.clipboardData.setData('text/plain', text);
      event.clipboardData.setData('text/html', html);
    };

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    document.addEventListener('copy', handleCopy, true);

    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      document.removeEventListener('copy', handleCopy, true);
      textarea.remove();
    }
  }

  function updateButtonPreview() {
    const route = getPrRoute();
    const button = document.querySelector(`#${SCRIPT_ID} button`);
    if (!route || !button) return;

    const preview = renderTemplate(getTemplate(), buildTemplateValues(route));
    button.title = `クリックしてコピー:\n${preview}\n\n右クリックでコピー形式を変更`;
  }

  function showButtonState(button, message, state) {
    button.dataset.state = state;
    button.setAttribute('aria-label', message);
    button.title = message;
    window.setTimeout(() => {
      if (!button.isConnected) return;
      delete button.dataset.state;
      button.setAttribute('aria-label', 'PRリンクをコピー');
      updateButtonPreview();
    }, 1800);
  }

  function addStyles() {
    GM_addStyle(`
      #${SCRIPT_ID} {
        display: inline-flex;
        margin-left: 0.6rem;
        vertical-align: 0.12em;
      }

      .${SCRIPT_ID}__button {
        align-items: center;
        background-color: var(--button-default-bgColor-rest, var(--color-btn-bg, #f6f8fa));
        border: 1px solid var(--button-default-borderColor-rest, var(--color-btn-border, #d0d7de));
        border-radius: 6px;
        box-sizing: border-box;
        box-shadow: var(--button-default-shadow-resting, var(--color-btn-shadow, 0 1px 0 rgba(31, 35, 40, 0.04)));
        color: var(--button-default-fgColor-rest, var(--color-btn-text, #24292f));
        cursor: pointer;
        display: inline-flex;
        height: 28px;
        justify-content: center;
        padding: 5px;
        width: 28px;
      }

      .${SCRIPT_ID}__button:hover {
        background-color: var(--button-default-bgColor-hover, var(--color-btn-hover-bg, #f3f4f6));
        border-color: var(--button-default-borderColor-hover, var(--color-btn-hover-border, #afb8c1));
      }

      .${SCRIPT_ID}__button:focus-visible {
        outline: 2px solid var(--focus-outlineColor, var(--color-accent-fg, #0969da));
        outline-offset: 2px;
      }

      .${SCRIPT_ID}__icon {
        fill: currentColor;
        flex: 0 0 auto;
      }

      .${SCRIPT_ID}__icon--success,
      .${SCRIPT_ID}__icon--error {
        display: none;
      }

      .${SCRIPT_ID}__button[data-state="success"] .${SCRIPT_ID}__icon--copy,
      .${SCRIPT_ID}__button[data-state="error"] .${SCRIPT_ID}__icon--copy {
        display: none;
      }

      .${SCRIPT_ID}__button[data-state="success"] .${SCRIPT_ID}__icon--success,
      .${SCRIPT_ID}__button[data-state="error"] .${SCRIPT_ID}__icon--error {
        display: block;
      }

      .${SCRIPT_ID}__button[data-state="success"] {
        color: var(--fgColor-open, var(--color-open-fg, #1a7f37));
      }

      .${SCRIPT_ID}__button[data-state="error"] {
        color: var(--fgColor-danger, var(--color-danger-fg, #cf222e));
      }

    `);
  }

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function escapeHtml(value) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
})();
