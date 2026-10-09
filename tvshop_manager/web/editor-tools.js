/**
 * Self-contained, robust Editor.js Custom Tools Suite for TV SHOP Portal Manager.
 * Guaranteed 100% offline & local compatibility without external CDN dependencies.
 */

// 1. Header Block Tool
class ArticleHeaderTool {
    static get toolbox() {
        return {
            title: 'Заголовок',
            icon: '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M5 4v3h5.5v12h3V7H19V4z"/></svg>'
        };
    }

    constructor({ data, config }) {
        this.data = {
            text: data.text || '',
            level: data.level || (config && config.defaultLevel) || 2
        };
        this.element = null;
    }

    render() {
        const tag = 'h' + this.data.level;
        this.element = document.createElement(tag);
        this.element.classList.add('ce-header');
        this.element.contentEditable = 'true';
        this.element.innerHTML = this.data.text;
        this.element.dataset.placeholder = 'Заголовок...';

        this.element.addEventListener('input', () => {
            this.data.text = this.element.innerHTML;
        });

        return this.element;
    }

    renderSettings() {
        const wrapper = document.createElement('div');
        wrapper.classList.add('cdx-settings-wrapper');
        [2, 3, 4].forEach(level => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.classList.add('cdx-settings-btn');
            if (this.data.level === level) btn.classList.add('active');
            btn.innerHTML = `<b>H${level}</b>`;
            btn.addEventListener('click', () => {
                this.setLevel(level);
                wrapper.querySelectorAll('.cdx-settings-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
            wrapper.appendChild(btn);
        });
        return wrapper;
    }

    setLevel(level) {
        this.data.level = level;
        if (this.element) {
            const newEl = document.createElement('h' + level);
            newEl.classList.add('ce-header');
            newEl.contentEditable = 'true';
            newEl.innerHTML = this.element.innerHTML;
            newEl.dataset.placeholder = 'Заголовок...';
            newEl.addEventListener('input', () => {
                this.data.text = newEl.innerHTML;
            });
            this.element.replaceWith(newEl);
            this.element = newEl;
        }
    }

    save(blockContent) {
        return {
            text: blockContent.innerHTML,
            level: this.data.level
        };
    }
}

// 2. List Block Tool (Ordered & Unordered, 100% resilient to legacy and nested format)
class ArticleListTool {
    static get toolbox() {
        return {
            title: 'Список',
            icon: '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M4 6h2v2H4zm0 5h2v2H4zm0 5h2v2H4zm4-10h12v2H8zm0 5h12v2H8zm0 5h12v2H8z"/></svg>'
        };
    }

    constructor({ data }) {
        this.data = {
            style: data.style === 'unordered' ? 'unordered' : 'ordered',
            items: Array.isArray(data.items) ? data.items.map(it => {
                if (typeof it === 'string') return it;
                return (it && it.content) ? it.content : (it && it.text) ? it.text : '';
            }) : []
        };
        if (!this.data.items.length) {
            this.data.items = [''];
        }
        this.listEl = null;
    }

    render() {
        const tag = this.data.style === 'ordered' ? 'ol' : 'ul';
        this.listEl = document.createElement(tag);
        this.listEl.classList.add('cdx-list-block', 'ce-list--' + this.data.style);

        this.data.items.forEach(itemText => {
            const li = this._createLi(itemText);
            this.listEl.appendChild(li);
        });

        return this.listEl;
    }

    _createLi(text) {
        const li = document.createElement('li');
        li.classList.add('cdx-list-item');
        li.contentEditable = 'true';
        li.innerHTML = text || '';

        li.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const newLi = this._createLi('');
                if (li.nextSibling) {
                    this.listEl.insertBefore(newLi, li.nextSibling);
                } else {
                    this.listEl.appendChild(newLi);
                }
                newLi.focus();
            } else if (e.key === 'Backspace' && !li.innerHTML.trim()) {
                if (this.listEl.children.length > 1) {
                    e.preventDefault();
                    const prev = li.previousSibling || li.nextSibling;
                    li.remove();
                    if (prev) prev.focus();
                }
            }
        });

        return li;
    }

    renderSettings() {
        const wrapper = document.createElement('div');
        wrapper.classList.add('cdx-settings-wrapper');

        const orderedBtn = document.createElement('button');
        orderedBtn.type = 'button';
        orderedBtn.classList.add('cdx-settings-btn');
        if (this.data.style === 'ordered') orderedBtn.classList.add('active');
        orderedBtn.innerHTML = '1. Нумерованный';
        orderedBtn.addEventListener('click', () => {
            this.data.style = 'ordered';
            this._toggleStyle();
            orderedBtn.classList.add('active');
            unorderedBtn.classList.remove('active');
        });

        const unorderedBtn = document.createElement('button');
        unorderedBtn.type = 'button';
        unorderedBtn.classList.add('cdx-settings-btn');
        if (this.data.style === 'unordered') unorderedBtn.classList.add('active');
        unorderedBtn.innerHTML = '• Маркированный';
        unorderedBtn.addEventListener('click', () => {
            this.data.style = 'unordered';
            this._toggleStyle();
            unorderedBtn.classList.add('active');
            orderedBtn.classList.remove('active');
        });

        wrapper.appendChild(orderedBtn);
        wrapper.appendChild(unorderedBtn);
        return wrapper;
    }

    _toggleStyle() {
        if (!this.listEl) return;
        const tag = this.data.style === 'ordered' ? 'ol' : 'ul';
        const newList = document.createElement(tag);
        newList.classList.add('cdx-list-block', 'ce-list--' + this.data.style);
        while (this.listEl.firstChild) {
            newList.appendChild(this.listEl.firstChild);
        }
        this.listEl.replaceWith(newList);
        this.listEl = newList;
    }

    save(blockContent) {
        const items = [];
        blockContent.querySelectorAll('li').forEach(li => {
            const html = li.innerHTML.trim();
            if (html) items.push(html);
        });
        return {
            style: this.data.style,
            items: items.length ? items : ['']
        };
    }
}

// 3. Image Block Tool (With instant upload, paste, caption & resize borders)
class ArticleImageTool {
    static get toolbox() {
        return {
            title: 'Изображение',
            icon: '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5.04-6.71l-2.75 3.54-1.96-2.36L6.5 17h11l-3.54-4.71z"/></svg>'
        };
    }

    constructor({ data }) {
        this.data = {
            url: (data.file && data.file.url) ? data.file.url : (data.url || ''),
            caption: data.caption || '',
            withBorder: !!data.withBorder,
            stretched: !!data.stretched,
            withBackground: !!data.withBackground
        };
        this.wrapper = null;
    }

    render() {
        this.wrapper = document.createElement('div');
        this.wrapper.classList.add('cdx-image-tool-wrapper');

        if (this.data.url) {
            this._renderImage();
        } else {
            this._renderUploader();
        }

        return this.wrapper;
    }

    _renderUploader() {
        this.wrapper.innerHTML = '';
        const box = document.createElement('div');
        box.classList.add('cdx-image-upload-box');
        box.innerHTML = `
            <div class="cdx-image-upload-icon">🖼️</div>
            <div class="cdx-image-upload-text">Нажмите для выбора фото или вставьте скриншот (Ctrl+V)</div>
            <input type="file" accept="image/*" style="display:none;" />
        `;

        const fileInput = box.querySelector('input[type="file"]');
        box.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', () => {
            const file = fileInput.files[0];
            if (file) this._uploadFile(file);
        });

        box.addEventListener('dragover', (e) => {
            e.preventDefault();
            box.classList.add('dragover');
        });
        box.addEventListener('dragleave', () => box.classList.remove('dragover'));
        box.addEventListener('drop', (e) => {
            e.preventDefault();
            box.classList.remove('dragover');
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
                this._uploadFile(e.dataTransfer.files[0]);
            }
        });

        this.wrapper.appendChild(box);
    }

    _renderImage() {
        this.wrapper.innerHTML = '';
        const figure = document.createElement('div');
        figure.classList.add('article-image-figure');
        if (this.data.withBorder) figure.classList.add('img-bordered');
        if (this.data.stretched) figure.classList.add('img-stretched');

        const img = document.createElement('img');
        img.src = this.data.url;
        img.alt = this.data.caption;

        const captionIn = document.createElement('input');
        captionIn.type = 'text';
        captionIn.classList.add('cdx-input', 'cdx-image-caption-input');
        captionIn.placeholder = 'Подпись к фото (необязательно)...';
        captionIn.value = this.data.caption;
        captionIn.addEventListener('input', () => {
            this.data.caption = captionIn.value;
        });

        const actionsBar = document.createElement('div');
        actionsBar.classList.add('cdx-image-actions-bar');
        actionsBar.innerHTML = `
            <button type="button" class="cdx-img-act-btn btn-change" title="Заменить фото">🔄 Заменить</button>
            <button type="button" class="cdx-img-act-btn btn-del" title="Удалить">🗑️ Удалить</button>
            <input type="file" accept="image/*" style="display:none;" />
        `;

        const replaceFileInput = actionsBar.querySelector('input');
        actionsBar.querySelector('.btn-change').addEventListener('click', () => replaceFileInput.click());
        replaceFileInput.addEventListener('change', () => {
            if (replaceFileInput.files[0]) this._uploadFile(replaceFileInput.files[0]);
        });

        actionsBar.querySelector('.btn-del').addEventListener('click', () => {
            this.data.url = '';
            this.data.caption = '';
            this._renderUploader();
        });

        figure.appendChild(img);
        figure.appendChild(actionsBar);
        figure.appendChild(captionIn);
        this.wrapper.appendChild(figure);
    }

    _uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);

        this.wrapper.innerHTML = '<div class="cdx-image-loading">⏳ Загрузка изображения...</div>';

        fetch('/api/upload', {
            method: 'POST',
            body: formData,
            headers: {
                'x-admin-pin': localStorage.getItem('portal_pin') || ''
            }
        })
        .then(res => res.json())
        .then(data => {
            if (data.path || (data.file && data.file.url)) {
                this.data.url = data.path || data.file.url;
                this._renderImage();
            } else {
                alert('Ошибка загрузки фото: ' + (data.error || 'неизвестная ошибка'));
                this._renderUploader();
            }
        })
        .catch(err => {
            alert('Ошибка отправки файла на сервер');
            this._renderUploader();
        });
    }

    renderSettings() {
        const wrapper = document.createElement('div');
        wrapper.classList.add('cdx-settings-wrapper');

        const borderBtn = document.createElement('button');
        borderBtn.type = 'button';
        borderBtn.classList.add('cdx-settings-btn');
        if (this.data.withBorder) borderBtn.classList.add('active');
        borderBtn.innerHTML = '🔲 Рамка';
        borderBtn.addEventListener('click', () => {
            this.data.withBorder = !this.data.withBorder;
            borderBtn.classList.toggle('active', this.data.withBorder);
            if (this.data.url) this._renderImage();
        });

        const stretchBtn = document.createElement('button');
        stretchBtn.type = 'button';
        stretchBtn.classList.add('cdx-settings-btn');
        if (this.data.stretched) stretchBtn.classList.add('active');
        stretchBtn.innerHTML = '↔ Во всю ширину';
        stretchBtn.addEventListener('click', () => {
            this.data.stretched = !this.data.stretched;
            stretchBtn.classList.toggle('active', this.data.stretched);
            if (this.data.url) this._renderImage();
        });

        wrapper.appendChild(borderBtn);
        wrapper.appendChild(stretchBtn);
        return wrapper;
    }

    save(blockContent) {
        const captionIn = blockContent.querySelector('.cdx-image-caption-input');
        return {
            url: this.data.url,
            file: { url: this.data.url },
            caption: captionIn ? captionIn.value.trim() : this.data.caption,
            withBorder: this.data.withBorder,
            stretched: this.data.stretched,
            withBackground: this.data.withBackground
        };
    }
}

// 4. Alert / Warning Card Tool
class ArticleAlertTool {
    static get toolbox() {
        return {
            title: 'Важное предупреждение',
            icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
        };
    }

    constructor({ data }) {
        this.data = {
            title: data.title || 'Внимание!',
            message: data.message || 'Не отключайте приставку из розетки во время настройки.'
        };
    }

    render() {
        const wrapper = document.createElement('div');
        wrapper.classList.add('editor-alert-box');

        const titleIn = document.createElement('input');
        titleIn.type = 'text';
        titleIn.placeholder = 'Заголовок (например: «Важно!»)...';
        titleIn.value = this.data.title;
        titleIn.classList.add('cdx-input', 'editor-alert-title');

        const messageIn = document.createElement('textarea');
        messageIn.placeholder = 'Текст предупреждения или подсказки...';
        messageIn.value = this.data.message;
        messageIn.classList.add('cdx-input', 'editor-alert-message');

        titleIn.addEventListener('input', () => { this.data.title = titleIn.value; });
        messageIn.addEventListener('input', () => { this.data.message = messageIn.value; });

        wrapper.appendChild(titleIn);
        wrapper.appendChild(messageIn);
        return wrapper;
    }

    save(blockContent) {
        const titleIn = blockContent.querySelector('.editor-alert-title');
        const messageIn = blockContent.querySelector('.editor-alert-message');
        return {
            title: titleIn ? titleIn.value.trim() : '',
            message: messageIn ? messageIn.value.trim() : ''
        };
    }
}

// 5. Action Button Tool
class ArticleButtonTool {
    static get toolbox() {
        return {
            title: 'Кнопка действия',
            icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="6" width="18" height="12" rx="4"/></svg>'
        };
    }

    constructor({ data }) {
        this.data = {
            text: data.text || 'Написать в Telegram',
            url: data.url || 'https://t.me/android_tv_shop'
        };
    }

    render() {
        const container = document.createElement('div');
        container.classList.add('editor-tool-button-block');

        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.placeholder = 'Текст кнопки...';
        textInput.value = this.data.text;
        textInput.classList.add('cdx-input', 'editor-btn-text-input');

        const urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.placeholder = 'URL ссылки (https://...)...';
        urlInput.value = this.data.url;
        urlInput.classList.add('cdx-input', 'editor-btn-url-input');

        textInput.addEventListener('input', () => { this.data.text = textInput.value; });
        urlInput.addEventListener('input', () => { this.data.url = urlInput.value; });

        container.appendChild(textInput);
        container.appendChild(urlInput);
        return container;
    }

    save(blockContent) {
        const textIn = blockContent.querySelector('.editor-btn-text-input');
        const urlIn = blockContent.querySelector('.editor-btn-url-input');
        return {
            text: textIn ? textIn.value.trim() : '',
            url: urlIn ? urlIn.value.trim() : ''
        };
    }
}

// 6. Spoiler / FAQ Tool
class ArticleSpoilerTool {
    static get toolbox() {
        return {
            title: 'Спойлер / FAQ',
            icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>'
        };
    }

    constructor({ data }) {
        this.data = {
            title: data.title || 'Частый вопрос / Проблема',
            content: data.content || 'Подробное решение или ответ...'
        };
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
        contentIn.placeholder = 'Текст решения или ответа...';
        contentIn.value = this.data.content;
        contentIn.classList.add('cdx-input', 'editor-spoiler-content');

        titleIn.addEventListener('input', () => { this.data.title = titleIn.value; });
        contentIn.addEventListener('input', () => { this.data.content = contentIn.value; });

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

// 7. Video Embed Tool
class ArticleEmbedTool {
    static get toolbox() {
        return {
            title: 'Видео (YouTube/Rutube/VK)',
            icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
        };
    }

    constructor({ data }) {
        this.data = {
            embed: data.embed || data.source || '',
            caption: data.caption || ''
        };
    }

    render() {
        const wrapper = document.createElement('div');
        wrapper.classList.add('editor-embed-box');

        const urlIn = document.createElement('input');
        urlIn.type = 'text';
        urlIn.placeholder = 'Ссылка на видео YouTube, Rutube или VK...';
        urlIn.value = this.data.embed;
        urlIn.classList.add('cdx-input', 'editor-embed-url');

        const captionIn = document.createElement('input');
        captionIn.type = 'text';
        captionIn.placeholder = 'Подпись к видео (необязательно)...';
        captionIn.value = this.data.caption;
        captionIn.classList.add('cdx-input', 'editor-embed-caption');

        urlIn.addEventListener('input', () => {
            let val = urlIn.value.trim();
            // Auto convert standard YouTube links to embed format
            if (val.includes('youtube.com/watch?v=')) {
                val = val.replace('watch?v=', 'embed/');
            } else if (val.includes('youtu.be/')) {
                val = val.replace('youtu.be/', 'youtube.com/embed/');
            }
            this.data.embed = val;
        });

        captionIn.addEventListener('input', () => { this.data.caption = captionIn.value; });

        wrapper.appendChild(urlIn);
        wrapper.appendChild(captionIn);
        return wrapper;
    }

    save(blockContent) {
        const urlIn = blockContent.querySelector('.editor-embed-url');
        const captionIn = blockContent.querySelector('.editor-embed-caption');
        return {
            embed: urlIn ? urlIn.value.trim() : '',
            caption: captionIn ? captionIn.value.trim() : ''
        };
    }
}

// 8. Remote Control Key Badge Inline Tool (Press [OK], [HOME])
class RemoteKeyInlineTool {
    static get isInline() {
        return true;
    }

    static get title() {
        return 'Кнопка пульта';
    }

    constructor({ api }) {
        this.api = api;
        this.button = null;
        this.tag = 'KBD';
    }

    render() {
        this.button = document.createElement('button');
        this.button.type = 'button';
        this.button.classList.add('ce-inline-tool');
        this.button.innerHTML = '<span style="font-weight:900; font-size:10px; border:1px solid currentColor; border-radius:3px; padding:1px 3px;">OK</span>';
        this.button.title = 'Оформить как кнопку пульта (Кнопка)';
        return this.button;
    }

    surround(range) {
        if (!range) return;
        const termWrapper = this.api.selection.findParentTag(this.tag, 'tv-remote-key');
        if (termWrapper) {
            this.api.selection.expandToTag(termWrapper);
            const sel = window.getSelection();
            const r = sel.getRangeAt(0);
            const content = r.extractContents();
            termWrapper.parentNode.removeChild(termWrapper);
            r.insertNode(content);
        } else {
            const selected = range.extractContents();
            const kbd = document.createElement(this.tag);
            kbd.classList.add('tv-remote-key');
            kbd.appendChild(selected);
            range.insertNode(kbd);
            this.api.selection.expandToTag(kbd);
        }
    }

    checkState() {
        const termWrapper = this.api.selection.findParentTag(this.tag, 'tv-remote-key');
        this.button.classList.toggle('ce-inline-tool--active', !!termWrapper);
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
                    const itemText = typeof item === 'string' ? item : (item.content || item.text || '');
                    return `<li>${itemText}</li>`;
                }).join('');
                htmlParts.push(`<${tag}>${lis}</${tag}>`);
                break;
            }
            case 'image': {
                const url = (data.file && data.file.url) ? data.file.url : (data.url || '');
                if (!url) break;
                const caption = data.caption || '';
                const withBorder = data.withBorder ? ' img-bordered' : '';
                const stretched = data.stretched ? ' img-stretched' : '';
                
                let imgHtml = `<div class="article-image-figure${withBorder}${stretched}">`;
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
                if (!embedUrl) break;
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

// Convert legacy HTML to Editor.js Blocks
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
                        url: imgs[0].getAttribute('src') || '',
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
                    url: node.getAttribute('src') || '',
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
                    message: body
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
