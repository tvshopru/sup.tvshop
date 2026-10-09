$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$jsonRaw = [System.IO.File]::ReadAllText("c:\ww\config.json", [System.Text.Encoding]::UTF8)
$cfg = $jsonRaw | ConvertFrom-Json

$articles = @()
if ($cfg.articles) { $articles += $cfg.articles }
if ($cfg.instructions) {
    foreach ($inst in $cfg.instructions) {
        if (-not ($articles | Where-Object { $_.id -eq $inst.id })) {
            $articles += $inst
        }
    }
}

Write-Output "Found $($articles.Count) total articles/instructions to build"

function Escape-Html($str) {
    if (-not $str) { return "" }
    return [System.Web.HttpUtility]::HtmlEncode([string]$str)
}

Add-Type -AssemblyName System.Web

foreach ($art in $articles) {
    $artId = $art.id
    if (-not $artId) { continue }

    $title = if ($art.title) { $art.title } else { "Статья TV SHOP" }
    $author = if ($art.author) { $art.author } else { "TV SHOP" }
    $date = if ($art.date) { $art.date } else { "Сегодня" }
    $videoUrl = if ($art.videoUrl) { $art.videoUrl } else { "" }

    # Generate body HTML
    $bodyHtml = ""
    if ($art.contentHtml) {
        $bodyHtml = $art.contentHtml
    } elseif ($art.steps) {
        $stepsHtml = ""
        $sIdx = 1
        foreach ($st in $art.steps) {
            $stTitle = if ($st.title) { "<h3>$sIdx. $(Escape-Html $st.title)</h3>" } else { "" }
            $stText = if ($st.text) { "<p>$($st.text -replace "`n", "<br>")</p>" } else { "" }
            $stImg = if ($st.imageUrl) { "<div class='article-image-figure'><img src='../$($st.imageUrl)' alt='' loading='lazy'/></div>" } else { "" }
            $stepsHtml += "$stTitle$stText$stImg"
            $sIdx++
        }
        $bodyHtml = $stepsHtml
    } elseif ($art.description) {
        $bodyHtml = "<p>$(Escape-Html $art.description)</p>"
    }

    # Extract plain text description
    $plain = $bodyHtml -replace "&nbsp;", " " -replace "&amp;", "&" -replace "&quot;", """"
    $plain = [System.Text.RegularExpressions.Regex]::Replace($plain, "<[^>]+>", " ")
    $plain = [System.Text.RegularExpressions.Regex]::Replace($plain, "\s+", " ").Trim()
    $desc = if ($plain.Length -gt 180) { $plain.Substring(0, 177) + "..." } else { $plain }
    if (-not $desc) { $desc = "Инструкция и руководство от TV SHOP" }

    # Open Graph image: TV SHOP square logo for compact preview card on the right
    $ogImg = "https://tvshopru.github.io/sup.tvshop/app_logo.png"

    $canonical = "https://tvshopru.github.io/sup.tvshop/articles/$artId.html"
    
    $videoBtn = ""
    if ($videoUrl) {
        $videoBtn = @"
        <a href="$videoUrl" target="_blank" class="video-banner-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            <span>Смотреть видеоверсию инструкции</span>
        </a>
"@
    }

    $safeTitle = Escape-Html $title
    $safeDesc = Escape-Html $desc
    $safeAuthor = Escape-Html $author
    $safeDate = Escape-Html $date

    $pageHtml = @"
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">
    <title>$safeTitle - TV SHOP</title>
    <meta name="description" content="$safeDesc">
    <link rel="icon" type="image/png" href="../app_logo.png?v=2">
    <link rel="canonical" href="$canonical">

    <!-- Open Graph for Telegram & Social Previews (Compact Card) -->
    <meta property="og:site_name" content="TV SHOP">
    <meta property="og:type" content="article">
    <meta property="og:title" content="$safeTitle">
    <meta property="og:description" content="$safeDesc">
    <meta property="og:image" content="$ogImg">
    <meta property="og:image:width" content="300">
    <meta property="og:image:height" content="300">
    <meta property="og:url" content="$canonical">

    <!-- Twitter Card (Compact summary) -->
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="$safeTitle">
    <meta name="twitter:description" content="$safeDesc">
    <meta name="twitter:image" content="$ogImg">

    <!-- Unified Stylesheet -->
    <link rel="stylesheet" href="../css/article.css?v=20261010_02">
    <style>
        :root {
            --bg-color: #ffffff;
            --bg-secondary: #f8fafc;
            --card-bg: #ffffff;
            --text-primary: #111827;
            --text-secondary: #4b5563;
            --text-muted: #9ca3af;
            --accent-color: #2481cc;
            --accent-hover: #1b66a3;
            --accent-light: #e8f4fd;
            --border-color: #e5e7eb;
            --header-bg: rgba(255, 255, 255, 0.85);
        }
        body.dark-theme {
            --bg-color: #0f141c;
            --bg-secondary: #171f2b;
            --card-bg: #171f2b;
            --text-primary: #f3f4f6;
            --text-secondary: #cbd5e1;
            --text-muted: #64748b;
            --accent-color: #00b4d8;
            --accent-hover: #0096c7;
            --accent-light: rgba(0, 180, 216, 0.12);
            --border-color: #243042;
            --header-bg: rgba(15, 20, 28, 0.85);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
        body {
            background-color: var(--bg-color);
            color: var(--text-primary);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            font-size: 17px;
            line-height: 1.7;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            transition: background-color 0.2s ease, color 0.2s ease;
        }
        .top-navbar {
            position: sticky;
            top: 0;
            z-index: 100;
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            background: var(--header-bg);
            border-bottom: 1px solid var(--border-color);
            padding: 10px 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .brand-link { display: flex; align-items: center; text-decoration: none; flex-shrink: 0; }
        .brand-link img { width: 30px; height: 30px; border-radius: 6px; object-fit: contain; }
        .nav-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .nav-btn {
            background: transparent;
            border: 1px solid var(--border-color);
            color: var(--text-secondary);
            border-radius: 16px;
            padding: 4px 9px;
            font-size: 0.8em;
            font-weight: 600;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            text-decoration: none;
            white-space: nowrap;
            transition: all 0.2s;
            line-height: 1.2;
        }
        .nav-btn:hover { background: var(--accent-light); color: var(--accent-color); border-color: var(--accent-color); }
        .nav-btn-icon { width: 30px; height: 30px; padding: 0; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; }
        .article-container { width: 100%; max-width: 740px; margin: 0 auto; padding: 36px 20px 80px 20px; flex: 1; }
        .article-header { margin-bottom: 30px; padding-bottom: 22px; border-bottom: 1px solid var(--border-color); }
        .article-title { font-size: 2.2em; font-weight: 800; line-height: 1.25; color: var(--text-primary); margin-bottom: 16px; letter-spacing: -0.5px; }
        @media (max-width: 600px) { .article-title { font-size: 1.75em; } .article-container { padding: 20px 16px 60px 16px; } }
        .article-meta-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 0.9em; color: var(--text-secondary); }
        .author-badge { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; color: var(--accent-color); text-decoration: none; }
        .author-badge:hover { text-decoration: underline; }
        .meta-dot { opacity: 0.5; }
        .video-banner-btn {
            display: flex; align-items: center; justify-content: center; gap: 10px;
            background: var(--accent-light); color: var(--accent-color); border: 1px solid var(--accent-color);
            border-radius: 12px; padding: 14px 20px; text-decoration: none; font-weight: 700; font-size: 1em;
            margin-bottom: 28px; transition: all 0.2s;
        }
        .video-banner-btn:hover { background: var(--accent-color); color: #ffffff; box-shadow: 0 4px 14px rgba(36, 129, 204, 0.3); }
        .share-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(100px); background: #1e293b; color: #fff; padding: 10px 20px; border-radius: 30px; font-size: 0.88em; font-weight: 600; opacity: 0; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); z-index: 1000; box-shadow: 0 4px 20px rgba(0,0,0,0.25); pointer-events: none; }
        .share-toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
    </style>
</head>
<body>
    <header class="top-navbar">
        <a href="../articles.html" class="brand-link" title="Все статьи TV SHOP">
            <img src="../app_logo.png" alt="TV SHOP Logo">
        </a>
        <div class="nav-actions">
            <a href="../articles.html" class="nav-btn" title="Вернуться к списку статей">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                <span>Все статьи</span>
            </a>
            <button type="button" class="nav-btn nav-btn-icon" id="btn-theme-toggle" title="Переключить тему">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>
            </button>
            <button type="button" class="nav-btn nav-btn-icon" id="btn-share-article" title="Поделиться статьей">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            </button>
        </div>
    </header>

    <main class="article-container">
        <article>
            <header class="article-header">
                <h1 class="article-title">$safeTitle</h1>
                <div class="article-meta-row">
                    <a href="https://t.me/android_tv_shop" target="_blank" class="author-badge">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z"/></svg>
                        <span>$safeAuthor</span>
                    </a>
                    <span class="meta-dot">•</span>
                    <time datetime="$safeDate">$safeDate</time>
                </div>
            </header>

            $videoBtn

            <div class="article-body">
                $bodyHtml
            </div>
        </article>
    </main>

    <div class="share-toast" id="share-toast">✓ Ссылка скопирована в буфер обмена!</div>

    <script>
        (function() {
            var savedTheme = localStorage.getItem("tvshop_theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
            if (savedTheme === "dark") document.body.classList.add("dark-theme");
            document.getElementById("btn-theme-toggle").addEventListener("click", function() {
                document.body.classList.toggle("dark-theme");
                localStorage.setItem("tvshop_theme", document.body.classList.contains("dark-theme") ? "dark" : "light");
            });
            document.getElementById("btn-share-article").addEventListener("click", function() {
                var url = window.location.href;
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(url).then(showToast);
                } else {
                    prompt("Скопируйте ссылку:", url);
                }
            });
            function showToast() {
                var toast = document.getElementById("share-toast");
                toast.classList.add("show");
                setTimeout(function() { toast.classList.remove("show"); }, 2500);
            }
        })();
    </script>
</body>
</html>
"@

    $outPath = "c:\ww\articles\$artId.html"
    [System.IO.File]::WriteAllText($outPath, $pageHtml, $utf8NoBom)
    Write-Output "Generated: articles/$artId.html ($title)"
}
