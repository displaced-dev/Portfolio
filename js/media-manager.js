// Loads and validates project media, builds the Overview media showcase,
// and exposes shared helpers (captions, placeholders) used by ui-controller.js.

const validatedImageCache = new Map();

const BLANK_SRC = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3C/svg%3E";

let currentMediaIndex = 0;
let mediaShowcaseItems = [];
let imageLoadQueue = [];
let currentlyLoading = 0;
let lazyLoadObserver = null;

/* ---------- YouTube helpers ---------- */

function extractIframeSrc(input) {
    if (!input || !input.trim().startsWith('<iframe')) return null;
    const m = input.match(/src=["']([^"']+)["']/);
    return m ? m[1] : null;
}

function extractYouTubeId(input) {
    if (!input) return null;
    const src = extractIframeSrc(input) || input;
    const m = src.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
    return /^[a-zA-Z0-9_-]{11}$/.test(src) ? src : null;
}

function buildEmbedSrc(input, extraParams) {
    let baseSrc = input.trim().startsWith('<iframe') ? extractIframeSrc(input) : null;
    if (!baseSrc) {
        const id = extractYouTubeId(input);
        baseSrc = id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (!baseSrc) return null;
    try {
        const url = new URL(baseSrc);
        for (const [k, v] of Object.entries(extraParams || {})) {
            if (!url.searchParams.has(k)) url.searchParams.set(k, v);
        }
        return url.toString();
    } catch {
        return baseSrc;
    }
}

function youtubeEmbedHtml(src, title, watchUrl, lazy) {
    return `<div class="media-youtube-embed"><iframe src="${src}" title="${title}"${lazy ? ' loading="lazy"' : ''} frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe><div class="yt-error-fallback"><i class="fas fa-exclamation-circle"></i><p>This video can't be embedded.</p><a href="${watchUrl}" target="_blank" rel="noopener" class="yt-watch-btn">Watch on YouTube</a></div></div>`;
}

/* ---------- Shared markup helpers ---------- */

function attr(value) {
    return String(value == null ? '' : value).replace(/"/g, '&quot;');
}

// Transparent header laid over the top of an image.
function captionHtml(caption) {
    return caption ? `<div class="media-caption">${caption}</div>` : '';
}

// Before/after markup shared by the Overview showcase and custom-tab pages.
// mode is 'side-by-side' or 'slider'. img(url, alt, className) builds each
// <img>, so callers decide lazy loading and error handling.
function compareMediaHtml({ mode, before, after, beforeLabel, afterLabel, alt, img }) {
    const b = beforeLabel || 'Before';
    const a = afterLabel || 'After';
    const beforeAlt = `${alt} (${attr(b)})`;
    const afterAlt = `${alt} (${attr(a)})`;

    if (mode === 'side-by-side') {
        return `
            <div class="compare-pair">
                <div class="media-frame"><span class="compare-label">${b}</span>${img(before, beforeAlt)}</div>
                <div class="media-frame"><span class="compare-label">${a}</span>${img(after, afterAlt)}</div>
            </div>`;
    }
    return `
        <div class="compare-slider" style="--split: 50%">
            ${img(before, beforeAlt, 'compare-before')}
            ${img(after, afterAlt, 'compare-after')}
            <span class="compare-label">${b}</span>
            <span class="compare-label compare-label-after">${a}</span>
            <span class="compare-handle" aria-hidden="true"><i class="fas fa-arrows-left-right"></i></span>
            <input class="compare-range" type="range" min="0" max="100" value="50" step="0.5"
                   aria-label="Drag to compare ${attr(b)} and ${attr(a)}">
        </div>`;
}

function placeholderHtml(icon, title, text) {
    return `
        <div class="media-placeholder-item">
            <div class="placeholder-icon"><i class="fas ${icon}"></i></div>
            <h5>${title}</h5>
            <p>${text}</p>
        </div>`;
}

/* ---------- Image validation ---------- */

function getEffectiveInventory() {
    return (window.PRECACHE && window.PRECACHE.imageInventory) || imageInventory;
}

function validateImage(imagePath, timeout = CONFIG.imageTimeout) {
    if (window.USE_PRECACHE) return Promise.resolve(true);
    if (validatedImageCache.has(imagePath)) return Promise.resolve(validatedImageCache.get(imagePath));

    return new Promise((resolve) => {
        const img = new Image();
        let settled = false;
        const finish = (ok) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            validatedImageCache.set(imagePath, ok);
            resolve(ok);
        };
        const timer = setTimeout(() => finish(false), timeout);
        img.onload = () => finish(true);
        img.onerror = () => finish(false);
        img.src = imagePath;
    });
}

async function processImageQueue() {
    while (imageLoadQueue.length > 0 && currentlyLoading < CONFIG.maxConcurrentLoads) {
        const { imagePath, resolve, reject } = imageLoadQueue.shift();
        currentlyLoading++;
        try {
            resolve(await validateImage(imagePath));
        } catch (error) {
            reject(error);
        } finally {
            currentlyLoading--;
            if (imageLoadQueue.length > 0) processImageQueue();
        }
    }
}

function queueImageValidation(imagePath) {
    return new Promise((resolve, reject) => {
        imageLoadQueue.push({ imagePath, resolve, reject });
        processImageQueue();
    });
}

/* ---------- Loading project media ---------- */

async function loadProjectThumbnails() {
    await Promise.all(projects.map(async (project) => {
        const inventory = getEffectiveInventory()[project.id];
        project.thumbnailUrl = null;
        if (!inventory || !inventory.thumbnail) return;
        try {
            if (await queueImageValidation(inventory.thumbnail)) project.thumbnailUrl = inventory.thumbnail;
        } catch (error) {
            console.error(`Error loading thumbnail for ${project.title}:`, error);
        }
    }));
}

async function loadInventoryImages(imageList) {
    if (!imageList || imageList.length === 0) return [];
    const results = await Promise.all(imageList.map(async (imagePath, index) => {
        try {
            if (!(await queueImageValidation(imagePath))) return null;
            return { type: 'image', url: imagePath, title: `Screenshot ${index + 1}` };
        } catch (error) {
            console.error(`Error validating ${imagePath}:`, error);
            return null;
        }
    }));
    return results.filter(Boolean);
}

function applyMediaOrder(displayMedia, youtubeItems, mediaOrder) {
    const imageMap = new Map(displayMedia.map(item => [`image:${item.url}`, item]));
    const youtubeMap = new Map(youtubeItems.map(item => [`youtube:${item.id}`, item]));
    const used = new Set();
    const result = [];

    for (const key of mediaOrder) {
        const item = imageMap.get(key) || youtubeMap.get(key);
        if (item && !used.has(key)) { result.push(item); used.add(key); }
    }
    for (const [key, item] of [...imageMap, ...youtubeMap]) {
        if (!used.has(key)) result.push(item);
    }
    return result;
}

function youtubeItemsFor(project) {
    return (project.youtubeUrls || [])
        .map((input, i) => {
            const id = extractYouTubeId(input);
            if (!id) return null;
            return {
                type: 'youtube',
                id,
                url: `https://www.youtube.com/watch?v=${id}`,
                embedSrc: buildEmbedSrc(input, { enablejsapi: '1' }),
                title: `Video ${i + 1}`
            };
        })
        .filter(Boolean);
}

async function loadProjectImages() {
    await Promise.all(projects.map(async (project) => {
        const inventory = getEffectiveInventory()[project.id];
        const captions = project.mediaCaptions || {};
        const youtubeItems = youtubeItemsFor(project);

        if (!inventory) {
            project.media = [...youtubeItems, ...createPlaceholderMedia(3)];
            return;
        }

        try {
            const displayMedia = await loadInventoryImages(inventory.displayImages);
            const compare = project.mediaCompare || {};
            displayMedia.forEach(item => {
                const key = `image:${item.url}`;
                item.caption = captions[key] || '';
                // Before/after only once the after image exists.
                const cmp = compare[key];
                if (cmp && cmp.mode && cmp.mode !== 'normal' && cmp.afterPath) item.compare = cmp;
            });
            const ordered = (project.mediaOrder && project.mediaOrder.length > 0)
                ? applyMediaOrder(displayMedia, youtubeItems, project.mediaOrder)
                : [...displayMedia, ...youtubeItems];
            project.media = ordered.length > 0 ? ordered : createPlaceholderMedia(3);
        } catch (error) {
            console.error(`Error loading images for ${project.title}:`, error);
            project.media = youtubeItems.length > 0 ? youtubeItems : createPlaceholderMedia(3);
        }
    }));
}

function createPlaceholderMedia(count) {
    const titles = ['Gameplay Screenshot', 'Environment Design', 'System Overview'];
    return Array.from({ length: count }, (_, i) => ({
        type: 'placeholder',
        title: titles[i] || `Screenshot ${i + 1}`
    }));
}

async function initializeAllProjectMedia() {
    try {
        await loadProjectThumbnails();
        await loadProjectImages();
        return true;
    } catch (error) {
        console.error('Failed to initialize project media:', error);
        return false;
    }
}

/* ---------- Lazy loading ---------- */

function initializeLazyLoading() {
    if (!CONFIG.enableLazyLoading || !('IntersectionObserver' in window)) return;
    lazyLoadObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            loadDeferredImage(entry.target);
            lazyLoadObserver.unobserve(entry.target);
        });
    }, { threshold: CONFIG.lazyLoadingThreshold, rootMargin: '50px' });
}

function loadDeferredImage(img) {
    if (img && img.dataset.src) {
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
    }
}

/* ---------- Media showcase (Overview tab) ---------- */

function createMediaShowcase(media, projectTitle) {
    if (!media || media.length === 0) {
        return `
            <div class="media-showcase">
                <div class="media-showcase-placeholder">
                    <div>
                        <i class="fas fa-film"></i>
                        <h3>Media Coming Soon</h3>
                        <p>Screenshots and videos for ${projectTitle} will be available soon.</p>
                    </div>
                </div>
            </div>`;
    }

    const multiple = media.length > 1;
    return `
        <div class="media-showcase">
            <div class="media-showcase-header">
                <h4>Project Media</h4>
                ${multiple ? `<div class="media-counter"><span id="currentMedia">1</span> / ${media.length}</div>` : ''}
            </div>
            <div class="media-showcase-container">
                <div class="media-showcase-main">
                    ${media.map(createMediaShowcaseItem).join('')}
                </div>
                ${multiple ? createMediaNavigation(media) : ''}
            </div>
        </div>`;
}

function createMediaShowcaseItem(item, index) {
    const active = index === 0 ? ' active' : '';

    if (item.type === 'placeholder') {
        return `<div class="media-showcase-item${active}" data-index="${index}">
            ${placeholderHtml('fa-play-circle', item.title, 'Preview available in development build')}
        </div>`;
    }

    if (item.type === 'youtube') {
        const content = index === 0
            ? youtubeEmbedHtml(item.embedSrc || `https://www.youtube.com/embed/${item.id}?enablejsapi=1`, item.title, item.url)
            : `<div class="media-youtube-placeholder"><img src="https://img.youtube.com/vi/${item.id}/hqdefault.jpg" alt="${item.title}"><div class="yt-play-btn"><i class="fas fa-play-circle"></i></div></div>`;
        return `<div class="media-showcase-item${active}" data-index="${index}" data-type="youtube">${content}</div>`;
    }

    // First image loads eagerly; the rest load when shown.
    const srcFor = url => index === 0 ? `src="${url}"` : `src="${BLANK_SRC}" data-src="${url}"`;
    const src = srcFor(item.url);

    if (item.compare) {
        const media = compareMediaHtml({
            mode: item.compare.mode,
            before: item.url,
            after: item.compare.afterPath,
            beforeLabel: item.compare.beforeLabel,
            afterLabel: item.compare.afterLabel,
            alt: attr(item.caption || item.title),
            img: (url, alt, cls) => `<img${cls ? ` class="${cls}"` : ''} ${srcFor(url)} alt="${alt}" onerror="showBrokenMedia(this)">`
        });
        return `
            <div class="media-showcase-item${active}" data-index="${index}">
                <div class="showcase-compare">
                    ${item.caption ? `<div class="showcase-compare-caption">${item.caption}</div>` : ''}
                    ${media}
                </div>
            </div>`;
    }

    return `
        <div class="media-showcase-item${active}" data-index="${index}">
            <div class="media-frame">
                ${captionHtml(item.caption)}
                <img ${src} alt="${attr(item.caption || item.title)}" onerror="showBrokenMedia(this)">
            </div>
        </div>`;
}

function showBrokenMedia(img) {
    const slot = img.closest('.media-showcase-item');
    if (slot) slot.innerHTML = placeholderHtml('fa-image', 'Image Loading Error', img.alt);
}

function createMediaNavigation(media) {
    return `
        <div class="media-showcase-navigation">
            <button class="media-nav-btn prev" id="mediaPrevBtn" aria-label="Previous"><i class="fas fa-chevron-left"></i></button>
            <button class="media-nav-btn next" id="mediaNextBtn" aria-label="Next"><i class="fas fa-chevron-right"></i></button>
        </div>
        <div class="media-showcase-thumbnails">
            ${media.map(createMediaThumbnail).join('')}
        </div>`;
}

function createMediaThumbnail(item, index) {
    const active = index === 0 ? ' active' : '';
    const title = attr(item.caption || item.title);
    let inner;

    if (item.type === 'placeholder') {
        inner = `<div class="thumbnail-placeholder"><i class="fas fa-image"></i></div>`;
    } else if (item.type === 'youtube') {
        inner = `<img src="https://img.youtube.com/vi/${item.id}/mqdefault.jpg" alt="${title}"><div class="yt-thumb-indicator"><i class="fas fa-play"></i></div>`;
    } else {
        inner = `<img data-src="${item.url}" alt="${title}">`;
    }
    return `<div class="media-thumbnail${active}" data-index="${index}" title="${title}">${inner}</div>`;
}

function initializeMediaShowcase(media) {
    mediaShowcaseItems = media;
    currentMediaIndex = 0;

    const showcase = document.querySelector('.media-showcase-container');
    if (!showcase) return;

    showcase.addEventListener('click', (e) => {
        if (e.target.closest('.media-nav-btn.prev')) showMediaAtIndex(currentMediaIndex - 1);
        else if (e.target.closest('.media-nav-btn.next')) showMediaAtIndex(currentMediaIndex + 1);
        else {
            const thumb = e.target.closest('.media-thumbnail');
            if (thumb) showMediaAtIndex(parseInt(thumb.dataset.index, 10));
        }
    });

    showcase.querySelectorAll('.media-thumbnail img[data-src]').forEach(img => {
        if (lazyLoadObserver) lazyLoadObserver.observe(img);
        else loadDeferredImage(img);
    });
}

function showMediaAtIndex(index) {
    const count = mediaShowcaseItems.length;
    if (!count) return;
    index = (index + count) % count;

    // Stop the video that is leaving the stage
    const leaving = document.querySelector('.media-showcase-item.active[data-type="youtube"] iframe');
    if (leaving) leaving.src = '';

    document.querySelectorAll('.media-showcase-item').forEach((el, i) => {
        el.classList.toggle('active', i === index);
        if (i !== index) return;
        if (el.dataset.type === 'youtube') {
            const item = mediaShowcaseItems[index];
            const src = buildEmbedSrc(item.embedSrc || item.url, { autoplay: '1', enablejsapi: '1' });
            el.innerHTML = youtubeEmbedHtml(src, item.title, item.url);
        } else {
            el.querySelectorAll('img[data-src]').forEach(loadDeferredImage);
        }
    });

    document.querySelectorAll('.media-thumbnail').forEach((thumb, i) => {
        thumb.classList.toggle('active', i === index);
    });

    const counter = document.getElementById('currentMedia');
    if (counter) counter.textContent = index + 1;
    currentMediaIndex = index;
}

function resetMediaShowcase() {
    document.querySelectorAll('.media-showcase-item iframe').forEach(iframe => { iframe.src = ''; });
    currentMediaIndex = 0;
    mediaShowcaseItems = [];
}

/* ---------- Diagnostics & dev tooling ---------- */

function clearImageCache() {
    validatedImageCache.clear();
}

function getPerformanceStats() {
    return { cacheSize: validatedImageCache.size, queueLength: imageLoadQueue.length, currentlyLoading };
}

function buildPrecacheManifest() {
    const manifest = { generatedAt: new Date().toISOString(), imageInventory: {} };
    projects.forEach(project => {
        const inv = getEffectiveInventory()[project.id] || {};
        manifest.imageInventory[project.id] = {
            thumbnail: project.thumbnailUrl || inv.thumbnail || null,
            displayImages: (project.media || []).filter(m => m.type === 'image').map(m => m.url)
        };
    });
    return manifest;
}

function savePrecacheManifest() {
    const blob = new Blob([JSON.stringify(buildPrecacheManifest(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'asset-manifest.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', initializeLazyLoading);

// Swap to the fallback card when YouTube reports the video can't be embedded.
window.addEventListener('message', (event) => {
    if (event.origin !== 'https://www.youtube.com') return;
    try {
        const data = JSON.parse(event.data);
        const isError = data.event === 'onError' || (data.event === 'infoDelivery' && data.info && data.info.errorCode);
        if (!isError) return;
        // Match the iframe that sent the message (showcase or a page video).
        const iframe = [...document.querySelectorAll('.media-youtube-embed iframe')]
            .find(f => f.contentWindow === event.source);
        const embed = iframe
            ? iframe.closest('.media-youtube-embed')
            : document.querySelector('.media-showcase-item.active[data-type="youtube"] .media-youtube-embed');
        if (embed) embed.classList.add('yt-error');
    } catch {}
});

window.clearImageCache = clearImageCache;
window.getPerformanceStats = getPerformanceStats;
window.savePrecacheManifest = savePrecacheManifest;