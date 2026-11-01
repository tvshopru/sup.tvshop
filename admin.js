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
            text: data.text || data.title || data.label || '',
            link: data.link || data.url || '',
            style: data.style || 'primary'
        };
        this.api = api;
        this.readOnly = readOnly;
        this.wrapper = null;
        this.styleButtons = [];
    }

    render() {
        this.wrapper = document.createElement('div');
        this.wrapper.classList.add('ed-link-btn-block');

        const header = document.createElement('div');
        header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase;';
        header.innerHTML = '<span>🔘 Кнопка действия (CTA / Ссылка)</span>';
        this.wrapper.appendChild(header);

        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;';

        // Button Text
        const textGroup = document.createElement('div');
        const textLabel = document.createElement('label');
        textLabel.style.cssText = 'display:block; font-size:12px; font-weight:700; margin-bottom:4px;';
        textLabel.textContent = 'Текст на кнопке';
        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.placeholder = 'Например: Скачать APK';
        textInput.value = this.data.text;
        textInput.style.cssText = 'width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:13px; font-weight:600; outline:none; background:#ffffff; color:#0f172a;';
        textInput.addEventListener('input', (e) => {
            this.data.text = e.target.value;
            this.updatePreview();
        });
        textGroup.appendChild(textLabel);
        textGroup.appendChild(textInput);
        grid.appendChild(textGroup);

        // Button Link
        const linkGroup = document.createElement('div');
        const linkLabel = document.createElement('label');
        linkLabel.style.cssText = 'display:block; font-size:12px; font-weight:700; margin-bottom:4px;';
        linkLabel.textContent = 'Ссылка (URL или статья)';
        const linkInput = document.createElement('input');
        linkInput.type = 'text';
        linkInput.placeholder = 'https://...';
        linkInput.value = this.data.link;
        linkInput.style.cssText = 'width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:13px; outline:none; background:#ffffff; color:#0f172a;';
        linkInput.addEventListener('input', (e) => {
            this.data.link = e.target.value;
            this.updatePreview();
        });
        linkGroup.appendChild(linkLabel);
        linkGroup.appendChild(linkInput);
        grid.appendChild(linkGroup);

        this.wrapper.appendChild(grid);

        // Quick Presets
        const presetsRow = document.createElement('div');
        presetsRow.style.cssText = 'display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:12px; font-size:11px;';

        const tgBtn = document.createElement('button');
        tgBtn.type = 'button';
        tgBtn.style.cssText = 'background:#e0f2fe; color:#0284c7; border:1px solid #bae6fd; border-radius:6px; padding:4px 8px; font-size:11px; font-weight:700; cursor:pointer;';
        tgBtn.textContent = '✈️ @android_tv_shop';
        tgBtn.addEventListener('click', () => {
            this.data.link = 'https://t.me/android_tv_shop';
            linkInput.value = this.data.link;
            if (!this.data.text) {
                this.data.text = 'Канал TV SHOP в Telegram';
                textInput.value = this.data.text;
            }
            this.setStyle('telegram');
        });
        presetsRow.appendChild(tgBtn);

        const tgSupBtn = document.createElement('button');
        tgSupBtn.type = 'button';
        tgSupBtn.style.cssText = 'background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; border-radius:6px; padding:4px 8px; font-size:11px; font-weight:700; cursor:pointer;';
        tgSupBtn.textContent = '💬 Поддержка @VladOpl';
        tgSupBtn.addEventListener('click', () => {
            this.data.link = 'https://t.me/VladOpl';
            linkInput.value = this.data.link;
            if (!this.data.text) {
                this.data.text = 'Написать в техподдержку';
                textInput.value = this.data.text;
            }
            this.setStyle('telegram');
        });
        presetsRow.appendChild(tgSupBtn);
        this.wrapper.appendChild(presetsRow);

        // Style selector
        const styleRow = document.createElement('div');
        styleRow.style.cssText = 'display:flex; align-items:center; gap:6px; margin-bottom:12px; flex-wrap:wrap;';
        
        const styles = [
            { key: 'primary', label: '🔵 Синяя' },
            { key: 'success', label: '🟢 Зелёная (Скачать)' },
            { key: 'telegram', label: '✈️ Telegram' },
            { key: 'amber', label: '🟠 Янтарная' },
            { key: 'outline', label: '⚪ Контурная' }
        ];

        this.styleButtons = [];
        styles.forEach(st => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.style = st.key;
            const isSel = this.data.style === st.key;
            btn.style.cssText = `padding:4px 9px; font-size:11px; font-weight:700; border-radius:14px; border:1px solid ${isSel ? '#0f172a' : '#cbd5e1'}; background:${isSel ? '#0f172a' : '#ffffff'}; color:${isSel ? '#ffffff' : '#475569'}; cursor:pointer;`;
            btn.textContent = st.label;
            btn.addEventListener('click', () => this.setStyle(st.key));
            this.styleButtons.push(btn);
            styleRow.appendChild(btn);
        });
        this.wrapper.appendChild(styleRow);

        // Preview box
        const previewBox = document.createElement('div');
        previewBox.style.cssText = 'padding:12px; background:#ffffff; border:1px dashed #cbd5e1; border-radius:8px; text-align:center;';
        this.previewBox = previewBox;
        this.wrapper.appendChild(previewBox);

        this.updatePreview();
        return this.wrapper;
    }

    setStyle(styleKey) {
        this.data.style = styleKey;
        this.styleButtons.forEach(btn => {
            const isSel = btn.dataset.style === styleKey;
            btn.style.border = isSel ? '1px solid #0f172a' : '1px solid #cbd5e1';
            btn.style.background = isSel ? '#0f172a' : '#ffffff';
            btn.style.color = isSel ? '#ffffff' : '#475569';
        });
        this.updatePreview();
    }

    updatePreview() {
        if (!this.previewBox) return;
        const text = this.data.text.trim() || 'Текст кнопки';
        const style = this.data.style || 'primary';
        this.previewBox.innerHTML = `
            <div style="font-size:11px; color:#94a3b8; font-weight:600; margin-bottom:6px;">Предпросмотр:</div>
            <div class="article-btn-wrapper" style="margin:0;">
                <span class="article-btn-cta btn-${style}"><span>${escapeHtml(text)}</span></span>
            </div>
        `;
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
                    toggler: { "Click to tune": "Настройки блока", "or drag to move": "Перетащить" }
                },
                inlineToolbar: { converter: { "Convert to": "Преобразовать в" } },
                toolbar: {
                    toolbox: { "Add": "Добавить блок", "Filter": "Поиск...", "Nothing found": "Ничего не найдено" }
                }
            },
            toolNames: {
                "Text": "Обычный текст",
                "Heading": "Заголовок",
                "List": "Список",
                "Warning": "Важно",
                "Quote": "Цитата",
                "Delimiter": "Разделитель",
                "Table": "Таблица",
                "Image": "Изображение",
                "Link": "Ссылка",
                "Bold": "Жирный",
                "Italic": "Курсив"
            }
        }
    };

    let dataToLoad = {};
    if (initialData && Array.isArray(initialData.blocks) && initialData.blocks.length > 0) {
        dataToLoad = initialData;
    } else if (initialData && typeof initialData === 'string' && initialData.trim()) {
        if (window.ArticleRenderer && typeof window.ArticleRenderer.parseHtmlToBlocks === 'function') {
            dataToLoad = window.ArticleRenderer.parseHtmlToBlocks(initialData);
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

    if (titleEl) titleEl.value = art.title || '';
    if (dateEl) dateEl.value = art.date || '';
    if (catEl) catEl.value = art.category || '';
    if (vidEl) vidEl.value = art.videoUrl || '';
    if (statusEl) statusEl.value = art.status || 'published';

    const artUrl = `articles/${encodeURIComponent(art.id)}.html`;
    if (linkText) linkText.textContent = artUrl;
    if (openTabBtn) openTabBtn.href = artUrl;

    // Load blocks in editor
    initEditorJS(art.contentData || art.contentHtml || null);

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

    listEl.innerHTML = filtered.map(({ art, idx }) => {
        const isAct = idx === activeArticleIdx;
        const isDraft = art.status === 'draft';
        const statusBadge = isDraft 
            ? `<span class="badge-status draft">🟡 Черновик</span>`
            : `<span class="badge-status published">🟢 Опубл.</span>`;
        const catBadge = art.category ? `<span class="item-category">${escapeHtml(art.category)}</span>` : '';
        const title = escapeHtml(art.title || 'Без названия');
        const date = escapeHtml(art.date || '');

        return `
            <div class="article-item ${isAct ? 'active' : ''}" data-idx="${idx}">
                <div class="item-title">${title}</div>
                <div class="item-meta">
                    ${statusBadge}
                    ${catBadge}
                    <span>${date}</span>
                </div>
            </div>
        `;
    }).join('');

    // Click handler on cards
    listEl.querySelectorAll('.article-item').forEach(el => {
        el.addEventListener('click', async () => {
            const idx = parseInt(el.dataset.idx, 10);
            if (idx === activeArticleIdx) return;
            await syncArticleEditorData();
            selectArticle(idx);
        });
    });
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

// ==========================================================================
// 9. Auth & Initialization
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
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

    // Real-time Title & Status change sync
    const titleInput = document.getElementById('article-title-input');
    if (titleInput) {
        titleInput.addEventListener('input', () => {
            if (portalConfig.articles && portalConfig.articles[activeArticleIdx]) {
                portalConfig.articles[activeArticleIdx].title = titleInput.value.trim();
                const activeCard = document.querySelector(`.article-item[data-idx="${activeArticleIdx}"] .item-title`);
                if (activeCard) activeCard.textContent = titleInput.value.trim() || 'Без названия';
            }
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
