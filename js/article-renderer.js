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
        }
    };

    // Export module
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ArticleRenderer;
    } else {
        global.ArticleRenderer = ArticleRenderer;
    }
})(typeof window !== 'undefined' ? window : this);
