/**
 * TV SHOP Online Cloud Studio
 * Direct Encrypted GitHub API Client & Editor Manager
 * Security: Web Crypto API (AES-256-GCM + PBKDF2 100,000 iterations)
 */

const GITHUB_OWNER = 'tvshopru';
const GITHUB_REPO = 'sup.tvshop';
const CONFIG_PATH = 'config.json';

let portalConfig = {};
let activeArticleIdx = 0;
let editorInstance = null;
let isEditorReady = false;
let activeGitHubToken = null;
let currentConfigSha = null;

let articleFilterStatus = 'all';
let articleSearchQuery = '';

// ==========================================================================
// 1. Toast Notifications System
// ==========================================================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.25s ease';
        setTimeout(() => toast.remove(), 250);
    }, 3800);
}

function escapeHtml(string) {
    if (!string) return '';
    return String(string)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ==========================================================================
// 2. Web Crypto API - Client-side AES-256-GCM + PBKDF2
// ==========================================================================
async function deriveEncryptionKey(password, saltUint8) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: saltUint8,
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

async function encryptToken(token, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveEncryptionKey(password, salt);
    const enc = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        enc.encode(token)
    );
    return {
        salt: Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join(''),
        iv: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''),
        data: Array.from(new Uint8Array(ciphertext)).map(b => b.toString(16).padStart(2, '0')).join('')
    };
}

async function decryptToken(encryptedPayload, password) {
    const salt = new Uint8Array(encryptedPayload.salt.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const iv = new Uint8Array(encryptedPayload.iv.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const data = new Uint8Array(encryptedPayload.data.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    
    const key = await deriveEncryptionKey(password, salt);
    const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        data
    );
    const dec = new TextDecoder();
    return dec.decode(decryptedBuffer);
}

// UTF-8 Base64 Helpers
function decodeBase64Utf8(base64Str) {
    const cleanStr = (base64Str || '').replace(/\s/g, '');
    const binaryStr = atob(cleanStr);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(bytes);
}

function encodeBase64Utf8(str) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    let binaryStr = '';
    for (let i = 0; i < bytes.length; i++) {
        binaryStr += String.fromCharCode(bytes[i]);
    }
    return btoa(binaryStr);
}

function encodeArrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// ==========================================================================
// 3. Direct GitHub REST API Client
// ==========================================================================
async function githubApiRequest(endpoint, method = 'GET', body = null, token = activeGitHubToken) {
    const url = `https://api.github.com${endpoint}`;
    const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${token}`
    };

    const options = {
        method: method,
        headers: headers
    };

    if (body) {
        options.body = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, options);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Ошибка GitHub API (${response.status}: ${response.statusText})`);
    }
    return await response.json();
}

async function verifyGitHubToken(token) {
    const repoData = await githubApiRequest(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}`, 'GET', null, token);
    return repoData && repoData.permissions && (repoData.permissions.push === true || repoData.permissions.admin === true);
}

async function loadPortalConfigFromGitHub() {
    showToast("Загрузка данных с GitHub...", "info");
    const data = await githubApiRequest(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CONFIG_PATH}?ref=main&t=${Date.now()}`);
    currentConfigSha = data.sha;
    const jsonStr = decodeBase64Utf8(data.content);
    portalConfig = JSON.parse(jsonStr);

    if (!Array.isArray(portalConfig.articles)) {
        portalConfig.articles = [];
    }

    // Populate all views
    populateAllViews();
    showToast("Данные успешно синхронизированы с GitHub!", "success");
}

async function savePortalConfigToGitHub() {
    // 1. Sync current article inputs & Editor.js
    if (editorInstance && isEditorReady) {
        await syncArticleEditorData();
    }
    gatherGeneralForms();

    if (Array.isArray(portalConfig.articles)) {
        portalConfig.articles.forEach((a, i) => {
            a.pinned = (i < 3);
        });
    }

    showToast("Сохранение и коммит на GitHub...", "info");
    const jsonString = JSON.stringify(portalConfig, null, 2);
    const base64Content = encodeBase64Utf8(jsonString);

    // Refresh SHA
    try {
        const fileInfo = await githubApiRequest(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CONFIG_PATH}?ref=main&t=${Date.now()}`);
        currentConfigSha = fileInfo.sha;
    } catch (e) {
        console.warn("Could not refresh SHA, using cached:", e);
    }

    const commitPayload = {
        message: `Update portal configuration (via TV SHOP Online Studio) [skip ci]`,
        content: base64Content,
        sha: currentConfigSha,
        branch: 'main'
    };

    const result = await githubApiRequest(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CONFIG_PATH}`, 'PUT', commitPayload);
    currentConfigSha = result.content.sha;

    // 2. Generate and publish standalone static article page for active article
    try {
        const curArt = portalConfig.articles[activeArticleIdx];
        if (curArt && curArt.id && window.ArticleRenderer && typeof window.ArticleRenderer.generateArticleHtml === 'function') {
            const artHtml = window.ArticleRenderer.generateArticleHtml(curArt);
            const artPath = `articles/${encodeURIComponent(curArt.id)}.html`;
            
            let artSha = null;
            try {
                const artInfo = await githubApiRequest(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${artPath}?ref=main&t=${Date.now()}`);
                artSha = artInfo.sha;
            } catch(err) {
                // file doesn't exist yet
            }

            const artPayload = {
                message: `Publish static article: ${curArt.title || curArt.id} with OpenGraph tags [skip ci]`,
                content: encodeBase64Utf8(artHtml),
                branch: 'main'
            };
            if (artSha) artPayload.sha = artSha;

            await githubApiRequest(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${artPath}`, 'PUT', artPayload);
        }
    } catch(err) {
        console.warn("Could not publish static article page:", err);
    }

    renderArticlesList();
    showToast("🎉 Успешно опубликовано на сайт!", "success");
}

async function uploadMediaFileToGitHub(file) {
    showToast(`Загрузка медиа: ${file.name}...`, "info");
    const arrayBuffer = await file.arrayBuffer();
    const base64Data = encodeArrayBufferToBase64(arrayBuffer);
    
    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `${Date.now()}_${cleanName}`;
    const filePath = `img/${filename}`;

    const payload = {
        message: `Upload media asset: ${filename} via Online Admin [skip ci]`,
        content: base64Data,
        branch: 'main'
    };

    await githubApiRequest(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`, 'PUT', payload);
    showToast("Фотография загружена в репозиторий!", "success");
    return filePath;
}

// ==========================================================================
// 4. Custom Editor.js Tools: RemoteKey & LinkButton
// ==========================================================================
class RemoteKeyInlineTool {
    static get isInline() { return true; }
    static get title() { return 'Пульт [OK]'; }
    static get sanitize() {
        return {
            kbd: { class: 'tv-remote-key' }
        };
    }

    constructor({ api }) {
        this.api = api;
        this.button = null;
        this.tag = 'KBD';
        this.cssClass = 'tv-remote-key';
        this.iconClasses = {
            base: this.api.styles.inlineToolButton,
            active: this.api.styles.inlineToolButtonActive
        };
    }

    render() {
        this.button = document.createElement('button');
        this.button.type = 'button';
        this.button.classList.add(this.iconClasses.base);
        this.button.innerHTML = '<b style="font-size:0.82em; background:#1e293b; color:#38bdf8; padding:2px 5px; border-radius:3px;">OK</b>';
        this.button.title = 'Кнопка пульта [OK]';
        return this.button;
    }

    surround(range) {
        if (!range) return;
        const termWrapper = this.api.selection.findParentTag(this.tag, this.cssClass);
        if (termWrapper) {
            this.unwrap(termWrapper);
        } else {
            this.wrap(range);
        }
    }

    wrap(range) {
        const kbd = document.createElement(this.tag);
        kbd.classList.add(this.cssClass);
        kbd.appendChild(range.extractContents());
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
        sel.removeAllRanges();
        sel.addRange(range);
    }

    checkState() {
        const parentTag = this.api.selection.findParentTag(this.tag, this.cssClass);
        if (this.button) {
            this.button.classList.toggle(this.iconClasses.active, !!parentTag);
        }
    }
}

class LinkButtonBlockTool {
    static get toolbox() {
        return {
            title: 'Кнопка-ссылка',
            icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="3"/><path d="M9 12h6"/><path d="M12 9l3 3-3 3"/></svg>'
        };
    }

    static get isReadOnlySupported() { return true; }

    constructor({ data, api, readOnly }) {
        this.data = {
            text: (data.text || data.title || data.label || '').trim(),
            link: (data.link || data.url || '').trim(),
            style: data.style || 'primary'
        };
        this.api = api;
        this.readOnly = readOnly;
        this.wrapper = null;
        this.btnEl = null;
        this.popoverEl = null;
        this.isOpen = false;
        this.onDocClick = this.onDocClick.bind(this);
    }

    getIconSvg(url, style) {
        url = url || '';
        style = style || 'primary';
        if (url.includes('t.me') || url.includes('telegram') || style === 'telegram') {
            return '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .37z"/></svg>';
        } else if (url.match(/\.(apk|zip|rar|m3u|m3u8|pdf)$/i) || style === 'success') {
            return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
        } else if (url.includes('article')) {
            return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
        } else {
            return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
        }
    }

    render() {
        this.wrapper = document.createElement('div');
        this.wrapper.classList.add('ed-btn-block-wrapper');

        // The button itself matching 1:1 final site
        this.btnEl = document.createElement('button');
        this.btnEl.type = 'button';
        this.btnEl.className = `article-btn-cta btn-${this.data.style || 'primary'}`;
        this.btnEl.title = 'Нажмите, чтобы настроить кнопку';
        this.renderButtonContent();

        if (!this.readOnly) {
            this.btnEl.addEventListener('click', (e) => {
                e.stopPropagation();
                this.togglePopover();
            });
        }

        this.wrapper.appendChild(this.btnEl);

        if (!this.readOnly) {
            this.buildPopover();
            this.wrapper.appendChild(this.popoverEl);
        }

        return this.wrapper;
    }

    renderButtonContent() {
        const text = this.data.text || 'Кнопка действия';
        const iconSvg = this.getIconSvg(this.data.link, this.data.style);
        const gearIcon = !this.readOnly ? '<span class="ed-btn-gear" title="Редактировать">⚙️</span>' : '';
        this.btnEl.className = `article-btn-cta btn-${this.data.style || 'primary'}`;
        this.btnEl.innerHTML = `${iconSvg}<span>${escapeHtml(text)}</span>${gearIcon}`;
    }

    buildPopover() {
        this.popoverEl = document.createElement('div');
        this.popoverEl.className = 'ed-btn-floating-popover';
        this.popoverEl.addEventListener('click', (e) => e.stopPropagation());

        // Header
        const header = document.createElement('div');
        header.className = 'ed-popover-header';
        header.innerHTML = `
            <div class="ed-popover-title">🔘 Настройка кнопки</div>
            <button type="button" class="ed-popover-close" title="Закрыть">✕</button>
        `;
        header.querySelector('.ed-popover-close').addEventListener('click', () => this.closePopover());
        this.popoverEl.appendChild(header);

        // Field: Text
        const textField = document.createElement('div');
        textField.className = 'ed-popover-field';
        textField.innerHTML = `
            <label class="ed-popover-label">Текст на кнопке</label>
            <input type="text" class="ed-popover-input ed-btn-input-text" placeholder="Например: Скачать APK" value="${escapeHtml(this.data.text)}">
        `;
        const textInput = textField.querySelector('input');
        textInput.addEventListener('input', (e) => {
            this.data.text = e.target.value;
            this.renderButtonContent();
        });
        this.popoverEl.appendChild(textField);

        // Field: Link
        const linkField = document.createElement('div');
        linkField.className = 'ed-popover-field';
        linkField.innerHTML = `
            <label class="ed-popover-label">Ссылка (URL или статья)</label>
            <input type="text" class="ed-popover-input ed-btn-input-link" placeholder="https://..." value="${escapeHtml(this.data.link)}">
        `;
        const linkInput = linkField.querySelector('input');
        linkInput.addEventListener('input', (e) => {
            this.data.link = e.target.value;
            this.renderButtonContent();
        });
        this.popoverEl.appendChild(linkField);

        // Quick Presets
        const presetsRow = document.createElement('div');
        presetsRow.className = 'ed-popover-presets';
        presetsRow.innerHTML = `
            <button type="button" class="ed-popover-preset-btn" data-preset="tg">✈️ Канал @android_tv_shop</button>
            <button type="button" class="ed-popover-preset-btn" data-preset="sup">💬 Поддержка @VladOpl</button>
        `;
        presetsRow.querySelector('[data-preset="tg"]').addEventListener('click', () => {
            this.data.link = 'https://t.me/android_tv_shop';
            linkInput.value = this.data.link;
            if (!this.data.text) {
                this.data.text = 'Канал TV SHOP в Telegram';
                textInput.value = this.data.text;
            }
            this.setStyle('telegram');
        });
        presetsRow.querySelector('[data-preset="sup"]').addEventListener('click', () => {
            this.data.link = 'https://t.me/VladOpl';
            linkInput.value = this.data.link;
            if (!this.data.text) {
                this.data.text = 'Написать в техподдержку';
                textInput.value = this.data.text;
            }
            this.setStyle('telegram');
        });
        this.popoverEl.appendChild(presetsRow);

        // Style Selector Pills
        const styleLabel = document.createElement('div');
        styleLabel.className = 'ed-popover-label';
        styleLabel.textContent = 'Стиль кнопки';
        this.popoverEl.appendChild(styleLabel);

        const stylesRow = document.createElement('div');
        stylesRow.className = 'ed-popover-styles';
        const styles = [
            { key: 'primary', label: '🔵 Синяя' },
            { key: 'success', label: '🟢 Скачать' },
            { key: 'telegram', label: '✈️ Telegram' },
            { key: 'amber', label: '🟠 Важно' },
            { key: 'outline', label: '⚪ Контур' }
        ];
        styles.forEach(st => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `ed-popover-style-btn ${this.data.style === st.key ? 'is-active' : ''}`;
            btn.textContent = st.label;
            btn.dataset.styleKey = st.key;
            btn.addEventListener('click', () => this.setStyle(st.key));
            stylesRow.appendChild(btn);
        });
        this.popoverEl.appendChild(stylesRow);

        // Footer Done button
        const actionsRow = document.createElement('div');
        actionsRow.className = 'ed-popover-actions';
        actionsRow.innerHTML = `<button type="button" class="ed-popover-done-btn">Готово</button>`;
        actionsRow.querySelector('button').addEventListener('click', () => this.closePopover());
        this.popoverEl.appendChild(actionsRow);
    }

    setStyle(styleKey) {
        this.data.style = styleKey;
        if (this.popoverEl) {
            this.popoverEl.querySelectorAll('.ed-popover-style-btn').forEach(btn => {
                btn.classList.toggle('is-active', btn.dataset.styleKey === styleKey);
            });
        }
        this.renderButtonContent();
    }

    togglePopover() {
        if (this.isOpen) {
            this.closePopover();
        } else {
            this.openPopover();
        }
    }

    openPopover() {
        document.querySelectorAll('.ed-btn-floating-popover.is-open').forEach(p => p.classList.remove('is-open'));
        if (!this.popoverEl) return;

        const rect = this.btnEl.getBoundingClientRect();
        if (rect.top < 280) {
            this.popoverEl.classList.add('popover-below');
        } else {
            this.popoverEl.classList.remove('popover-below');
        }

        this.popoverEl.classList.add('is-open');
        this.isOpen = true;
        document.addEventListener('click', this.onDocClick);
        const textInp = this.popoverEl.querySelector('.ed-btn-input-text');
        if (textInp) setTimeout(() => textInp.focus(), 50);
    }

    closePopover() {
        if (!this.popoverEl) return;
        this.popoverEl.classList.remove('is-open');
        this.isOpen = false;
        document.removeEventListener('click', this.onDocClick);
    }

    onDocClick(e) {
        if (!this.wrapper.contains(e.target)) {
            this.closePopover();
        }
    }

    save() {
        return {
            text: (this.data.text || '').trim(),
            link: (this.data.link || '').trim(),
            style: this.data.style || 'primary'
        };
    }
}

// ==========================================================================
// 5. Editor.js Initialization
// ==========================================================================
function initEditorJS(initialData) {
    if (editorInstance && typeof editorInstance.destroy === 'function') {
        try {
            editorInstance.destroy();
        } catch (e) {
            console.warn("Editor destroy warning:", e);
        }
        editorInstance = null;
        isEditorReady = false;
        document.getElementById('editorjs-holder').innerHTML = '';
    }

    const ListClass = window.EditorjsList || window.List;

    const editorTools = {
        header: {
            class: window.Header,
            inlineToolbar: true,
            config: {
                placeholder: 'Введите заголовок...',
                levels: [2, 3],
                defaultLevel: 2
            }
        },
        list: {
            class: ListClass,
            inlineToolbar: true,
            config: { defaultStyle: 'unordered' }
        },
        linkButton: {
            class: LinkButtonBlockTool
        },
        image: {
            class: window.ImageTool,
            config: {
                uploader: {
                    async uploadByFile(file) {
                        try {
                            const path = await uploadMediaFileToGitHub(file);
                            return {
                                success: 1,
                                file: { url: path }
                            };
                        } catch (err) {
                            showToast("Ошибка загрузки в GitHub: " + err.message, "error");
                            return { success: 0 };
                        }
                    }
                }
            }
        },
        quote: {
            class: window.Quote,
            inlineToolbar: true,
            config: {
                quotePlaceholder: 'Текст цитаты или подсказки...',
                captionPlaceholder: 'Пояснение'
            }
        },
        warning: {
            class: window.Warning,
            inlineToolbar: true,
            config: {
                titlePlaceholder: 'Заголовок предупреждения...',
                messagePlaceholder: 'Важная информация...'
            }
        },
        table: {
            class: window.Table,
            inlineToolbar: true,
            config: { rows: 2, cols: 2 }
        },
        embed: {
            class: window.Embed,
            config: {
                services: {
                    youtube: true,
                    rutube: true
                }
            }
        },
        delimiter: {
            class: window.Delimiter
        },
        marker: {
            class: window.Marker
        },
        inlineCode: {
            class: window.InlineCode
        },
        underline: {
            class: window.Underline
        },
        remoteKey: {
            class: RemoteKeyInlineTool
        }
    };

    const editorI18n = {
        messages: {
            ui: {
                blockTunes: {
                    toggler: {
                        "Click to tune": "Настройки блока",
                        "or drag to move": "или перетащите для перемещения"
                    },
                    actions: {
                        "Filter": "Поиск...",
                        "Nothing found": "Ничего не найдено",
                        "Convert to": "Преобразовать в",
                        "Move up": "Переместить вверх",
                        "Move down": "Переместить вниз",
                        "Delete": "Удалить",
                        "Click to delete": "Нажмите для удаления"
                    }
                },
                inlineToolbar: {
                    converter: {
                        "Convert to": "Преобразовать в"
                    }
                },
                toolbar: {
                    toolbox: {
                        "Add": "Добавить блок",
                        "Filter": "Поиск...",
                        "Nothing found": "Ничего не найдено"
                    }
                },
                popover: {
                    "Filter": "Поиск...",
                    "Nothing found": "Ничего не найдено",
                    "Convert to": "Преобразовать в"
                }
            },
            toolNames: {
                "Text": "Обычный текст",
                "Heading": "Заголовок",
                "List": "Список",
                "Unordered List": "Маркированный список",
                "Ordered List": "Нумерованный список",
                "Checklist": "Чек-лист",
                "Warning": "Важно",
                "Quote": "Цитата",
                "Delimiter": "Разделитель",
                "Table": "Таблица",
                "Image": "Изображение",
                "Link": "Ссылка",
                "Bold": "Жирный",
                "Italic": "Курсив",
                "Underline": "Подчёркнутый",
                "Marker": "Маркер",
                "Code": "Код",
                "InlineCode": "Код"
            },
            tools: {
                list: {
                    "Ordered": "Нумерованный список",
                    "Unordered": "Маркированный список",
                    "Checklist": "Чек-лист",
                    "Unordered List": "Маркированный список",
                    "Ordered List": "Нумерованный список"
                },
                warning: {
                    "Title": "Заголовок",
                    "Message": "Сообщение"
                },
                link: {
                    "Add a link": "Вставьте ссылку"
                },
                stub: {
                    "The block can not be displayed correctly.": "Блок не может быть отображен"
                },
                image: {
                    "Caption": "Подпись к фото",
                    "Select an Image": "Выберите изображение",
                    "With border": "С рамкой",
                    "Stretch image": "Растянуть",
                    "With background": "С фоном"
                },
                table: {
                    "Add row above": "Вставить строку выше",
                    "Add row below": "Вставить строку ниже",
                    "Delete row": "Удалить строку",
                    "Add column to left": "Вставить столбец слева",
                    "Add column to right": "Вставить столбец справа",
                    "Delete column": "Удалить столбец",
                    "With headings": "С заголовками",
                    "Without headings": "Без заголовков"
                },
                quote: {
                    "Quote": "Цитата",
                    "Enter a quote": "Введите текст цитаты",
                    "Enter a caption": "Автор или источник"
                }
            },
            blockTunes: {
                delete: {
                    "Delete": "Удалить",
                    "Click to delete": "Нажмите для подтверждения"
                },
                moveUp: {
                    "Move up": "Переместить вверх"
                },
                moveDown: {
                    "Move down": "Переместить вниз"
                }
            }
        }
    };

    let dataToLoad = {};
    if (initialData && Array.isArray(initialData.blocks) && initialData.blocks.length > 0) {
        dataToLoad = initialData;
    } else if (typeof initialData === 'string' && initialData.trim()) {
        const converter = window.ArticleRenderer && (window.ArticleRenderer.htmlToEditorData || window.ArticleRenderer.parseHtmlToBlocks);
        if (typeof converter === 'function') {
            dataToLoad = converter(initialData);
        }
    }

    try {
        editorInstance = new EditorJS({
            holder: 'editorjs-holder',
            tools: editorTools,
            i18n: editorI18n,
            placeholder: 'Нажмите Tab или начните писать текст здесь...',
            data: dataToLoad,
            onReady: () => {
                isEditorReady = true;
                if (window.Undo) {
                    new window.Undo({ editor: editorInstance });
                }
            }
        });
    } catch (e) {
        console.error("EditorJS init error:", e);
    }
}

// Quick Toolbar Block Insertion
function initQuickToolbar() {
    const bar = document.getElementById('editor-quick-toolbar');
    if (!bar) return;

    bar.addEventListener('click', async (e) => {
        const btn = e.target.closest('.q-btn');
        if (!btn || !editorInstance || !isEditorReady) return;

        const tool = btn.dataset.tool;

        if (tool === 'image') {
            const fileInput = document.getElementById('image-upload-file-input');
            if (fileInput) fileInput.click();
            return;
        }

        try {
            const count = await editorInstance.blocks.getBlocksCount();
            let data = {};
            if (tool === 'header') data = { text: '', level: 2 };
            if (tool === 'list') data = { style: 'unordered', items: [''] };
            if (tool === 'warning') data = { title: 'Важно', message: '' };
            if (tool === 'linkButton') data = { text: 'Кнопка действия', link: 'https://', style: 'primary' };
            if (tool === 'quote') data = { text: '', caption: '' };
            if (tool === 'table') data = { withHeadings: false, content: [['', ''], ['', '']] };
            if (tool === 'embed') data = { service: 'youtube', source: '', embed: '' };
            if (tool === 'delimiter') data = {};

            await editorInstance.blocks.insert(tool, data, {}, count, true);
        } catch (err) {
            console.warn("Quick insert error:", err);
        }
    });

    const fileInput = document.getElementById('image-upload-file-input');
    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const imgPath = await uploadMediaFileToGitHub(file);
                const count = await editorInstance.blocks.getBlocksCount();
                await editorInstance.blocks.insert('image', {
                    file: { url: imgPath },
                    caption: ''
                }, {}, count, true);
            } catch (err) {
                showToast("Ошибка загрузки фото: " + err.message, "error");
            } finally {
                fileInput.value = '';
            }
        });
    }
}

// ==========================================================================
// 6. Article Management & Sync
// ==========================================================================
async function syncArticleEditorData() {
    if (!portalConfig.articles || !portalConfig.articles[activeArticleIdx]) return;
    const art = portalConfig.articles[activeArticleIdx];

    const titleEl = document.getElementById('article-title-input');
    const dateEl = document.getElementById('article-date-input');
    const catEl = document.getElementById('article-category-input');
    const vidEl = document.getElementById('article-video-input');
    const statusEl = document.getElementById('select-article-status');

    if (titleEl) art.title = titleEl.value.trim();
    if (dateEl) art.date = dateEl.value.trim();
    if (catEl) art.category = catEl.value.trim();
    if (vidEl) art.videoUrl = vidEl.value.trim();
    if (statusEl) art.status = statusEl.value;

    if (editorInstance && isEditorReady) {
        try {
            const outputData = await editorInstance.save();
            art.contentData = outputData;
            if (window.ArticleRenderer && typeof window.ArticleRenderer.renderBlocks === 'function') {
                art.contentHtml = window.ArticleRenderer.renderBlocks(outputData);
            }
        } catch (err) {
            console.warn("Could not extract editor output:", err);
        }
    }
}

function updateVideoBannerPreview(url) {
    const banner = document.getElementById('live-video-banner-preview');
    const link = document.getElementById('live-video-banner-link');
    if (banner && link) {
        if (url && url.trim()) {
            banner.style.display = 'block';
            link.href = url.trim();
        } else {
            banner.style.display = 'none';
        }
    }
}

function selectArticle(idx) {
    if (!portalConfig.articles || !portalConfig.articles[idx]) return;
    activeArticleIdx = idx;
    const art = portalConfig.articles[idx];

    // Meta inputs
    const titleEl = document.getElementById('article-title-input');
    const dateEl = document.getElementById('article-date-input');
    const catEl = document.getElementById('article-category-input');
    const vidEl = document.getElementById('article-video-input');
    const statusEl = document.getElementById('select-article-status');
    const linkText = document.getElementById('link-preview-text');
    const openTabBtn = document.getElementById('btn-open-article-tab');

    if (titleEl) {
        titleEl.value = art.title || '';
        titleEl.style.height = 'auto';
        titleEl.style.height = (titleEl.scrollHeight) + 'px';
    }
    if (dateEl) dateEl.value = art.date || '';
    if (catEl) catEl.value = art.category || '';
    if (vidEl) {
        vidEl.value = art.videoUrl || '';
        updateVideoBannerPreview(art.videoUrl);
    }
    if (statusEl) statusEl.value = art.status || 'published';

    const artUrl = `articles/${encodeURIComponent(art.id)}.html`;
    if (linkText) linkText.textContent = artUrl;
    if (openTabBtn) openTabBtn.href = artUrl;

    // Load blocks in editor
    let editorData = null;
    if (art.contentData && Array.isArray(art.contentData.blocks) && art.contentData.blocks.length > 0) {
        editorData = art.contentData;
    } else if (art.contentHtml && typeof art.contentHtml === 'string' && art.contentHtml.trim()) {
        editorData = art.contentHtml;
    }
    initEditorJS(editorData);

    // Update active highlight in list
    document.querySelectorAll('.article-item').forEach((el, i) => {
        el.classList.toggle('active', parseInt(el.dataset.idx, 10) === idx);
    });

    // Toggle empty state
    const emptyState = document.getElementById('article-empty-state');
    const editorArea = document.getElementById('article-editor-area');
    if (emptyState && editorArea) {
        emptyState.style.display = 'none';
        editorArea.style.display = 'flex';
    }
}

let draggedItemIndex = null;
let isDraggingActive = false;

function renderArticlesList() {
    const listEl = document.getElementById('articles-list');
    if (!listEl) return;

    const articles = portalConfig.articles || [];
    
    // Counts
    const countAll = articles.length;
    const countPub = articles.filter(a => a.status !== 'draft').length;
    const countDraft = articles.filter(a => a.status === 'draft').length;

    const elAll = document.getElementById('count-all');
    const elPub = document.getElementById('count-pub');
    const elDraft = document.getElementById('count-draft');
    if (elAll) elAll.textContent = countAll;
    if (elPub) elPub.textContent = countPub;
    if (elDraft) elDraft.textContent = countDraft;

    // Filter
    const filtered = articles.map((art, idx) => ({ art, idx })).filter(({ art }) => {
        if (articleFilterStatus === 'published' && art.status === 'draft') return false;
        if (articleFilterStatus === 'draft' && art.status !== 'draft') return false;
        if (articleSearchQuery) {
            const q = articleSearchQuery.toLowerCase();
            const t = (art.title || '').toLowerCase();
            const c = (art.category || '').toLowerCase();
            if (!t.includes(q) && !c.includes(q)) return false;
        }
        return true;
    });

    if (filtered.length === 0) {
        listEl.innerHTML = `<div style="padding:24px 16px; text-align:center; color:var(--text-muted); font-size:0.86em;">Статей не найдено</div>`;
        return;
    }

    const isDefaultView = (articleFilterStatus === 'all' && !articleSearchQuery);
    let htmlParts = [];

    filtered.forEach(({ art, idx }, pos) => {
        const isAct = idx === activeArticleIdx;
        const isDraft = art.status === 'draft';
        const isPinned = isDefaultView && (pos < 3);

        const statusBadge = isDraft 
            ? `<span class="badge-status draft">🟡 Черновик</span>`
            : `<span class="badge-status published">🟢 Опубл.</span>`;
        const pinBadge = isPinned 
            ? `<span class="badge-status pinned" title="Закреплено на сайте (топ-3)">📌 Закреп</span>` 
            : '';
        const catBadge = art.category ? `<span class="item-category">${escapeHtml(art.category)}</span>` : '';
        const title = escapeHtml(art.title || 'Без названия');
        const date = escapeHtml(art.date || '');

        htmlParts.push(`
            <div class="article-item ${isAct ? 'active' : ''}" data-idx="${idx}" draggable="${isDefaultView ? 'true' : 'false'}" title="${isDefaultView ? 'Перетащите мышкой, чтобы изменить порядок статей' : ''}">
                <div class="item-title">${title}</div>
                <div class="item-meta">
                    ${pinBadge}
                    ${statusBadge}
                    ${catBadge}
                    <span>${date}</span>
                </div>
            </div>
        `);

        if (isDefaultView && pos === 2 && filtered.length > 3) {
            htmlParts.push(`
                <div class="articles-pinned-divider">
                    <span>Остальные статьи</span>
                </div>
            `);
        }
    });

    listEl.innerHTML = htmlParts.join('');

    // Click handler on cards
    listEl.querySelectorAll('.article-item').forEach(el => {
        el.addEventListener('click', async () => {
            if (isDraggingActive) return;
            const idx = parseInt(el.dataset.idx, 10);
            if (idx === activeArticleIdx) return;
            await syncArticleEditorData();
            selectArticle(idx);
        });
    });

    // Native Drag and Drop Reordering (Active in Default View)
    if (isDefaultView) {
        const items = listEl.querySelectorAll('.article-item');
        items.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                isDraggingActive = true;
                draggedItemIndex = parseInt(item.dataset.idx, 10);
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(draggedItemIndex));
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                listEl.querySelectorAll('.article-item').forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom'));
                draggedItemIndex = null;
                setTimeout(() => { isDraggingActive = false; }, 60);
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const targetIdx = parseInt(item.dataset.idx, 10);
                if (draggedItemIndex === null || draggedItemIndex === targetIdx) return;

                const rect = item.getBoundingClientRect();
                const relY = e.clientY - rect.top;
                if (relY < rect.height / 2) {
                    item.classList.add('drag-over-top');
                    item.classList.remove('drag-over-bottom');
                } else {
                    item.classList.add('drag-over-bottom');
                    item.classList.remove('drag-over-top');
                }
            });

            item.addEventListener('dragleave', () => {
                item.classList.remove('drag-over-top', 'drag-over-bottom');
            });

            item.addEventListener('drop', async (e) => {
                e.preventDefault();
                const fromIdx = draggedItemIndex;
                const toIdx = parseInt(item.dataset.idx, 10);
                if (fromIdx === null || fromIdx === toIdx) return;

                const isBottom = item.classList.contains('drag-over-bottom');
                item.classList.remove('drag-over-top', 'drag-over-bottom', 'dragging');

                let insertIdx = toIdx;
                if (isBottom) {
                    insertIdx = toIdx + 1;
                }
                if (fromIdx < insertIdx) {
                    insertIdx--;
                }
                if (fromIdx === insertIdx) return;

                await syncArticleEditorData();

                const activeArtId = (portalConfig.articles && portalConfig.articles[activeArticleIdx])
                    ? portalConfig.articles[activeArticleIdx].id
                    : null;

                const [moved] = portalConfig.articles.splice(fromIdx, 1);
                portalConfig.articles.splice(insertIdx, 0, moved);

                portalConfig.articles.forEach((a, i) => {
                    a.pinned = (i < 3);
                });

                if (activeArtId) {
                    activeArticleIdx = portalConfig.articles.findIndex(a => a.id === activeArtId);
                    if (activeArticleIdx < 0) activeArticleIdx = 0;
                }

                renderArticlesList();
                showToast("Порядок статей обновлен! Первые 3 в закрепе 📌", "success");
            });
        });
    }
}

function createNewArticle() {
    if (!Array.isArray(portalConfig.articles)) portalConfig.articles = [];

    // Format current Russian date
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const now = new Date();
    const curDate = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;

    const newArt = {
        id: `art-${Date.now()}`,
        title: 'Новая инструкция',
        date: curDate,
        status: 'published',
        category: 'Общее',
        videoUrl: '',
        contentHtml: '',
        contentData: { time: Date.now(), blocks: [] }
    };

    portalConfig.articles.unshift(newArt);
    activeArticleIdx = 0;
    renderArticlesList();
    selectArticle(0);

    const titleInput = document.getElementById('article-title-input');
    if (titleInput) {
        titleInput.focus();
        titleInput.select();
    }
    showToast("Создана новая статья!", "info");
}

function duplicateCurrentArticle() {
    if (!portalConfig.articles || !portalConfig.articles[activeArticleIdx]) return;
    const cur = portalConfig.articles[activeArticleIdx];

    const copy = JSON.parse(JSON.stringify(cur));
    copy.id = `art-${Date.now()}`;
    copy.title = `Копия - ${copy.title}`;
    copy.status = 'draft';

    portalConfig.articles.splice(activeArticleIdx + 1, 0, copy);
    renderArticlesList();
    selectArticle(activeArticleIdx + 1);
    showToast("Статья продублирована как черновик!", "info");
}

function deleteCurrentArticle() {
    if (!portalConfig.articles || !portalConfig.articles[activeArticleIdx]) return;
    const cur = portalConfig.articles[activeArticleIdx];

    if (!confirm(`Вы действительно хотите удалить статью «${cur.title || cur.id}»?`)) return;

    portalConfig.articles.splice(activeArticleIdx, 1);
    if (activeArticleIdx >= portalConfig.articles.length) {
        activeArticleIdx = Math.max(0, portalConfig.articles.length - 1);
    }

    renderArticlesList();
    if (portalConfig.articles.length > 0) {
        selectArticle(activeArticleIdx);
    } else {
        const emptyState = document.getElementById('article-empty-state');
        const editorArea = document.getElementById('article-editor-area');
        if (emptyState && editorArea) {
            emptyState.style.display = 'flex';
            editorArea.style.display = 'none';
        }
    }
    showToast("Статья удалена", "info");
}

// ==========================================================================
// 7. News, Products, Promo, Support Management
// ==========================================================================
function renderNewsList() {
    const container = document.getElementById('news-list-container');
    if (!container) return;
    const news = portalConfig.news || [];

    if (news.length === 0) {
        container.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:var(--text-muted); padding:32px;">Новостей нет</div>`;
        return;
    }

    container.innerHTML = news.map((item, idx) => `
        <div class="panel-card" data-idx="${idx}">
            <div class="card-header-row">
                <span style="font-weight:700; font-size:0.88em; color:var(--brand-primary);">#${idx + 1} Новость</span>
                <button type="button" class="btn-card-del btn-del-news" data-idx="${idx}">🗑️ Удалить</button>
            </div>
            <div class="form-row">
                <label>Заголовок новости</label>
                <input type="text" class="form-input news-title" value="${escapeHtml(item.title || '')}" placeholder="Заголовок">
            </div>
            <div class="form-row">
                <label>Дата публикации</label>
                <input type="text" class="form-input news-date" value="${escapeHtml(item.date || '')}" placeholder="Например: 1 ноября 2026">
            </div>
            <div class="form-row">
                <label>Краткое описание / Текст</label>
                <textarea class="form-textarea news-desc" rows="3" placeholder="Текст новости...">${escapeHtml(item.desc || '')}</textarea>
            </div>
        </div>
    `).join('');

    container.querySelectorAll('.btn-del-news').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx, 10);
            portalConfig.news.splice(idx, 1);
            renderNewsList();
        });
    });
}

function addNewsItem() {
    if (!Array.isArray(portalConfig.news)) portalConfig.news = [];
    portalConfig.news.unshift({
        id: `news-${Date.now()}`,
        title: 'Новая новость',
        date: 'Сегодня',
        desc: ''
    });
    renderNewsList();
}

function renderProductsList() {
    const container = document.getElementById('products-list-container');
    if (!container) return;
    const products = portalConfig.products || [];

    if (products.length === 0) {
        container.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:var(--text-muted); padding:32px;">Товаров нет</div>`;
        return;
    }

    container.innerHTML = products.map((item, idx) => `
        <div class="panel-card" data-idx="${idx}">
            <div class="card-header-row">
                <span style="font-weight:700; font-size:0.88em; color:var(--brand-primary);">#${idx + 1} Товар</span>
                <button type="button" class="btn-card-del btn-del-prod" data-idx="${idx}">🗑️ Удалить</button>
            </div>
            <div class="form-row">
                <label>Название товара</label>
                <input type="text" class="form-input prod-title" value="${escapeHtml(item.title || '')}" placeholder="Название">
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <div class="form-row">
                    <label>Цена</label>
                    <input type="text" class="form-input prod-price" value="${escapeHtml(item.price || '')}" placeholder="5 500 руб.">
                </div>
                <div class="form-row">
                    <label>Наличие / Статус</label>
                    <input type="text" class="form-input prod-avail" value="${escapeHtml(item.available || '')}" placeholder="В наличии">
                </div>
            </div>
            <div class="form-row">
                <label>Описание</label>
                <textarea class="form-textarea prod-desc" rows="3" placeholder="Описание товара...">${escapeHtml(item.desc || '')}</textarea>
            </div>
            <div class="form-row">
                <label>Изображение (URL или путь)</label>
                <input type="text" class="form-input prod-img" value="${escapeHtml(item.imageUrl || '')}" placeholder="app_logo.png">
            </div>
        </div>
    `).join('');

    container.querySelectorAll('.btn-del-prod').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx, 10);
            portalConfig.products.splice(idx, 1);
            renderProductsList();
        });
    });
}

function addProductItem() {
    if (!Array.isArray(portalConfig.products)) portalConfig.products = [];
    portalConfig.products.unshift({
        id: `prod-${Date.now()}`,
        title: 'Новый товар',
        price: '0 руб.',
        available: 'В наличии',
        condition: 'Новый',
        desc: '',
        imageUrl: 'app_logo.png'
    });
    renderProductsList();
}

function populateGeneralForms() {
    // Promo
    const promo = portalConfig.promo || {};
    const pBadge = document.getElementById('promo-badge');
    const pTitle = document.getElementById('promo-title');
    const pText = document.getElementById('promo-text');
    const pAction = document.getElementById('promo-action');
    const pImg = document.getElementById('promo-image');

    if (pBadge) pBadge.value = promo.badge || '';
    if (pTitle) pTitle.value = promo.title || '';
    if (pText) pText.value = promo.text || '';
    if (pAction) pAction.value = promo.actionText || '';
    if (pImg) pImg.value = promo.imageUrl || '';

    // Support
    const sText = document.getElementById('support-text');
    const sTg = document.getElementById('support-tg');
    const sMax = document.getElementById('support-max');
    const sQr = document.getElementById('support-qr');
    const sOne = document.getElementById('onesignal-id');

    if (sText) sText.value = portalConfig.supportText || '';
    if (sTg) sTg.value = portalConfig.supportTg || '';
    if (sMax) sMax.value = portalConfig.supportMax || '';
    if (sQr) sQr.value = portalConfig.supportQrUrl || '';
    if (sOne) sOne.value = portalConfig.oneSignalAppId || '';
}

function gatherGeneralForms() {
    // Gather News
    const newsCards = document.querySelectorAll('#news-list-container .panel-card');
    if (newsCards.length > 0 && Array.isArray(portalConfig.news)) {
        newsCards.forEach((card, idx) => {
            if (portalConfig.news[idx]) {
                const titleEl = card.querySelector('.news-title');
                const dateEl = card.querySelector('.news-date');
                const descEl = card.querySelector('.news-desc');
                if (titleEl) portalConfig.news[idx].title = titleEl.value.trim();
                if (dateEl) portalConfig.news[idx].date = dateEl.value.trim();
                if (descEl) portalConfig.news[idx].desc = descEl.value.trim();
            }
        });
    }

    // Gather Products
    const prodCards = document.querySelectorAll('#products-list-container .panel-card');
    if (prodCards.length > 0 && Array.isArray(portalConfig.products)) {
        prodCards.forEach((card, idx) => {
            if (portalConfig.products[idx]) {
                const titleEl = card.querySelector('.prod-title');
                const priceEl = card.querySelector('.prod-price');
                const availEl = card.querySelector('.prod-avail');
                const descEl = card.querySelector('.prod-desc');
                const imgEl = card.querySelector('.prod-img');
                if (titleEl) portalConfig.products[idx].title = titleEl.value.trim();
                if (priceEl) portalConfig.products[idx].price = priceEl.value.trim();
                if (availEl) portalConfig.products[idx].available = availEl.value.trim();
                if (descEl) portalConfig.products[idx].desc = descEl.value.trim();
                if (imgEl) portalConfig.products[idx].imageUrl = imgEl.value.trim();
            }
        });
    }

    // Gather Promo
    if (!portalConfig.promo) portalConfig.promo = {};
    const pBadge = document.getElementById('promo-badge');
    const pTitle = document.getElementById('promo-title');
    const pText = document.getElementById('promo-text');
    const pAction = document.getElementById('promo-action');
    const pImg = document.getElementById('promo-image');

    if (pBadge) portalConfig.promo.badge = pBadge.value.trim();
    if (pTitle) portalConfig.promo.title = pTitle.value.trim();
    if (pText) portalConfig.promo.text = pText.value.trim();
    if (pAction) portalConfig.promo.actionText = pAction.value.trim();
    if (pImg) portalConfig.promo.imageUrl = pImg.value.trim();

    // Gather Support
    const sText = document.getElementById('support-text');
    const sTg = document.getElementById('support-tg');
    const sMax = document.getElementById('support-max');
    const sQr = document.getElementById('support-qr');
    const sOne = document.getElementById('onesignal-id');

    if (sText) portalConfig.supportText = sText.value.trim();
    if (sTg) portalConfig.supportTg = sTg.value.trim();
    if (sMax) portalConfig.supportMax = sMax.value.trim();
    if (sQr) portalConfig.supportQrUrl = sQr.value.trim();
    if (sOne) portalConfig.oneSignalAppId = sOne.value.trim();
}

function populateAllViews() {
    renderArticlesList();
    if (portalConfig.articles && portalConfig.articles.length > 0) {
        selectArticle(0);
    }
    renderNewsList();
    renderProductsList();
    populateGeneralForms();
}

// ==========================================================================
// 8. Live Preview Modal
// ==========================================================================
function openLivePreview() {
    if (!portalConfig.articles || !portalConfig.articles[activeArticleIdx]) return;
    const cur = portalConfig.articles[activeArticleIdx];

    const modal = document.getElementById('preview-modal');
    const content = document.getElementById('preview-page-content');
    const badge = document.getElementById('preview-badge-status');

    if (badge) {
        badge.textContent = cur.status === 'draft' ? '🟡 Черновик' : '🟢 Опубликовано';
    }

    if (content) {
        if (window.ArticleRenderer && typeof window.ArticleRenderer.renderBlocks === 'function') {
            const bodyHtml = window.ArticleRenderer.renderBlocks(cur.contentData || cur.contentHtml);
            content.innerHTML = `
                <div class="article-header">
                    <h1 class="article-title">${escapeHtml(cur.title)}</h1>
                    <div class="article-byline">
                        <span class="byline-author">TV SHOP</span>
                        <span class="byline-sep">•</span>
                        <span class="byline-date">${escapeHtml(cur.date || '')}</span>
                        ${cur.category ? `<span class="byline-sep">•</span><span class="byline-cat">${escapeHtml(cur.category)}</span>` : ''}
                    </div>
                </div>
                <div class="article-body" style="margin-top:24px; line-height:1.75;">
                    ${bodyHtml}
                </div>
            `;
        } else {
            content.innerHTML = `<h1>${escapeHtml(cur.title)}</h1><div>${cur.contentHtml || ''}</div>`;
        }
    }

    if (modal) modal.style.display = 'flex';
}

function closeLivePreview() {
    const modal = document.getElementById('preview-modal');
    if (modal) modal.style.display = 'none';
}

// Active DOM Localization Watcher for Editor.js Popovers & Submenus
function initPopoverLocalizationWatcher() {
    const translations = {
        'Filter': 'Поиск...',
        'Convert to': 'Преобразовать в',
        'Move up': 'Переместить вверх',
        'Move down': 'Переместить вниз',
        'Delete': 'Удалить',
        'Click to delete': 'Нажмите для удаления',
        'Unordered List': 'Маркированный список',
        'Ordered List': 'Нумерованный список',
        'Checklist': 'Чек-лист',
        'Heading': 'Заголовок',
        'Text': 'Текст',
        'Quote': 'Цитата',
        'Warning': 'Важно',
        'Table': 'Таблица',
        'Image': 'Фото',
        'Delimiter': 'Разделитель',
        'Link': 'Ссылка',
        'Nothing found': 'Ничего не найдено',
        'Start with': 'Начать с',
        'Counter type': 'Тип счетчика',
        'Numeric': 'Числовой (1, 2, 3)',
        'Lower Roman': 'Римские строчные (i, ii)',
        'Upper Roman': 'Римские прописные (I, II)',
        'Lower Alpha': 'Буквы строчные (a, b)',
        'Upper Alpha': 'Буквы прописные (A, B)'
    };

    const translateElement = (el) => {
        if (!el) return;
        if (el.tagName === 'INPUT' && (el.placeholder === 'Filter' || translations[el.placeholder?.trim()])) {
            el.placeholder = 'Поиск...';
        }
        if (el.querySelectorAll) {
            el.querySelectorAll('input[placeholder="Filter"], input.cdx-search-field__input, .ce-popover__search input').forEach(inp => {
                inp.placeholder = 'Поиск...';
            });
            el.querySelectorAll('.ce-popover-item__title, .ce-popover-item__secondary-title, .ce-popover-item, .tc-popover__item-label, .cdx-settings-button, .ce-popover__item-label').forEach(target => {
                const trimmed = (target.textContent || '').trim();
                if (translations[trimmed]) {
                    target.textContent = translations[trimmed];
                }
            });
        }
    };

    // Instant event delegation for search inputs and popover hover
    document.addEventListener('focusin', (e) => {
        if (e.target && e.target.tagName === 'INPUT' && (e.target.placeholder === 'Filter' || e.target.classList.contains('cdx-search-field__input'))) {
            e.target.placeholder = 'Поиск...';
        }
    }, true);

    document.addEventListener('mouseover', (e) => {
        const pop = e.target && e.target.closest && e.target.closest('.ce-popover, .tc-popover');
        if (pop) translateElement(pop);
    }, { passive: true });

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    translateElement(node);
                }
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

// ==========================================================================
// 9. Auth & Initialization
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    initPopoverLocalizationWatcher();
    // 1. Theme Management
    const themeBtn = document.getElementById('btn-theme-toggle');
    const savedTheme = localStorage.getItem('tvshop_theme') || 'light';
    if (savedTheme === 'dark') document.body.classList.add('dark-theme');

    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const isDark = document.body.classList.toggle('dark-theme');
            localStorage.setItem('tvshop_theme', isDark ? 'dark' : 'light');
        });
    }

    // 2. Sidebar Collapse
    const toggleSidebarBtn = document.getElementById('btn-toggle-sidebar');
    const sidebar = document.getElementById('app-sidebar');
    if (toggleSidebarBtn && sidebar) {
        toggleSidebarBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
        });
    }

    // 3. Navigation Pane Switching
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', async () => {
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const targetPaneId = btn.dataset.pane;
            document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
            const targetPane = document.getElementById(targetPaneId);
            if (targetPane) targetPane.classList.add('active');

            // Auto-collapse sidebar when on Articles pane if desired
            if (targetPaneId === 'pane-articles') {
                // Focus on editor
            }
        });
    });

    // 4. Quick Toolbar
    initQuickToolbar();

    // 5. Article Action Bar Buttons
    const btnCreate = document.getElementById('btn-create-article');
    const btnEmptyCreate = document.getElementById('btn-empty-create');
    if (btnCreate) btnCreate.addEventListener('click', createNewArticle);
    if (btnEmptyCreate) btnEmptyCreate.addEventListener('click', createNewArticle);

    const btnDup = document.getElementById('btn-duplicate-article');
    if (btnDup) btnDup.addEventListener('click', duplicateCurrentArticle);

    const btnDel = document.getElementById('btn-delete-article');
    if (btnDel) btnDel.addEventListener('click', deleteCurrentArticle);

    const btnPub = document.getElementById('btn-publish-main');
    if (btnPub) btnPub.addEventListener('click', savePortalConfigToGitHub);

    // Save general buttons in other panes
    document.querySelectorAll('.btn-save-general').forEach(btn => {
        btn.addEventListener('click', savePortalConfigToGitHub);
    });

    // News & Products Add buttons
    const btnAddNews = document.getElementById('btn-add-news');
    if (btnAddNews) btnAddNews.addEventListener('click', addNewsItem);

    const btnAddProd = document.getElementById('btn-add-product');
    if (btnAddProd) btnAddProd.addEventListener('click', addProductItem);

    // Preview
    const btnPrev = document.getElementById('btn-preview-article');
    const btnClosePrev = document.getElementById('btn-close-preview');
    if (btnPrev) btnPrev.addEventListener('click', openLivePreview);
    if (btnClosePrev) btnClosePrev.addEventListener('click', closeLivePreview);

    document.querySelectorAll('.dev-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.dev-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const frame = document.getElementById('preview-frame-device');
            if (frame) {
                frame.classList.toggle('mobile', btn.dataset.device === 'mobile');
            }
        });
    });

    // Search and Filters
    const searchInput = document.getElementById('articles-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            articleSearchQuery = e.target.value.trim();
            renderArticlesList();
        });
    }

    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            articleFilterStatus = chip.dataset.filter;
            renderArticlesList();
        });
    });

    // Copy link chip
    const btnCopyLink = document.getElementById('btn-copy-direct-link');
    if (btnCopyLink) {
        btnCopyLink.addEventListener('click', () => {
            const cur = portalConfig.articles && portalConfig.articles[activeArticleIdx];
            if (cur && cur.id) {
                const fullUrl = `${window.location.origin}${window.location.pathname.replace('admin.html', '')}articles/${encodeURIComponent(cur.id)}.html`;
                navigator.clipboard.writeText(fullUrl).then(() => {
                    showToast("Прямая ссылка скопирована!", "success");
                }).catch(() => {
                    showToast(fullUrl, "info");
                });
            }
        });
    }

    // Real-time Title, Video & Status change sync
    const titleInput = document.getElementById('article-title-input');
    if (titleInput) {
        titleInput.addEventListener('input', () => {
            titleInput.style.height = 'auto';
            titleInput.style.height = (titleInput.scrollHeight) + 'px';
            if (portalConfig.articles && portalConfig.articles[activeArticleIdx]) {
                portalConfig.articles[activeArticleIdx].title = titleInput.value.trim();
                const activeCard = document.querySelector(`.article-item[data-idx="${activeArticleIdx}"] .item-title`);
                if (activeCard) activeCard.textContent = titleInput.value.trim() || 'Без названия';
            }
        });
    }

    const vidInput = document.getElementById('article-video-input');
    if (vidInput) {
        vidInput.addEventListener('input', () => {
            updateVideoBannerPreview(vidInput.value.trim());
        });
    }

    const statusSelect = document.getElementById('select-article-status');
    if (statusSelect) {
        statusSelect.addEventListener('change', () => {
            if (portalConfig.articles && portalConfig.articles[activeArticleIdx]) {
                portalConfig.articles[activeArticleIdx].status = statusSelect.value;
                renderArticlesList();
            }
        });
    }

    // 6. Auth / Setup Modal
    const loginModal = document.getElementById('login-modal');
    const setupView = document.getElementById('login-setup-view');
    const existingView = document.getElementById('login-existing-view');

    const savedEncrypted = localStorage.getItem('tvshop_encrypted_token');
    if (savedEncrypted) {
        if (existingView) existingView.style.display = 'block';
        if (setupView) setupView.style.display = 'none';
        if (loginModal) loginModal.style.display = 'flex';
    } else {
        if (setupView) setupView.style.display = 'block';
        if (existingView) existingView.style.display = 'none';
        if (loginModal) loginModal.style.display = 'flex';
    }

    // Setup Save
    const btnSetupSave = document.getElementById('btn-setup-save');
    if (btnSetupSave) {
        btnSetupSave.addEventListener('click', async () => {
            const tokenInput = document.getElementById('setup-token');
            const passInput = document.getElementById('setup-password');
            const errorDiv = document.getElementById('setup-error');

            const token = (tokenInput ? tokenInput.value : '').trim();
            const pass = (passInput ? passInput.value : '').trim();

            if (!token || !pass) {
                if (errorDiv) {
                    errorDiv.textContent = 'Пожалуйста, заполните токен и пароль';
                    errorDiv.style.display = 'block';
                }
                return;
            }

            try {
                btnSetupSave.disabled = true;
                btnSetupSave.textContent = 'Проверка прав токена...';
                const isValid = await verifyGitHubToken(token);
                if (!isValid) {
                    throw new Error("Токен не имеет прав записи (push) в репозиторий!");
                }

                const encrypted = await encryptToken(token, pass);
                localStorage.setItem('tvshop_encrypted_token', JSON.stringify(encrypted));
                activeGitHubToken = token;

                if (loginModal) loginModal.style.display = 'none';
                await loadPortalConfigFromGitHub();
            } catch (err) {
                if (errorDiv) {
                    errorDiv.textContent = err.message;
                    errorDiv.style.display = 'block';
                }
            } finally {
                btnSetupSave.disabled = false;
                btnSetupSave.textContent = 'Войти в студию';
            }
        });
    }

    // Login Unlock
    const btnLoginUnlock = document.getElementById('btn-login-unlock');
    const loginPassInput = document.getElementById('login-password');
    if (btnLoginUnlock && loginPassInput) {
        const doUnlock = async () => {
            const pass = loginPassInput.value.trim();
            const errorDiv = document.getElementById('login-error');
            if (!pass) return;

            try {
                btnLoginUnlock.disabled = true;
                btnLoginUnlock.textContent = 'Расшифровка...';

                const encryptedPayload = JSON.parse(localStorage.getItem('tvshop_encrypted_token'));
                const token = await decryptToken(encryptedPayload, pass);
                activeGitHubToken = token;

                if (loginModal) loginModal.style.display = 'none';
                await loadPortalConfigFromGitHub();
            } catch (err) {
                if (errorDiv) {
                    errorDiv.textContent = 'Неверный мастер-пароль!';
                    errorDiv.style.display = 'block';
                }
            } finally {
                btnLoginUnlock.disabled = false;
                btnLoginUnlock.textContent = 'Разблокировать';
            }
        };

        btnLoginUnlock.addEventListener('click', doUnlock);
        loginPassInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doUnlock();
        });
    }

    // Reset Token Key
    const btnResetKey = document.getElementById('btn-reset-key');
    const btnLogout = document.getElementById('btn-logout');

    const resetTokenFlow = () => {
        if (confirm("Сбросить сохранённый ключ GitHub и ввести новый?")) {
            localStorage.removeItem('tvshop_encrypted_token');
            activeGitHubToken = null;
            if (setupView) setupView.style.display = 'block';
            if (existingView) existingView.style.display = 'none';
            if (loginModal) loginModal.style.display = 'flex';
        }
    };

    if (btnResetKey) btnResetKey.addEventListener('click', resetTokenFlow);
    if (btnLogout) btnLogout.addEventListener('click', resetTokenFlow);
});
