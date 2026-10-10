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
let activeInstIdx = 0;
let editorInstance = null;
let isEditorReady = false;
let undoInstance = null;
let activeGitHubToken = null;
let currentConfigSha = null;

let articleFilterStatus = 'all';
let articleSearchQuery = '';

// ==========================================================================
// 1. Web Crypto API - Military/Banking Grade Client-side AES-256-GCM
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
// 2. Direct GitHub REST API Client
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
        throw new Error(errorData.message || `GitHub API Error (${response.status}: ${response.statusText})`);
    }
    return await response.json();
}

async function verifyGitHubToken(token) {
    const repoData = await githubApiRequest(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}`, 'GET', null, token);
    return repoData && repoData.permissions && (repoData.permissions.push === true || repoData.permissions.admin === true);
}

async function loadPortalConfigFromGitHub() {
    showToast("Загрузка конфигурации с GitHub...", "info");
    const data = await githubApiRequest(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CONFIG_PATH}?ref=main&t=${Date.now()}`);
    currentConfigSha = data.sha;
    const jsonStr = decodeBase64Utf8(data.content);
    portalConfig = JSON.parse(jsonStr);
    populateForm();
    showToast("Конфигурация успешно загружена с GitHub!", "success");
}

async function savePortalConfigToGitHub() {
    gatherValues();
    if (editorInstance && isEditorReady) {
        await syncArticleEditorData();
    }

    showToast("Сохранение и коммит на GitHub...", "info");
    const jsonString = JSON.stringify(portalConfig, null, 2);
    const base64Content = encodeBase64Utf8(jsonString);

    // Get latest sha before pushing
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

    // Generate and upload standalone static article page for active article with Open Graph tags
    try {
        if (portalConfig && portalConfig.articles && activeArticleIdx >= 0 && portalConfig.articles[activeArticleIdx]) {
            const art = portalConfig.articles[activeArticleIdx];
            if (art.id && window.ArticleRenderer && typeof window.ArticleRenderer.generateArticleHtml === 'function') {
                const artHtml = window.ArticleRenderer.generateArticleHtml(art);
                const artPath = `articles/${encodeURIComponent(art.id)}.html`;
                
                let artSha = null;
                try {
                    const artInfo = await githubApiRequest(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${artPath}?ref=main&t=${Date.now()}`);
                    artSha = artInfo.sha;
                } catch(err) {
                    // file doesn't exist yet
                }

                const artPayload = {
                    message: `Publish static article: ${art.title || art.id} with OpenGraph tags [skip ci]`,
                    content: encodeBase64Utf8(artHtml),
                    branch: 'main'
                };
                if (artSha) artPayload.sha = artSha;

                await githubApiRequest(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${artPath}`, 'PUT', artPayload);
            }
        }
    } catch(err) {
        console.warn("Could not publish static article page:", err);
    }

    showToast("🎉 Успешно сохранено и опубликовано на GitHub!", "success");
}

async function uploadMediaFileToGitHub(file) {
    showToast(`Загрузка медиа: ${file.name}...`, "info");
    const arrayBuffer = await file.arrayBuffer();
    const base64Data = encodeArrayBufferToBase64(arrayBuffer);
    
    // Clean filename
    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `${Date.now()}_${cleanName}`;
    const filePath = `img/${filename}`;

    const payload = {
        message: `Upload media asset: ${filename} via Online Admin`,
        content: base64Data,
        branch: 'main'
    };

    await githubApiRequest(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`, 'PUT', payload);
    const finalUrl = `${filePath}`;
    showToast("Медиафайл успешно загружен в репозиторий!", "success");
    return finalUrl;
}

// ==========================================================================
// 3. Setup, Encryption & Login Management
// ==========================================================================

$(document).ready(function() {
    initTelegramEditorEvents();
    initArticlePreviewModal();
    initTelegramPasteModal();

    // Check saved encrypted token
    const savedEncrypted = localStorage.getItem('tvshop_encrypted_token');
    if (savedEncrypted) {
        $('#login-existing-view').show();
        $('#login-setup-view').hide();
    } else {
        $('#login-existing-view').hide();
        $('#login-setup-view').show();
    }

    // Sidebar tab swapping
    $('.menu-item').on('click', function() {
        $('.menu-item').removeClass('active');
        $(this).addClass('active');
        const paneId = $(this).attr('data-pane');
        $('.pane').removeClass('active');
        $('#' + paneId).addClass('active');
    });

    // Sidebar collapse toggle
    $('#btn-toggle-sidebar').on('click', function() {
        $('#manager-sidebar').toggleClass('collapsed');
    });

    // Initial Setup Submission
    $('#btn-setup-submit').on('click', async function() {
        const token = $('#setup-github-token').val().trim();
        const pass = $('#setup-master-password').val().trim();

        if (!token || !pass) {
            $('#setup-error-msg').text("Заполните все поля!").show();
            return;
        }

        try {
            $('#btn-setup-submit').prop('disabled', true).text("Проверка токена...");
            const isValid = await verifyGitHubToken(token);
            if (!isValid) {
                $('#setup-error-msg').text("Токен не имеет прав на запись в репозиторий!").show();
                $('#btn-setup-submit').prop('disabled', false).text("Сохранить и войти");
                return;
            }

            const encrypted = await encryptToken(token, pass);
            localStorage.setItem('tvshop_encrypted_token', JSON.stringify(encrypted));
            activeGitHubToken = token;

            $('#login-overlay').fadeOut(200);
            await loadPortalConfigFromGitHub();
        } catch (err) {
            $('#setup-error-msg').text("Ошибка: " + err.message).show();
        } finally {
            $('#btn-setup-submit').prop('disabled', false).text("Сохранить и войти");
        }
    });

    // Existing Token Login Submission
    $('#btn-login-submit').on('click', async function() {
        const pass = $('#login-password-input').val().trim();
        if (!pass) return;

        const savedEncrypted = JSON.parse(localStorage.getItem('tvshop_encrypted_token') || '{}');
        try {
            $('#btn-login-submit').prop('disabled', true).text("Вход...");
            const decryptedToken = await decryptToken(savedEncrypted, pass);
            const isValid = await verifyGitHubToken(decryptedToken);
            if (!isValid) throw new Error("Токен устарел или был отозван");

            activeGitHubToken = decryptedToken;
            $('#login-overlay').fadeOut(200);
            $('#login-error-msg').hide();
            await loadPortalConfigFromGitHub();
        } catch (err) {
            $('#login-error-msg').text("Неверный пароль или ошибка ключа!").show();
            $('#login-password-input').val('').focus();
        } finally {
            $('#btn-login-submit').prop('disabled', false).text("Войти в панель");
        }
    });

    $('#login-password-input').on('keypress', function(e) {
        if (e.which === 13) $('#btn-login-submit').click();
    });

    // Reset Token / Logout
    $('#btn-logout-token, #btn-reset-auth').on('click', function() {
        if (confirm("Сбросить сохранённый ключ доступа на этом устройстве?")) {
            localStorage.removeItem('tvshop_encrypted_token');
            location.reload();
        }
    });

    // Publish & Deploy Action
    $('.btn-save-deploy').on('click', async function() {
        try {
            $(this).prop('disabled', true);
            await savePortalConfigToGitHub();
        } catch (err) {
            showToast("Ошибка сохранения: " + err.message, "error");
        } finally {
            $(this).prop('disabled', false);
        }
    });

    // Reset Form Action
    $('.btn-reset').on('click', function() {
        if (confirm("Отменить все несохранённые изменения и перезагрузить данные с GitHub?")) {
            loadPortalConfigFromGitHub();
        }
    });

    // Add News / Product / Guide buttons
    $('#btn-add-news').on('click', function() {
        if (!portalConfig.news) portalConfig.news = [];
        portalConfig.news.unshift({
            date: 'Сегодня',
            title: 'Новая новость',
            desc: ''
        });
        renderNews();
    });

    $('#btn-add-product').on('click', function() {
        if (!portalConfig.products) portalConfig.products = [];
        portalConfig.products.unshift({
            title: 'Новый товар',
            price: '0 ₽',
            available: 'В наличии',
            condition: 'Новое',
            imageUrl: 'app_logo.png?v=2',
            desc: ''
        });
        renderProducts();
    });

    $('#btn-add-article').on('click', function() {
        createNewBlankArticle();
    });

    $('#btn-paste-clipboard-article').on('click', function() {
        openTelegramPasteModal(true);
    });
});

// ==========================================================================
// 4. Form Population & Rendering
// ==========================================================================

function populateForm() {
    $('#input-support-text').val(portalConfig.supportText || '');
    $('#input-support-tg').val(portalConfig.supportTg || '');
    $('#input-support-max').val(portalConfig.supportMax || '');
    $('#input-support-qr').val(portalConfig.supportQrUrl || '');
    $('#input-onesignal-appid').val(portalConfig.oneSignalAppId || '');

    const promo = portalConfig.promo || {};
    $('#input-promo-badge').val(promo.badge || '');
    $('#input-promo-title').val(promo.title || '');
    $('#input-promo-text').val(promo.text || '');
    $('#input-promo-action').val(promo.actionText || '');
    $('#input-promo-image').val(promo.imageUrl || '');

    renderNews();
    renderProducts();
    renderArticlesList();
    if (portalConfig.articles && portalConfig.articles.length > 0) {
        selectArticle(0);
    }
}

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
}

// ==========================================================================
// 5. Articles Management, Search, Filters & Duplication
// ==========================================================================

function renderArticlesList() {
    const list = $('#articles-sidebar-list');
    list.empty();
    const articles = portalConfig.articles || [];

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

    const query = articleSearchQuery.toLowerCase().trim();
    const filteredArticles = [];

    articles.forEach((art, originalIdx) => {
        const isDraft = art.status === 'draft' || art.isDraft === true || art.draft === true;
        
        if (articleFilterStatus === 'published' && isDraft) return;
        if (articleFilterStatus === 'draft' && !isDraft) return;

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

    $('.inst-item-row[data-art-index]').off('click').on('click', function(e) {
        if ($(e.target).closest('button').length) return;
        const idx = parseInt($(this).attr('data-art-index'));
        gatherValues();
        selectArticle(idx);
    });

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

    const editorData = art.contentData || (art.blocks && art.blocks.blocks ? art.blocks : null) || (window.ArticleRenderer ? ArticleRenderer.htmlToEditorData(art.contentHtml || '') : htmlToEditorData(art.contentHtml || ''));
    initEditorJS(editorData);
    initEditorToolbarActions();

    const prodBase = "https://tvshopru.github.io/sup.tvshop";
    const artId = art.id || ('art-' + idx);
    const directUrl = `${prodBase}/articles/${encodeURIComponent(artId)}.html`;
    $('#art-direct-link-text').text(directUrl);
    $('#btn-open-art-link').attr('href', directUrl);

    $('#btn-copy-art-link').off('click').on('click', function() {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(directUrl).then(() => {
                showToast("Ссылка на статью скопирована!", "success");
            });
        } else {
            prompt("Скопируйте ссылку:", directUrl);
        }
    });

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

function duplicateArticle(idx) {
    gatherValues();
    const articles = portalConfig.articles || [];
    if (idx < 0 || idx >= articles.length) return;

    const source = articles[idx];
    const copy = JSON.parse(JSON.stringify(source));
    copy.id = 'art-' + new Date().getTime();
    copy.title = (copy.title || 'Статья') + ' (Копия)';
    copy.status = 'draft';

    portalConfig.articles.splice(idx + 1, 0, copy);
    activeArticleIdx = idx + 1;
    renderArticlesList();
    selectArticle(activeArticleIdx);
    showToast("Статья успешно дублирована как черновик!", "success");
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
        }
    };
    portalConfig.articles.unshift(newArt);
    renderArticlesList();
    selectArticle(0);
}

// ==========================================================================
// 6. Editor.js Core Setup & Custom Tools
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
        this.button.innerHTML = '<b style="font-size:0.85em; background:#334155; color:#38bdf8; padding:1px 4px; border-radius:3px;">OK</b>';
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
            title: 'Кнопка-ссылка (CTA)',
            icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="3"/><path d="M9 12h6"/><path d="M12 9l3 3-3 3"/></svg>'
        };
    }

    static get isReadOnlySupported() {
        return true;
    }

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
        this.wrapper.style.cssText = 'background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px; margin:12px 0; font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; box-shadow:0 1px 3px rgba(0,0,0,0.03);';

        const header = document.createElement('div');
        header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.5px;';
        header.innerHTML = '<span style="display:flex; align-items:center; gap:6px;">🔘 Кнопка действия (CTA / Ссылка)</span>';
        this.wrapper.appendChild(header);

        // Inputs grid
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;';

        // Label input
        const textGroup = document.createElement('div');
        const textLabel = document.createElement('label');
        textLabel.style.cssText = 'display:block; font-size:12px; font-weight:700; color:#334155; margin-bottom:5px;';
        textLabel.textContent = 'Текст на кнопке';
        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.placeholder = 'Например: Скачать APK или Открыть инструкцию...';
        textInput.value = this.data.text;
        textInput.style.cssText = 'width:100%; box-sizing:border-box; padding:9px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-weight:600; outline:none; background:#ffffff; color:#0f172a;';
        textInput.addEventListener('input', (e) => {
            this.data.text = e.target.value;
            this.updatePreview();
        });
        textGroup.appendChild(textLabel);
        textGroup.appendChild(textInput);
        grid.appendChild(textGroup);

        // Link input
        const linkGroup = document.createElement('div');
        const linkLabel = document.createElement('label');
        linkLabel.style.cssText = 'display:block; font-size:12px; font-weight:700; color:#334155; margin-bottom:5px;';
        linkLabel.textContent = 'Ссылка (URL или статья)';
        const linkInput = document.createElement('input');
        linkInput.type = 'text';
        linkInput.placeholder = 'https://..., @username или выберите из списка...';
        linkInput.value = this.data.link;
        linkInput.style.cssText = 'width:100%; box-sizing:border-box; padding:9px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; outline:none; background:#ffffff; color:#0f172a;';
        linkInput.addEventListener('input', (e) => {
            this.data.link = e.target.value;
            this.updatePreview();
        });
        linkGroup.appendChild(linkLabel);
        linkGroup.appendChild(linkInput);
        grid.appendChild(linkGroup);

        this.wrapper.appendChild(grid);

        // Helper Article Picker & Fast Presets
        const helperRow = document.createElement('div');
        helperRow.style.cssText = 'display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:12px; font-size:12px;';

        const selectArticle = document.createElement('select');
        selectArticle.style.cssText = 'padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px; background:#ffffff; color:#334155; font-size:12px; font-weight:600; cursor:pointer; outline:none; max-width:260px;';
        selectArticle.innerHTML = '<option value="">📑 Быстрая ссылка на статью портала...</option>';
        if (portalConfig && Array.isArray(portalConfig.articles)) {
            portalConfig.articles.forEach(art => {
                if (art && art.id) {
                    const opt = document.createElement('option');
                    opt.value = `articles/${encodeURIComponent(art.id)}.html`;
                    opt.textContent = `📄 ${art.title || art.id}`;
                    selectArticle.appendChild(opt);
                }
            });
        }
        selectArticle.addEventListener('change', (e) => {
            if (e.target.value) {
                this.data.link = e.target.value;
                linkInput.value = e.target.value;
                if (!this.data.text || this.data.text === 'Текст кнопки') {
                    const selectedArt = portalConfig.articles.find(a => `articles/${encodeURIComponent(a.id)}.html` === e.target.value);
                    if (selectedArt && selectedArt.title) {
                        this.data.text = `Инструкция: ${selectedArt.title}`;
                        textInput.value = this.data.text;
                    }
                }
                this.updatePreview();
            }
        });
        helperRow.appendChild(selectArticle);

        // Fast TG Channel Preset
        const tgBtn = document.createElement('button');
        tgBtn.type = 'button';
        tgBtn.style.cssText = 'background:#e0f2fe; color:#0284c7; border:1px solid #bae6fd; border-radius:6px; padding:5px 10px; font-size:11px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px;';
        tgBtn.innerHTML = '✈️ @android_tv_shop';
        tgBtn.addEventListener('click', () => {
            this.data.link = 'https://t.me/android_tv_shop';
            linkInput.value = this.data.link;
            if (!this.data.text || this.data.text === 'Текст кнопки') {
                this.data.text = 'Канал TV SHOP в Telegram';
                textInput.value = this.data.text;
            }
            this.setStyle('telegram');
        });
        helperRow.appendChild(tgBtn);

        // Fast TG Support Preset
        const tgSupBtn = document.createElement('button');
        tgSupBtn.type = 'button';
        tgSupBtn.style.cssText = 'background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; border-radius:6px; padding:5px 10px; font-size:11px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px;';
        tgSupBtn.innerHTML = '💬 Поддержка @VladOpl';
        tgSupBtn.addEventListener('click', () => {
            this.data.link = 'https://t.me/VladOpl';
            linkInput.value = this.data.link;
            if (!this.data.text || this.data.text === 'Текст кнопки') {
                this.data.text = 'Написать в техподдержку';
                textInput.value = this.data.text;
            }
            this.setStyle('telegram');
        });
        helperRow.appendChild(tgSupBtn);

        this.wrapper.appendChild(helperRow);

        // Style selector pills
        const styleRow = document.createElement('div');
        styleRow.style.cssText = 'display:flex; align-items:center; gap:6px; margin-bottom:12px; flex-wrap:wrap;';
        
        const styles = [
            { key: 'primary', label: '🔵 Синяя (Основная)', color: '#2563eb' },
            { key: 'success', label: '🟢 Зелёная (Скачать)', color: '#16a34a' },
            { key: 'telegram', label: '✈️ Telegram', color: '#0284c7' },
            { key: 'amber', label: '🟠 Янтарная', color: '#d97706' },
            { key: 'outline', label: '⚪ Контурная', color: '#475569' }
        ];

        this.styleButtons = [];
        styles.forEach(st => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.style = st.key;
            const isSel = this.data.style === st.key;
            btn.style.cssText = `padding:5px 11px; font-size:11px; font-weight:700; border-radius:20px; border:1px solid ${isSel ? '#0f172a' : '#cbd5e1'}; background:${isSel ? '#0f172a' : '#ffffff'}; color:${isSel ? '#ffffff' : '#475569'}; cursor:pointer; transition:all 0.15s;`;
            btn.textContent = st.label;
            btn.addEventListener('click', () => {
                this.setStyle(st.key);
            });
            this.styleButtons.push(btn);
            styleRow.appendChild(btn);
        });
        this.wrapper.appendChild(styleRow);

        // Live preview inside editor block
        const previewBox = document.createElement('div');
        previewBox.classList.add('ed-btn-preview-container');
        previewBox.style.cssText = 'padding:14px; background:#ffffff; border:1px dashed #cbd5e1; border-radius:8px; text-align:center;';
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
        const url = this.data.link.trim() || '#';
        const style = this.data.style || 'primary';

        let iconSvg = '';
        if (url.includes('t.me') || url.includes('telegram') || style === 'telegram') {
            iconSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;margin-right:6px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .37z"/></svg>';
        } else if (url.match(/\.(apk|zip|rar|m3u|m3u8|pdf)$/i) || style === 'success') {
            iconSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
        } else if (url.includes('article')) {
            iconSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
        } else {
            iconSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
        }

        const safeText = escapeHtml(text);
        this.previewBox.innerHTML = `
            <div style="font-size:11px; color:#94a3b8; font-weight:600; margin-bottom:8px;">Предпросмотр кнопки на сайте:</div>
            <div class="article-btn-wrapper" style="margin:0;">
                <span class="article-btn-cta btn-${style}">
                    ${iconSvg}<span>${safeText}</span>
                </span>
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
                quotePlaceholder: 'Введите текст подсказки или цитаты...',
                captionPlaceholder: 'Автор или пояснение'
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
            config: { rows: 2, cols: 2 }
        },
        embed: {
            class: window.Embed,
            config: {
                services: {
                    youtube: true,
                    rutube: true,
                    vimeo: true
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
                "Link Button": "Кнопка-ссылка (CTA)",
                "LinkButton": "Кнопка-ссылка (CTA)",
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
                delete: { "Delete": "Удалить блок" },
                moveUp: { "Move up": "Переместить вверх" },
                moveDown: { "Move down": "Переместить вниз" }
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
                            shortcuts: { undo: 'CMD+Z', redo: 'CMD+Y' }
                        });
                    } catch (e) {}
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
                } catch (err) {}
            }
        });
    } catch (err) {
        console.error("EditorJS initialization error:", err);
    }
}

function initEditorToolbarActions() {
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

    $('#editorjs-file-input').off('change').on('change', async function() {
        const file = this.files[0];
        if (file) {
            try {
                const imgPath = await uploadMediaFileToGitHub(file);
                if (editorInstance && isEditorReady) {
                    editorInstance.blocks.insert('image', {
                        file: { url: imgPath },
                        caption: '',
                        withBorder: false,
                        stretched: false,
                        withBackground: false
                    });
                }
            } catch (err) {
                showToast("Ошибка загрузки: " + err.message, "error");
            }
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

    $('#ed-btn-add-link-btn').off('click').on('click', function() {
        if (editorInstance && isEditorReady) {
            editorInstance.blocks.insert('linkButton', { text: '', link: '', style: 'primary' });
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

// Convert HTML <-> Editor.js Blocks
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
                    data: { style: style, items: items }
                });
            }
            return;
        }

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

        if (node.classList.contains('article-btn-wrapper') || node.classList.contains('article-btn-cta') || (tag === 'a' && node.classList.contains('btn'))) {
            const aEl = tag === 'a' ? node : (node.querySelector('a') || node);
            const textSpan = aEl.querySelector('span');
            const text = textSpan ? textSpan.textContent.trim() : aEl.textContent.trim();
            const link = aEl.getAttribute('href') || '';
            let style = 'primary';
            if (aEl.classList.contains('btn-success')) style = 'success';
            else if (aEl.classList.contains('btn-telegram')) style = 'telegram';
            else if (aEl.classList.contains('btn-amber')) style = 'amber';
            else if (aEl.classList.contains('btn-outline')) style = 'outline';
            blocks.push({
                type: 'linkButton',
                data: { text: text, link: link, style: style }
            });
            return;
        }

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

        if (tag === 'table' || node.querySelector('table')) {
            const tbl = tag === 'table' ? node : node.querySelector('table');
            const rows = Array.from(tbl.querySelectorAll('tr')).map(tr => {
                return Array.from(tr.querySelectorAll('th, td')).map(cell => cell.innerHTML.trim());
            });
            if (rows.length > 0) {
                const withHeadings = tbl.querySelector('th') !== null;
                blocks.push({
                    type: 'table',
                    data: { withHeadings: withHeadings, content: rows }
                });
            }
            return;
        }

        if (tag === 'hr') {
            blocks.push({ type: 'delimiter', data: {} });
            return;
        }

        if (tag === 'p') {
            const pContent = node.innerHTML.trim();
            if (pContent) {
                blocks.push({ type: 'paragraph', data: { text: pContent } });
            }
            return;
        }

        if (node.children.length > 0) {
            Array.from(node.children).forEach(processNode);
        } else {
            const txt = node.innerHTML.trim();
            if (txt) blocks.push({ type: 'paragraph', data: { text: txt } });
        }
    }

    Array.from(tempDiv.children).forEach(processNode);
    return { time: Date.now(), blocks: blocks };
}

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
                    if (isOrdered) runningOrderedIndex++;
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
            case 'button':
            case 'linkButton':
            case 'link': {
                const text = d.text || d.title || d.label || 'Перейти';
                const url = d.link || d.url || '#';
                const style = d.style || 'primary';
                let iconSvg = '';
                if (url.includes('t.me') || url.includes('telegram') || style === 'telegram') {
                    iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .37z"/></svg>';
                } else if (url.match(/\.(apk|zip|rar|m3u|m3u8|pdf)$/i) || style === 'success') {
                    iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
                } else if (url.includes('article')) {
                    iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
                } else {
                    iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
                }
                const targetAttr = !url.startsWith('#') ? ' target="_blank" rel="noopener noreferrer"' : '';
                return `<div class="article-btn-wrapper"><a href="${escapeHtml(url)}" class="article-btn-cta btn-${style}"${targetAttr}>${iconSvg}<span>${escapeHtml(text)}</span></a></div>`;
            }
            case 'delimiter': return '<hr />';
            case 'code':
            case 'raw': return `<pre><code>${escapeHtml(d.code || d.html || '')}</code></pre>`;
            default: return d.text ? `<p>${d.text}</p>` : '';
        }
    }).filter(Boolean).join('\n');
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
        } catch (err) {}
    }
}

function updateArticleReadingTimeFromData(data) {
    const mins = window.ArticleRenderer ? ArticleRenderer.calculateReadTime(data) : 1;
    $('#tg-paper-readtime').text(`${mins} мин чтения`);
}

// ==========================================================================
// 7. Live Preview Modal
// ==========================================================================

function initArticlePreviewModal() {
    $('#tg-btn-live-preview, #btn-sidebar-preview').off('click').on('click', function() {
        openArticleLivePreview();
    });

    $('#btn-close-preview-modal').off('click').on('click', function() {
        $('#modal-article-preview').fadeOut(150);
    });

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

    $('#btn-prev-theme-toggle').off('click').on('click', function() {
        $('#tg-btn-theme-toggle').click();
    });
}

function openArticleLivePreview() {
    if (activeArticleIdx < 0 || !portalConfig.articles || !portalConfig.articles[activeArticleIdx]) {
        showToast("Сначала выберите или создайте статью!", "info");
        return;
    }

    gatherValues();
    const art = portalConfig.articles[activeArticleIdx];
    const isDraft = art.status === 'draft' || art.isDraft === true;

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

    const prodBase = "https://tvshopru.github.io/sup.tvshop";
    const artId = art.id || ('art-' + activeArticleIdx);
    $('#btn-prev-open-tab').off('click').on('click', function() {
        window.open(`${prodBase}/articles/${encodeURIComponent(artId)}.html`, '_blank');
    });

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

// ==========================================================================
// 8. Telegram Post Import Modal
// ==========================================================================

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
        if (!line) { closeList(); continue; }

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
    if (/^(И все после|Важно|Внимание|Примечание|Обратите внимание|Лайфхак|Совет)\b/i.test(plain)) return true;
    return line.startsWith('&gt;') || line.startsWith('>') || line.includes('tg-text-highlight') || line.includes('<mark>');
}

function isHeadingLine(line) {
    const plain = $('<div>').html(line).text().trim();
    if (plain.startsWith('## ') || plain.startsWith('### ')) return true;
    if (plain.length > 90) return false;
    return /^(👉|⚙️|📱|📢|✨|Так же в|Также в|Не забывайте|Как настроить|Настройка|Шаг \d+|Инструкция:)/i.test(plain);
}

// ==========================================================================
// 9. Editor Toolbar & Theme Events
// ==========================================================================

function initTelegramEditorEvents() {
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

    $('#tg-btn-paste-in-editor').off('click').on('click', function() {
        openTelegramPasteModal(false);
    });

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

    $('#btn-duplicate-article').off('click').on('click', function() {
        duplicateArticle(activeArticleIdx);
    });
}

// ==========================================================================
// 10. News & Products Renderers
// ==========================================================================

function renderNews() {
    const list = $('#news-list-container');
    list.empty();
    const news = portalConfig.news || [];
    news.forEach((n, idx) => {
        const card = $(`
            <div class="item-card news-editor-card card" style="margin-bottom:12px;" data-index="${idx}">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <span style="font-weight:700; font-size:0.95em;">Новость #${idx + 1}</span>
                    <button class="btn btn-danger btn-sm btn-delete-news" data-index="${idx}">Удалить</button>
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
                    <textarea class="form-control news-desc-tx" spellcheck="true" lang="ru" style="min-height:90px;">${escapeHtml(n.desc || '')}</textarea>
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

function renderProducts() {
    const list = $('#products-list-container');
    list.empty();
    const products = portalConfig.products || [];
    products.forEach((p, idx) => {
        const condNewSelected = p.condition === 'Новое' ? 'selected' : '';
        const condUsedSelected = p.condition === 'Б/У' ? 'selected' : '';

        const card = $(`
            <div class="item-card product-editor-card card" style="margin-bottom:14px;" data-index="${idx}">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <span style="font-weight:700;">Товар #${idx + 1}</span>
                    <button class="btn btn-danger btn-sm btn-delete-prod" data-index="${idx}">Удалить</button>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div class="form-group">
                        <label>Название товара</label>
                        <input type="text" class="form-control prod-title-in" spellcheck="true" lang="ru" value="${escapeHtml(p.title)}">
                    </div>
                    <div class="form-group">
                        <label>Цена</label>
                        <input type="text" class="form-control prod-price-in" value="${escapeHtml(p.price)}">
                    </div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div class="form-group">
                        <label>Наличие</label>
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
                    <label>Описание</label>
                    <textarea class="form-control prod-desc-tx" spellcheck="true" lang="ru" style="min-height:90px;">${escapeHtml(p.desc || '')}</textarea>
                </div>
            </div>
        `);
        list.append(card);
    });

    $('.btn-delete-prod').on('click', function() {
        const idx = parseInt($(this).attr('data-index'));
        if (confirm('Удалить этот товар?')) {
            gatherValues();
            portalConfig.products.splice(idx, 1);
            renderProducts();
        }
    });
}

// Helpers
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
    const icon = type === 'success' ? '✅' : (type === 'error' ? '❌' : 'ℹ️');
    const toast = $(`<div class="toast-msg"><span>${icon}</span><span>${message}</span></div>`);
    $('#toast-container').append(toast);
    setTimeout(() => {
        toast.fadeOut(300, function() { $(this).remove(); });
    }, 3500);
}
