// Renders the page sections and the project modal (Overview + custom tabs).

let modal = null;

const performanceMetrics = {
    initStart: 0,
    initEnd: 0,
    mediaLoadTime: 0,
    renderTime: 0
};

/* ---------- Boot ---------- */

async function bootstrapPrecache() {
    const isLocalHost =
        ['localhost', '127.0.0.1', '::1'].some(h => location.hostname.includes(h)) ||
        /^192\.168\./.test(location.hostname) ||
        location.protocol === 'file:';

    window.IS_LOCAL = isLocalHost;
    window.USE_PRECACHE = false;
    if (isLocalHost) return;

    try {
        const res = await fetch('assets/asset-manifest.json', { cache: 'force-cache' });
        if (res.ok) {
            window.PRECACHE = await res.json();
            window.USE_PRECACHE = true;
        }
    } catch (e) {
        console.warn('Failed to load pre-cached manifest, falling back.', e);
    }
}

function injectDevManifestButton() {
    const btn = document.createElement('button');
    btn.textContent = 'Generate Asset Manifest';
    Object.assign(btn.style, {
        position: 'fixed', right: '16px', bottom: '16px', zIndex: 3000,
        padding: '10px 14px', borderRadius: '10px', border: '2px solid #dc2626',
        background: '#111', color: '#fff', cursor: 'pointer'
    });
    btn.onclick = () => window.savePrecacheManifest && window.savePrecacheManifest();
    document.body.appendChild(btn);
}

document.addEventListener('DOMContentLoaded', async () => {
    await bootstrapPrecache();
    performanceMetrics.initStart = performance.now();

    initializeNavigation();
    renderAbout();
    renderExperience();
    initializeTechStack();
    initializeModal();
    initializeScrollEffects();
    showProjectsLoading();

    try {
        const mediaStart = performance.now();
        await initializeAllProjectMedia();
        performanceMetrics.mediaLoadTime = Math.round(performance.now() - mediaStart);

        const renderStart = performance.now();
        renderProjects();
        performanceMetrics.renderTime = Math.round(performance.now() - renderStart);
        performanceMetrics.initEnd = performance.now();
    } catch (error) {
        console.error('Failed to initialize portfolio:', error);
        renderProjects();
    }

    if (window.IS_LOCAL) injectDevManifestButton();
});

/* ---------- Navigation ---------- */

function initializeNavigation() {
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');

    if (hamburger && navMenu) {
        hamburger.addEventListener('click', () => navMenu.classList.toggle('active'));
    }

    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = document.querySelector(link.getAttribute('href'));
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            if (navMenu) navMenu.classList.remove('active');
        });
    });

    const heroScroll = document.querySelector('.hero-scroll');
    if (heroScroll) {
        heroScroll.addEventListener('click', () => {
            const about = document.querySelector('#about');
            if (about) about.scrollIntoView({ behavior: 'smooth' });
        });
    }
}

/* ---------- Static sections ---------- */

function renderAbout() {
    if (typeof about === 'undefined') return;

    const bullets = document.getElementById('aboutBullets');
    if (bullets) {
        bullets.innerHTML = about.bullets.map(b => `
            <div class="location">
                <i class="fas fa-circle"></i>
                <span>${b}</span>
            </div>`).join('');
    }

    const resumeLink = document.getElementById('resumeLink');
    if (resumeLink) {
        resumeLink.setAttribute('href', about.resumePath);
        resumeLink.insertAdjacentHTML('afterend', (about.links || [])
            .filter(link => link.url)
            .map(link => `
                <a class="about-link" href="${link.url}" target="_blank" rel="noopener noreferrer">
                    <i class="${linkIcon(link.url)}"></i>
                    <span>${link.label || linkHost(link.url)}</span>
                </a>`).join(''));
    }

    const headshot = document.getElementById('aboutHeadshot');
    if (headshot) headshot.setAttribute('src', about.headshot);
}

// Picks a Font Awesome icon from the link's address.
function linkIcon(url) {
    const icons = [
        ['itch.io', 'fab fa-itch-io'],
        ['linkedin.com', 'fab fa-linkedin'],
        ['github.com', 'fab fa-github'],
        ['youtube.com', 'fab fa-youtube'],
        ['youtu.be', 'fab fa-youtube'],
        ['steampowered.com', 'fab fa-steam'],
        ['twitter.com', 'fab fa-twitter'],
        ['x.com', 'fab fa-twitter'],
        ['artstation.com', 'fab fa-artstation'],
        ['mailto:', 'fas fa-envelope'],
    ];
    const match = icons.find(([needle]) => url.toLowerCase().includes(needle));
    return match ? match[1] : 'fas fa-link';
}

function linkHost(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function renderExperience() {
    if (typeof experience === 'undefined') return;
    const timeline = document.getElementById('experienceTimeline');
    if (!timeline) return;

    timeline.innerHTML = experience.map(entry => `
        <div class="timeline-item">
            <div class="timeline-date">${entry.dateRange}</div>
            <div class="timeline-content">
                <h3>${entry.title}</h3>
                <h4>${entry.organization}</h4>
                <div class="project-tech">${tagsHtml(entry.tech)}</div>
                <p>${entry.description}</p>
                <ul>${entry.bullets.map(b => `<li>${b}</li>`).join('')}</ul>
            </div>
        </div>`).join('');
}

function initializeTechStack() {
    const techGrid = document.getElementById('techGrid');
    if (!techGrid) return;

    techGrid.innerHTML = techStack.map(createTechItem).join('');
    techGrid.addEventListener('click', (e) => {
        if (e.target.closest('.tech-item')) {
            document.getElementById('projects').scrollIntoView({ behavior: 'smooth' });
        }
    });
}

function createTechItem(tech) {
    const isFontAwesome = /^fa[bsr]? /.test(tech.icon) || tech.icon.startsWith('fa-');
    const icon = isFontAwesome
        ? `<i class="${tech.icon}"></i>`
        : `<img src="${tech.icon}" alt="${tech.name} icon" onerror="this.nextElementSibling.hidden=false; this.remove();"><i class="fas fa-code" hidden></i>`;
    return `<div class="tech-item">${icon}<h4>${tech.name}</h4></div>`;
}

function tagsHtml(list) {
    return (list || []).map(t => `<span class="tech-tag">${t}</span>`).join('');
}

/* ---------- Project cards ---------- */

function showProjectsLoading() {
    const grid = document.getElementById('projectsGrid');
    if (grid) {
        grid.innerHTML = `<div class="projects-loading"><div class="spinner"></div><p>Loading projects...</p></div>`;
    }
}

function renderProjects() {
    const host = document.getElementById('projectsGrid');
    if (!host) return;

    const mainProjects = projects.filter(p => p.type !== 'gamejam');
    const gameJams = projects.filter(p => p.type === 'gamejam');
    const gridHtml = list => `<div class="projects-grid">${list.map((p, i) => createProjectCard(p, i)).join('')}</div>`;

    host.innerHTML =
        (mainProjects.length ? gridHtml(mainProjects) : '') +
        (gameJams.length ? `<div class="subsection-label">Game Jams</div>${gridHtml(gameJams)}` : '');

    if (!host.dataset.bound) {
        host.dataset.bound = 'true';
        host.addEventListener('click', (e) => {
            const card = e.target.closest('.project-card');
            const project = card && projects.find(p => p.id === card.dataset.projectId);
            if (project) openProjectModal(project);
        });
    }
}

function createProjectCard(project, order) {
    const image = project.thumbnailUrl
        ? `<img src="${project.thumbnailUrl}" alt="${project.title}" loading="lazy" onerror="this.nextElementSibling.hidden=false; this.remove();"><i class="${project.image}" hidden></i>`
        : `<i class="${project.image}"></i>`;

    const isJam = project.type === 'gamejam';
    const duration = isJam && project.duration
        ? `<div class="duration-tag"><i class="fas fa-clock"></i> ${project.duration}</div>`
        : '';

    return `
        <div class="project-card fade-in" data-project-id="${project.id}" style="animation-delay:${order * 0.1}s">
            <div class="project-image">${image}</div>
            <div class="project-content">
                <div class="project-header">
                    <h3>${project.title}</h3>
                    ${isJam ? '<span class="gamejam-badge">Game Jam</span>' : ''}
                </div>
                ${duration}
                <p>${project.description}</p>
                <div class="project-tech">${tagsHtml(project.tech)}</div>
            </div>
        </div>`;
}

/* ---------- Modal ---------- */
// The popup has an Overview tab, then one tab per custom section from the
// admin tool (e.g. Maps, Sound), then an optional Summary tab. Each custom
// tab can hold several pages and appears as a clickable Key Feature.

function initializeModal() {
    modal = document.getElementById('projectModal');
    if (!modal) return;

    modal.querySelector('.close').addEventListener('click', closeProjectModal);
    window.addEventListener('click', (e) => { if (e.target === modal) closeProjectModal(); });

    document.getElementById('modalTabs').addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn');
        if (btn) switchModalTab(btn.dataset.tab);
    });

    document.getElementById('modalBody').addEventListener('click', (e) => {
        const feature = e.target.closest('.feature-link');
        if (feature) {
            switchModalTab(feature.dataset.tab);
            return;
        }
        const pageBtn = e.target.closest('.page-btn');
        if (pageBtn) showTabPage(pageBtn.closest('.tab-content'), parseInt(pageBtn.dataset.page, 10));
    });

    // Before/after sliders: the invisible range input drives the split.
    document.getElementById('modalBody').addEventListener('input', (e) => {
        if (!e.target.classList.contains('compare-range')) return;
        e.target.closest('.compare-slider').style.setProperty('--split', `${e.target.value}%`);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === 'block') closeProjectModal();
    });
}

// Custom tabs to show for a project. detailsEnabled === false hides them all.
function customTabs(project) {
    if (project.detailsEnabled === false) return [];
    const d = project.details || {};
    let sections = Array.isArray(d.sections) ? d.sections : [];

    // data.js written before custom tabs existed: show the old pages as one tab.
    if (!sections.length && Array.isArray(d.pages) && d.pages.length) {
        sections = [{ title: 'In-Depth', pages: d.pages }];
    }

    return sections
        .filter(s => (s.title && s.title.trim()) || (s.pages && s.pages.length))
        .map((s, i) => {
            const title = (s.title || '').trim() || 'Untitled';
            return {
                id: `tab-${i}`,
                title,
                feature: (s.feature || '').trim() || title,
                pages: s.pages || []
            };
        });
}

function summaryHtml(project) {
    if (project.detailsEnabled === false) return '';
    const d = project.details || {};
    const groups = [
        ['Challenges', d.challenges],
        ['Solutions', d.solutions],
        ['Lessons Learned', d.lessons]
    ].filter(([, items]) => items && items.length);

    return groups.map(([heading, items]) => `
        <div class="details-section">
            <h4>${heading}</h4>
            <ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>
        </div>`).join('');
}

function openProjectModal(project) {
    if (!modal) return;

    const sections = customTabs(project);
    const summary = summaryHtml(project);
    const tabs = [
        { id: 'overview', title: 'Overview', render: () => createOverviewContent(project, sections) },
        ...sections.map(sec => ({ id: sec.id, title: sec.title, render: () => customTabHtml(sec) })),
        ...(summary ? [{ id: 'summary', title: 'Summary', render: () => summary }] : [])
    ];

    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    document.getElementById('modalTitle').textContent = project.title;
    document.getElementById('modalTabs').innerHTML = tabs.map((t, i) =>
        `<button class="tab-btn${i === 0 ? ' active' : ''}" data-tab="${t.id}" role="tab">${t.title}</button>`).join('');
    document.getElementById('modalBody').innerHTML = '';

    requestAnimationFrame(() => populateModalContent(project, tabs));
}

function populateModalContent(project, tabs) {
    document.getElementById('modalBody').innerHTML = tabs.map(t =>
        `<div class="tab-content" data-tab="${t.id}" role="tabpanel">${t.render()}</div>`).join('');
    switchModalTab('overview');

    if (project.media && project.media.length > 1) initializeMediaShowcase(project.media);
}

function switchModalTab(tabName) {
    if (!modal) return;
    modal.querySelectorAll('.tab-btn').forEach(btn => {
        const active = btn.dataset.tab === tabName;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active);
        if (active) btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    modal.querySelectorAll('.tab-content').forEach(el => el.classList.toggle('active', el.dataset.tab === tabName));
    modal.querySelector('.modal-content').scrollTop = 0;
    pauseHiddenVideos();
}

function closeProjectModal() {
    if (!modal) return;
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    resetMediaShowcase();
    // Drop the tab content so page videos stop playing.
    document.getElementById('modalBody').innerHTML = '';
}

/* ---------- Overview tab ---------- */

function createOverviewContent(project, sections) {
    const o = project.overview;
    const storeButton = o.status === 'Released' && o.storeUrl
        ? `<div class="store-cta">
               <a class="store-btn" href="${o.storeUrl}" target="_blank" rel="noopener noreferrer">
                   <i class="fas fa-external-link-alt"></i> Play Now
               </a>
           </div>`
        : '';

    // One Key Feature per custom tab; clicking it opens that tab.
    const features = sections.length
        ? `<h4>Key Features</h4>
           <ul class="modal-features">${sections.map(sec => `
               <li>
                   <button type="button" class="feature-link" data-tab="${sec.id}">
                       <span>${sec.feature}</span>
                       <i class="fas fa-chevron-right" aria-hidden="true"></i>
                   </button>
               </li>`).join('')}
           </ul>`
        : '';

    return `
        ${createMediaShowcase(project.media, project.title)}
        <p class="modal-description">${o.description}</p>
        <div class="modal-info-grid">
            <div class="modal-info-item"><h4>Platforms</h4><p>${o.platforms.join(', ')}</p></div>
            <div class="modal-info-item"><h4>Status</h4><p>${o.status}</p></div>
            <div class="modal-info-item"><h4>Role</h4><p>${o.role}</p></div>
        </div>
        ${storeButton}
        ${features}
        <div class="modal-tech-stack">
            <h4>Technology Stack</h4>
            <div class="modal-tech-tags">${tagsHtml(project.tech)}</div>
        </div>`;
}

/* ---------- Custom tabs ---------- */

function customTabHtml(sec) {
    const pages = sec.pages;
    if (!pages.length) return `<p class="details-empty">This section is on its way.</p>`;

    const nav = pages.length > 1
        ? `<div class="page-nav">${pages.map((p, i) =>
            `<button class="page-btn${i === 0 ? ' active' : ''}" data-page="${i}">${p.title || `Page ${i + 1}`}</button>`).join('')}</div>`
        : '';

    return nav + pages.map((p, i) =>
        `<div class="details-page${i === 0 ? ' active' : ''}" data-page="${i}">${breakdownPageHtml(p)}</div>`).join('');
}

// A page's content in display order. Pages saved before blocks existed
// ({ body, images }) are read as their text followed by their images.
function pageBlocks(page) {
    if (Array.isArray(page.blocks)) return page.blocks;
    const blocks = page.body ? [{ type: 'text', body: page.body }] : [];
    return blocks.concat((page.images || []).map(im => ({ type: 'image', ...im })));
}

function breakdownPageHtml(page) {
    const content = pageBlocks(page).map(block => {
        if (block.type === 'image') return breakdownImageHtml(block, page);
        if (block.type === 'video') return breakdownVideoHtml(block, page);
        const body = (block.body || '').trim();
        return body ? `<div class="breakdown-body">${body}</div>` : '';
    }).join('');

    return `
        <article class="breakdown">
            ${page.title ? `<h3 class="breakdown-title">${page.title}</h3>` : ''}
            ${content}
        </article>`;
}

// An image block: a single image, a before | after pair, or a before/after
// slider. Comparison modes fall back to a single image until the after
// image exists.
function breakdownImageHtml(block, page) {
    if (!block.path) return '';
    const alt = attr(block.caption || page.title);
    const img = (src, altText, cls = '') =>
        `<img${cls ? ` class="${cls}"` : ''} src="${src}" alt="${altText}" loading="lazy" onerror="this.closest('figure').remove()">`;

    if (block.afterPath && (block.mode === 'side-by-side' || block.mode === 'slider')) {
        return `
            <figure class="breakdown-figure">
                ${block.caption ? `<figcaption class="breakdown-caption">${block.caption}</figcaption>` : ''}
                ${compareMediaHtml({
                    mode: block.mode,
                    before: block.path,
                    after: block.afterPath,
                    beforeLabel: block.beforeLabel,
                    afterLabel: block.afterLabel,
                    alt,
                    img
                })}
            </figure>`;
    }

    return `
        <figure class="breakdown-figure">
            <div class="media-frame">
                ${captionHtml(block.caption)}
                ${img(block.path, alt)}
            </div>
        </figure>`;
}

// A YouTube video block. Skipped when the link isn't a recognisable YouTube video.
function breakdownVideoHtml(block, page) {
    const id = extractYouTubeId(block.url);
    const src = id && buildEmbedSrc(block.url, { enablejsapi: '1' });
    if (!src) return '';
    const title = attr(block.caption || page.title || 'Video');
    return `
        <figure class="breakdown-figure breakdown-video">
            ${block.caption ? `<figcaption class="breakdown-caption">${block.caption}</figcaption>` : ''}
            <div class="video-frame">
                ${youtubeEmbedHtml(src, title, `https://www.youtube.com/watch?v=${id}`, true)}
            </div>
        </figure>`;
}

// Pause page videos that are no longer on screen (they keep playing when hidden).
function pauseHiddenVideos() {
    const command = JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] });
    document.querySelectorAll('#modalBody .breakdown-video iframe').forEach(iframe => {
        if (iframe.offsetParent === null && iframe.contentWindow) {
            iframe.contentWindow.postMessage(command, '*');
        }
    });
}

function showTabPage(panel, index) {
    if (!panel) return;
    panel.querySelectorAll('.page-btn').forEach(btn => btn.classList.toggle('active', +btn.dataset.page === index));
    panel.querySelectorAll('.details-page').forEach(el => el.classList.toggle('active', +el.dataset.page === index));

    const nav = panel.querySelector('.page-nav');
    if (nav) nav.scrollIntoView({ block: 'nearest' });
    pauseHiddenVideos();
}

/* ---------- Scroll effects ---------- */

function initializeScrollEffects() {
    const navbar = document.querySelector('.navbar');
    const heroBackground = document.querySelector('.hero-background');
    let ticking = false;

    function handleScroll() {
        const scrollY = window.scrollY;

        if (navbar) {
            navbar.classList.toggle('visible', scrollY > 50);
            navbar.style.backgroundColor = scrollY > 100 ? 'rgba(12, 12, 12, 0.97)' : 'rgba(12, 12, 12, 0.90)';
        }
        if (heroBackground && scrollY < window.innerHeight) {
            heroBackground.style.transform = `translateY(${scrollY * 0.5}px)`;
        }
        ticking = false;
    }

    window.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(handleScroll);
            ticking = true;
        }
    }, { passive: true });
    handleScroll();

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    document.querySelectorAll('section').forEach(section => observer.observe(section));
}

window.getPerformanceMetrics = () => ({
    ...performanceMetrics,
    totalTime: performanceMetrics.initEnd - performanceMetrics.initStart
});