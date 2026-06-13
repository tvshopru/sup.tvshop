document.addEventListener('DOMContentLoaded', () => {
    
    // ----------------------------------------------------
    // 1. DEFAULT CONFIGURATION & STATE
    // ----------------------------------------------------
    const DEFAULT_CONFIG = {
        telegramUrl: "https://t.me/android_tv_shop",
        remoteSyncUrl: "",
        adminPin: "0000",
        callbacks: [],
        promo: {
            title: "Подключите Премиум ТВ",
            text: "1000+ телеканалов со всего мира в цифровом качестве HD и 4K. Фильмы, спорт, сериалы и мультфильмы без рекламы!",
            price: "199 ₽/мес",
            buttonText: "Подключить сейчас",
            imageUrl: "https://images.unsplash.com/photo-1593305841991-05c297ba4575?auto=format&fit=crop&w=600&q=80"
        },
        news: [
            {
                id: "1",
                date: "Сегодня, 18:30",
                title: "Добавлено 15 новых каналов!",
                text: "В пакете «Премиум» появились новые фильмовые и спортивные телеканалы в качестве Ultra HD.",
                imageUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=400&q=80"
            },
            {
                id: "2",
                date: "Вчера, 12:00",
                title: "Обновление прошивки приставок",
                text: "Вышла прошивка v2.5.4. Повышена стабильность воспроизведения 4K видео и скорость работы меню.",
                imageUrl: "https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=400&q=80"
            },
            {
                id: "3",
                date: "10 июня, 14:15",
                title: "Плановые технические работы",
                text: "15 июня с 03:00 до 05:00 МСК будут проводиться профилактические работы. Возможны прерывания вещания.",
                imageUrl: ""
            }
        ]
    };

    let currentConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    let isAdminAuthenticated = false;
    
    // Auth & Phone entry buffers
    let tempPinBuffer = "";
    let tempPhoneBuffer = ""; // Holds 10 digits after +7
    let previousFocusedElement = null;

    // ----------------------------------------------------
    // 2. AUDIO SYNTHESIZER (TV STYLE UI AUDIO CUES)
    // ----------------------------------------------------
    let audioCtx = null;

    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    // Synthesize short remote control D-pad "tick" sound
    function playTickSound() {
        try {
            initAudio();
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            osc.frequency.setValueAtTime(950, audioCtx.currentTime); // High pitch click
            osc.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.02, audioCtx.currentTime); // Very subtle
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.015); // Decay
            
            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 0.015);
        } catch (e) {
            // Audio Context blocked or unsupported
        }
    }

    // Synthesize premium UI chime
    function playChimeSound() {
        try {
            initAudio();
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
            osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.12); // E5
            osc.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
            
            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 0.35);
        } catch (e) {
            // Audio context failed
        }
    }

    // ----------------------------------------------------
    // 3. TIMERS & LIVE CLOCK
    // ----------------------------------------------------
    const clockElement = document.getElementById('live-clock');
    
    function updateClock() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        clockElement.textContent = `${hours}:${minutes}:${seconds}`;
    }
    
    setInterval(updateClock, 1000);
    updateClock();

    // ----------------------------------------------------
    // 4. TOAST SYSTEM
    // ----------------------------------------------------
    const toast = document.getElementById('toast-notification');
    const toastMsg = document.getElementById('toast-message');
    let toastTimeout;

    function showToast(message) {
        clearTimeout(toastTimeout);
        toastMsg.textContent = message;
        toast.classList.add('show');
        
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 4000);
    }

    // ----------------------------------------------------
    // 5. CONFIG LOADING & DATA SYNCING
    // ----------------------------------------------------
    async function loadConfiguration() {
        const cached = localStorage.getItem('tv_shop_config');
        if (cached) {
            try {
                currentConfig = JSON.parse(cached);
                console.log("Config loaded from LocalStorage cache");
            } catch (e) {
                console.error("Error parsing cached config, fallback to default", e);
            }
        }

        try {
            const response = await fetch('config.json');
            if (response.ok) {
                const serverConfig = await response.json();
                if (!cached) {
                    currentConfig = serverConfig;
                    localStorage.setItem('tv_shop_config', JSON.stringify(currentConfig));
                    console.log("Config initialized from server config.json");
                }
            }
        } catch (e) {
            console.log("Local config.json fetch failed or omitted, using cached/default");
        }

        if (currentConfig.remoteSyncUrl) {
            await fetchFromRemoteSync(currentConfig.remoteSyncUrl);
        }

        renderAllViews();
        checkAdminMode();
    }

    async function fetchFromRemoteSync(url) {
        try {
            console.log("Fetching live updates from remote sync URL:", url);
            const response = await fetch(url);
            if (response.ok) {
                let liveData = await response.json();
                if (liveData.record) {
                    liveData = liveData.record;
                }
                
                if (liveData.telegramUrl || liveData.news) {
                    // Make sure we keep the callbacks queue merging locally
                    const mergedCallbacks = mergeCallbacks(currentConfig.callbacks, liveData.callbacks);
                    currentConfig = liveData;
                    currentConfig.callbacks = mergedCallbacks;
                    
                    localStorage.setItem('tv_shop_config', JSON.stringify(currentConfig));
                    console.log("Config updated in real-time from remote sync database");
                }
            }
        } catch (e) {
            console.error("Failed to fetch from remote sync URL:", e);
        }
    }

    function mergeCallbacks(local, remote) {
        const arr = [...(remote || [])];
        const localArr = local || [];
        localArr.forEach(l => {
            if (!arr.some(r => r.id === l.id)) {
                arr.push(l);
            }
        });
        return arr;
    }

    // Helper to upload latest callbacks and configuration
    async function syncConfigToRemote() {
        if (!currentConfig.remoteSyncUrl) return false;
        
        const token = localStorage.getItem('tv_shop_write_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['X-Master-Key'] = token;
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const response = await fetch(currentConfig.remoteSyncUrl, {
                method: 'PUT',
                headers: headers,
                body: JSON.stringify(currentConfig)
            });
            return response.ok;
        } catch (e) {
            console.error("Push sync error:", e);
            return false;
        }
    }

    // ----------------------------------------------------
    // 6. VIEW RENDER ENGINE
    // ----------------------------------------------------
    const qrImage = document.getElementById('support-qr-img');
    const tgLinkText = document.getElementById('support-tg-link');
    const newsContainer = document.getElementById('news-container');
    const promoContainer = document.getElementById('promo-container');
    const adminCallbacksContainer = document.getElementById('admin-callbacks-container');

    function renderAllViews() {
        renderSupport();
        renderNews();
        renderPromo();
        renderAdminNewsList();
        renderAdminCallbacksList();
    }

    function renderSupport() {
        if (!currentConfig.telegramUrl) return;
        
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(currentConfig.telegramUrl)}&color=0072ff&bgcolor=ffffff`;
        qrImage.src = qrUrl;

        try {
            const urlObj = new URL(currentConfig.telegramUrl);
            const username = urlObj.pathname.replace('/', '@');
            tgLinkText.textContent = username;
        } catch (e) {
            tgLinkText.textContent = currentConfig.telegramUrl.replace('https://t.me/', '@');
        }
    }

    function renderNews() {
        newsContainer.innerHTML = '';
        
        if (!currentConfig.news || currentConfig.news.length === 0) {
            newsContainer.innerHTML = '<div style="color: var(--text-muted); font-size:13px; text-align:center; padding: 20px;">Нет свежих новостей</div>';
            return;
        }

        currentConfig.news.forEach((item, index) => {
            const newsItem = document.createElement('div');
            newsItem.className = 'news-item';
            
            let imgHtml = '';
            if (item.imageUrl && item.imageUrl.trim() !== '') {
                imgHtml = `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}" class="news-img">`;
            }

            newsItem.innerHTML = `
                <div class="news-text-box">
                    <div class="news-date">${escapeHtml(item.date)}</div>
                    <h3 class="news-title">${escapeHtml(item.title)}</h3>
                    <p class="news-text">${escapeHtml(item.text)}</p>
                </div>
                ${imgHtml}
            `;
            
            newsContainer.appendChild(newsItem);
            
            if (index < currentConfig.news.length - 1) {
                const divider = document.createElement('div');
                divider.className = 'news-divider';
                newsContainer.appendChild(divider);
            }
        });
    }

    function renderPromo() {
        promoContainer.innerHTML = '';
        const promo = currentConfig.promo || DEFAULT_CONFIG.promo;
        
        const banner = document.createElement('div');
        banner.className = 'promo-banner';
        
        if (promo.imageUrl && promo.imageUrl.trim() !== '') {
            banner.style.backgroundImage = `url('${promo.imageUrl}')`;
        }

        banner.innerHTML = `
            <div class="promo-glow"></div>
            <div class="promo-banner-content">
                <div class="promo-icon-box">
                    <svg class="promo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
                        <polyline points="17 2 12 7 7 2"></polyline>
                    </svg>
                </div>
                <h3 class="promo-title">${escapeHtml(promo.title)}</h3>
                <p class="promo-text">${escapeHtml(promo.text)}</p>
                <div class="promo-price">${escapeHtml(promo.price)}</div>
                <button class="action-button spatial-focus" tabindex="0" id="btn-promo-connect">${escapeHtml(promo.buttonText)}</button>
            </div>
        `;
        
        promoContainer.appendChild(banner);
        
        const btnPromoConnect = document.getElementById('btn-promo-connect');
        btnPromoConnect.addEventListener('click', (e) => {
            e.stopPropagation();
            openPhoneOverlay();
        });
    }

    function renderAdminCallbacksList() {
        adminCallbacksContainer.innerHTML = '';
        const callbacks = currentConfig.callbacks || [];

        if (callbacks.length === 0) {
            adminCallbacksContainer.innerHTML = '<div style="color:var(--text-muted); font-size:12px; text-align:center; padding:10px;">Нет активных заявок</div>';
            return;
        }

        callbacks.forEach(item => {
            const row = document.createElement('div');
            row.className = 'admin-news-item-row';
            row.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:2px;">
                    <span style="font-size:13px; font-weight:700; color:var(--color-cyan);">${escapeHtml(item.phone)}</span>
                    <span style="font-size:10px; color:var(--text-muted);">${escapeHtml(item.date)}</span>
                </div>
                <button type="button" class="btn-delete-news spatial-focus" tabindex="0" data-id="${item.id}" title="Удалить">
                    <svg class="delete-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            `;
            adminCallbacksContainer.appendChild(row);
        });

        adminCallbacksContainer.querySelectorAll('.btn-delete-news').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                deleteCallbackItem(id);
            });
        });
    }

    function deleteCallbackItem(id) {
        currentConfig.callbacks = (currentConfig.callbacks || []).filter(item => String(item.id) !== String(id));
        renderAdminCallbacksList();
        syncStatusText.textContent = 'Изменения не сохранены *';
        syncStatusText.classList.add('error');
        showToast('Заявка удалена из списка. Нажмите Сохранить для синхронизации.');
    }

    // ----------------------------------------------------
    // 7. ROUTING & CONTROLS
    // ----------------------------------------------------
    const navHome = document.getElementById('nav-home');
    const navInstructions = document.getElementById('nav-instructions');
    const navAdmin = document.getElementById('nav-admin');
    
    const viewDashboard = document.getElementById('view-dashboard');
    const viewInstructions = document.getElementById('view-instructions');
    const viewAdmin = document.getElementById('view-admin');
    const pageTitle = document.getElementById('page-title');

    function checkAdminMode() {
        const hasHash = window.location.hash === '#admin';
        const hasQuery = new URLSearchParams(window.location.search).get('admin') !== null;
        
        if (hasHash || hasQuery) {
            navAdmin.style.display = 'flex';
        } else {
            navAdmin.style.display = 'none';
        }
    }

    window.addEventListener('hashchange', () => {
        checkAdminMode();
    });

    function switchView(viewName) {
        viewDashboard.classList.remove('active');
        viewInstructions.classList.remove('active');
        viewAdmin.classList.remove('active');
        
        navHome.classList.remove('active');
        navInstructions.classList.remove('active');
        navAdmin.classList.remove('active');

        if (viewName === 'home') {
            viewDashboard.classList.add('active');
            navHome.classList.add('active');
            pageTitle.textContent = 'Панель поддержки';
            setTimeout(() => navHome.focus(), 50);
        } else if (viewName === 'instructions') {
            viewInstructions.classList.add('active');
            navInstructions.classList.add('active');
            pageTitle.textContent = 'Инструкции';
            const devCard = viewInstructions.querySelector('.dev-card');
            setTimeout(() => devCard.focus(), 50);
        } else if (viewName === 'admin') {
            viewAdmin.classList.add('active');
            navAdmin.classList.add('active');
            pageTitle.textContent = 'Настройки системы';
            populateAdminInputs();
            setTimeout(() => document.getElementById('input-tg-url').focus(), 50);
        }
    }

    navHome.addEventListener('click', () => switchView('home'));
    navInstructions.addEventListener('click', () => switchView('instructions'));
    
    navAdmin.addEventListener('click', () => {
        if (isAdminAuthenticated) {
            switchView('admin');
        } else {
            openAuthOverlay();
        }
    });

    const btnBackHome = document.getElementById('btn-back-home');
    btnBackHome.addEventListener('click', (e) => {
        e.stopPropagation();
        switchView('home');
    });

    // ----------------------------------------------------
    // 8. PIN-CODE AUTHORIZATION LOGIC
    // ----------------------------------------------------
    const authOverlay = document.getElementById('admin-auth-overlay');
    const pinDots = document.querySelectorAll('.pin-dot');
    
    function openAuthOverlay() {
        previousFocusedElement = document.activeElement;
        tempPinBuffer = "";
        updatePinDots();
        authOverlay.classList.add('active');
        
        const middleKey = authOverlay.querySelector('.pin-key[data-val="5"]');
        setTimeout(() => middleKey.focus(), 100);
    }

    function closeAuthOverlay(success = false) {
        authOverlay.classList.remove('active');
        tempPinBuffer = "";
        updatePinDots();
        
        if (success) {
            playChimeSound();
            isAdminAuthenticated = true;
            switchView('admin');
        } else {
            if (previousFocusedElement && typeof previousFocusedElement.focus === 'function') {
                previousFocusedElement.focus();
            } else {
                navHome.focus();
            }
        }
    }

    function updatePinDots() {
        pinDots.forEach((dot, index) => {
            dot.className = 'pin-dot';
            if (index < tempPinBuffer.length) {
                dot.classList.add('active');
            }
        });
    }

    authOverlay.querySelectorAll('.pin-key').forEach(key => {
        key.addEventListener('click', () => {
            const val = key.getAttribute('data-val');
            
            if (val === 'cancel') {
                closeAuthOverlay(false);
                return;
            }
            if (val === 'clear') {
                tempPinBuffer = "";
                updatePinDots();
                return;
            }
            
            if (tempPinBuffer.length < 4) {
                tempPinBuffer += val;
                updatePinDots();
                
                if (tempPinBuffer.length === 4) {
                    verifyPin();
                }
            }
        });
    });

    function verifyPin() {
        const configuredPin = currentConfig.adminPin || "0000";
        if (tempPinBuffer === configuredPin) {
            showToast('Доступ разрешен!');
            closeAuthOverlay(true);
        } else {
            pinDots.forEach(dot => {
                dot.classList.add('error');
            });
            showToast('Неверный ПИН-код!');
            setTimeout(() => {
                tempPinBuffer = "";
                updatePinDots();
            }, 800);
        }
    }

    // ----------------------------------------------------
    // 9. D-PAD FRIENDLY PHONE CONNECTION REQUEST MODAL
    // ----------------------------------------------------
    const phoneOverlay = document.getElementById('promo-phone-overlay');
    const phoneDisplay = document.getElementById('phone-number-display');
    const btnSubmitPhone = document.getElementById('btn-submit-phone');

    function openPhoneOverlay() {
        previousFocusedElement = document.activeElement;
        tempPhoneBuffer = "";
        updatePhoneDisplay();
        phoneOverlay.classList.add('active');
        
        const middleKey = phoneOverlay.querySelector('.pin-key[data-phone-val="5"]');
        setTimeout(() => middleKey.focus(), 100);
    }

    function closePhoneOverlay(success = false) {
        phoneOverlay.classList.remove('active');
        tempPhoneBuffer = "";
        updatePhoneDisplay();
        
        if (!success) {
            if (previousFocusedElement && typeof previousFocusedElement.focus === 'function') {
                previousFocusedElement.focus();
            } else {
                navHome.focus();
            }
        }
    }

    function updatePhoneDisplay() {
        let displayStr = "+7 (";
        
        for (let i = 0; i < 10; i++) {
            if (i === 3) displayStr += ") ";
            if (i === 6) displayStr += "-";
            if (i === 8) displayStr += "-";
            
            if (i < tempPhoneBuffer.length) {
                displayStr += tempPhoneBuffer[i];
            } else {
                displayStr += "_";
            }
        }
        
        phoneDisplay.textContent = displayStr;
    }

    phoneOverlay.querySelectorAll('.pin-key').forEach(key => {
        key.addEventListener('click', () => {
            const val = key.getAttribute('data-phone-val');
            
            if (val === 'cancel') {
                closePhoneOverlay(false);
                return;
            }
            
            if (val === 'backspace') {
                if (tempPhoneBuffer.length > 0) {
                    tempPhoneBuffer = tempPhoneBuffer.slice(0, -1);
                    updatePhoneDisplay();
                }
                return;
            }

            if (tempPhoneBuffer.length < 10) {
                tempPhoneBuffer += val;
                updatePhoneDisplay();
            }
        });
    });

    btnSubmitPhone.addEventListener('click', async () => {
        if (tempPhoneBuffer.length !== 10) {
            showToast('Пожалуйста, введите все 10 цифр вашего номера!');
            return;
        }

        const formattedPhone = `+7 (${tempPhoneBuffer.slice(0,3)}) ${tempPhoneBuffer.slice(3,6)}-${tempPhoneBuffer.slice(6,8)}-${tempPhoneBuffer.slice(8,10)}`;
        
        const now = new Date();
        const timestamp = `${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()}, ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

        const callbackObj = {
            id: Date.now(),
            phone: formattedPhone,
            date: timestamp
        };

        if (!currentConfig.callbacks) currentConfig.callbacks = [];
        currentConfig.callbacks.unshift(callbackObj);

        localStorage.setItem('tv_shop_config', JSON.stringify(currentConfig));
        renderAdminCallbacksList();

        closePhoneOverlay(true);
        playChimeSound();
        showToast('Заявка принята! Оператор свяжется с вами в течение 5 минут.');

        if (currentConfig.remoteSyncUrl) {
            const ok = await syncConfigToRemote();
            if (ok) {
                console.log("Callbacks synchronized online in background");
            }
        }
    });

    // ----------------------------------------------------
    // 10. ADMIN DASHBOARD ACTIONS (EDIT, SAVE, SYNC)
    // ----------------------------------------------------
    const inputTgUrl = document.getElementById('input-tg-url');
    const inputSyncUrl = document.getElementById('input-sync-url');
    const inputAdminPin = document.getElementById('input-admin-pin');
    const inputAuthToken = document.getElementById('input-auth-token');
    
    const inputPromoTitle = document.getElementById('input-promo-title');
    const inputPromoText = document.getElementById('input-promo-text');
    const inputPromoPrice = document.getElementById('input-promo-price');
    const inputPromoBtnText = document.getElementById('input-promo-btn-text');
    const inputPromoImg = document.getElementById('input-promo-img');
    
    const inputNewsTitle = document.getElementById('input-news-title');
    const inputNewsText = document.getElementById('input-news-text');
    const inputNewsDate = document.getElementById('input-news-date');
    const inputNewsImg = document.getElementById('input-news-img');
    
    const adminNewsContainer = document.getElementById('admin-news-list-container');
    const syncStatusText = document.getElementById('admin-sync-status');
    
    const btnAddNewsItem = document.getElementById('btn-add-news-item');
    const btnAdminSave = document.getElementById('btn-admin-save');
    const btnAdminDownload = document.getElementById('btn-admin-download');
    const btnAdminReset = document.getElementById('btn-admin-reset');

    function populateAdminInputs() {
        inputTgUrl.value = currentConfig.telegramUrl || '';
        inputSyncUrl.value = currentConfig.remoteSyncUrl || '';
        inputAdminPin.value = currentConfig.adminPin || '0000';
        
        inputAuthToken.value = localStorage.getItem('tv_shop_write_token') || '';
        
        const promo = currentConfig.promo || DEFAULT_CONFIG.promo;
        inputPromoTitle.value = promo.title || '';
        inputPromoText.value = promo.text || '';
        inputPromoPrice.value = promo.price || '';
        inputPromoBtnText.value = promo.buttonText || '';
        inputPromoImg.value = promo.imageUrl || '';
        
        syncStatusText.textContent = 'Изменения не сохранены';
        syncStatusText.className = 'admin-footer-status';
        renderAdminNewsList();
        renderAdminCallbacksList();
    }

    function renderAdminNewsList() {
        adminNewsContainer.innerHTML = '';
        
        if (!currentConfig.news || currentConfig.news.length === 0) {
            adminNewsContainer.innerHTML = '<div style="color:var(--text-muted); font-size:12px; text-align:center; padding:10px;">Список новостей пуст</div>';
            return;
        }

        currentConfig.news.forEach(item => {
            const row = document.createElement('div');
            row.className = 'admin-news-item-row';
            row.innerHTML = `
                <span class="admin-news-item-title">${escapeHtml(item.title)}</span>
                <button type="button" class="btn-delete-news spatial-focus" tabindex="0" data-id="${item.id}" title="Удалить">
                    <svg class="delete-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            `;
            adminNewsContainer.appendChild(row);
        });

        adminNewsContainer.querySelectorAll('.btn-delete-news').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                deleteNewsItem(id);
            });
        });
    }

    function deleteNewsItem(id) {
        currentConfig.news = currentConfig.news.filter(item => item.id !== id);
        renderAdminNewsList();
        syncStatusText.textContent = 'Изменения не сохранены *';
        syncStatusText.classList.add('error');
        showToast('Новость удалена. Не забудьте сохранить изменения!');
    }

    btnAddNewsItem.addEventListener('click', () => {
        const title = inputNewsTitle.value.trim();
        const text = inputNewsText.value.trim();
        let date = inputNewsDate.value.trim();
        const imageUrl = inputNewsImg.value.trim();

        if (!title || !text) {
            showToast('Заполните название и текст новости!');
            return;
        }

        if (!date) {
            const now = new Date();
            const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
            date = `${now.getDate()} ${months[now.getMonth()]}, ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        }

        const newItem = {
            id: String(Date.now()),
            title,
            text,
            date,
            imageUrl
        };

        currentConfig.news.unshift(newItem);
        
        inputNewsTitle.value = '';
        inputNewsText.value = '';
        inputNewsDate.value = '';
        inputNewsImg.value = '';

        renderAdminNewsList();
        syncStatusText.textContent = 'Изменения не сохранены *';
        syncStatusText.classList.add('error');
        showToast('Новость успешно добавлена в список!');
    });

    btnAdminSave.addEventListener('click', async () => {
        const pin = inputAdminPin.value.trim();
        if (pin.length !== 4 || isNaN(Number(pin))) {
            showToast('ПИН-код панели должен состоять ровно из 4-х цифр!');
            return;
        }

        const token = inputAuthToken.value.trim();
        localStorage.setItem('tv_shop_write_token', token);

        currentConfig.telegramUrl = inputTgUrl.value.trim() || DEFAULT_CONFIG.telegramUrl;
        currentConfig.remoteSyncUrl = inputSyncUrl.value.trim();
        currentConfig.adminPin = pin;
        
        currentConfig.promo = {
            title: inputPromoTitle.value.trim() || DEFAULT_CONFIG.promo.title,
            text: inputPromoText.value.trim() || DEFAULT_CONFIG.promo.text,
            price: inputPromoPrice.value.trim() || DEFAULT_CONFIG.promo.price,
            buttonText: inputPromoBtnText.value.trim() || DEFAULT_CONFIG.promo.buttonText,
            imageUrl: inputPromoImg.value.trim() || DEFAULT_CONFIG.promo.imageUrl
        };

        localStorage.setItem('tv_shop_config', JSON.stringify(currentConfig));
        renderAllViews();

        if (currentConfig.remoteSyncUrl) {
            syncStatusText.textContent = 'Синхронизация...';
            syncStatusText.className = 'admin-footer-status';
            
            const ok = await syncConfigToRemote();
            if (ok) {
                syncStatusText.textContent = 'Синхронизировано онлайн ✅';
                syncStatusText.className = 'admin-footer-status saved';
                playChimeSound();
                showToast('Конфигурация успешно сохранена и синхронизирована с сервером!');
            } else {
                syncStatusText.textContent = 'Ошибка онлайн-синхронизации (сохранено локально)';
                syncStatusText.className = 'admin-footer-status error';
                showToast('Ошибка авторизации или сети! Изменения сохранены только локально.');
            }
        } else {
            syncStatusText.textContent = 'Сохранено локально';
            syncStatusText.className = 'admin-footer-status saved';
            playChimeSound();
            showToast('Конфигурация сохранена в памяти устройства.');
        }
    });

    btnAdminDownload.addEventListener('click', () => {
        try {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentConfig, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", "config.json");
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
            showToast('Файл config.json успешно сгенерирован и скачан!');
        } catch (e) {
            showToast('Не удалось сгенерировать файл конфигурации.');
        }
    });

    btnAdminReset.addEventListener('click', () => {
        if (confirm('Сбросить все настройки к начальным значениям? Внесенные изменения будут удалены.')) {
            currentConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
            localStorage.setItem('tv_shop_config', JSON.stringify(currentConfig));
            localStorage.removeItem('tv_shop_write_token');
            populateAdminInputs();
            renderAllViews();
            showToast('Настройки сброшены к значениям по умолчанию.');
        }
    });

    // ----------------------------------------------------
    // 11. D-PAD / KEYBOARD NAVIGATION CONTROLLER (TV SUPPORT)
    // ----------------------------------------------------
    document.addEventListener('focusin', (e) => {
        if (e.target.classList.contains('spatial-focus')) {
            playTickSound();
        }

        document.querySelectorAll('.spatial-focus').forEach(el => {
            el.classList.remove('focused');
        });
        
        if (e.target.classList.contains('spatial-focus')) {
            e.target.classList.add('focused');
        }
    });

    document.addEventListener('keydown', (e) => {
        const activeElement = document.activeElement;
        const isAuthActive = authOverlay.classList.contains('active');
        const isPhoneActive = phoneOverlay.classList.contains('active');
        
        if (e.key === 'Enter') {
            if (activeElement && activeElement.tagName !== 'INPUT' && activeElement.tagName !== 'TEXTAREA') {
                activeElement.click();
                e.preventDefault();
                return;
            }
        }

        if (e.key === 'Backspace' || e.key === 'Escape') {
            const isTyping = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');
            
            if (isAuthActive) {
                closeAuthOverlay(false);
                e.preventDefault();
                return;
            }
            
            if (isPhoneActive) {
                closePhoneOverlay(false);
                e.preventDefault();
                return;
            }
            
            if (isTyping && e.key === 'Backspace') {
                return;
            }

            if (viewInstructions.classList.contains('active') || viewAdmin.classList.contains('active')) {
                switchView('home');
                e.preventDefault();
            } else {
                showToast('Нажмите BACK еще раз для выхода из приложения');
            }
            return;
        }

        let direction = '';
        if (e.key === 'ArrowUp') direction = 'up';
        else if (e.key === 'ArrowDown') direction = 'down';
        else if (e.key === 'ArrowLeft') direction = 'left';
        else if (e.key === 'ArrowRight') direction = 'right';

        if (direction) {
            const isInsideInput = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');
            if (isInsideInput && (direction === 'left' || direction === 'right')) {
                return;
            }

            e.preventDefault();
            navigateSpatially(direction);
        }
    });

    function navigateSpatially(direction) {
        const activeElement = document.activeElement;
        const isAuthActive = authOverlay.classList.contains('active');
        const isPhoneActive = phoneOverlay.classList.contains('active');
        
        let focusableElements = Array.from(document.querySelectorAll('.spatial-focus')).filter(el => {
            return el.offsetParent !== null && window.getComputedStyle(el).display !== 'none';
        });

        if (isAuthActive) {
            focusableElements = focusableElements.filter(el => authOverlay.contains(el));
        } else if (isPhoneActive) {
            focusableElements = focusableElements.filter(el => phoneOverlay.contains(el));
        }

        if (focusableElements.length === 0) return;

        if (!activeElement || !focusableElements.includes(activeElement)) {
            focusableElements[0].focus();
            return;
        }

        const activeRect = activeElement.getBoundingClientRect();
        const activeCenter = {
            x: activeRect.left + activeRect.width / 2,
            y: activeRect.top + activeRect.height / 2
        };

        let bestCandidate = null;
        let bestScore = Infinity;

        focusableElements.forEach(candidate => {
            if (candidate === activeElement) return;

            const candRect = candidate.getBoundingClientRect();
            const candCenter = {
                x: candRect.left + candRect.width / 2,
                y: candRect.top + candRect.height / 2
            };

            const dx = candCenter.x - activeCenter.x;
            const dy = candCenter.y - activeCenter.y;

            let isValidDirection = false;
            switch (direction) {
                case 'right':
                    isValidDirection = dx > 5;
                    break;
                case 'left':
                    isValidDirection = dx < -5;
                    break;
                case 'down':
                    isValidDirection = dy > 5;
                    break;
                case 'up':
                    isValidDirection = dy < -5;
                    break;
            }

            if (!isValidDirection) return;

            const primaryDist = Math.abs(direction === 'left' || direction === 'right' ? dx : dy);
            const secondaryDist = Math.abs(direction === 'left' || direction === 'right' ? dy : dx);
            
            let weight = 3.5;
            if (viewAdmin.classList.contains('active')) {
                weight = 6.0;
            } else if (isAuthActive || isPhoneActive) {
                weight = 2.0;
            }

            const score = primaryDist + (weight * secondaryDist);

            if (score < bestScore) {
                bestScore = score;
                bestCandidate = candidate;
            }
        });

        if (bestCandidate) {
            bestCandidate.focus();
        }
    }

    // ----------------------------------------------------
    // 12. HELPER FUNCTIONS
    // ----------------------------------------------------
    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    loadConfiguration();
});
