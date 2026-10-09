/**
 * Editor.js Tool Suite & Custom Plugins for TV SHOP Portal Manager
 * Supports: Headers, Paragraphs, Images (with upload & resize/align), Lists,
 * Warnings/Alerts, Video Embeds (YouTube, Rutube, VK), Tables, Checklists, Quotes,
 * Delimiters, Call-to-Action Buttons, Accordions/Spoilers, Markers & Remote Keys.
 */

// Custom Button (Call-to-Action) Tool
class ArticleButtonTool {
    static get toolbox() {
        return {
            title: 'Кнопка действия',
            icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="6" width="18" height="12" rx="4"/></svg>'
        };
    }

    constructor({ data, api }) {
        this.data = {
            text: data.text || 'Написать в Telegram',
            url: data.url || 'https://t.me/android_tv_shop',
            style: data.style || 'primary'
        };
        this.api = api;
    }

    render() {
        const container = document.createElement('div');
        container.classList.add('editor-tool-button-block');

        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.placeholder = 'Текст кнопки (например, «Скачать приложение»)...';
        textInput.value = this.data.text;
        textInput.classList.add('cdx-input', 'editor-btn-text-input');

        const urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.placeholder = 'URL ссылки (https://...)...';
        urlInput.value = this.data.url;
        urlInput.classList.add('cdx-input', 'editor-btn-url-input');

        const previewBtn = document.createElement('a');
        previewBtn.classList.add('article-btn-cta', 'btn-preview');
        previewBtn.textContent = this.data.text || 'Кнопка';
        previewBtn.href = '#';
        previewBtn.onclick = (e) => e.preventDefault();

        textInput.addEventListener('input', () => {
            this.data.text = textInput.value;
            previewBtn.textContent = this.data.text || 'Кнопка';
        });

        urlInput.addEventListener('input', () => {
            this.data.url = urlInput.value;
        });

        container.appendChild(textInput);
        container.appendChild(urlInput);
        container.appendChild(previewBtn);

        return container;
    }

    save(blockContent) {
        const textIn = blockContent.querySelector('.editor-btn-text-input');
        const urlIn = blockContent.querySelector('.editor-btn-url-input');
        return {
            text: textIn ? textIn.value.trim() : '',
            url: urlIn ? urlIn.value.trim() : '',
            style: this.data.style || 'primary'
        };
    }
}

// Custom Accordion / Spoiler Tool for FAQ
class ArticleSpoilerTool {
    static get toolbox() {
        return {
            title: 'Спойлер / FAQ',
            icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>'
        };
    }

    constructor({ data, api }) {
        this.data = {
            title: data.title || 'Частый вопрос / Проблема',
            content: data.content || 'Подробное решение или ответ...'
        };
        this.api = api;
    }

    render() {
        const wrapper = document.createElement('div');
        wrapper.classList.add('editor-spoiler-box');

        const titleIn = document.createElement('input');
        titleIn.type = 'text';
        titleIn.placeholder = 'Вопрос или заголовок спойлера...';
        titleIn.value = this.data.title;
        titleIn.classList.add('cdx-input', 'editor-spoiler-title');

        const contentIn = document.createElement('textarea');
        contentIn.placeholder = 'Подробный текст решения или инструкции...';
        contentIn.value = this.data.content;
        contentIn.classList.add('cdx-input', 'editor-spoiler-content');

        titleIn.addEventListener('input', () => {
            this.data.title = titleIn.value;
        });

        contentIn.addEventListener('input', () => {
            this.data.content = contentIn.value;
        });

        wrapper.appendChild(titleIn);
        wrapper.appendChild(contentIn);
        return wrapper;
    }

    save(blockContent) {
        const titleIn = blockContent.querySelector('.editor-spoiler-title');
        const contentIn = blockContent.querySelector('.editor-spoiler-content');
        return {
            title: titleIn ? titleIn.value.trim() : '',
            content: contentIn ? contentIn.value.trim() : ''
        };
    }
}

// Custom Warning / Alert Notice Tool
class ArticleAlertTool {
    static get toolbox() {
        return {
            title: 'Важное предупреждение',
            icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
        };
    }

    constructor({ data, api }) {
        this.data = {
            title: data.title || 'Внимание!',
            message: data.message || 'Не отключайте приставку из розетки во время настройки.',
            type: data.type || 'warning'
        };
        this.api = api;
    }

    render() {
        const wrapper = document.createElement('div');
        wrapper.classList.add('editor-alert-box', 'editor-alert-' + this.data.type);

        const titleIn = document.createElement('input');
        titleIn.type = 'text';
        titleIn.placeholder = 'Заголовок предупреждения (например: «Важно!»)...';
        titleIn.value = this.data.title;
        titleIn.classList.add('cdx-input', 'editor-alert-title');

        const messageIn = document.createElement('textarea');
        messageIn.placeholder = 'Текст предупреждения или подсказки...';
        messageIn.value = this.data.message;
        messageIn.classList.add('cdx-input', 'editor-alert-message');

        titleIn.addEventListener('input', () => {
            this.data.title = titleIn.value;
        });

        messageIn.addEventListener('input', () => {
            this.data.message = messageIn.value;
        });

        wrapper.appendChild(titleIn);
        wrapper.appendChild(messageIn);
        return wrapper;
    }

    save(blockContent) {
        const titleIn = blockContent.querySelector('.editor-alert-title');
        const messageIn = blockContent.querySelector('.editor-alert-message');
        return {
            title: titleIn ? titleIn.value.trim() : '',
            message: messageIn ? messageIn.value.trim() : '',
            type: this.data.type || 'warning'
        };
    }
}

// Remote Key Badge Inline Tool (Turns text into 3D TV Remote button like [OK], [HOME], [MENU])
class RemoteKeyInlineTool {
    static get isInline() {
        return true;
    }

    static get title() {
        return 'Кнопка пульта';
    }

    static get sanitize() {
        return {
            kbd: {
                class: true
            }
        };
    }

    constructor({ api }) {
        this.api = api;
        this.button = null;
        this.tag = 'KBD';
        this.iconClasses = {
            base: this.api.styles.inlineToolButton,
            active: this.api.styles.inlineToolButtonActive
        };
    }

    render() {
        this.button = document.createElement('button');
        this.button.type = 'button';
        this.button.classList.add(this.iconClasses.base);
        this.button.innerHTML = '<span style="font-weight:900; font-size:11px; border:1px solid currentColor; border-radius:3px; padding:1px 3px;">OK</span>';
        this.button.title = 'Оформить как кнопку пульта (Кнопка)';
        return this.button;
    }

    surround(range) {
        if (!range) return;
        const termWrapper = this.api.selection.findParentTag(this.tag, 'tv-remote-key');
        if (termWrapper) {
            this.unwrap(termWrapper);
        } else {
            this.wrap(range);
        }
    }

    wrap(range) {
        const selected = range.extractContents();
        const kbd = document.createElement(this.tag);
        kbd.classList.add('tv-remote-key');
        kbd.appendChild(selected);
        range.insertNode(kbd);
        this.api.selection.expandToTag(kbd);
    }

    unwrap(termWrapper) {
        this.api.selection.expandToTag(termWrapper);
        const sel = window.getSelection();
        const range = sel.getRangeAt(0);
        const unwrappedContent = range.extractContents();
        termWrapper.parentNode.removeChild(termWrapper);
        range.insertNode(unwrappedContent);
    }

    checkState() {
        const termWrapper = this.api.selection.findParentTag(this.tag, 'tv-remote-key');
        this.button.classList.toggle(this.iconClasses.active, !!termWrapper);
    }
}

// Convert Editor.js JSON Blocks to Clean Semantic HTML
function renderBlocksToHtml(blocksData) {
    if (!blocksData || !blocksData.blocks || !Array.isArray(blocksData.blocks)) {
        return '';
    }

    const htmlParts = [];

    blocksData.blocks.forEach(block => {
        const type = block.type;
        const data = block.data || {};

        switch (type) {
            case 'header': {
                const level = data.level || 2;
                const text = data.text || '';
                htmlParts.push(`<h${level}>${text}</h${level}>`);
                break;
            }
            case 'paragraph': {
                const text = data.text || '';
                if (text.trim()) {
                    htmlParts.push(`<p>${text}</p>`);
                }
                break;
            }
            case 'list': {
                const isOrdered = data.style === 'ordered';
                const tag = isOrdered ? 'ol' : 'ul';
                const items = data.items || [];
                const lis = items.map(item => {
                    const itemText = typeof item === 'string' ? item : (item.content || '');
                    return `<li>${itemText}</li>`;
                }).join('');
                htmlParts.push(`<${tag}>${lis}</${tag}>`);
                break;
            }
            case 'image': {
                const url = (data.file && data.file.url) ? data.file.url : (data.url || '');
                const caption = data.caption || '';
                const withBorder = data.withBorder ? ' img-bordered' : '';
                const stretched = data.stretched ? ' img-stretched' : '';
                const withBg = data.withBackground ? ' img-with-bg' : '';
                
                let imgHtml = `<div class="article-image-figure${withBorder}${stretched}${withBg}">`;
                imgHtml += `<img src="${url}" alt="${escapeHtmlAttr(caption)}" />`;
                if (caption && caption.trim()) {
                    imgHtml += `<figcaption class="article-image-caption">${caption}</figcaption>`;
                }
                imgHtml += `</div>`;
                htmlParts.push(imgHtml);
                break;
            }
            case 'alert':
            case 'warning': {
                const title = data.title || 'Внимание';
                const message = data.message || '';
                htmlParts.push(`
                    <div class="article-alert-card">
                        <div class="article-alert-header">
                            <span class="article-alert-icon">⚠️</span>
                            <strong>${title}</strong>
                        </div>
                        <div class="article-alert-body">${message}</div>
                    </div>
                `);
                break;
            }
            case 'embed': {
                const embedUrl = data.embed || data.source || '';
                const caption = data.caption || '';
                htmlParts.push(`
                    <div class="article-embed-wrapper">
                        <div class="article-embed-responsive">
                            <iframe src="${embedUrl}" frameborder="0" allowfullscreen loading="lazy"></iframe>
                        </div>
                        ${caption ? `<div class="article-embed-caption">${caption}</div>` : ''}
                    </div>
                `);
                break;
            }
            case 'button': {
                const btnText = data.text || 'Перейти';
                const btnUrl = data.url || '#';
                htmlParts.push(`
                    <div class="article-btn-wrapper">
                        <a href="${btnUrl}" target="_blank" class="article-btn-cta">${btnText}</a>
                    </div>
                `);
                break;
            }
            case 'spoiler':
            case 'accordion': {
                const title = data.title || 'Подробнее';
                const content = data.content || '';
                htmlParts.push(`
                    <details class="article-spoiler-card">
                        <summary class="article-spoiler-header">${title}</summary>
                        <div class="article-spoiler-content">${content}</div>
                    </details>
                `);
                break;
            }
            case 'quote': {
                const text = data.text || '';
                const caption = data.caption || '';
                htmlParts.push(`
                    <blockquote class="article-quote-block">
                        <p>${text}</p>
                        ${caption ? `<cite>${caption}</cite>` : ''}
                    </blockquote>
                `);
                break;
            }
            case 'delimiter': {
                htmlParts.push('<hr class="article-delimiter" />');
                break;
            }
            case 'table': {
                const content = data.content || [];
                const withHeadings = data.withHeadings;
                let tableHtml = '<div class="article-table-responsive"><table class="article-table">';
                content.forEach((row, rIdx) => {
                    tableHtml += '<tr>';
                    row.forEach(cell => {
                        const cellTag = (rIdx === 0 && withHeadings) ? 'th' : 'td';
                        tableHtml += `<${cellTag}>${cell}</${cellTag}>`;
                    });
                    tableHtml += '</tr>';
                });
                tableHtml += '</table></div>';
                htmlParts.push(tableHtml);
                break;
            }
            case 'checklist': {
                const items = data.items || [];
                let clHtml = '<ul class="article-checklist-list">';
                items.forEach(item => {
                    const checked = item.checked ? ' checked' : '';
                    clHtml += `<li class="article-checklist-item${checked}"><span class="checklist-box">${item.checked ? '☑' : '☐'}</span> ${item.text || ''}</li>`;
                });
                clHtml += '</ul>';
                htmlParts.push(clHtml);
                break;
            }
            case 'raw': {
                htmlParts.push(data.html || '');
                break;
            }
            default: {
                if (data.text) {
                    htmlParts.push(`<p>${data.text}</p>`);
                }
                break;
            }
        }
    });

    return htmlParts.join('\n');
}

// Helper to convert legacy HTML to Editor.js Blocks
function convertHtmlToEditorBlocks(htmlString) {
    if (!htmlString || !htmlString.trim()) {
        return [];
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    const nodes = Array.from(doc.body.childNodes);
    const blocks = [];

    nodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent.trim();
            if (text) {
                blocks.push({
                    type: 'paragraph',
                    data: { text: text }
                });
            }
            return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return;

        const tag = node.tagName.toLowerCase();

        if (/^h[1-6]$/.test(tag)) {
            const level = parseInt(tag.charAt(1));
            blocks.push({
                type: 'header',
                data: {
                    text: node.innerHTML.trim(),
                    level: level
                }
            });
        } else if (tag === 'p') {
            const imgs = node.querySelectorAll('img');
            if (imgs.length === 1 && node.textContent.trim() === '') {
                blocks.push({
                    type: 'image',
                    data: {
                        file: { url: imgs[0].getAttribute('src') || '' },
                        caption: imgs[0].getAttribute('alt') || '',
                        withBorder: false,
                        stretched: false
                    }
                });
            } else {
                const html = node.innerHTML.trim();
                if (html) {
                    blocks.push({
                        type: 'paragraph',
                        data: { text: html }
                    });
                }
            }
        } else if (tag === 'ol' || tag === 'ul') {
            const items = Array.from(node.querySelectorAll('li')).map(li => li.innerHTML.trim()).filter(Boolean);
            if (items.length) {
                blocks.push({
                    type: 'list',
                    data: {
                        style: tag === 'ol' ? 'ordered' : 'unordered',
                        items: items
                    }
                });
            }
        } else if (tag === 'img') {
            blocks.push({
                type: 'image',
                data: {
                    file: { url: node.getAttribute('src') || '' },
                    caption: node.getAttribute('alt') || '',
                    withBorder: false,
                    stretched: false
                }
            });
        } else if (tag === 'blockquote') {
            blocks.push({
                type: 'quote',
                data: {
                    text: node.innerHTML.trim(),
                    caption: ''
                }
            });
        } else if (tag === 'details') {
            const summary = node.querySelector('summary');
            const summaryText = summary ? summary.textContent.trim() : 'Подробнее';
            const clone = node.cloneNode(true);
            const sumClone = clone.querySelector('summary');
            if (sumClone) sumClone.remove();
            blocks.push({
                type: 'spoiler',
                data: {
                    title: summaryText,
                    content: clone.innerHTML.trim()
                }
            });
        } else if (node.classList.contains('article-alert-card') || node.classList.contains('tg-highlight-box')) {
            const titleEl = node.querySelector('strong, .article-alert-header');
            const title = titleEl ? titleEl.textContent.trim() : 'Внимание';
            const body = node.querySelector('.article-alert-body') ? node.querySelector('.article-alert-body').innerHTML.trim() : node.innerHTML.trim();
            blocks.push({
                type: 'alert',
                data: {
                    title: title,
                    message: body,
                    type: 'warning'
                }
            });
        } else {
            const html = node.outerHTML.trim();
            if (html) {
                blocks.push({
                    type: 'paragraph',
                    data: { text: node.innerHTML.trim() || html }
                });
            }
        }
    });

    return blocks;
}

function escapeHtmlAttr(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
