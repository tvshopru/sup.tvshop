let portalConfig = {};
let activeInstIdx = 0;
let activeArticleIdx = 0;

// Setup global jQuery AJAX settings to include the PIN header
$.ajaxSetup({
    beforeSend: function(xhr) {
        xhr.setRequestHeader('X-Admin-Pin', localStorage.getItem('portal_pin') || '');
    }
});

// Intercept global AJAX unauthorized errors
$(document).ajaxError(function(event, xhr, settings) {
    if (xhr.status === 401) {
        localStorage.removeItem('portal_pin');
        showLoginOverlay();
    }
});

$(document).ready(function() {
    // Tab Pane Swapping
    $('.menu-item').on('click', function() {
        $('.menu-item').removeClass('active');
        $(this).addClass('active');
        const paneId = $(this).attr('data-pane');
        $('.pane').removeClass('active');
        $('#' + paneId).addClass('active');
    });

    // Check for saved PIN in localStorage
    const savedPin = localStorage.getItem('portal_pin');
    if (savedPin) {
        testPinAndInit(savedPin);
    } else {
        showLoginOverlay();
    }

    // Login Submission Handlers
    $('#btn-login-submit').on('click', submitLogin);
    $('#login-pin-input').on('keypress', function(e) {
        if (e.which === 13) {
            submitLogin();
        }
    });

    // Sidebar toggle handler
    $('#btn-toggle-sidebar').on('click', function() {
        $('#manager-sidebar').toggleClass('collapsed');
        const isCollapsed = $('#manager-sidebar').hasClass('collapsed');
        localStorage.setItem('sidebar_collapsed', isCollapsed ? '1' : '0');
    });

    if (localStorage.getItem('sidebar_collapsed') === '1') {
        $('#manager-sidebar').addClass('collapsed');
    }

    // Save & Deploy Button Handler
    $('#btn-save-deploy').on('click', saveAndDeploy);

    // Reset Button Handler
    $('#btn-reset').on('click', function() {
        if (confirm('Сбросить все несохраненные изменения? Текущие данные будут перезагружены с диска.')) {
            loadConfig();
        }
    });

    // Add News Item
    $('#btn-add-news').on('click', function() {
        gatherValues();
        if (!portalConfig.news) portalConfig.news = [];
        
        let nextIdx = 0;
        portalConfig.news.forEach(n => {
            let nIdx = parseInt(n.id.replace('news-', ''));
            if (nIdx >= nextIdx) nextIdx = nIdx + 1;
        });

        const today = new Date();
        const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
        const dateStr = today.getDate() + ' ' + months[today.getMonth()] + ' ' + today.getFullYear();

        portalConfig.news.unshift({
            id: 'news-' + nextIdx,
            date: dateStr,
            title: 'Заголовок новости',
            desc: 'Текст новости...'
        });
        renderNews();
    });

    // Add Product Item
    $('#btn-add-product').on('click', function() {
        gatherValues();
        if (!portalConfig.products) portalConfig.products = [];
        
        portalConfig.products.push({
            id: 'prod-' + new Date().getTime(),
            title: 'Новый ТВ-бокс/Товар',
            price: '5 000 руб.',
            available: 'В наличии',
            condition: 'Новое',
            desc: 'Характеристики и описание товара...',
            imageUrl: 'app_logo.png?v=2'
        });
        renderProducts();
    });

    // Add Article (Telegram format)
    $('#btn-add-article').on('click', function() {
        createNewBlankArticle();
    });

    // Paste New Article directly from Clipboard
    $('#btn-paste-clipboard-article').on('click', function() {
        pasteArticleFromClipboard(true);
    });

    // Add Instruction Guide
    $('#btn-add-inst').on('click', function() {
        gatherValues();
        if (!portalConfig.instructions) portalConfig.instructions = [];
        
        const nextIdx = portalConfig.instructions.length;
        portalConfig.instructions.push({
            id: 'inst-' + new Date().getTime(),
            title: 'Инструкция по настройке',
            type: 'steps',
            videoUrl: '',
            steps: [
                {
                    id: 'step-0',
                    title: 'Шаг 1: Подключение',
                    text: 'Текст первого шага...',
                    imageUrl: 'app_logo.png'
                }
            ]
        });
        renderInstructionsList();
        selectInstruction(nextIdx);
    });

    initTelegramEditorEvents();
    initTelegramPasteModal();
});

// Helper to make any image text input uploadable via file dialog or copy-paste (Ctrl+V)
function makeImageUploadable(inputElements) {
    inputElements.each(function() {
        const input = $(this);
        if (input.parent('.image-upload-wrapper').length) return; // Already wrapped

        const wrapper = $('<div class="image-upload-wrapper" style="display:flex; gap:10px; align-items:center; width:100%;"></div>');
        input.wrap(wrapper);

        const editBtn = $(
            '<button type="button" class="btn btn-secondary btn-edit-annotator" style="padding: 10px 14px; font-size: 1em; flex-shrink: 0; line-height: 1;" title="Выделить кнопку / нарисовать рамку на скриншоте">' +
                '✏️ Выделить' +
            '</button>'
        );
        const uploadBtn = $(
            '<button type="button" class="btn btn-secondary" style="padding: 10px 15px; font-size: 1.1em; flex-shrink: 0; line-height: 1;" title="Выбрать файл или вставить из буфера (Ctrl+V)">' +
                '📁' +
            '</button>'
        );
        const fileInput = $('<input type="file" accept="image/*" style="display:none;">');

        input.after(fileInput);
        input.after(uploadBtn);
        input.after(editBtn);

        // Edit/Annotate Button Handler
        editBtn.on('click', function() {
            const imgPath = input.val().trim();
            if (!imgPath) {
                showToast("Сначала укажите или загрузите изображение шага!", "error");
                return;
            }
            openAnnotatorModal(imgPath, input);
        });

        // Click handler to open file selector
        uploadBtn.on('click', function() {
            fileInput.click();
        });

        // File selection handler
        fileInput.on('change', function() {
            const file = this.files[0];
            if (file) {
                uploadImageFile(file, input);
            }
        });

        // Paste clipboard handler (Ctrl+V)
        input.on('paste', function(e) {
            const clipboardData = e.clipboardData || e.originalEvent.clipboardData;
            if (!clipboardData) return;
            const items = clipboardData.items;
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.kind === 'file' && item.type.indexOf('image') !== -1) {
                    const file = item.getAsFile();
                    uploadImageFile(file, input);
                    e.preventDefault();
                    break;
                }
            }
        });
    });
}

// Upload file to FastAPI backend
function uploadImageFile(file, targetInput) {
    const formData = new FormData();
    formData.append('file', file);

    showToast("Загрузка изображения на сервер...", "info");
    appendLog("Отправка файла: " + (file.name || "изображение_буфера.png") + " (" + file.size + " байт)...");

    $.ajax({
        url: '/api/upload',
        type: 'POST',
        data: formData,
        processData: false,
        contentType: false,
        success: function(response) {
            targetInput.val(response.path).trigger('change').trigger('input');
            showToast("Изображение успешно загружено!", "success");
            appendLog("Изображение загружено и сохранено по пути: " + response.path);
            gatherValues();
        },
        error: function(xhr) {
            showToast("Ошибка при загрузке изображения!", "error");
            appendLog("Ошибка загрузки файла на сервер: " + xhr.responseText);
        }
    });
}

// Validate client entered PIN
function submitLogin() {
    const pin = $('#login-pin-input').val().trim();
    if (!pin) return;

    $.ajax({
        url: '/api/verify',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ pin: pin }),
        success: function() {
            localStorage.setItem('portal_pin', pin);
            $('#login-overlay').fadeOut(200);
            $('#login-error-msg').hide();
            startSseLogs();
            loadConfig();
        },
        error: function() {
            $('#login-error-msg').fadeIn(150);
            $('#login-pin-input').val('').focus();
        }
    });
}

// Test saved PIN on app load
function testPinAndInit(pin) {
    $.ajax({
        url: '/api/verify',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ pin: pin }),
        success: function() {
            $('#login-overlay').hide();
            startSseLogs();
            loadConfig();
        },
        error: function() {
            localStorage.removeItem('portal_pin');
            showLoginOverlay();
        }
    });
}

function showLoginOverlay() {
    $('#login-overlay').fadeIn(200);
    $('#login-pin-input').val('').focus();
}

// Load configuration from API
function loadConfig() {
    appendLog("Запрос конфигурации портала...");
    $.ajax({
        url: '/api/config',
        type: 'GET',
        success: function(data) {
            portalConfig = data;
            populateForm();
            appendLog("Конфигурация успешно загружена.");
            showToast("Конфигурация загружена с сервера", "success");
        },
        error: function(xhr) {
            appendLog("Ошибка загрузки конфигурации: " + xhr.responseText);
            showToast("Не удалось загрузить config.json", "error");
        }
    });
}

// Populate forms with loaded data
function populateForm() {
    $('#input-support-text').val(portalConfig.supportText || '');
    $('#input-support-tg').val(portalConfig.supportTg || '');
    $('#input-support-max').val(portalConfig.supportMax || '');
    $('#input-support-qr').val(portalConfig.supportQrUrl || '');
    $('#input-onesignal-appid').val(portalConfig.oneSignalAppId || '');
    $('#input-admin-pin').val(localStorage.getItem('portal_pin') || '');

    const promo = portalConfig.promo || { badge: '', title: '', text: '', actionText: '', imageUrl: '' };
    $('#input-promo-badge').val(promo.badge || '');
    $('#input-promo-title').val(promo.title || '');
    $('#input-promo-text').val(promo.text || '');
    $('#input-promo-action').val(promo.actionText || '');
    $('#input-promo-image').val(promo.imageUrl || '');

    // Bind uploaders to static fields
    makeImageUploadable($('#input-support-qr'));
    makeImageUploadable($('#input-promo-image'));

    renderNews();
    renderProducts();
    renderArticlesList();
    if (portalConfig.articles && portalConfig.articles.length > 0) {
        selectArticle(0);
    }
    renderInstructionsList();
    selectInstruction(0);
}

// Gather all input fields into portalConfig JSON
function gatherValues() {
    portalConfig.supportText = $('#input-support-text').val();
    portalConfig.supportTg = $('#input-support-tg').val();
    portalConfig.supportMax = $('#input-support-max').val();
    portalConfig.supportQrUrl = $('#input-support-qr').val();
    portalConfig.oneSignalAppId = $('#input-onesignal-appid').val();

    if (!portalConfig.promo) portalConfig.promo = {};
    portalConfig.promo.badge = $('#input-promo-badge').val();
    portalConfig.promo.title = $('#input-promo-title').val();
    portalConfig.promo.text = $('#input-promo-text').val();
    portalConfig.promo.actionText = $('#input-promo-action').val();
    portalConfig.promo.imageUrl = $('#input-promo-image').val();

    // Gather news fields
    $('.news-editor-card').each(function() {
        const idx = parseInt($(this).attr('data-index'));
        if (portalConfig.news && portalConfig.news[idx]) {
            portalConfig.news[idx].date = $(this).find('.news-date-in').val();
            portalConfig.news[idx].title = $(this).find('.news-title-in').val();
            portalConfig.news[idx].desc = $(this).find('.news-desc-tx').val();
        }
    });

    // Gather products fields
    $('.product-editor-card').each(function() {
        const idx = parseInt($(this).attr('data-index'));
        if (portalConfig.products && portalConfig.products[idx]) {
            portalConfig.products[idx].title = $(this).find('.prod-title-in').val();
            portalConfig.products[idx].price = $(this).find('.prod-price-in').val();
            portalConfig.products[idx].available = $(this).find('.prod-avail-in').val();
            portalConfig.products[idx].condition = $(this).find('.prod-cond-sl').val();
            portalConfig.products[idx].imageUrl = $(this).find('.prod-img-in').val();
            portalConfig.products[idx].desc = $(this).find('.prod-desc-tx').val();
        }
    });

    // Gather current article settings if visible
    if (portalConfig.articles && portalConfig.articles[activeArticleIdx]) {
        const art = portalConfig.articles[activeArticleIdx];
        art.title = $('#input-art-title').val() || art.title;
        art.date = $('#input-art-date').val() || art.date;
        art.videoUrl = $('#input-art-video').val().trim();
        art.status = $('#select-art-status').val() || 'published';
        art.category = $('#input-art-category').val().trim();
    }

    // Gather current instruction settings if visible
    if (portalConfig.instructions && portalConfig.instructions[activeInstIdx]) {
        const inst = portalConfig.instructions[activeInstIdx];
        inst.title = $('#input-inst-title').val();
        inst.type = $('#select-inst-type').val();
        inst.videoUrl = $('#input-inst-video').val().trim();

        // Gather steps
        $('.step-editor-card').each(function() {
            const stepIdx = parseInt($(this).attr('data-step-index'));
            if (inst.steps && inst.steps[stepIdx]) {
                inst.steps[stepIdx].title = $(this).find('.step-title-in').val();
                inst.steps[stepIdx].imageUrl = $(this).find('.step-img-in').val();
                inst.steps[stepIdx].text = $(this).find('.step-text-tx').val();
            }
        });
    }
}

let articleFilterStatus = 'all';
let articleSearchQuery = '';

// Render Articles Sidebar list with search, status filtering and draft badges
function renderArticlesList() {
    const list = $('#articles-sidebar-list');
    list.empty();
    const articles = portalConfig.articles || [];

    // Calculate article counts
    let totalCount = articles.length;
    let pubCount = 0;
    let draftCount = 0;

    articles.forEach(art => {
        const isDraft = art.status === 'draft' || art.isDraft === true || art.draft === true;
        if (isDraft) draftCount++;
        else pubCount++;
    });

    $('#count-art-all').text(totalCount);
    $('#count-art-pub').text(pubCount);
    $('#count-art-draft').text(draftCount);

    // Filter articles based on search query and status tab
    const query = articleSearchQuery.toLowerCase().trim();
    const filteredArticles = [];

    articles.forEach((art, originalIdx) => {
        const isDraft = art.status === 'draft' || art.isDraft === true || art.draft === true;
        
        // Status filter
        if (articleFilterStatus === 'published' && isDraft) return;
        if (articleFilterStatus === 'draft' && !isDraft) return;

        // Search query filter
        if (query) {
            const title = (art.title || '').toLowerCase();
            const cat = (art.category || '').toLowerCase();
            const date = (art.date || '').toLowerCase();
            const rawHtml = (art.contentHtml || '').toLowerCase();
            if (!title.includes(query) && !cat.includes(query) && !date.includes(query) && !rawHtml.includes(query)) {
                return;
            }
        }

        filteredArticles.push({ art: art, originalIdx: originalIdx });
    });

    if (filteredArticles.length === 0) {
        list.append('<div style="text-align:center; padding:24px 12px; color:var(--text-muted); font-size:0.88em;">Ничего не найдено</div>');
    } else {
        filteredArticles.forEach(item => {
            const art = item.art;
            const idx = item.originalIdx;
            const activeClass = idx === activeArticleIdx ? 'active' : '';
            const isDraft = art.status === 'draft' || art.isDraft === true || art.draft === true;
            const statusBadge = isDraft ? '<span class="badge-draft-sidebar">Черновик</span>' : '';
            const catBadge = art.category ? `<span class="badge-category-tag" style="margin-left:4px; font-size:0.7em;">${escapeHtml(art.category)}</span>` : '';

            const row = $(`
                <div class="inst-item-row ${activeClass}" data-art-index="${idx}">
                    <div class="inst-item-row-header">
                        <span class="inst-item-row-title">${statusBadge}${escapeHtml(art.title || 'Без названия')}</span>
                        <div class="inst-row-controls">
                            <button class="btn-icon btn-art-up" data-art-index="${idx}" title="Вверх">↑</button>
                            <button class="btn-icon btn-art-down" data-art-index="${idx}" title="Вниз">↓</button>
                            <button class="btn-icon btn-icon-danger btn-art-delete" data-art-index="${idx}" title="Удалить">×</button>
                        </div>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:2px;">
                        <span class="inst-item-row-sub">${escapeHtml(art.date || 'Сегодня')}</span>
                        ${catBadge}
                    </div>
                </div>
            `);
            list.append(row);
        });
    }

    // Bind article sidebar row clicks
    $('.inst-item-row[data-art-index]').off('click').on('click', function(e) {
        if ($(e.target).closest('button').length) return;
        const idx = parseInt($(this).attr('data-art-index'));
        gatherValues();
        selectArticle(idx);
    });

    // Article Up/Down/Delete Actions
    $('.btn-art-up').off('click').on('click', function(e) {
        e.stopPropagation();
        const idx = parseInt($(this).attr('data-art-index'));
        if (idx > 0) {
            gatherValues();
            const temp = portalConfig.articles[idx];
            portalConfig.articles[idx] = portalConfig.articles[idx - 1];
            portalConfig.articles[idx - 1] = temp;
            activeArticleIdx = idx - 1;
            renderArticlesList();
            selectArticle(activeArticleIdx);
        }
    });

    $('.btn-art-down').off('click').on('click', function(e) {
        e.stopPropagation();
        const idx = parseInt($(this).attr('data-art-index'));
        if (idx < portalConfig.articles.length - 1) {
            gatherValues();
            const temp = portalConfig.articles[idx];
            portalConfig.articles[idx] = portalConfig.articles[idx + 1];
            portalConfig.articles[idx + 1] = temp;
            activeArticleIdx = idx + 1;
            renderArticlesList();
            selectArticle(activeArticleIdx);
        }
    });

    $('.btn-art-delete').off('click').on('click', function(e) {
        e.stopPropagation();
        const idx = parseInt($(this).attr('data-art-index'));
        if (confirm(`Удалить статью "${portalConfig.articles[idx].title}"?`)) {
            gatherValues();
            portalConfig.articles.splice(idx, 1);
            activeArticleIdx = 0;
            renderArticlesList();
            if (portalConfig.articles.length > 0) {
                selectArticle(0);
            } else {
                $('#article-editor-panel').hide();
                $('#article-meta-sidebar').hide();
            }
        }
    });
}

// ==========================================================================
// Editor.js Custom Inline Tool: TV Remote Key Badge (<kbd class="tv-remote-key">)
// ==========================================================================
class RemoteKeyInlineTool {
    static get isInline() { return true; }
    static get title() { return 'Пульт [OK]'; }
    static get sanitize() {
        return {
            kbd: {
                class: 'tv-remote-key'
            }
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
        this.button.innerHTML = '<span style="font-weight:800; font-size:11px; padding:1px 5px; background:#1e293b; color:#fff; border-radius:3px; line-height:1; display:inline-block;">[OK]</span>';
        return this.button;
    }

    surround(range) {
        if (!range) return;
        const parentTag = this.api.selection.findParentTag(this.tag, this.cssClass);
        if (parentTag) {
            this.unwrap(parentTag);
        } else {
            this.wrap(range);
        }
    }

    wrap(range) {
        const kbd = document.createElement(this.tag);
        kbd.classList.add(this.cssClass);
        const fragment = range.extractContents();
        if (!fragment.textContent.trim()) {
            kbd.textContent = 'OK';
        } else {
            kbd.appendChild(fragment);
        }
        range.insertNode(kbd);
        this.api.selection.expandToTag(kbd);
    }

    unwrap(tag) {
        this.api.selection.expandToTag(tag);
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        const content = range.extractContents();
        if (tag.parentNode) {
            tag.parentNode.removeChild(tag);
        }
        range.insertNode(content);
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

// ==========================================================================
// Editor.js Instance and Management
// ==========================================================================
let editorInstance = null;
let isEditorReady = false;
let undoInstance = null;

// HTML to Editor.js Blocks Converter
function htmlToEditorData(html) {
    if (!html || !html.trim()) {
        return { time: Date.now(), blocks: [{ type: 'paragraph', data: { text: '' } }] };
    }

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html.trim();
    const blocks = [];

    function processNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent.trim();
            if (text) {
                blocks.push({ type: 'paragraph', data: { text: escapeHtml(text) } });
            }
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;

        const tag = node.tagName.toLowerCase();

        // Headers
        if (/^h[1-6]$/.test(tag)) {
            const level = parseInt(tag.charAt(1), 10);
            blocks.push({
                type: 'header',
                data: {
                    text: node.innerHTML.trim(),
                    level: Math.min(Math.max(level, 2), 4)
                }
            });
            return;
        }

        // Lists
        if (tag === 'ol' || tag === 'ul') {
            const style = tag === 'ol' ? 'ordered' : 'unordered';
            const items = [];
            Array.from(node.children).forEach(child => {
                if (child.tagName.toLowerCase() === 'li') {
                    items.push(child.innerHTML.trim());
                }
            });
            if (items.length > 0) {
                blocks.push({
                    type: 'list',
                    data: {
                        style: style,
                        items: items
                    }
                });
            }
            return;
        }

        // Image Figures or Direct IMG
        if (tag === 'img' || node.classList.contains('article-image-figure') || tag === 'figure') {
            const imgEl = tag === 'img' ? node : node.querySelector('img');
            if (imgEl && imgEl.getAttribute('src')) {
                const captionEl = node.querySelector('.article-image-caption') || node.querySelector('figcaption');
                const captionText = captionEl ? captionEl.innerHTML.trim() : (imgEl.getAttribute('alt') || '');
                blocks.push({
                    type: 'image',
                    data: {
                        file: { url: imgEl.getAttribute('src') },
                        caption: captionText,
                        withBorder: node.classList.contains('img-bordered') || false,
                        stretched: node.classList.contains('img-stretched') || false,
                        withBackground: false
                    }
                });
            }
            return;
        }

        // Quotes / Blockquotes
        if (tag === 'blockquote') {
            const citeEl = node.querySelector('cite');
            const citeText = citeEl ? citeEl.innerHTML.trim() : '';
            if (citeEl) citeEl.remove();
            blocks.push({
                type: 'quote',
                data: {
                    text: node.innerHTML.trim(),
                    caption: citeText,
                    alignment: 'left'
                }
            });
            return;
        }

        // Warnings / Highlights
        if (node.classList.contains('tg-highlight-box') || node.classList.contains('cdx-warning')) {
            const titleEl = node.querySelector('b') || node.querySelector('strong') || node.querySelector('.cdx-warning__title');
            const titleText = titleEl ? titleEl.innerHTML.trim() : 'Важно';
            if (titleEl) titleEl.remove();
            blocks.push({
                type: 'warning',
                data: {
                    title: titleText,
                    message: node.innerHTML.trim()
                }
            });
            return;
        }

        // Video Embeds
        if (tag === 'iframe' || node.querySelector('iframe')) {
            const iframe = tag === 'iframe' ? node : node.querySelector('iframe');
            if (iframe && iframe.getAttribute('src')) {
                const src = iframe.getAttribute('src');
                blocks.push({
                    type: 'embed',
                    data: {
                        service: src.includes('rutube') ? 'rutube' : 'youtube',
                        source: src,
                        embed: src,
                        width: 580,
                        height: 320,
                        caption: ''
                    }
                });
            }
            return;
        }

        // Tables
        if (tag === 'table' || node.querySelector('table')) {
            const tbl = tag === 'table' ? node : node.querySelector('table');
            const rows = Array.from(tbl.querySelectorAll('tr')).map(tr => {
                return Array.from(tr.querySelectorAll('th, td')).map(cell => cell.innerHTML.trim());
            });
            if (rows.length > 0) {
                const withHeadings = tbl.querySelector('th') !== null;
                blocks.push({
                    type: 'table',
                    data: {
                        withHeadings: withHeadings,
                        content: rows
                    }
                });
            }
            return;
        }

        // Delimiter / HR
        if (tag === 'hr') {
            blocks.push({ type: 'delimiter', data: {} });
            return;
        }

        // Paragraphs or default containers
        if (tag === 'p') {
            const pContent = node.innerHTML.trim();
            if (pContent) {
                // If it contains only an image, extract as image
                const innerImg = node.querySelector('img');
                if (innerImg && node.children.length === 1 && !node.textContent.trim()) {
                    blocks.push({
                        type: 'image',
                        data: {
                            file: { url: innerImg.getAttribute('src') },
                            caption: innerImg.getAttribute('alt') || '',
                            withBorder: false,
                            stretched: false,
                            withBackground: false
                        }
                    });
                } else {
                    blocks.push({ type: 'paragraph', data: { text: pContent } });
                }
            }
            return;
        }

        // Fallback for divs with children
        if (node.children.length > 0) {
            Array.from(node.children).forEach(processNode);
        } else {
            const txt = node.innerHTML.trim();
            if (txt) {
                blocks.push({ type: 'paragraph', data: { text: txt } });
            }
        }
    }

    Array.from(tempDiv.children).forEach(processNode);

    if (blocks.length === 0) {
        const fullText = tempDiv.innerHTML.trim();
        if (fullText) {
            blocks.push({ type: 'paragraph', data: { text: fullText } });
        } else {
            blocks.push({ type: 'paragraph', data: { text: '' } });
        }
    }

    return { time: Date.now(), blocks: blocks };
}

// Editor.js Blocks to Clean HTML Converter
function editorDataToHtml(data) {
    if (!data || !data.blocks || !Array.isArray(data.blocks)) return '';

    let runningOrderedIndex = 1;

    return data.blocks.map(block => {
        const type = block.type;
        const d = block.data || {};

        switch (type) {
            case 'header': {
                const lvl = d.level || 2;
                return `<h${lvl}>${d.text || ''}</h${lvl}>`;
            }
            case 'paragraph': {
                return `<p>${d.text || ''}</p>`;
            }
            case 'list': {
                const isOrdered = d.style === 'ordered';
                const tag = isOrdered ? 'ol' : 'ul';
                const startAttr = isOrdered ? ` start="${runningOrderedIndex}"` : '';

                const itemsHtml = (d.items || []).map(item => {
                    const content = typeof item === 'object' ? (item.content || item.text || '') : item;
                    if (isOrdered) {
                        runningOrderedIndex++;
                    }
                    return `<li>${content}</li>`;
                }).join('');
                return `<${tag}${startAttr}>${itemsHtml}</${tag}>`;
            }
            case 'image': {
                const url = (d.file && d.file.url) || d.url || '';
                if (!url) return '';
                const caption = d.caption ? `<div class="article-image-caption">${d.caption}</div>` : '';
                const borderCls = d.withBorder ? ' img-bordered' : '';
                const stretchCls = d.stretched ? ' img-stretched' : '';
                return `<div class="article-image-figure${borderCls}${stretchCls}"><img src="${url}" alt="${d.caption || ''}" />${caption}</div>`;
            }
            case 'quote': {
                const caption = d.caption ? `<cite>${d.caption}</cite>` : '';
                return `<blockquote><p>${d.text || ''}</p>${caption}</blockquote>`;
            }
            case 'warning': {
                const title = d.title ? `<b>${d.title}</b><br>` : '';
                return `<div class="tg-highlight-box">${title}<span>${d.message || ''}</span></div>`;
            }
            case 'table': {
                const withHeadings = d.withHeadings || false;
                const rows = d.content || [];
                if (!rows.length) return '';
                const rowsHtml = rows.map((row, rIdx) => {
                    const isHeader = withHeadings && rIdx === 0;
                    const cellTag = isHeader ? 'th' : 'td';
                    const cellsHtml = row.map(cell => `<${cellTag}>${cell}</${cellTag}>`).join('');
                    return `<tr>${cellsHtml}</tr>`;
                }).join('');
                return `<div class="article-table-responsive"><table class="article-table"><tbody>${rowsHtml}</tbody></table></div>`;
            }
            case 'embed': {
                const embedSrc = d.embed || d.source || '';
                const caption = d.caption ? `<div class="article-image-caption">${d.caption}</div>` : '';
                return `<div class="article-embed-wrapper"><div class="article-embed-responsive"><iframe src="${embedSrc}" frameborder="0" allowfullscreen></iframe></div>${caption}</div>`;
            }
            case 'delimiter': {
                return '<hr />';
            }
            case 'code':
            case 'raw': {
                return `<pre><code>${escapeHtml(d.code || d.html || '')}</code></pre>`;
            }
            default: {
                if (d.text) return `<p>${d.text}</p>`;
                return '';
            }
        }
    }).filter(Boolean).join('\n');
}

// Calculate estimated reading time from Editor.js data
function updateArticleReadingTimeFromData(data) {
    const mins = window.ArticleRenderer ? ArticleRenderer.calculateReadTime(data) : 1;
    $('#tg-paper-readtime').text(`${mins} мин чтения`);
}

// Initialize Editor.js instance
function initEditorJS(initialData) {
    if (editorInstance && typeof editorInstance.destroy === 'function') {
        try {
            editorInstance.destroy();
        } catch (e) {
            console.warn("Editor destroy warning:", e);
        }
        editorInstance = null;
        isEditorReady = false;
        $('#editorjs-holder').empty();
    }

    const ListClass = window.EditorjsList || window.List;

    const editorTools = {
        header: {
            class: window.Header,
            inlineToolbar: true,
            config: {
                placeholder: 'Введите заголовок...',
                levels: [2, 3, 4],
                defaultLevel: 2
            }
        },
        list: {
            class: ListClass,
            inlineToolbar: true,
            config: {
                defaultStyle: 'unordered'
            }
        },
        image: {
            class: window.ImageTool,
            config: {
                endpoints: {
                    byFile: '/api/upload',
                    byUrl: '/api/upload'
                },
                additionalRequestHeaders: {
                    'x-admin-pin': localStorage.getItem('portal_pin') || ''
                },
                field: 'file'
            }
        },
        quote: {
            class: window.Quote,
            inlineToolbar: true,
            config: {
                quotePlaceholder: 'Введите текст подсказки или цитаты...',
                captionPlaceholder: 'Автор или пояснение (необязательно)'
            }
        },
        warning: {
            class: window.Warning,
            inlineToolbar: true,
            config: {
                titlePlaceholder: 'Заголовок предупреждения...',
                messagePlaceholder: 'Важная информация для пользователя...'
            }
        },
        table: {
            class: window.Table,
            inlineToolbar: true,
            config: {
                rows: 2,
                cols: 2
            }
        },
        embed: {
            class: window.Embed,
            config: {
                services: {
                    youtube: true,
                    rutube: true,
                    coub: true,
                    vimeo: true,
                    imgur: true
                }
            }
        },
        delimiter: {
            class: window.Delimiter
        },
        marker: {
            class: window.Marker,
            shortcut: 'CMD+SHIFT+M'
        },
        inlineCode: {
            class: window.InlineCode,
            shortcut: 'CMD+SHIFT+C'
        },
        underline: {
            class: window.Underline,
            shortcut: 'CMD+U'
        },
        remoteKey: {
            class: RemoteKeyInlineTool
        }
    };

    // Full Russian Localization Dictionary for Editor.js UI, Tools, Popovers, and Tunes
    const editorI18n = {
        messages: {
            ui: {
                blockTunes: {
                    toggler: {
                        "Click to tune": "Нажмите для настроек блока",
                        "or drag to move": "или перетащите для перемещения"
                    },
                },
                inlineToolbar: {
                    converter: {
                        "Convert to": "Преобразовать в"
                    }
                },
                toolbar: {
                    toolbox: {
                        "Add": "Добавить блок",
                        "Filter": "Поиск блока...",
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
                "Heading": "Заголовок H2/H3",
                "List": "Список",
                "Ordered List": "Нумерованный список",
                "Unordered List": "Маркированный список",
                "Checklist": "Чек-лист с галочками",
                "Warning": "Важное предупреждение",
                "Quote": "Цитата / Выноска",
                "Code": "Фрагмент кода",
                "Delimiter": "Разделитель",
                "Raw HTML": "HTML код",
                "Table": "Таблица",
                "Link": "Ссылка",
                "Marker": "Выделитель",
                "Bold": "Жирный",
                "Italic": "Курсив",
                "Underline": "Подчёркнутый",
                "InlineCode": "Код",
                "Image": "Изображение / Фото",
                "Embed": "Видео (YouTube / Rutube)",
                "Remote Key": "Кнопка пульта [OK]"
            },
            tools: {
                warning: {
                    "Title": "Заголовок",
                    "Message": "Сообщение",
                },
                link: {
                    "Add a link": "Вставить ссылку"
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
                image: {
                    "Caption": "Подпись к фото...",
                    "Select an Image": "Выберите изображение",
                    "With border": "С рамкой",
                    "Stretch image": "Растянуть на всю ширину",
                    "With background": "С фоном",
                },
                quote: {
                    "Align Left": "По левому краю",
                    "Align Center": "По центру"
                },
                list: {
                    "Ordered": "Нумерованный",
                    "Unordered": "Маркированный",
                    "Checklist": "Чек-лист"
                }
            },
            blockTunes: {
                delete: {
                    "Delete": "Удалить блок"
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

    try {
        editorInstance = new EditorJS({
            holder: 'editorjs-holder',
            placeholder: 'Нажмите Tab для выбора блока или начните вводить текст (Ctrl+V для вставки фото или постов)...',
            tools: editorTools,
            i18n: editorI18n,
            data: initialData || { blocks: [{ type: 'paragraph', data: { text: '' } }] },
            onReady: () => {
                isEditorReady = true;
                updateArticleReadingTimeFromData(initialData);
                if (window.Undo) {
                    try {
                        undoInstance = new Undo({
                            editor: editorInstance,
                            maxLength: 50,
                            shortcuts: {
                                undo: 'CMD+Z',
                                redo: 'CMD+Y'
                            }
                        });
                    } catch (e) {
                        console.warn("Undo manager init warning:", e);
                    }
                }
            },
            onChange: async () => {
                if (!isEditorReady || !editorInstance) return;
                try {
                    const savedData = await editorInstance.save();
                    updateArticleReadingTimeFromData(savedData);
                    if (portalConfig.articles && portalConfig.articles[activeArticleIdx]) {
                        portalConfig.articles[activeArticleIdx].contentData = savedData;
                        portalConfig.articles[activeArticleIdx].contentHtml = editorDataToHtml(savedData);
                    }
                } catch (err) {
                    console.error("Editor.js onChange save error:", err);
                }
            }
        });
    } catch (err) {
        console.error("Error creating EditorJS:", err);
    }
}

// Quick insertion toolbar button handlers
function initEditorToolbarActions() {
    // Undo & Redo Actions
    $('#ed-btn-undo').off('click').on('click', function(e) {
        e.preventDefault();
        if (undoInstance && typeof undoInstance.undo === 'function') {
            undoInstance.undo();
        } else {
            document.execCommand('undo');
        }
    });

    $('#ed-btn-redo').off('click').on('click', function(e) {
        e.preventDefault();
        if (undoInstance && typeof undoInstance.redo === 'function') {
            undoInstance.redo();
        } else {
            document.execCommand('redo');
        }
    });

    $('#ed-btn-add-header').off('click').on('click', function() {
        if (editorInstance && isEditorReady) {
            editorInstance.blocks.insert('header', { text: '', level: 2 });
        }
    });

    $('#ed-btn-add-image').off('click').on('click', function() {
        $('#editorjs-file-input').click();
    });

    $('#editorjs-file-input').off('change').on('change', function() {
        const file = this.files[0];
        if (file) {
            uploadEditorJsImageFile(file);
        }
        $(this).val('');
    });

    $('#ed-btn-add-list').off('click').on('click', function() {
        if (editorInstance && isEditorReady) {
            editorInstance.blocks.insert('list', { style: 'unordered', items: [''] });
        }
    });

    $('#ed-btn-add-quote').off('click').on('click', function() {
        if (editorInstance && isEditorReady) {
            editorInstance.blocks.insert('quote', { text: '', caption: '', alignment: 'left' });
        }
    });

    $('#ed-btn-add-alert').off('click').on('click', function() {
        if (editorInstance && isEditorReady) {
            editorInstance.blocks.insert('warning', { title: 'Важно', message: '' });
        }
    });

    $('#ed-btn-add-table').off('click').on('click', function() {
        if (editorInstance && isEditorReady) {
            editorInstance.blocks.insert('table', { withHeadings: true, content: [['Параметр', 'Значение'], ['', '']] });
        }
    });

    $('#ed-btn-add-video').off('click').on('click', function() {
        if (editorInstance && isEditorReady) {
            const url = prompt("Введите ссылку на видео (YouTube / Rutube):");
            if (url && url.trim()) {
                editorInstance.blocks.insert('embed', { service: 'youtube', source: url.trim(), embed: url.trim() });
            }
        }
    });

    $('#ed-btn-add-remote-key').off('click').on('click', function() {
        if (editorInstance && isEditorReady) {
            editorInstance.blocks.insert('paragraph', { text: 'Нажмите кнопку пульта <kbd class="tv-remote-key">OK</kbd>' });
        }
    });

    $('#ed-btn-add-delimiter').off('click').on('click', function() {
        if (editorInstance && isEditorReady) {
            editorInstance.blocks.insert('delimiter', {});
        }
    });
}

// Upload image file and insert into Editor.js
function uploadEditorJsImageFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    showToast("Загрузка изображения на сервер...", "info");
    appendLog("Загрузка медиа: " + (file.name || "image.png") + "...");

    $.ajax({
        url: '/api/upload',
        type: 'POST',
        data: formData,
        processData: false,
        contentType: false,
        headers: {
            'x-admin-pin': localStorage.getItem('portal_pin') || ''
        },
        success: function(response) {
            const imgUrl = response.path || (response.file && response.file.url);
            if (!imgUrl) {
                showToast("Ошибка получения пути картинки", "error");
                return;
            }
            if (editorInstance && isEditorReady) {
                editorInstance.blocks.insert('image', {
                    file: { url: imgUrl },
                    caption: '',
                    withBorder: false,
                    stretched: false,
                    withBackground: false
                });
            }
            showToast("Изображение успешно вставлено!", "success");
            appendLog("Изображение загружено: " + imgUrl);
            gatherValues();
        },
        error: function(xhr) {
            showToast("Ошибка при загрузке изображения!", "error");
            appendLog("Ошибка загрузки: " + xhr.responseText);
        }
    });
}

// Select Article item to display in Editor.js
function selectArticle(idx) {
    const articles = portalConfig.articles || [];
    if (idx < 0 || idx >= articles.length) {
        $('#article-editor-panel').hide();
        $('#article-meta-sidebar').hide();
        return;
    }

    activeArticleIdx = idx;
    $('.inst-item-row[data-art-index]').removeClass('active');
    $(`.inst-item-row[data-art-index="${idx}"]`).addClass('active');

    const art = articles[idx];
    const initialTitle = art.title || '';
    const initialDate = art.date || '';
    const initialVideo = art.videoUrl || '';
    const initialStatus = art.status || (art.isDraft ? 'draft' : 'published');
    const initialCategory = art.category || '';

    $('#input-art-title').val(initialTitle);
    $('#tg-paper-title').text(initialTitle || 'Заголовок статьи');
    $('#input-art-date').val(initialDate);
    $('#tg-paper-date').text(initialDate || 'Сегодня');
    $('#input-art-video').val(initialVideo);
    $('#select-art-status').val(initialStatus);
    $('#input-art-category').val(initialCategory);

    // Sync header draft badge and category
    if (initialStatus === 'draft') {
        $('#tg-paper-draft-badge').show();
    } else {
        $('#tg-paper-draft-badge').hide();
    }

    if (initialCategory) {
        $('#tg-paper-category-badge').text(initialCategory).show();
        $('#tg-paper-category-dot').show();
    } else {
        $('#tg-paper-category-badge').hide();
        $('#tg-paper-category-dot').hide();
    }
    
    if (initialVideo) {
        $('#tg-paper-video-badge').show();
        $('#tg-paper-video-link').attr('href', initialVideo);
    } else {
        $('#tg-paper-video-badge').hide();
    }

    // Convert existing contentHtml into Editor.js blocks
    const editorData = art.contentData || (art.blocks && art.blocks.blocks ? art.blocks : null) || (window.ArticleRenderer ? ArticleRenderer.htmlToEditorData(art.contentHtml || '') : htmlToEditorData(art.contentHtml || ''));
    initEditorJS(editorData);
    initEditorToolbarActions();

    // Direct article link
    const prodBase = "https://tvshopru.github.io/sup.tvshop";
    const artId = art.id || ('art-' + idx);
    const directUrl = `${prodBase}/article.html?id=${encodeURIComponent(artId)}`;
    $('#art-direct-link-text').text(directUrl);
    $('#btn-open-art-link').attr('href', directUrl);

    $('#btn-copy-art-link').off('click').on('click', function() {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(directUrl).then(() => {
                showToast("Ссылка на статью скопирована в буфер!", "success");
            });
        } else {
            prompt("Скопируйте ссылку:", directUrl);
        }
    });

    // Two-way sync for title / date / video / status / category
    $('#input-art-title').off('input').on('input', function() {
        const val = $(this).val();
        art.title = val;
        $('#tg-paper-title').text(val || 'Заголовок статьи');
        $(`.inst-item-row[data-art-index="${idx}"] .inst-item-row-title`).text(val || 'Без названия');
    });

    $('#tg-paper-title').off('input').on('input', function() {
        const val = $(this).text().trim();
        art.title = val;
        $('#input-art-title').val(val);
        $(`.inst-item-row[data-art-index="${idx}"] .inst-item-row-title`).text(val || 'Без названия');
    });

    $('#input-art-date').off('input').on('input', function() {
        const val = $(this).val();
        art.date = val;
        $('#tg-paper-date').text(val || 'Сегодня');
        $(`.inst-item-row[data-art-index="${idx}"] .inst-item-row-sub`).text(`Статья • ${val}`);
    });

    $('#input-art-video').off('input').on('input', function() {
        const val = $(this).val().trim();
        art.videoUrl = val;
        if (val) {
            $('#tg-paper-video-badge').show();
            $('#tg-paper-video-link').attr('href', val);
        } else {
            $('#tg-paper-video-badge').hide();
        }
    });

    $('#select-art-status').off('change').on('change', function() {
        const val = $(this).val();
        art.status = val;
        if (val === 'draft') {
            $('#tg-paper-draft-badge').show();
        } else {
            $('#tg-paper-draft-badge').hide();
        }
        renderArticlesList();
    });

    $('#input-art-category').off('input').on('input', function() {
        const val = $(this).val().trim();
        art.category = val;
        if (val) {
            $('#tg-paper-category-badge').text(val).show();
            $('#tg-paper-category-dot').show();
        } else {
            $('#tg-paper-category-badge').hide();
            $('#tg-paper-category-dot').hide();
        }
        renderArticlesList();
    });

    $('#article-editor-panel').css('display', 'flex');
    $('#article-meta-sidebar').css('display', 'flex');
}

// Duplicate an article as draft
function duplicateArticle(idx) {
    gatherValues();
    const articles = portalConfig.articles || [];
    if (idx < 0 || idx >= articles.length) return;

    const source = articles[idx];
    const copy = JSON.parse(JSON.stringify(source));
    copy.id = 'art-' + new Date().getTime();
    copy.title = (copy.title || 'Статья') + ' (Копия)';
    copy.status = 'draft'; // Duplicates default to draft for safe editing

    portalConfig.articles.splice(idx + 1, 0, copy);
    activeArticleIdx = idx + 1;
    renderArticlesList();
    selectArticle(activeArticleIdx);
    showToast("Статья успешно дублирована как черновик!", "success");
}

// Open Article Live Preview Modal
function openArticleLivePreview() {
    if (activeArticleIdx < 0 || !portalConfig.articles || !portalConfig.articles[activeArticleIdx]) {
        showToast("Сначала выберите или создайте статью!", "info");
        return;
    }

    gatherValues();
    const art = portalConfig.articles[activeArticleIdx];
    const isDraft = art.status === 'draft' || art.isDraft === true;

    // Header & Meta in Preview
    $('#prev-art-title').text(art.title || 'Заголовок статьи');
    $('#prev-art-date').text(art.date || 'Сегодня');
    $('#prev-art-readtime').text($('#tg-paper-readtime').text() || '1 мин чтения');

    if (art.category) {
        $('#prev-art-category').text(art.category).show();
        $('#prev-art-cat-dot').show();
    } else {
        $('#prev-art-category').hide();
        $('#prev-art-cat-dot').hide();
    }

    if (isDraft) {
        $('#preview-status-pill').show();
    } else {
        $('#preview-status-pill').hide();
    }

    if (art.videoUrl) {
        $('#prev-art-video-banner').show();
        $('#prev-art-video-link').attr('href', art.videoUrl);
    } else {
        $('#prev-art-video-banner').hide();
    }

    // Direct tab link button
    const prodBase = "https://tvshopru.github.io/sup.tvshop";
    const artId = art.id || ('art-' + activeArticleIdx);
    $('#btn-prev-open-tab').off('click').on('click', function() {
        window.open(`${prodBase}/article.html?id=${encodeURIComponent(artId)}`, '_blank');
    });

    // Save and render body
    if (editorInstance && isEditorReady) {
        editorInstance.save().then(savedData => {
            art.contentData = savedData;
            art.blocks = savedData;
            art.contentHtml = window.ArticleRenderer ? ArticleRenderer.render(savedData) : editorDataToHtml(savedData);
            $('#prev-art-body').html(art.contentHtml || '<p style="color:#94a3b8; font-style:italic;">Текст статьи пока пуст...</p>');
            $('#modal-article-preview').css('display', 'flex').hide().fadeIn(150);
        }).catch(() => {
            const html = window.ArticleRenderer ? ArticleRenderer.render(art) : (art.contentHtml || '');
            $('#prev-art-body').html(html || '<p style="color:#94a3b8; font-style:italic;">Текст статьи пока пуст...</p>');
            $('#modal-article-preview').css('display', 'flex').hide().fadeIn(150);
        });
    } else {
        const html = window.ArticleRenderer ? ArticleRenderer.render(art) : (art.contentHtml || '');
        $('#prev-art-body').html(html || '<p style="color:#94a3b8; font-style:italic;">Текст статьи пока пуст...</p>');
        $('#modal-article-preview').css('display', 'flex').hide().fadeIn(150);
    }
}

// Editor Toolbar Theme Toggle, Live Preview, Search & Events
function initTelegramEditorEvents() {
    // Editor Theme Toggle (Light / Dark)
    const savedEditorTheme = localStorage.getItem('tg-editor-theme') || 'light';
    if (savedEditorTheme === 'dark') {
        $('.tg-editor-wrapper, .tg-split-layout, .preview-modal-card').addClass('dark-theme');
        $('#tg-theme-name, #prev-theme-text').text('Тёмная');
        $('#tg-btn-theme-toggle span:first, #prev-theme-icon').text('🌙');
    } else {
        $('.tg-editor-wrapper, .tg-split-layout, .preview-modal-card').removeClass('dark-theme');
        $('#tg-theme-name, #prev-theme-text').text('Светлая');
        $('#tg-btn-theme-toggle span:first, #prev-theme-icon').text('☀️');
    }

    $('#tg-btn-theme-toggle').off('click').on('click', function() {
        const isDark = $('.tg-editor-wrapper').toggleClass('dark-theme').hasClass('dark-theme');
        $('.tg-split-layout, .preview-modal-card').toggleClass('dark-theme', isDark);
        localStorage.setItem('tg-editor-theme', isDark ? 'dark' : 'light');
        $('#tg-theme-name, #prev-theme-text').text(isDark ? 'Тёмная' : 'Светлая');
        $('#tg-btn-theme-toggle span:first, #prev-theme-icon').text(isDark ? '🌙' : '☀️');
    });

    // In-Editor Paste Button in toolbar
    $('#tg-btn-paste-in-editor').off('click').on('click', function() {
        pasteArticleFromClipboard(false);
    });

    // Search and Status Filters
    $('#articles-search-input').off('input').on('input', function() {
        articleSearchQuery = $(this).val();
        renderArticlesList();
    });

    $('.art-filter-btn').off('click').on('click', function() {
        $('.art-filter-btn').removeClass('active');
        $(this).addClass('active');
        articleFilterStatus = $(this).attr('data-filter') || 'all';
        renderArticlesList();
    });

    // Live Preview Buttons
    $('#tg-btn-live-preview, #btn-sidebar-preview').off('click').on('click', function() {
        openArticleLivePreview();
    });

    $('#btn-close-preview-modal').off('click').on('click', function() {
        $('#modal-article-preview').fadeOut(150);
    });

    // Device switcher in Preview Modal
    $('.prev-dev-btn').off('click').on('click', function() {
        $('.prev-dev-btn').removeClass('active');
        $(this).addClass('active');
        const dev = $(this).attr('data-device');
        $('#preview-device-frame').removeClass('mode-mobile mode-tv');
        if (dev === 'mobile') {
            $('#preview-device-frame').addClass('mode-mobile');
        } else if (dev === 'tv') {
            $('#preview-device-frame').addClass('mode-tv');
        }
    });

    // Theme toggle inside Preview Modal
    $('#btn-prev-theme-toggle').off('click').on('click', function() {
        $('#tg-btn-theme-toggle').click();
    });

    // Duplicate Article Button
    $('#btn-duplicate-article').off('click').on('click', function() {
        duplicateArticle(activeArticleIdx);
    });
}

function createNewBlankArticle() {
    gatherValues();
    if (!portalConfig.articles) portalConfig.articles = [];

    const today = new Date();
    const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
    const dateStr = today.getDate() + ' ' + months[today.getMonth()] + ' ' + today.getFullYear();

    const newArt = {
        id: 'art-' + new Date().getTime(),
        title: 'Новая статья',
        date: dateStr,
        status: 'published',
        category: '',
        videoUrl: '',
        contentHtml: '<p>Начните писать руководство или выберите блок в панели сверху...</p>',
        contentData: {
            blocks: [{ type: 'paragraph', data: { text: 'Начните писать руководство или выберите блок в панели сверху...' } }]
        },
        blocks: {
            blocks: [{ type: 'paragraph', data: { text: 'Начните писать руководство или выберите блок в панели сверху...' } }]
        }
    };
    portalConfig.articles.unshift(newArt);
    renderArticlesList();
    selectArticle(0);
}

// Telegram Import Modal Handlers
function initTelegramPasteModal() {
    $('#btn-close-paste-modal, #btn-cancel-paste-modal').on('click', function() {
        $('#modal-paste-telegram').fadeOut(150);
    });

    $('#btn-create-new-article-modal').on('click', function() {
        const text = $('#paste-telegram-textarea').val();
        if (!text || !text.trim()) {
            showToast("Вставьте текст поста в поле!", "info");
            return;
        }
        $('#modal-paste-telegram').fadeOut(150);
        createNewArticleFromText(text);
    });

    $('#btn-insert-current-article').on('click', function() {
        const text = $('#paste-telegram-textarea').val();
        if (!text || !text.trim()) {
            showToast("Вставьте текст поста в поле!", "info");
            return;
        }
        $('#modal-paste-telegram').fadeOut(150);
        insertTextIntoCurrentArticle(text);
    });
}

function openTelegramPasteModal(defaultModeIsNew) {
    $('#paste-telegram-textarea').val('');
    $('#modal-paste-telegram').css('display', 'flex').hide().fadeIn(150);
    $('#paste-telegram-textarea').focus();

    if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(clipText => {
            if (clipText && clipText.trim()) {
                $('#paste-telegram-textarea').val(clipText);
            }
        }).catch(() => {});
    }
}

function createNewArticleFromText(rawText) {
    gatherValues();
    if (!portalConfig.articles) portalConfig.articles = [];

    const today = new Date();
    const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
    const dateStr = today.getDate() + ' ' + months[today.getMonth()] + ' ' + today.getFullYear();

    const formattedHtml = parseTelegramBlocks(rawText, true);
    const titleVal = $('#input-art-title').val().trim() || 'Статья Telegram';
    const editorData = window.ArticleRenderer ? ArticleRenderer.htmlToEditorData(formattedHtml) : htmlToEditorData(formattedHtml);

    const newArt = {
        id: 'art-' + new Date().getTime(),
        title: titleVal,
        date: dateStr,
        status: 'published',
        category: '',
        videoUrl: '',
        contentHtml: formattedHtml,
        contentData: editorData,
        blocks: editorData
    };
    portalConfig.articles.unshift(newArt);
    renderArticlesList();
    selectArticle(0);
    showToast("Новая статья создана и структурирована!", "success");
}

async function syncArticleEditorData() {
    if (editorInstance && isEditorReady) {
        try {
            const savedData = await editorInstance.save();
            if (portalConfig.articles && portalConfig.articles[activeArticleIdx]) {
                portalConfig.articles[activeArticleIdx].contentData = savedData;
                portalConfig.articles[activeArticleIdx].blocks = savedData;
                portalConfig.articles[activeArticleIdx].contentHtml = window.ArticleRenderer ? ArticleRenderer.render(savedData) : editorDataToHtml(savedData);
            }
        } catch (err) {
            console.error("syncArticleEditorData error:", err);
        }
    }
}

function insertTextIntoCurrentArticle(rawText) {
    const formattedHtml = parseTelegramBlocks(rawText, false);
    const newEditorData = window.ArticleRenderer ? ArticleRenderer.htmlToEditorData(formattedHtml) : htmlToEditorData(formattedHtml);
    if (editorInstance && isEditorReady && newEditorData && newEditorData.blocks) {
        newEditorData.blocks.forEach(b => {
            editorInstance.blocks.insert(b.type, b.data);
        });
    }
    showToast("Пост вставлен в текущую статью!", "success");
    gatherValues();
}

// Paste directly from clipboard (button action)
function pasteArticleFromClipboard(isNewArticle) {
    openTelegramPasteModal(isNewArticle);
}

// Helper to parse pasted Telegram plain text
function parseTelegramBlocks(content, isNewArticle) {
    if (!content || !content.trim()) return '';

    const rawLines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    let htmlOutput = [];
    let inList = false;
    let listType = null;

    function closeList() {
        if (inList) {
            htmlOutput.push(listType === 'ul' ? '</ul>' : '</ol>');
            inList = false;
            listType = null;
        }
    }

    let i = 0;
    const currentTitle = $('#input-art-title').val().trim();
    const shouldExtractTitle = isNewArticle || (!currentTitle || currentTitle === 'Без названия' || currentTitle === 'Новая статья' || currentTitle === 'Заголовок статьи');

    if (shouldExtractTitle && rawLines.length > 0) {
        const firstLine = rawLines[0];
        const plainFirst = $('<div>').html(firstLine).text().trim();
        
        if (!isPhotoMarker(firstLine) && !isBulletLine(firstLine) && plainFirst.length <= 110) {
            let combinedTitle = plainFirst;
            i = 1;

            if (rawLines.length > 1) {
                const secondLine = rawLines[1];
                const plainSecond = $('<div>').html(secondLine).text().trim();
                const endsWithPrep = /\b(в|на|с|со|для|по|к|ко|из|изо|о|об|обо|от|ото|при|через|под|над|без|про|до)$/i.test(plainFirst.replace(/[.,:!?\s]+$/, ''));
                
                if (endsWithPrep || (plainFirst.length + plainSecond.length < 80 && !isPhotoMarker(secondLine) && !isBulletLine(secondLine) && !plainSecond.includes('.') && !isHeadingLine(secondLine))) {
                    combinedTitle = (plainFirst + ' ' + plainSecond).replace(/\s+/g, ' ').trim();
                    i = 2;
                }
            }

            $('#input-art-title').val(combinedTitle).trigger('input');
            $('#tg-paper-title').text(combinedTitle);
        }
    }

    for (; i < rawLines.length; i++) {
        let line = rawLines[i];
        if (!line) {
            closeList();
            continue;
        }

        if (isPhotoMarker(line)) {
            closeList();
            continue;
        }

        const bulletMatch = line.match(/^[\s\u00A0\u200B\t]*(?:[•\u2022\u2023\u2043\u25E6\u25AA\u25AB\u25CF\u25CB\-\*\—\–]|&bull;|&#8226;|&middot;)\s*(.+)$/i);
        if (bulletMatch) {
            if (!inList || listType !== 'ul') {
                closeList();
                htmlOutput.push('<ul>');
                inList = true;
                listType = 'ul';
            }
            htmlOutput.push(`<li>${formatInlineMarkup(bulletMatch[1])}</li>`);
            continue;
        }

        const numMatch = line.match(/^[\s\u00A0\u200B\t]*(\d+)[\.\)]\s*(.+)$/);
        if (numMatch) {
            if (!inList || listType !== 'ol') {
                closeList();
                htmlOutput.push('<ol>');
                inList = true;
                listType = 'ol';
            }
            htmlOutput.push(`<li>${formatInlineMarkup(numMatch[2])}</li>`);
            continue;
        }

        closeList();

        if (isHighlightLine(line)) {
            const cleanText = line.replace(/^(&gt;|>)\s*/, '').replace(/<\/?(blockquote|mark|p)>/gi, '').trim();
            htmlOutput.push(`<div class="article-alert-card"><div class="article-alert-header">⚠️ <strong>Важно</strong></div><div class="article-alert-body">${formatInlineMarkup(cleanText)}</div></div>`);
            continue;
        }

        if (line.startsWith('<blockquote>')) {
            const cleanQuote = line.replace(/<\/?blockquote>/gi, '');
            htmlOutput.push(`<blockquote>${formatInlineMarkup(cleanQuote)}</blockquote>`);
            continue;
        }

        if (isHeadingLine(line)) {
            const cleanHead = line.replace(/^#+\s*/, '').trim();
            htmlOutput.push(`<h2>${formatInlineMarkup(cleanHead)}</h2>`);
            continue;
        }

        if (line.startsWith('<img') || line.indexOf('<img') !== -1) {
            htmlOutput.push(line);
            continue;
        }

        htmlOutput.push(`<p>${formatInlineMarkup(line)}</p>`);
    }

    closeList();
    return htmlOutput.join('\n');
}

function formatInlineMarkup(text) {
    if (!text) return '';
    let result = text;
    result = result.replace(/__([^_]+)__/g, '<u>$1</u>');
    result = result.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    result = result.replace(/(^|[^\*])\*([^\*]+)\*([^\*]|$)/g, '$1<i>$2</i>$3');
    result = result.replace(/~~([^~]+)~~/g, '<s>$1</s>');
    const urlRegex = /(?<!href=["'])(https?:\/\/[^\s<"']+)/g;
    result = result.replace(urlRegex, function(url) {
        return `<a href="${url}" target="_blank">${url}</a>`;
    });
    return result;
}

function isPhotoMarker(line) {
    if (!line) return false;
    const lower = $('<div>').html(line).text().trim().toLowerCase();
    return lower === 'photo' || lower === 'фото' || lower.startsWith('photo, [') || lower.startsWith('фото, [') || lower.startsWith('📷');
}

function isBulletLine(line) {
    return /^[\s\u00A0\u200B\t]*(?:[•\u2022\u2023\u2043\u25E6\u25AA\u25AB\u25CF\u25CB\-\*\—\–]|&bull;|&#8226;|&middot;)/.test(line);
}

function isHighlightLine(line) {
    if (!line) return false;
    const plain = $('<div>').html(line).text().trim();
    if (/^(И все после|Важно|Внимание|Примечание|Обратите внимание|Лайфхак|Совет)\b/i.test(plain)) {
        return true;
    }
    return line.startsWith('&gt;') || line.startsWith('>') || line.includes('tg-text-highlight') || line.includes('<mark>');
}

function isHeadingLine(line) {
    const plain = $('<div>').html(line).text().trim();
    if (plain.startsWith('## ') || plain.startsWith('### ')) return true;
    if (plain.length > 90) return false;
    return /^(👉|⚙️|📱|📢|✨|Так же в|Также в|Не забывайте|Как настроить|Настройка|Шаг \d+|Инструкция:)/i.test(plain);
}

// Render News tab
function renderNews() {
    const list = $('#news-list-container');
    list.empty();
    const news = portalConfig.news || [];
    news.forEach((n, idx) => {
        const card = $(`
            <div class="item-card news-editor-card" data-index="${idx}">
                <div class="item-card-header">
                    <span class="item-card-number">Новость #${idx + 1}</span>
                    <button class="btn btn-danger btn-delete-news" data-index="${idx}">Удалить</button>
                </div>
                <div class="form-group">
                    <label>Дата публикации</label>
                    <input type="text" class="form-control news-date-in" value="${escapeHtml(n.date)}">
                </div>
                <div class="form-group">
                    <label>Заголовок новости</label>
                    <input type="text" class="form-control news-title-in" spellcheck="true" lang="ru" value="${escapeHtml(n.title)}">
                </div>
                <div class="form-group">
                    <label>Текст описания</label>
                    <textarea class="form-control news-desc-tx" spellcheck="true" lang="ru">${escapeHtml(n.desc || '')}</textarea>
                </div>
            </div>
        `);
        list.append(card);
    });

    $('.btn-delete-news').on('click', function() {
        const idx = parseInt($(this).attr('data-index'));
        if (confirm('Удалить эту новость?')) {
            gatherValues();
            portalConfig.news.splice(idx, 1);
            renderNews();
        }
    });
}

// Render Products tab
function renderProducts() {
    const list = $('#products-list-container');
    list.empty();
    const products = portalConfig.products || [];
    products.forEach((p, idx) => {
        const condNewSelected = p.condition === 'Новое' ? 'selected' : '';
        const condUsedSelected = p.condition === 'Б/У' ? 'selected' : '';

        const card = $(`
            <div class="item-card product-editor-card" data-index="${idx}">
                <div class="item-card-header">
                    <span class="item-card-number">Товар #${idx + 1}</span>
                    <button class="btn btn-danger btn-delete-prod" data-index="${idx}">Удалить</button>
                </div>
                <div class="grid-2col">
                    <div class="form-group">
                        <label>Название товара</label>
                        <input type="text" class="form-control prod-title-in" spellcheck="true" lang="ru" value="${escapeHtml(p.title)}">
                    </div>
                    <div class="form-group">
                        <label>Цена</label>
                        <input type="text" class="form-control prod-price-in" value="${escapeHtml(p.price)}">
                    </div>
                </div>
                <div class="grid-2col">
                    <div class="form-group">
                        <label>Наличие (например, В наличии, Под заказ)</label>
                        <input type="text" class="form-control prod-avail-in" value="${escapeHtml(p.available || 'В наличии')}">
                    </div>
                    <div class="form-group">
                        <label>Состояние</label>
                        <select class="form-control prod-cond-sl">
                            <option value="Новое" ${condNewSelected}>Новое</option>
                            <option value="Б/У" ${condUsedSelected}>Б/У</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Ссылка на картинку товара</label>
                    <input type="text" class="form-control prod-img-in" value="${escapeHtml(p.imageUrl || 'app_logo.png?v=2')}">
                </div>
                <div class="form-group">
                    <label>Описание / Характеристики</label>
                    <textarea class="form-control prod-desc-tx" spellcheck="true" lang="ru">${escapeHtml(p.desc || '')}</textarea>
                </div>
            </div>
        `);
        list.append(card);
    });

    // Make newly rendered product image inputs uploadable
    makeImageUploadable(list.find('.prod-img-in'));

    $('.btn-delete-prod').on('click', function() {
        const idx = parseInt($(this).attr('data-index'));
        if (confirm('Удалить этот товар?')) {
            gatherValues();
            portalConfig.products.splice(idx, 1);
            renderProducts();
        }
    });
}

// Render Instructions Left Sidebar list
function renderInstructionsList() {
    const list = $('#instructions-sidebar-list');
    list.empty();
    const inst = portalConfig.instructions || [];
    
    inst.forEach((item, idx) => {
        const activeClass = idx === activeInstIdx ? 'active' : '';
        const stepsCount = item.steps ? item.steps.length : 0;
        const typeLabel = item.type === 'single' ? 'Памятка' : 'Инструкция';

        const row = $(`
            <div class="inst-item-row ${activeClass}" data-inst-index="${idx}">
                <div class="inst-item-row-header">
                    <span class="inst-item-row-title">${escapeHtml(item.title)}</span>
                    <div class="inst-row-controls">
                        <button class="btn-icon btn-inst-up" data-inst-index="${idx}" title="Вверх">↑</button>
                        <button class="btn-icon btn-inst-down" data-inst-index="${idx}" title="Вниз">↓</button>
                        <button class="btn-icon btn-icon-danger btn-inst-delete" data-inst-index="${idx}" title="Удалить">×</button>
                    </div>
                </div>
                <span class="inst-item-row-sub">${typeLabel} • Шагов: ${stepsCount}</span>
            </div>
        `);
        list.append(row);
    });

    // Bind sidebar clicks
    $('.inst-item-row').on('click', function(e) {
        if ($(e.target).closest('button').length) return;
        const idx = parseInt($(this).attr('data-inst-index'));
        gatherValues();
        selectInstruction(idx);
    });

    // Instructions Up/Down/Delete Actions
    $('.btn-inst-up').on('click', function(e) {
        e.stopPropagation();
        const idx = parseInt($(this).attr('data-inst-index'));
        if (idx > 0) {
            gatherValues();
            const temp = portalConfig.instructions[idx];
            portalConfig.instructions[idx] = portalConfig.instructions[idx - 1];
            portalConfig.instructions[idx - 1] = temp;
            activeInstIdx = idx - 1;
            renderInstructionsList();
            selectInstruction(activeInstIdx);
        }
    });

    $('.btn-inst-down').on('click', function(e) {
        e.stopPropagation();
        const idx = parseInt($(this).attr('data-inst-index'));
        if (idx < portalConfig.instructions.length - 1) {
            gatherValues();
            const temp = portalConfig.instructions[idx];
            portalConfig.instructions[idx] = portalConfig.instructions[idx + 1];
            portalConfig.instructions[idx + 1] = temp;
            activeInstIdx = idx + 1;
            renderInstructionsList();
            selectInstruction(activeInstIdx);
        }
    });

    $('.btn-inst-delete').on('click', function(e) {
        e.stopPropagation();
        const idx = parseInt($(this).attr('data-inst-index'));
        if (confirm(`Удалить все руководство "${portalConfig.instructions[idx].title}"?`)) {
            gatherValues();
            portalConfig.instructions.splice(idx, 1);
            activeInstIdx = 0;
            renderInstructionsList();
            selectInstruction(0);
        }
    });
}

// Select instruction item to display in the right editor pane
function selectInstruction(idx) {
    const instList = portalConfig.instructions || [];
    if (idx < 0 || idx >= instList.length) {
        $('#instruction-steps-editor').hide();
        return;
    }

    activeInstIdx = idx;
    $('.inst-item-row').removeClass('active');
    $(`.inst-item-row[data-inst-index="${idx}"]`).addClass('active');

    const inst = instList[idx];
    $('#input-inst-title').val(inst.title);
    $('#select-inst-type').val(inst.type || 'steps');
    $('#input-inst-video').val(inst.videoUrl || '');

    // Bind layout changes on type selector
    $('#select-inst-type').off('change').on('change', function() {
        inst.type = $(this).val();
        if (inst.type === 'single') {
            if (!inst.steps || inst.steps.length === 0) {
                inst.steps = [{ id: 'step-0', title: 'Памятка', text: '', imageUrl: 'app_logo.png' }];
            } else {
                inst.steps = [inst.steps[0]];
            }
        }
        renderStepsList(inst);
        renderInstructionsList();
    });

    // Dynamic title rename in left sidebar
    $('#input-inst-title').off('input').on('input', function() {
        inst.title = $(this).val();
        $(`.inst-item-row[data-inst-index="${idx}"] .inst-item-row-title`).text(inst.title);
    });

    renderStepsList(inst);
    $('#instruction-steps-editor').show();
}

// Render steps for the active instruction
function renderStepsList(inst) {
    const container = $('#steps-list-container');
    container.empty();
    const steps = inst.steps || [];

    if (inst.type === 'single') {
        const step = steps[0] || { title: 'Памятка', text: '', imageUrl: 'app_logo.png' };
        const card = $(`
            <div class="step-card step-editor-card" data-step-index="0">
                <div class="form-group">
                    <label>Заголовок памятки</label>
                    <input type="text" class="form-control step-title-in" spellcheck="true" lang="ru" value="${escapeHtml(step.title)}">
                </div>
                <div class="form-group">
                    <label>Путь к картинке (по умолчанию app_logo.png)</label>
                    <input type="text" class="form-control step-img-in" value="${escapeHtml(step.imageUrl || 'app_logo.png')}">
                </div>
                <div class="form-group">
                    <label>Текст памятки</label>
                    <textarea class="form-control step-text-tx" spellcheck="true" lang="ru" style="min-height: 180px;">${escapeHtml(step.text || '')}</textarea>
                </div>
            </div>
        `);
        container.append(card);
    } else {
        steps.forEach((step, idx) => {
            let imgSrc = step.imageUrl || '';
            let fullImgUrl = imgSrc;
            if (imgSrc && !imgSrc.startsWith('http') && !imgSrc.startsWith('/')) {
                if (imgSrc.startsWith('img/')) {
                    fullImgUrl = '/' + imgSrc;
                } else {
                    fullImgUrl = '/root/' + imgSrc;
                }
            }

            let previewHtml = '';
            if (imgSrc && imgSrc !== 'app_logo.png' && imgSrc !== 'app_logo.png?v=2') {
                previewHtml = `
                    <div class="step-img-preview-box" data-step-index="${idx}" title="Кликните на картинку, чтобы открыть графический редактор">
                        <img src="${escapeHtml(fullImgUrl)}" alt="Превью шага" onerror="this.onerror=null; this.src='/root/${escapeHtml(imgSrc.replace(/^\//, ''))}';">
                        <div class="step-img-edit-overlay">✏️ Кликните для редактирования</div>
                    </div>
                `;
            } else {
                previewHtml = `
                    <div class="step-img-preview-box empty" data-step-index="${idx}" title="Нет картинки шага (кликните, чтобы добавить или выделить)">
                        <div style="color:var(--text-muted); font-size:0.9em; text-align:center; display:flex; flex-direction:column; align-items:center; gap:6px;">
                            <svg viewBox="0 0 24 24" style="width:32px;height:32px;opacity:0.4;fill:none;stroke:currentColor;stroke-width:1.5;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                            <span>Картинка не задана</span>
                        </div>
                    </div>
                `;
            }

            const card = $(`
                <div class="step-card step-editor-card" data-step-index="${idx}">
                    <div class="item-card-header" style="border:none; padding:0; margin-bottom:8px;">
                        <span style="font-weight:700; color:var(--accent-hover);">Шаг #${idx + 1}</span>
                        <div class="inst-row-controls">
                            <button class="btn-icon btn-step-up" data-step-index="${idx}">↑</button>
                            <button class="btn-icon btn-step-down" data-step-index="${idx}">↓</button>
                            <button class="btn-icon btn-icon-danger btn-step-delete" data-step-index="${idx}">×</button>
                        </div>
                    </div>
                    <div class="step-split-row" style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; align-items:start;">
                        <div style="display:flex; flex-direction:column; gap:14px;">
                            <div class="form-group">
                                <label>Заголовок шага</label>
                                <input type="text" class="form-control step-title-in" spellcheck="true" lang="ru" value="${escapeHtml(step.title)}">
                            </div>
                            <div class="form-group">
                                <label>Картинка шага (например, img/step_1.png)</label>
                                <input type="text" class="form-control step-img-in" value="${escapeHtml(step.imageUrl || 'app_logo.png')}">
                            </div>
                            <div class="form-group">
                                <label>Текст описания шага</label>
                                <textarea class="form-control step-text-tx" spellcheck="true" lang="ru" style="min-height:90px;">${escapeHtml(step.text || '')}</textarea>
                            </div>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:8px;">
                            <label style="font-size:0.85em; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">Превью картинки шага</label>
                            ${previewHtml}
                        </div>
                    </div>
                </div>
            `);
            container.append(card);
        });

        container.append('<button class="btn btn-primary btn-add" id="btn-add-step" style="margin-top:10px;">+ Добавить шаг</button>');

        // Click on preview image triggers annotator editor directly
        container.find('.step-img-preview-box').on('click', function() {
            const stepIdx = $(this).attr('data-step-index');
            const input = container.find(`.step-editor-card[data-step-index="${stepIdx}"] .step-img-in`);
            const imgPath = input.val().trim();
            if (!imgPath || imgPath === 'app_logo.png' || imgPath === 'app_logo.png?v=2') {
                input.nextAll('input[type="file"]').click();
                return;
            }
            openAnnotatorModal(imgPath, input);
        });

        // Bind step actions
        $('.btn-step-up').on('click', function() {
            const idx = parseInt($(this).attr('data-step-index'));
            if (idx > 0) {
                gatherValues();
                const temp = inst.steps[idx];
                inst.steps[idx] = inst.steps[idx - 1];
                inst.steps[idx - 1] = temp;
                renderStepsList(inst);
            }
        });

        $('.btn-step-down').on('click', function() {
            const idx = parseInt($(this).attr('data-step-index'));
            if (idx < inst.steps.length - 1) {
                gatherValues();
                const temp = inst.steps[idx];
                inst.steps[idx] = inst.steps[idx + 1];
                inst.steps[idx + 1] = temp;
                renderStepsList(inst);
            }
        });

        $('.btn-step-delete').on('click', function() {
            const idx = parseInt($(this).attr('data-step-index'));
            if (inst.steps.length <= 1) {
                alert('Инструкция должна содержать как минимум один шаг!');
                return;
            }
            if (confirm('Удалить этот шаг?')) {
                gatherValues();
                inst.steps.splice(idx, 1);
                renderStepsList(inst);
            }
        });

        $('#btn-add-step').on('click', function() {
            gatherValues();
            const nextIdx = inst.steps.length;
            inst.steps.push({
                id: 'step-' + nextIdx,
                title: 'Шаг ' + (nextIdx + 1),
                text: 'Инструкция для данного шага...',
                imageUrl: 'app_logo.png'
            });
            renderStepsList(inst);
        });
    }

    // Make newly rendered step image inputs uploadable
    makeImageUploadable(container.find('.step-img-in'));
}

// Gather, Save to disk, and Push to remote Git
async function saveAndDeploy() {
    await syncArticleEditorData();
    gatherValues();
    appendLog("Сохранение настроек в config.json локально...");
    
    $('.status-dot').addClass('loading');
    $('#status-text').text("Сохранение...");
    
    $.ajax({
        url: '/api/config',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(portalConfig),
        success: function() {
            appendLog("Локальный файл config.json сохранен. Запуск отправки в репозиторий Git...");
            showToast("Файл сохранен. Заливка на GitHub...", "info");
            
            $.ajax({
                url: '/api/git/deploy',
                type: 'POST',
                success: function() {
                    appendLog("Синхронизация с GitHub успешно завершена!");
                    showToast("Конфигурация опубликована на GitHub!", "success");
                    $('.status-dot').removeClass('loading');
                    $('#status-text').text("Все изменения в сети");
                },
                error: function(xhr) {
                    appendLog("Ошибка Git деплоя: " + xhr.responseText);
                    showToast("Ошибка коммита/пуша на GitHub!", "error");
                    $('.status-dot').removeClass('loading');
                    $('#status-text').text("Ошибка синхронизации");
                }
            });
        },
        error: function(xhr) {
            appendLog("Ошибка локального сохранения: " + xhr.responseText);
            showToast("Не удалось сохранить конфигурационный файл!", "error");
            $('.status-dot').removeClass('loading');
            $('#status-text').text("Ошибка локального сохранения");
        }
    });
}

// SSE Listener for Server logs
function startSseLogs() {
    const pin = localStorage.getItem('portal_pin') || '';
    const logsOutput = document.getElementById('logs-output');
    const source = new EventSource('/api/logs?pin=' + encodeURIComponent(pin));
    
    source.onmessage = function(event) {
        appendLog(event.data);
    };
    
    source.onerror = function() {
        console.log("SSE: Connection error or unauthorized.");
    };
}

// Output log text inside bottom console
function appendLog(message) {
    const out = $('#logs-output');
    if (out.text().trim() === 'Ожидание логов сервера...') {
        out.empty();
    }
    const date = new Date().toLocaleTimeString();
    out.append(`[${date}] ${message}\n`);
    out.scrollTop(out[0].scrollHeight);
}

// Toast notification helper
function showToast(message, type) {
    const container = $('#toast-container');
    const toast = $(`<div class="toast ${type || 'info'}">${escapeHtml(message)}</div>`);
    container.append(toast);
    
    setTimeout(() => { toast.addClass('show'); }, 50);
    setTimeout(() => {
        toast.removeClass('show');
        setTimeout(() => { toast.remove(); }, 300);
    }, 4000);
}

// Image Annotator Engine logic
let annotatorBaseImg = new Image();
let annotatorRects = [];
let isDrawingRect = false;
let rectStartX = 0, rectStartY = 0;
let currentRectColor = '#ff3366';
let activeAnnotatorInput = null;

function openAnnotatorModal(imgPath, targetInput) {
    activeAnnotatorInput = targetInput;
    annotatorRects = [];
    isDrawingRect = false;
    currentRectColor = '#ff3366';

    $('.annotator-tool-btn[data-color]').removeClass('active');
    $('.annotator-tool-btn[data-color="#ff3366"]').addClass('active');

    let fullImgUrl = imgPath;
    if (!imgPath.startsWith('http') && !imgPath.startsWith('/')) {
        if (imgPath.startsWith('img/')) {
            fullImgUrl = '/' + imgPath;
        } else {
            fullImgUrl = '/root/' + imgPath;
        }
    }

    annotatorBaseImg = new Image();
    
    showToast("Загрузка изображения для выделения...", "info");
    
    annotatorBaseImg.onload = function() {
        const canvas = document.getElementById('annotator-canvas');
        canvas.width = annotatorBaseImg.naturalWidth;
        canvas.height = annotatorBaseImg.naturalHeight;
        drawAnnotatorCanvas();
        $('#annotator-modal').css('display', 'flex').hide().fadeIn(200);
    };

    annotatorBaseImg.onerror = function() {
        // Fallback retry via /root/
        if (!fullImgUrl.startsWith('/root/')) {
            annotatorBaseImg.src = '/root/' + imgPath.replace(/^\//, '') + '?t=' + new Date().getTime();
            return;
        }
        showToast("Не удалось открыть картинку для редактирования: " + imgPath, "error");
    };

    annotatorBaseImg.src = fullImgUrl + (fullImgUrl.includes('?') ? '&' : '?') + 't=' + new Date().getTime();
}

function drawAnnotatorCanvas(previewRect) {
    const canvas = document.getElementById('annotator-canvas');
    if (!canvas || !annotatorBaseImg.width) return;
    const ctx = canvas.getContext('2d');

    // Draw background image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(annotatorBaseImg, 0, 0);

    // Draw existing rectangles
    annotatorRects.forEach(r => {
        ctx.strokeStyle = r.color;
        ctx.lineWidth = Math.max(4, Math.round(canvas.width / 150));
        ctx.fillStyle = r.color.startsWith('#') ? (r.color + '22') : 'rgba(255,51,102,0.15)';
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(r.x, r.y, r.w, r.h, 6) : ctx.rect(r.x, r.y, r.w, r.h);
        ctx.stroke();
        ctx.fill();
    });

    // Draw currently dragging preview rectangle
    if (previewRect) {
        ctx.strokeStyle = previewRect.color;
        ctx.lineWidth = Math.max(4, Math.round(canvas.width / 150));
        ctx.fillStyle = previewRect.color.startsWith('#') ? (previewRect.color + '22') : 'rgba(255,51,102,0.15)';
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(previewRect.x, previewRect.y, previewRect.w, previewRect.h, 6) : ctx.rect(previewRect.x, previewRect.y, previewRect.w, previewRect.h);
        ctx.stroke();
        ctx.fill();
    }
}

$(document).ready(function() {
    // Color selector buttons in Annotator
    $('.annotator-tool-btn[data-color]').on('click', function() {
        $('.annotator-tool-btn[data-color]').removeClass('active');
        $(this).addClass('active');
        currentRectColor = $(this).attr('data-color');
    });

    // Undo action
    $('#btn-annotator-undo').on('click', function() {
        if (annotatorRects.length > 0) {
            annotatorRects.pop();
            drawAnnotatorCanvas();
        }
    });

    // Reset action
    $('#btn-annotator-reset').on('click', function() {
        annotatorRects = [];
        drawAnnotatorCanvas();
    });

    // Cancel modal
    $('#btn-annotator-cancel').on('click', function() {
        $('#annotator-modal').fadeOut(200);
    });

    // Canvas drawing interaction
    const canvas = document.getElementById('annotator-canvas');

    function getCanvasCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    $(canvas).on('mousedown touchstart', function(e) {
        e.preventDefault();
        const clientEvt = e.originalEvent.touches ? e.originalEvent.touches[0] : e;
        const pos = getCanvasCoords(clientEvt);
        isDrawingRect = true;
        rectStartX = pos.x;
        rectStartY = pos.y;
    });

    $(canvas).on('mousemove touchmove', function(e) {
        if (!isDrawingRect) return;
        e.preventDefault();
        const clientEvt = e.originalEvent.touches ? e.originalEvent.touches[0] : e;
        const pos = getCanvasCoords(clientEvt);
        
        const previewRect = {
            x: Math.min(rectStartX, pos.x),
            y: Math.min(rectStartY, pos.y),
            w: Math.abs(pos.x - rectStartX),
            h: Math.abs(pos.y - rectStartY),
            color: currentRectColor
        };
        drawAnnotatorCanvas(previewRect);
    });

    $(canvas).on('mouseup touchend touchcancel', function(e) {
        if (!isDrawingRect) return;
        isDrawingRect = false;
        const clientEvt = e.originalEvent.changedTouches ? e.originalEvent.changedTouches[0] : e;
        const pos = getCanvasCoords(clientEvt);

        const w = Math.abs(pos.x - rectStartX);
        const h = Math.abs(pos.y - rectStartY);

        // Only save if rectangle has visible size (> 10px)
        if (w > 10 && h > 10) {
            annotatorRects.push({
                x: Math.min(rectStartX, pos.x),
                y: Math.min(rectStartY, pos.y),
                w: w,
                h: h,
                color: currentRectColor
            });
        }
        drawAnnotatorCanvas();
    });

    // Save annotated image back to server and set input value
    $('#btn-annotator-save').on('click', function() {
        if (!activeAnnotatorInput) return;
        
        drawAnnotatorCanvas();
        const canvas = document.getElementById('annotator-canvas');

        canvas.toBlob(function(blob) {
            if (!blob) {
                showToast("Ошибка сохранения вырезанного фрагмента!", "error");
                return;
            }
            const file = new File([blob], "edited_step_" + new Date().getTime() + ".png", { type: "image/png" });
            
            uploadImageFile(file, activeAnnotatorInput);
            $('#annotator-modal').fadeOut(200);
        }, 'image/png');
    });
});

// Helper to escape HTML characters
function escapeHtml(string) {
    const matchHtmlRegExp = /["'&<>]/;
    const str = '' + string;
    const match = matchHtmlRegExp.exec(str);

    if (!match) {
        return str;
    }

    let escape;
    let html = '';
    let index = 0;
    let lastIndex = 0;

    for (index = match.index; index < str.length; index++) {
        switch (str.charCodeAt(index)) {
            case 34: // "
                escape = '&quot;';
                break;
            case 38: // &
                escape = '&amp;';
                break;
            case 39: // '
                escape = '&#39;';
                break;
            case 60: // <
                escape = '&lt;';
                break;
            case 62: // >
                escape = '&gt;';
                break;
            default:
                continue;
        }

        if (lastIndex !== index) {
            html += str.substring(lastIndex, index);
        }

        lastIndex = index + 1;
        html += escape;
    }

    return lastIndex !== index
        ? html + str.substring(lastIndex, index)
        : html;
}
