let portalConfig = {};
let activeInstIdx = 0;

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
});

// Helper to make any image text input uploadable via file dialog or copy-paste (Ctrl+V)
function makeImageUploadable(inputElements) {
    inputElements.each(function() {
        const input = $(this);
        if (input.parent('.image-upload-wrapper').length) return; // Already wrapped

        const wrapper = $('<div class="image-upload-wrapper" style="display:flex; gap:10px; align-items:center; width:100%;"></div>');
        input.wrap(wrapper);

        const uploadBtn = $(
            '<button type="button" class="btn btn-secondary" style="padding: 10px 15px; font-size: 1.1em; flex-shrink: 0; line-height: 1;" title="Выбрать файл или вставить из буфера (Ctrl+V)">' +
                '📁' +
            '</button>'
        );
        const fileInput = $('<input type="file" accept="image/*" style="display:none;">');

        input.after(fileInput);
        input.after(uploadBtn);

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
    renderInstructionsList();
    selectInstruction(0);
}

// Gather all input fields into portalConfig JSON
function gatherValues() {
    portalConfig.supportText = $('#input-support-text').val();
    portalConfig.supportTg = $('#input-support-tg').val();
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
                    <input type="text" class="form-control news-title-in" value="${escapeHtml(n.title)}">
                </div>
                <div class="form-group">
                    <label>Текст описания</label>
                    <textarea class="form-control news-desc-tx">${escapeHtml(n.desc || '')}</textarea>
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
                        <input type="text" class="form-control prod-title-in" value="${escapeHtml(p.title)}">
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
                    <textarea class="form-control prod-desc-tx">${escapeHtml(p.desc || '')}</textarea>
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
                    <input type="text" class="form-control step-title-in" value="${escapeHtml(step.title)}">
                </div>
                <div class="form-group">
                    <label>Путь к картинке (по умолчанию app_logo.png)</label>
                    <input type="text" class="form-control step-img-in" value="${escapeHtml(step.imageUrl || 'app_logo.png')}">
                </div>
                <div class="form-group">
                    <label>Текст памятки</label>
                    <textarea class="form-control step-text-tx" style="min-height: 180px;">${escapeHtml(step.text || '')}</textarea>
                </div>
            </div>
        `);
        container.append(card);
    } else {
        steps.forEach((step, idx) => {
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
                    <div class="form-group">
                        <label>Заголовок шага</label>
                        <input type="text" class="form-control step-title-in" value="${escapeHtml(step.title)}">
                    </div>
                    <div class="form-group">
                        <label>Картинка шага (например, img/step_1.png)</label>
                        <input type="text" class="form-control step-img-in" value="${escapeHtml(step.imageUrl || 'app_logo.png')}">
                    </div>
                    <div class="form-group">
                        <label>Текст описания шага</label>
                        <textarea class="form-control step-text-tx">${escapeHtml(step.text || '')}</textarea>
                    </div>
                </div>
            `);
            container.append(card);
        });

        container.append('<button class="btn btn-primary btn-add" id="btn-add-step">+ Добавить шаг</button>');

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
function saveAndDeploy() {
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
