const validatedImageCache = new Map();

function extractYouTubeId(input) {
    if (!input) return null;
    const src = extractIframeSrc(input) || input;
    const m = src.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
    if (/^[a-zA-Z0-9_-]{11}$/.test(src)) return src;
    return null;
}

function extractIframeSrc(input) {
    if (!input || !input.trim().startsWith('<iframe')) return null;
    const m = input.match(/src=["']([^"']+)["']/);
    return m ? m[1] : null;
}

function buildEmbedSrc(input, extraParams) {
    let baseSrc;
    if (input.trim().startsWith('<iframe')) {
        baseSrc = extractIframeSrc(input);
    }
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

let currentMediaIndex = 0;
let mediaShowcaseItems = [];
let currentComparisonIndex = 0;
let comparisonGalleryItems = [];

function getEffectiveInventory() {
  return (window.PRECACHE && window.PRECACHE.imageInventory) || imageInventory;
}

let imageLoadQueue = [];
let currentlyLoading = 0;

async function validateImage(imagePath, timeout = CONFIG.imageTimeout) {
    if (window.USE_PRECACHE) return true;

    if (validatedImageCache.has(imagePath)) {
        return validatedImageCache.get(imagePath);
    }

    return new Promise((resolve) => {
        const img = new Image();
        let resolved = false;

        const timeoutId = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                validatedImageCache.set(imagePath, false);
                resolve(false);
            }
        }, timeout);

        img.onload = () => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeoutId);
                validatedImageCache.set(imagePath, true);
                resolve(true);
            }
        };

        img.onerror = () => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeoutId);
                validatedImageCache.set(imagePath, false);
                resolve(false);
            }
        };

        img.src = imagePath;
    });
}

async function processImageQueue() {
    while (imageLoadQueue.length > 0 && currentlyLoading < CONFIG.maxConcurrentLoads) {
        const { imagePath, resolve, reject } = imageLoadQueue.shift();
        currentlyLoading++;

        try {
            const isValid = await validateImage(imagePath);
            resolve(isValid);
        } catch (error) {
            reject(error);
        } finally {
            currentlyLoading--;
            if (imageLoadQueue.length > 0) {
                processImageQueue();
            }
        }
    }
}

function queueImageValidation(imagePath) {
    return new Promise((resolve, reject) => {
        imageLoadQueue.push({ imagePath, resolve, reject });
        processImageQueue();
    });
}

async function loadProjectThumbnails() {
    const loadPromises = projects.map(async (project) => {
        const inventory = getEffectiveInventory()[project.id];
        if (!inventory || !inventory.thumbnail) {
            project.thumbnailUrl = null;
            return { project: project.title, success: false, reason: 'not_defined' };
        }

        try {
            const isValid = await queueImageValidation(inventory.thumbnail);
            if (isValid) {
                project.thumbnailUrl = inventory.thumbnail;
                return { project: project.title, success: true, url: inventory.thumbnail };
            }
            project.thumbnailUrl = null;
            return { project: project.title, success: false, reason: 'invalid' };
        } catch (error) {
            console.error(`Error loading thumbnail for ${project.title}:`, error);
            project.thumbnailUrl = null;
            return { project: project.title, success: false, reason: 'error', error: error.message };
        }
    });

    return Promise.all(loadPromises);
}

function applyMediaOrder(displayMedia, youtubeItems, mediaOrder) {
    const imageMap = new Map(displayMedia.map(item => [item.url, item]));
    const youtubeMap = new Map(youtubeItems.map(item => [item.id, item]));
    const result = [];
    const usedUrls = new Set();
    const usedYtIds = new Set();

    for (const key of mediaOrder) {
        const colonIdx = key.indexOf(':');
        const type = key.substring(0, colonIdx);
        const ref = key.substring(colonIdx + 1);
        if (type === 'image') {
            const item = imageMap.get(ref);
            if (item && !usedUrls.has(ref)) { result.push(item); usedUrls.add(ref); }
        } else if (type === 'youtube') {
            const item = youtubeMap.get(ref);
            if (item && !usedYtIds.has(ref)) { result.push(item); usedYtIds.add(ref); }
        }
    }
    displayMedia.forEach(item => { if (!usedUrls.has(item.url)) result.push(item); });
    youtubeItems.forEach(item => { if (!usedYtIds.has(item.id)) result.push(item); });
    return result;
}

async function loadProjectImages() {
    const loadPromises = projects.map(async (project) => {
        const inventory = getEffectiveInventory()[project.id];

        const youtubeItems = (project.youtubeUrls || [])
            .map((input, i) => {
                const id = extractYouTubeId(input);
                if (!id) return null;
                const embedSrc = buildEmbedSrc(input, { enablejsapi: '1' });
                return { type: 'youtube', id, url: `https://www.youtube.com/watch?v=${id}`, embedSrc, title: `Video ${i + 1}` };
            })
            .filter(Boolean);

        if (!inventory) {
            const placeholders = createPlaceholderMedia(3);
            project.media = youtubeItems.length > 0 ? [...youtubeItems, ...placeholders] : placeholders;
            project.details.comparison.media = createPlaceholderMedia(2, 'comparison');
            return { project: project.title, success: false, reason: 'no_inventory' };
        }

        try {
            const displayMedia = await loadInventoryImages(inventory.displayImages, 'Screenshot', project.title);
            const ordered = (project.mediaOrder && project.mediaOrder.length > 0)
                ? applyMediaOrder(displayMedia, youtubeItems, project.mediaOrder)
                : [...displayMedia, ...youtubeItems];
            project.media = ordered.length > 0 ? ordered : createPlaceholderMedia(3);

            const comparisonMedia = await loadInventoryImages(inventory.comparisonImages, 'Comparison Image', project.title);
            project.details.comparison.media = comparisonMedia.length > 0 ? comparisonMedia : createPlaceholderMedia(2, 'comparison');

            return {
                project: project.title,
                success: true,
                displayCount: displayMedia.length,
                youtubeCount: youtubeItems.length,
                comparisonCount: comparisonMedia.length
            };
        } catch (error) {
            console.error(`Error loading images for ${project.title}:`, error);
            project.media = youtubeItems.length > 0 ? youtubeItems : createPlaceholderMedia(3);
            project.details.comparison.media = createPlaceholderMedia(2, 'comparison');
            return { project: project.title, success: false, reason: 'error', error: error.message };
        }
    });

    return Promise.all(loadPromises);
}

async function loadInventoryImages(imageList, titlePrefix, projectTitle) {
    if (!imageList || imageList.length === 0) return [];

    const validationPromises = imageList.map(async (imagePath, index) => {
        try {
            const isValid = await queueImageValidation(imagePath);
            if (isValid) {
                return {
                    type: 'image',
                    url: imagePath,
                    title: `${titlePrefix} ${index + 1}`,
                    number: index + 1
                };
            }
            return null;
        } catch (error) {
            console.error(`Error validating ${imagePath}:`, error);
            return null;
        }
    });

    const results = await Promise.all(validationPromises);
    return results.filter(r => r !== null);
}

function createPlaceholderMedia(count, type = 'display') {
    const titles = type === 'comparison'
        ? ['Comparison Image', 'Version Comparison', 'Feature Analysis']
        : ['Gameplay Screenshot', 'Environment Design', 'System Overview', 'Character Design', 'UI Interface'];

    const placeholders = [];
    for (let i = 0; i < count; i++) {
        placeholders.push({
            type: 'placeholder',
            title: titles[i] || `${type === 'comparison' ? 'Comparison' : 'Screenshot'} ${i + 1}`
        });
    }
    return placeholders;
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

let lazyLoadObserver = null;

function initializeLazyLoading() {
    if (!CONFIG.enableLazyLoading || !('IntersectionObserver' in window)) return;

    lazyLoadObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                if (img.dataset.src) {
                    img.src = img.dataset.src;
                    img.removeAttribute('data-src');
                    lazyLoadObserver.unobserve(img);
                }
            }
        });
    }, {
        threshold: CONFIG.lazyLoadingThreshold,
        rootMargin: '50px'
    });
}

function addToLazyLoading(img) {
    if (lazyLoadObserver && img.dataset.src) {
        lazyLoadObserver.observe(img);
    }
}

function createMediaShowcase(media, projectTitle) {
    if (!media || media.length === 0) {
        return createEmptyMediaShowcase(projectTitle);
    }

    return `
        <div class="media-showcase">
            <div class="media-showcase-header">
                <h4>Project Media</h4>
                ${media.length > 1 ? `<div class="media-counter"><span id="currentMedia">1</span> / ${media.length}</div>` : ''}
            </div>
            <div class="media-showcase-container">
                <div class="media-showcase-main" id="mediaShowcaseMain">
                    ${media.map((item, index) => createMediaShowcaseItem(item, index)).join('')}
                </div>
                ${media.length > 1 ? createMediaNavigation(media) : ''}
            </div>
        </div>
    `;
}

function createMediaShowcaseItem(item, index) {
    const isActive = index === 0 ? 'active' : '';

    if (item.type === 'placeholder') {
        return `
            <div class="media-showcase-item ${isActive}" data-index="${index}">
                <div class="media-placeholder-item">
                    <div class="placeholder-icon">
                        <i class="fas fa-play-circle"></i>
                    </div>
                    <h5>${item.title}</h5>
                    <p>Preview available in development build</p>
                </div>
            </div>
        `;
    }

    if (item.type === 'youtube') {
        const ytUrl = item.url;
        const embedSrc = item.embedSrc || `https://www.youtube.com/embed/${item.id}?enablejsapi=1`;
        const content = index === 0
            ? `<div class="media-youtube-embed"><iframe src="${embedSrc}" title="${item.title}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe><div class="yt-error-fallback"><i class="fas fa-exclamation-circle" style="font-size:2rem;color:#555"></i><p>This video can't be embedded.</p><a href="${ytUrl}" target="_blank" rel="noopener" class="yt-watch-btn">Watch on YouTube</a></div></div>`
            : `<div class="media-youtube-placeholder"><img src="https://img.youtube.com/vi/${item.id}/hqdefault.jpg" alt="${item.title}" /><div class="yt-play-btn"><i class="fas fa-play-circle"></i></div></div>`;
        return `<div class="media-showcase-item ${isActive}" data-index="${index}" data-type="youtube" data-ytid="${item.id}">${content}</div>`;
    }

    // First image loads eagerly; the rest get a 1x1 placeholder src and load via lazy observer.
    const imgAttributes = index === 0
        ? `src="${item.url}"`
        : `data-src="${item.url}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3C/svg%3E"`;

    return `
        <div class="media-showcase-item ${isActive}" data-index="${index}">
            <img ${imgAttributes} alt="${item.title}" loading="lazy"
                 onerror="this.parentElement.innerHTML='<div class=&quot;media-placeholder-item&quot;><div class=&quot;placeholder-icon&quot;><i class=&quot;fas fa-image&quot;></i></div><h5>Image Loading Error</h5><p>${item.title}</p></div>'" />
        </div>
    `;
}

function createMediaNavigation(media) {
    return `
        <div class="media-showcase-navigation">
            <button class="media-nav-btn prev" id="mediaPrevBtn">
                <i class="fas fa-chevron-left"></i>
            </button>
            <button class="media-nav-btn next" id="mediaNextBtn">
                <i class="fas fa-chevron-right"></i>
            </button>
        </div>
        <div class="media-showcase-thumbnails" id="mediaThumbnails">
            ${media.map((item, index) => createMediaThumbnail(item, index)).join('')}
        </div>
    `;
}

function createMediaThumbnail(item, index) {
    const isActive = index === 0 ? 'active' : '';

    if (item.type === 'placeholder') {
        return `
            <div class="media-thumbnail ${isActive}" data-index="${index}" title="${item.title}">
                <div class="thumbnail-placeholder">
                    <i class="fas fa-image"></i>
                </div>
            </div>
        `;
    }

    if (item.type === 'youtube') {
        return `
            <div class="media-thumbnail ${isActive}" data-index="${index}" title="${item.title}" style="position:relative;">
                <img src="https://img.youtube.com/vi/${item.id}/mqdefault.jpg" alt="${item.title}" />
                <div class="yt-thumb-indicator"><i class="fas fa-play"></i></div>
            </div>
        `;
    }

    return `
        <div class="media-thumbnail ${isActive}" data-index="${index}" title="${item.title}">
            <img data-src="${item.url}" alt="${item.title}" loading="lazy"
                 onerror="this.parentElement.innerHTML='<div class=&quot;thumbnail-placeholder&quot;><i class=&quot;fas fa-exclamation-triangle&quot;></i></div>'" />
        </div>
    `;
}

function createEmptyMediaShowcase(projectTitle) {
    return `
        <div class="media-showcase">
            <div class="media-showcase-placeholder">
                <div class="placeholder-content">
                    <i class="fas fa-film"></i>
                    <h3>Media Coming Soon</h3>
                    <p>Screenshots and videos for ${projectTitle} will be available soon.</p>
                </div>
            </div>
        </div>
    `;
}

function initializeMediaShowcase(media) {
    mediaShowcaseItems = media;
    currentMediaIndex = 0;

    const showcase = document.querySelector('.media-showcase-container');
    if (!showcase) return;

    showcase.addEventListener('click', (e) => {
        if (e.target.closest('.media-nav-btn.prev')) {
            showPreviousMedia();
        } else if (e.target.closest('.media-nav-btn.next')) {
            showNextMedia();
        } else if (e.target.closest('.media-thumbnail')) {
            const index = parseInt(e.target.closest('.media-thumbnail').dataset.index);
            showMediaAtIndex(index);
        }
    });

    if (CONFIG.enableLazyLoading) {
        showcase.querySelectorAll('img[data-src]').forEach(addToLazyLoading);
    }

    updateMediaNavigation();
}

function showMediaAtIndex(index) {
    if (index < 0 || index >= mediaShowcaseItems.length) return;

    // Stop any currently playing YouTube video before switching
    const activeItem = document.querySelector('.media-showcase-item.active');
    if (activeItem && activeItem.dataset.type === 'youtube') {
        const iframe = activeItem.querySelector('iframe');
        if (iframe) iframe.src = '';
    }

    requestAnimationFrame(() => {
        const showcaseItems = document.querySelectorAll('.media-showcase-item');
        showcaseItems.forEach((item, i) => {
            item.classList.toggle('active', i === index);

            if (i === index) {
                if (item.dataset.type === 'youtube') {
                    const mediaItem = mediaShowcaseItems[index];
                    const ytUrl = mediaItem.url;
                    const autoplaySrc = buildEmbedSrc(mediaItem.embedSrc || mediaItem.url, { autoplay: '1', enablejsapi: '1' });
                    item.innerHTML = `<div class="media-youtube-embed"><iframe src="${autoplaySrc}" title="${mediaItem.title}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe><div class="yt-error-fallback"><i class="fas fa-exclamation-circle" style="font-size:2rem;color:#555"></i><p>This video can't be embedded.</p><a href="${ytUrl}" target="_blank" rel="noopener" class="yt-watch-btn">Watch on YouTube</a></div></div>`;
                } else {
                    const img = item.querySelector('img[data-src]');
                    if (img) {
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                    }
                }
            }
        });

        document.querySelectorAll('.media-thumbnail').forEach((thumbnail, i) => {
            thumbnail.classList.toggle('active', i === index);
        });

        const counterElement = document.getElementById('currentMedia');
        if (counterElement) counterElement.textContent = index + 1;

        currentMediaIndex = index;
        updateMediaNavigation();
    });
}

function showNextMedia() {
    showMediaAtIndex((currentMediaIndex + 1) % mediaShowcaseItems.length);
}

function showPreviousMedia() {
    showMediaAtIndex((currentMediaIndex - 1 + mediaShowcaseItems.length) % mediaShowcaseItems.length);
}

function updateMediaNavigation() {
    const prevBtn = document.getElementById('mediaPrevBtn');
    const nextBtn = document.getElementById('mediaNextBtn');
    if (prevBtn && nextBtn) {
        prevBtn.disabled = mediaShowcaseItems.length <= 1;
        nextBtn.disabled = mediaShowcaseItems.length <= 1;
    }
}

function createComparisonGallery(media, comparisonTitle) {
    if (!media || media.length === 0) {
        return createEmptyComparisonGallery(comparisonTitle);
    }

    return `
        <div class="comparison-gallery">
            <div class="comparison-gallery-header">
                <h5>Visual Comparison</h5>
                ${media.length > 1 ? `<div class="gallery-counter"><span id="currentComparison">1</span> / ${media.length}</div>` : ''}
            </div>
            <div class="comparison-gallery-container">
                <div class="comparison-gallery-main" id="comparisonGalleryMain">
                    ${media.map((item, index) => createComparisonItem(item, index)).join('')}
                </div>
                ${media.length > 1 ? createComparisonNavigation(media) : ''}
            </div>
        </div>
    `;
}

function createComparisonItem(item, index) {
    const isActive = index === 0 ? 'active' : '';

    if (item.type === 'placeholder') {
        return `
            <div class="comparison-gallery-item ${isActive}" data-index="${index}">
                <div class="comparison-placeholder-item">
                    <div class="placeholder-icon">
                        <i class="fas fa-images"></i>
                    </div>
                    <h6>${item.title}</h6>
                    <p>Comparison screenshot available in development</p>
                </div>
            </div>
        `;
    }

    const imgAttributes = index === 0
        ? `src="${item.url}"`
        : `data-src="${item.url}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3C/svg%3E"`;

    return `
        <div class="comparison-gallery-item ${isActive}" data-index="${index}">
            <img ${imgAttributes} alt="${item.title}" loading="lazy" />
        </div>
    `;
}

function createComparisonNavigation(media) {
    return `
        <div class="comparison-gallery-navigation">
            <button class="gallery-nav-btn prev" id="comparisonPrevBtn">
                <i class="fas fa-chevron-left"></i>
            </button>
            <button class="gallery-nav-btn next" id="comparisonNextBtn">
                <i class="fas fa-chevron-right"></i>
            </button>
        </div>
        <div class="comparison-gallery-thumbnails" id="comparisonThumbnails">
            ${media.map((item, index) => createComparisonThumbnail(item, index)).join('')}
        </div>
    `;
}

function createComparisonThumbnail(item, index) {
    const isActive = index === 0 ? 'active' : '';

    if (item.type === 'placeholder') {
        return `
            <div class="gallery-thumbnail ${isActive}" data-index="${index}">
                <div class="thumbnail-placeholder">
                    <i class="fas fa-image"></i>
                </div>
            </div>
        `;
    }

    return `
        <div class="gallery-thumbnail ${isActive}" data-index="${index}">
            <img data-src="${item.url}" alt="${item.title}" loading="lazy" />
        </div>
    `;
}

function createEmptyComparisonGallery(comparisonTitle) {
    return `
        <div class="comparison-gallery">
            <div class="comparison-gallery-placeholder">
                <div class="placeholder-content">
                    <i class="fas fa-images"></i>
                    <h5>Comparison Media Coming Soon</h5>
                    <p>Visual comparisons for ${comparisonTitle} will be available soon.</p>
                </div>
            </div>
        </div>
    `;
}

function initializeComparisonGallery(media) {
    comparisonGalleryItems = media;
    currentComparisonIndex = 0;

    const gallery = document.querySelector('.comparison-gallery-container');
    if (!gallery) return;

    gallery.addEventListener('click', (e) => {
        if (e.target.closest('.gallery-nav-btn.prev')) {
            showPreviousComparison();
        } else if (e.target.closest('.gallery-nav-btn.next')) {
            showNextComparison();
        } else if (e.target.closest('.gallery-thumbnail')) {
            const index = parseInt(e.target.closest('.gallery-thumbnail').dataset.index);
            showComparisonAtIndex(index);
        }
    });

    if (CONFIG.enableLazyLoading) {
        gallery.querySelectorAll('img[data-src]').forEach(addToLazyLoading);
    }

    updateComparisonNavigation();
}

function showComparisonAtIndex(index) {
    if (index < 0 || index >= comparisonGalleryItems.length) return;

    requestAnimationFrame(() => {
        document.querySelectorAll('.comparison-gallery-item').forEach((item, i) => {
            item.classList.toggle('active', i === index);

            if (i === index) {
                const img = item.querySelector('img[data-src]');
                if (img) {
                    img.src = img.dataset.src;
                    img.removeAttribute('data-src');
                }
            }
        });

        document.querySelectorAll('.gallery-thumbnail').forEach((thumbnail, i) => {
            thumbnail.classList.toggle('active', i === index);
        });

        const counterElement = document.getElementById('currentComparison');
        if (counterElement) counterElement.textContent = index + 1;

        currentComparisonIndex = index;
        updateComparisonNavigation();
    });
}

function showNextComparison() {
    showComparisonAtIndex((currentComparisonIndex + 1) % comparisonGalleryItems.length);
}

function showPreviousComparison() {
    showComparisonAtIndex((currentComparisonIndex - 1 + comparisonGalleryItems.length) % comparisonGalleryItems.length);
}

function updateComparisonNavigation() {
    const prevBtn = document.getElementById('comparisonPrevBtn');
    const nextBtn = document.getElementById('comparisonNextBtn');
    if (prevBtn && nextBtn) {
        prevBtn.disabled = comparisonGalleryItems.length <= 1;
        nextBtn.disabled = comparisonGalleryItems.length <= 1;
    }
}

function resetMediaShowcase() {
    document.querySelectorAll('.media-showcase-item iframe').forEach(iframe => {
        iframe.src = '';
    });
    currentMediaIndex = 0;
    mediaShowcaseItems = [];
    currentComparisonIndex = 0;
    comparisonGalleryItems = [];
}

function clearImageCache() {
    validatedImageCache.clear();
}

function getPerformanceStats() {
    return {
        cacheSize: validatedImageCache.size,
        queueLength: imageLoadQueue.length,
        currentlyLoading
    };
}

document.addEventListener('DOMContentLoaded', () => {
    if (CONFIG.enableLazyLoading) initializeLazyLoading();
});

window.addEventListener('message', (event) => {
    if (event.origin !== 'https://www.youtube.com') return;
    try {
        const data = JSON.parse(event.data);
        const isError = data.event === 'onError' ||
            (data.event === 'infoDelivery' && data.info && data.info.errorCode);
        if (isError) {
            const activeYt = document.querySelector('.media-showcase-item.active[data-type="youtube"]');
            if (activeYt) {
                const embed = activeYt.querySelector('.media-youtube-embed');
                if (embed) embed.classList.add('yt-error');
            }
        }
    } catch {}
});

window.clearImageCache = clearImageCache;
window.getPerformanceStats = getPerformanceStats;

function buildPrecacheManifest() {
    const manifest = { generatedAt: new Date().toISOString(), imageInventory: {} };
    try {
        projects.forEach(project => {
            const invSrc = (getEffectiveInventory()[project.id]) || {};
            manifest.imageInventory[project.id] = {
                thumbnail: project.thumbnailUrl || invSrc.thumbnail || null,
                displayImages: (project.media || [])
                    .filter(m => m && m.type === 'image')
                    .map(m => m.url),
                comparisonImages: (((project.details && project.details.comparison) ? project.details.comparison.media : []) || [])
                    .filter(m => m && m.type === 'image')
                    .map(m => m.url)
            };
        });
    } catch (e) {
        console.warn('Failed to build manifest', e);
    }
    return manifest;
}

function savePrecacheManifest() {
    const manifest = buildPrecacheManifest();
    try { localStorage.setItem('assetManifest', JSON.stringify(manifest)); } catch (_) {}
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'assets/asset-manifest.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

window.savePrecacheManifest = savePrecacheManifest;
