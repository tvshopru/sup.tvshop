/**
 * TV SHOP Unified Article Renderer Engine (CodeX Editor.js Core)
 * Single Source of Truth for rendering Editor.js blocks to HTML across:
 * - Public Article Viewer (article.html)
 * - Online Cloud Admin Studio (admin.html & admin.js)
 * - Local Manager Desktop App (tvshop_manager app.js & index.html)
 */

(function (global) {
    'use strict';

    var ArticleRenderer = {
        version: '2.0.0',

        /**
         * Escape HTML string
         */
        escapeHtml: function (string) {
            if (!string) return '';
            var str = String(string);
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        },

        /**
         * Converts Editor.js JSON data (blocks) into clean, modern semantic HTML
         * @param {Object} data - { time: number, blocks: Array, version?: string }
         * @returns {string} HTML string
         */
        renderBlocks: function (data) {
            if (!data) return '';
            var blocks = Array.isArray(data) ? data : (data.blocks && Array.isArray(data.blocks) ? data.blocks : []);
            if (!blocks.length) return '';

            var htmlParts = [];
            var runningOrderedIndex = 1;

            blocks.forEach(function (block) {
                if (!block) return;
                var type = block.type || 'paragraph';
                var d = block.data || {};

                switch (type) {
                    case 'header': {
                        var level = Math.min(Math.max(parseInt(d.level || 2, 10), 1), 6);
                        var text = d.text || '';
                        if (text.trim()) {
                            htmlParts.push('<h' + level + '>' + text + '</h' + level + '>');
                        }
                        break;
                    }

                    case 'paragraph': {
                        var pText = d.text || '';
                        if (pText.trim()) {
                            htmlParts.push('<p>' + pText + '</p>');
                        }
                        break;
                    }

                    case 'list': {
                        var style = d.style || 'unordered';
                        var isOrdered = style === 'ordered';
                        var isChecklist = style === 'checklist';
                        var items = d.items || [];

                        if (isChecklist) {
                            var checkLis = items.map(function (item) {
                                var text = typeof item === 'string' ? item : (item.content || item.text || '');
                                var isChecked = item && item.meta && item.meta.checked;
                                var checkedClass = isChecked ? ' checked' : '';
                                var boxIcon = isChecked ? '☑' : '☐';
                                return '<li class="article-checklist-item' + checkedClass + '"><span class="checklist-box">' + boxIcon + '</span> ' + text + '</li>';
                            }).join('');
                            htmlParts.push('<ul class="article-checklist-list">' + checkLis + '</ul>');
                        } else {
                            var tag = isOrdered ? 'ol' : 'ul';
                            var startAttr = isOrdered ? ' start="' + runningOrderedIndex + '"' : '';
                            var listLis = items.map(function (item) {
                                var text = typeof item === 'string' ? item : (item.content || item.text || '');
                                if (isOrdered) {
                                    runningOrderedIndex++;
                                }
                                return '<li>' + text + '</li>';
                            }).join('');
                            htmlParts.push('<' + tag + startAttr + '>' + listLis + '</' + tag + '>');
                        }
                        break;
                    }

                    case 'image': {
                        var url = (d.file && d.file.url) || d.url || '';
                        if (!url) break;
                        var caption = d.caption || '';
                        var withBorder = d.withBorder ? ' img-bordered' : '';
                        var stretched = d.stretched ? ' img-stretched' : '';
                        var withBg = d.withBackground ? ' img-with-bg' : '';

                        var captionHtml = caption && caption.trim() 
                            ? '<figcaption class="article-image-caption">' + caption + '</figcaption>' 
                            : '';

                        htmlParts.push(
                            '<figure class="article-image-figure' + withBorder + stretched + withBg + '">' +
                                '<img src="' + url + '" alt="' + ArticleRenderer.escapeHtml(caption) + '" loading="lazy" />' +
                                captionHtml +
                            '</figure>'
                        );
                        break;
                    }

                    case 'quote': {
                        var qText = d.text || '';
                        var cite = d.caption || '';
                        var citeHtml = cite && cite.trim() ? '<cite>' + cite + '</cite>' : '';
                        htmlParts.push(
                            '<blockquote class="article-quote-block">' +
                                '<p>' + qText + '</p>' +
                                citeHtml +
                            '</blockquote>'
                        );
                        break;
                    }

                    case 'warning':
                    case 'alert': {
                        var title = d.title || 'Важно';
                        var message = d.message || '';
                        htmlParts.push(
                            '<div class="article-alert-card">' +
                                '<div class="article-alert-header">' +
                                    '<span class="article-alert-icon">⚠️</span>' +
                                    '<strong>' + ArticleRenderer.escapeHtml(title) + '</strong>' +
                                '</div>' +
                                '<div class="article-alert-body">' + message + '</div>' +
                            '</div>'
                        );
                        break;
                    }

                    case 'table': {
                        var rows = d.content || [];
                        var withHeadings = !!d.withHeadings;
                        if (!rows.length) break;

                        var rowsHtml = rows.map(function (row, rIdx) {
                            var isHeaderRow = withHeadings && rIdx === 0;
                            var cellTag = isHeaderRow ? 'th' : 'td';
                            var cellsHtml = (row || []).map(function (cell) {
                                return '<' + cellTag + '>' + (cell || '') + '</' + cellTag + '>';
                            }).join('');
                            return '<tr>' + cellsHtml + '</tr>';
                        }).join('');

                        htmlParts.push(
                            '<div class="article-table-responsive">' +
                                '<table class="article-table">' +
                                    '<tbody>' + rowsHtml + '</tbody>' +
                                '</table>' +
                            '</div>'
                        );
                        break;
                    }

                    case 'embed': {
                        var embedSrc = d.embed || d.source || '';
                        if (!embedSrc) break;
                        var embedCaption = d.caption || '';
                        var embedCaptionHtml = embedCaption && embedCaption.trim() 
                            ? '<div class="article-embed-caption">' + embedCaption + '</div>' 
                            : '';

                        htmlParts.push(
                            '<div class="article-embed-wrapper">' +
                                '<div class="article-embed-responsive">' +
                                    '<iframe src="' + ArticleRenderer.escapeHtml(embedSrc) + '" frameborder="0" allowfullscreen loading="lazy"></iframe>' +
                                '</div>' +
                                embedCaptionHtml +
                            '</div>'
                        );
                        break;
                    }

                    case 'delimiter': {
                        htmlParts.push('<hr class="article-delimiter" />');
                        break;
                    }

                    case 'code':
                    case 'raw': {
                        var codeContent = d.code || d.html || '';
                        htmlParts.push('<pre><code>' + ArticleRenderer.escapeHtml(codeContent) + '</code></pre>');
                        break;
                    }

                    default: {
                        if (d.text && d.text.trim()) {
                            htmlParts.push('<p>' + d.text + '</p>');
                        }
                        break;
                    }
                }
            });

            return htmlParts.join('\n');
        },

        /**
         * Cleans legacy HTML (removes placeholder artefacts, normalizes image sources)
         */
        cleanHtml: function (html) {
            if (!html || !html.trim()) return '';
            if (typeof document === 'undefined') return html;

            var temp = document.createElement('div');
            temp.innerHTML = html;

            var placeholders = temp.querySelectorAll('.tg-photo-placeholder, .tg-img-hover-actions');
            placeholders.forEach(function (el) { el.remove(); });

            var wrappers = temp.querySelectorAll('.tg-img-wrapper');
            wrappers.forEach(function (w) {
                var img = w.querySelector('img');
                if (img) w.replaceWith(img);
            });

            var imgs = temp.querySelectorAll('img');
            imgs.forEach(function (img) {
                var src = img.getAttribute('src') || '';
                src = src.replace(/^https?:\/\/[^\/]+\/(img\/[^\s"']+)/i, '$1');
                src = src.replace(/^https?:\/\/[^\/]+:?\d*\/(img\/[^\s"']+)/i, '$1');
                img.setAttribute('src', src);
                img.removeAttribute('title');
            });

            var captions = temp.querySelectorAll('.tg-img-caption');
            captions.forEach(function (el) {
                var txt = el.textContent.trim();
                if (!txt || txt === 'Подпись' || txt === 'Подпись к фото...') {
                    el.remove();
                }
            });

            var lis = temp.querySelectorAll('li');
            lis.forEach(function (li) {
                var txt = li.textContent.trim();
                if (!txt && !li.querySelector('img, span, strong, b, a')) {
                    li.remove();
                }
            });

            var lists = temp.querySelectorAll('ol, ul');
            lists.forEach(function (l) {
                if (!l.querySelector('li')) {
                    l.remove();
                }
            });

            return temp.innerHTML;
        },

        /**
         * High-level article renderer
         * Accepts an article object or Editor.js data and returns formatted HTML
         */
        render: function (articleOrData) {
            if (!articleOrData) return '';

            // 1. Check if passed an Editor.js data object
            if (articleOrData.blocks && Array.isArray(articleOrData.blocks) && articleOrData.blocks.length > 0) {
                return this.renderBlocks(articleOrData);
            }

            // 2. Check if passed an Article model with contentData
            if (articleOrData.contentData && articleOrData.contentData.blocks && articleOrData.contentData.blocks.length > 0) {
                return this.renderBlocks(articleOrData.contentData);
            }

            // 3. Fallback: check article.blocks legacy field
            if (articleOrData.blocks && articleOrData.blocks.blocks && Array.isArray(articleOrData.blocks.blocks)) {
                return this.renderBlocks(articleOrData.blocks);
            }

            // 4. Fallback: clean contentHtml
            if (articleOrData.contentHtml && articleOrData.contentHtml.trim()) {
                return this.cleanHtml(articleOrData.contentHtml);
            }

            return '';
        },

        /**
         * Converts raw HTML into Editor.js blocks (for Telegram paste / import)
         */
        htmlToEditorData: function (html) {
            if (!html || !html.trim()) {
                return { time: Date.now(), blocks: [{ type: 'paragraph', data: { text: '' } }] };
            }

            if (typeof document === 'undefined') {
                return { time: Date.now(), blocks: [{ type: 'paragraph', data: { text: html } }] };
            }

            var tempDiv = document.createElement('div');
            tempDiv.innerHTML = html.trim();
            var blocks = [];

            function processNode(node) {
                if (node.nodeType === Node.TEXT_NODE) {
                    var text = node.textContent.trim();
                    if (text) {
                        blocks.push({ type: 'paragraph', data: { text: ArticleRenderer.escapeHtml(text) } });
                    }
                    return;
                }
                if (node.nodeType !== Node.ELEMENT_NODE) return;

                var tag = node.tagName.toLowerCase();

                if (/^h[1-6]$/.test(tag)) {
                    var level = parseInt(tag.charAt(1), 10);
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
                    var style = tag === 'ol' ? 'ordered' : 'unordered';
                    var items = [];
                    Array.from(node.children).forEach(function (child) {
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
                    var imgEl = tag === 'img' ? node : node.querySelector('img');
                    if (imgEl && imgEl.getAttribute('src')) {
                        var captionEl = node.querySelector('.article-image-caption') || node.querySelector('figcaption');
                        var captionText = captionEl ? captionEl.innerHTML.trim() : (imgEl.getAttribute('alt') || '');
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
                    var citeEl = node.querySelector('cite');
                    var citeText = citeEl ? citeEl.innerHTML.trim() : '';
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

                if (node.classList.contains('article-alert-card') || node.classList.contains('tg-highlight-box') || node.classList.contains('cdx-warning')) {
                    var titleEl = node.querySelector('b') || node.querySelector('strong') || node.querySelector('.cdx-warning__title');
                    var titleText = titleEl ? titleEl.innerHTML.trim() : 'Важно';
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

                if (tag === 'iframe' || node.querySelector('iframe')) {
                    var iframe = tag === 'iframe' ? node : node.querySelector('iframe');
                    if (iframe && iframe.getAttribute('src')) {
                        var src = iframe.getAttribute('src');
                        blocks.push({
                            type: 'embed',
                            data: {
                                service: src.includes('rutube') ? 'rutube' : 'youtube',
                                source: src,
                                embed: src,
                                caption: ''
                            }
                        });
                    }
                    return;
                }

                if (tag === 'table' || node.querySelector('table')) {
                    var tbl = tag === 'table' ? node : node.querySelector('table');
                    var rows = Array.from(tbl.querySelectorAll('tr')).map(function (tr) {
                        return Array.from(tr.querySelectorAll('th, td')).map(function (cell) {
                            return cell.innerHTML.trim();
                        });
                    });
                    if (rows.length > 0) {
                        var withHeadings = tbl.querySelector('th') !== null;
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
                    var pContent = node.innerHTML.trim();
                    if (pContent) {
                        blocks.push({ type: 'paragraph', data: { text: pContent } });
                    }
                    return;
                }

                if (node.children.length > 0) {
                    Array.from(node.children).forEach(processNode);
                } else {
                    var txt = node.innerHTML.trim();
                    if (txt) blocks.push({ type: 'paragraph', data: { text: txt } });
                }
            }

            Array.from(tempDiv.children).forEach(processNode);
            return { time: Date.now(), blocks: blocks };
        },

        /**
         * Calculates estimated reading time in minutes
         */
        calculateReadTime: function (data) {
            var wordCount = 0;
            if (data && data.blocks) {
                data.blocks.forEach(function (b) {
                    var d = b.data || {};
                    var text = (d.text || d.message || d.title || d.caption || '') + ' ' + (Array.isArray(d.items) ? d.items.join(' ') : '');
                    if (typeof document !== 'undefined') {
                        var clean = document.createElement('div');
                        clean.innerHTML = text;
                        var plain = clean.textContent.trim();
                        if (plain) wordCount += plain.split(/\s+/).filter(Boolean).length;
                    } else {
                        wordCount += text.replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).length;
                    }
                });
            }
            return Math.max(1, Math.ceil(wordCount / 150));
        },

        /**
         * Generates complete standalone HTML file with Open Graph tags for Telegram previews
         */
        generateArticleHtml: function (article, options) {
            options = options || {};
            var baseUrl = options.baseUrl || 'https://tvshopru.github.io/sup.tvshop';
            var title = (article && article.title) ? article.title.trim() : 'Статья TV SHOP';
            var author = (article && article.author) ? article.author.trim() : 'TV SHOP';
            var date = (article && article.date) ? article.date.trim() : 'Сегодня';
            var artId = (article && article.id) ? article.id : 'article';
            var videoUrl = (article && article.videoUrl) ? article.videoUrl.trim() : '';

            // Render body HTML
            var bodyHtml = this.render(article) || '<p>' + (article.description || '') + '</p>';

            // Extract plain text for description (max 180 chars)
            var plainText = (bodyHtml || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            var description = plainText.length > 180 ? plainText.substring(0, 177) + '...' : (plainText || 'Инструкции и руководства от TV SHOP');

            // Always use official square TV SHOP logo for compact Telegram snippet on the right
            var ogImage = 'https://tvshopru.github.io/sup.tvshop/app_logo.png';

            var canonicalUrl = baseUrl + '/articles/' + encodeURIComponent(artId) + '.html';
            var readTime = this.calculateReadTime(article.contentData || article.blocks) || 1;

            var videoBtnHtml = videoUrl ? 
                '<a href="' + this.escapeHtml(videoUrl) + '" target="_blank" class="video-banner-btn">' +
                    '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' +
                    '<span>Смотреть видеоверсию инструкции</span>' +
                '</a>' : '';

            return '<!DOCTYPE html>\n' +
'<html lang="ru">\n' +
'<head>\n' +
'    <meta charset="UTF-8">\n' +
'    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">\n' +
'    <title>' + this.escapeHtml(title) + ' - TV SHOP</title>\n' +
'    <meta name="description" content="' + this.escapeHtml(description) + '">\n' +
'    <link rel="icon" type="image/png" href="../app_logo.png?v=2">\n' +
'    <link rel="canonical" href="' + canonicalUrl + '">\n\n' +
'    <!-- Open Graph for Telegram & Social Previews (Compact Card) -->\n' +
'    <meta property="og:site_name" content="TV SHOP">\n' +
'    <meta property="og:type" content="article">\n' +
'    <meta property="og:title" content="' + this.escapeHtml(title) + '">\n' +
'    <meta property="og:description" content="' + this.escapeHtml(description) + '">\n' +
'    <meta property="og:image" content="' + this.escapeHtml(ogImage) + '">\n' +
'    <meta property="og:image:width" content="300">\n' +
'    <meta property="og:image:height" content="300">\n' +
'    <meta property="og:url" content="' + canonicalUrl + '">\n\n' +
'    <!-- Twitter Card (Compact summary) -->\n' +
'    <meta name="twitter:card" content="summary">\n' +
'    <meta name="twitter:title" content="' + this.escapeHtml(title) + '">\n' +
'    <meta name="twitter:description" content="' + this.escapeHtml(description) + '">\n' +
'    <meta name="twitter:image" content="' + this.escapeHtml(ogImage) + '">\n\n' +
'    <!-- Unified Stylesheet -->\n' +
'    <link rel="stylesheet" href="../css/article.css?v=20261010_02">\n' +
'    <style>\n' +
'        :root {\n' +
'            --bg-color: #ffffff;\n' +
'            --bg-secondary: #f8fafc;\n' +
'            --card-bg: #ffffff;\n' +
'            --text-primary: #111827;\n' +
'            --text-secondary: #4b5563;\n' +
'            --text-muted: #9ca3af;\n' +
'            --accent-color: #2481cc;\n' +
'            --accent-hover: #1b66a3;\n' +
'            --accent-light: #e8f4fd;\n' +
'            --border-color: #e5e7eb;\n' +
'            --header-bg: rgba(255, 255, 255, 0.85);\n' +
'        }\n' +
'        body.dark-theme {\n' +
'            --bg-color: #0f141c;\n' +
'            --bg-secondary: #171f2b;\n' +
'            --card-bg: #171f2b;\n' +
'            --text-primary: #f3f4f6;\n' +
'            --text-secondary: #cbd5e1;\n' +
'            --text-muted: #64748b;\n' +
'            --accent-color: #00b4d8;\n' +
'            --accent-hover: #0096c7;\n' +
'            --accent-light: rgba(0, 180, 216, 0.12);\n' +
'            --border-color: #243042;\n' +
'            --header-bg: rgba(15, 20, 28, 0.85);\n' +
'        }\n' +
'        * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }\n' +
'        body {\n' +
'            background-color: var(--bg-color);\n' +
'            color: var(--text-primary);\n' +
'            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;\n' +
'            font-size: 17px;\n' +
'            line-height: 1.7;\n' +
'            min-height: 100vh;\n' +
'            display: flex;\n' +
'            flex-direction: column;\n' +
'            transition: background-color 0.2s ease, color 0.2s ease;\n' +
'        }\n' +
'        .top-navbar {\n' +
'            position: sticky;\n' +
'            top: 0;\n' +
'            z-index: 100;\n' +
'            backdrop-filter: blur(12px);\n' +
'            -webkit-backdrop-filter: blur(12px);\n' +
'            background: var(--header-bg);\n' +
'            border-bottom: 1px solid var(--border-color);\n' +
'            padding: 10px 20px;\n' +
'            display: flex;\n' +
'            align-items: center;\n' +
'            justify-content: space-between;\n' +
'        }\n' +
'        .brand-link { display: flex; align-items: center; text-decoration: none; flex-shrink: 0; }\n' +
'        .brand-link img { width: 30px; height: 30px; border-radius: 6px; object-fit: contain; }\n' +
'        .nav-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }\n' +
'        .nav-btn {\n' +
'            background: transparent;\n' +
'            border: 1px solid var(--border-color);\n' +
'            color: var(--text-secondary);\n' +
'            border-radius: 16px;\n' +
'            padding: 4px 9px;\n' +
'            font-size: 0.8em;\n' +
'            font-weight: 600;\n' +
'            cursor: pointer;\n' +
'            display: inline-flex;\n' +
'            align-items: center;\n' +
'            gap: 4px;\n' +
'            text-decoration: none;\n' +
'            white-space: nowrap;\n' +
'            transition: all 0.2s;\n' +
'            line-height: 1.2;\n' +
'        }\n' +
'        .nav-btn:hover { background: var(--accent-light); color: var(--accent-color); border-color: var(--accent-color); }\n' +
'        .nav-btn-icon { width: 30px; height: 30px; padding: 0; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; }\n' +
'        .article-container { width: 100%; max-width: 740px; margin: 0 auto; padding: 36px 20px 80px 20px; flex: 1; }\n' +
'        .article-header { margin-bottom: 30px; padding-bottom: 22px; border-bottom: 1px solid var(--border-color); }\n' +
'        .article-title { font-size: 2.2em; font-weight: 800; line-height: 1.25; color: var(--text-primary); margin-bottom: 16px; letter-spacing: -0.5px; }\n' +
'        @media (max-width: 600px) { .article-title { font-size: 1.75em; } .article-container { padding: 20px 16px 60px 16px; } }\n' +
'        .article-meta-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 0.9em; color: var(--text-secondary); }\n' +
'        .author-badge { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; color: var(--accent-color); text-decoration: none; }\n' +
'        .author-badge:hover { text-decoration: underline; }\n' +
'        .meta-dot { opacity: 0.5; }\n' +
'        .video-banner-btn {\n' +
'            display: flex; align-items: center; justify-content: center; gap: 10px;\n' +
'            background: var(--accent-light); color: var(--accent-color); border: 1px solid var(--accent-color);\n' +
'            border-radius: 12px; padding: 14px 20px; text-decoration: none; font-weight: 700; font-size: 1em;\n' +
'            margin-bottom: 28px; transition: all 0.2s;\n' +
'        }\n' +
'        .video-banner-btn:hover { background: var(--accent-color); color: #ffffff; box-shadow: 0 4px 14px rgba(36, 129, 204, 0.3); }\n' +
'        .share-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(100px); background: #1e293b; color: #fff; padding: 10px 20px; border-radius: 30px; font-size: 0.88em; font-weight: 600; opacity: 0; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); z-index: 1000; box-shadow: 0 4px 20px rgba(0,0,0,0.25); pointer-events: none; }\n' +
'        .share-toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }\n' +
'    </style>\n' +
'</head>\n' +
'<body>\n' +
'    <header class="top-navbar">\n' +
'        <a href="../articles.html" class="brand-link" title="Все статьи TV SHOP">\n' +
'            <img src="../app_logo.png" alt="TV SHOP Logo">\n' +
'        </a>\n' +
'        <div class="nav-actions">\n' +
'            <a href="../articles.html" class="nav-btn" title="Вернуться к списку статей">\n' +
'                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>\n' +
'                <span>Все статьи</span>\n' +
'            </a>\n' +
'            <button type="button" class="nav-btn nav-btn-icon" id="btn-theme-toggle" title="Переключить тему">\n' +
'                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>\n' +
'            </button>\n' +
'            <button type="button" class="nav-btn nav-btn-icon" id="btn-share-article" title="Поделиться статьей">\n' +
'                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>\n' +
'            </button>\n' +
'        </div>\n' +
'    </header>\n\n' +
'    <main class="article-container">\n' +
'        <article>\n' +
'            <header class="article-header">\n' +
'                <h1 class="article-title">' + this.escapeHtml(title) + '</h1>\n' +
'                <div class="article-meta-row">\n' +
'                    <a href="https://t.me/android_tv_shop" target="_blank" class="author-badge">\n' +
'                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z"/></svg>\n' +
'                        <span>' + this.escapeHtml(author) + '</span>\n' +
'                    </a>\n' +
'                    <span class="meta-dot">•</span>\n' +
'                    <time datetime="' + this.escapeHtml(date) + '">' + this.escapeHtml(date) + '</time>\n' +
'                    <span class="meta-dot">•</span>\n' +
'                    <span>' + readTime + ' мин чтения</span>\n' +
'                </div>\n' +
'            </header>\n\n' +
'            ' + videoBtnHtml + '\n\n' +
'            <div class="article-body">\n' +
'                ' + bodyHtml + '\n' +
'            </div>\n' +
'        </article>\n' +
'    </main>\n\n' +
'    <div class="share-toast" id="share-toast">✓ Ссылка скопирована в буфер обмена!</div>\n\n' +
'    <script>\n' +
'        (function() {\n' +
'            var savedTheme = localStorage.getItem("tvshop_theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");\n' +
'            if (savedTheme === "dark") document.body.classList.add("dark-theme");\n' +
'            document.getElementById("btn-theme-toggle").addEventListener("click", function() {\n' +
'                document.body.classList.toggle("dark-theme");\n' +
'                localStorage.setItem("tvshop_theme", document.body.classList.contains("dark-theme") ? "dark" : "light");\n' +
'            });\n' +
'            document.getElementById("btn-share-article").addEventListener("click", function() {\n' +
'                var url = window.location.href;\n' +
'                if (navigator.clipboard) {\n' +
'                    navigator.clipboard.writeText(url).then(showToast);\n' +
'                } else {\n' +
'                    prompt("Скопируйте ссылку:", url);\n' +
'                }\n' +
'            });\n' +
'            function showToast() {\n' +
'                var toast = document.getElementById("share-toast");\n' +
'                toast.classList.add("show");\n' +
'                setTimeout(function() { toast.classList.remove("show"); }, 2500);\n' +
'            }\n' +
'        })();\n' +
'    </script>\n' +
'</body>\n' +
'</html>';
        }
    };

    // Export module
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ArticleRenderer;
    } else {
        global.ArticleRenderer = ArticleRenderer;
    }
})(typeof window !== 'undefined' ? window : this);
