// Renders the page sections and the project modal (Overview + In-Depth).

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

function initializeModal() {
    modal = document.getElementById('projectModal');
    if (!modal) return;

    modal.querySelector('.close').addEventListener('click', closeProjectModal);
    window.addEventListener('click', (e) => { if (e.target === modal) closeProjectModal(); });

    modal.querySelector('.modal-header').addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-btn')) switchModalTab(e.target.dataset.tab);
    });

    document.getElementById('details').addEventListener('click', (e) => {
        const btn = e.target.closest('.page-btn');
        if (btn) showDetailsPage(parseInt(btn.dataset.page, 10));
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === 'block') closeProjectModal();
    });
}

function openProjectModal(project) {
    if (!modal) return;

    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    document.getElementById('modalTitle').textContent = project.title;

    // detailsEnabled defaults to true when undefined so legacy data keeps working.
    const detailsTab = modal.querySelector('.tab-btn[data-tab="details"]');
    if (detailsTab) detailsTab.hidden = project.detailsEnabled === false;

    switchModalTab('overview');
    requestAnimationFrame(() => populateModalContent(project));
}

function populateModalContent(project) {
    document.getElementById('overview').innerHTML = createOverviewContent(project);
    document.getElementById('details').innerHTML =
        project.detailsEnabled === false ? '' : createDetailsContent(project);

    if (project.media && project.media.length > 1) initializeMediaShowcase(project.media);
}

function switchModalTab(tabName) {
    if (!modal) return;
    modal.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));
    modal.querySelectorAll('.tab-content').forEach(el => el.classList.toggle('active', el.id === tabName));
}

function closeProjectModal() {
    if (!modal) return;
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    resetMediaShowcase();
}

/* ---------- Overview tab ---------- */

function createOverviewContent(project) {
    const o = project.overview;
    const storeButton = o.status === 'Released' && o.storeUrl
        ? `<div class="store-cta">
               <a class="store-btn" href="${o.storeUrl}" target="_blank" rel="noopener noreferrer">
                   <i class="fas fa-external-link-alt"></i> Play Now
               </a>
           </div>`
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
        <h4>Key Features</h4>
        <ul class="modal-features">${o.features.map(f => `<li>${f}</li>`).join('')}</ul>
        <div class="modal-tech-stack">
            <h4>Technology Stack</h4>
            <div class="modal-tech-tags">${tagsHtml(project.tech)}</div>
        </div>`;
}

/* ---------- In-Depth tab ---------- */

// The In-Depth tab is a set of pages: an optional Summary (challenges /
// solutions / lessons) followed by each breakdown page from the admin tool.
function createDetailsContent(project) {
    const d = project.details || {};
    const pages = [];

    const summary = [
        ['Challenges', d.challenges],
        ['Solutions', d.solutions],
        ['Lessons Learned', d.lessons]
    ].filter(([, items]) => items && items.length);

    if (summary.length) {
        pages.push({
            title: 'Summary',
            html: summary.map(([heading, items]) => `
                <div class="details-section">
                    <h4>${heading}</h4>
                    <ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>
                </div>`).join('')
        });
    }

    (d.pages || []).forEach(page => {
        pages.push({ title: page.title || 'Untitled', html: breakdownPageHtml(page) });
    });

    if (!pages.length) return `<p class="details-empty">A breakdown for this project is on its way.</p>`;

    const nav = pages.length > 1
        ? `<div class="page-nav">${pages.map((p, i) =>
            `<button class="page-btn${i === 0 ? ' active' : ''}" data-page="${i}">${p.title}</button>`).join('')}</div>`
        : '';

    return nav + pages.map((p, i) =>
        `<div class="details-page${i === 0 ? ' active' : ''}" data-page="${i}">${p.html}</div>`).join('');
}

function breakdownPageHtml(page) {
    const figures = (page.images || []).map(img => `
        <figure class="breakdown-figure">
            <div class="media-frame">
                ${captionHtml(img.caption)}
                <img src="${img.path}" alt="${attr(img.caption || page.title)}" loading="lazy" onerror="this.closest('figure').remove()">
            </div>
        </figure>`).join('');

    return `
        <article class="breakdown">
            ${page.title ? `<h3 class="breakdown-title">${page.title}</h3>` : ''}
            ${page.body ? `<div class="breakdown-body">${page.body.trim()}</div>` : ''}
            ${figures}
        </article>`;
}

function showDetailsPage(index) {
    const details = document.getElementById('details');
    details.querySelectorAll('.page-btn').forEach(btn => btn.classList.toggle('active', +btn.dataset.page === index));
    details.querySelectorAll('.details-page').forEach(el => el.classList.toggle('active', +el.dataset.page === index));

    const nav = details.querySelector('.page-nav');
    if (nav) nav.scrollIntoView({ block: 'nearest' });
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