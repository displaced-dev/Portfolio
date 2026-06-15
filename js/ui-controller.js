let modal = null;

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

document.addEventListener('DOMContentLoaded', async function () {
    await bootstrapPrecache();

    initializeNavigation();
    renderAbout();
    renderExperience();
    initializeTechStack();
    initializeModal();
    initializeScrollEffects();

    showProjectsLoading();

    try {
        await initializeAllProjectMedia();
        initializeProjects();
    } catch (error) {
        console.error('Failed to initialize portfolio:', error);
        initializeProjects();
    }

    if (window.IS_LOCAL) injectDevManifestButton();
});

function showProjectsLoading() {
    const projectsGrid = document.getElementById('projectsGrid');
    if (!projectsGrid) return;
    projectsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
            <div style="display: inline-block; width: 40px; height: 40px; border: 3px solid #f3f3f3; border-top: 3px solid #dc2626; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <p style="margin-top: 1rem; color: #666;">Loading projects...</p>
        </div>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    `;
}

function initializeNavigation() {
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');
    const navLinks = document.querySelectorAll('.nav-link');

    if (hamburger && navMenu) {
        hamburger.addEventListener('click', () => {
            navMenu.classList.toggle('active');
        });
    }

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetSection = document.querySelector(link.getAttribute('href'));
            if (targetSection) {
                targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            if (navMenu) navMenu.classList.remove('active');
        });
    });

    const heroScroll = document.querySelector('.hero-scroll');
    if (heroScroll) {
        heroScroll.addEventListener('click', () => {
            const aboutSection = document.querySelector('#about');
            if (aboutSection) aboutSection.scrollIntoView({ behavior: 'smooth' });
        });
    }
}

function renderAbout() {
    if (typeof about === 'undefined') return;

    const bulletsContainer = document.getElementById('aboutBullets');
    if (bulletsContainer) {
        bulletsContainer.innerHTML = about.bullets.map(b => `
            <div class="location">
                <i class="fas fa-circle"></i>
                <span>${b}</span>
            </div>
        `).join('');
    }

    const resumeLink = document.getElementById('resumeLink');
    if (resumeLink) resumeLink.setAttribute('href', about.resumePath);

    const headshot = document.getElementById('aboutHeadshot');
    if (headshot) headshot.setAttribute('src', about.headshot);
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
                <div class="project-tech">
                    ${entry.tech.map(t => `<span class="tech-tag">${t}</span>`).join('')}
                </div>
                <p>${entry.description}</p>
                <ul>
                    ${entry.bullets.map(b => `<li>${b}</li>`).join('')}
                </ul>
            </div>
        </div>
    `).join('');
}

function initializeTechStack() {
    const techGrid = document.getElementById('techGrid');
    if (!techGrid) return;

    const techFragment = document.createDocumentFragment();
    techStack.forEach(tech => techFragment.appendChild(createTechItem(tech)));
    techGrid.appendChild(techFragment);

    techGrid.addEventListener('click', (e) => {
        if (e.target.closest('.tech-item')) {
            document.getElementById('projects').scrollIntoView({ behavior: 'smooth' });
        }
    });
}

function createTechItem(tech) {
    const techItem = document.createElement('div');
    techItem.className = 'tech-item';

    const isImage = tech.icon.includes('/') || tech.icon.includes('.') ||
                   (!tech.icon.startsWith('fa') && !tech.icon.includes('fa-'));

    const iconHtml = isImage
        ? `<img src="${tech.icon}"
                alt="${tech.name} icon"
                onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';"
                onload="this.nextElementSibling.style.display='none';" />
           <i class="fas fa-code" style="display:none"></i>`
        : `<i class="${tech.icon}"></i>`;

    techItem.innerHTML = `${iconHtml}<h4>${tech.name}</h4>`;
    return techItem;
}

function initializeProjects() {
    renderProjects();
}

function renderProjects() {
    const projectsGrid = document.getElementById('projectsGrid');
    if (!projectsGrid) return;

    const mainProjects = projects.filter(p => p.type !== 'gamejam');
    const gameJams = projects.filter(p => p.type === 'gamejam');

    const wrapper = document.createDocumentFragment();

    if (mainProjects.length) {
        const grid = document.createElement('div');
        grid.className = 'projects-grid';
        mainProjects.forEach((project, i) => {
            const card = createProjectCard(project);
            card.style.animationDelay = `${i * 0.1}s`;
            card.classList.add('fade-in');
            grid.appendChild(card);
        });
        wrapper.appendChild(grid);
    }

    if (gameJams.length) {
        const label = document.createElement('div');
        label.className = 'subsection-label';
        label.textContent = 'Game Jams';
        wrapper.appendChild(label);

        const grid = document.createElement('div');
        grid.className = 'projects-grid';
        gameJams.forEach((project, i) => {
            const card = createProjectCard(project);
            card.style.animationDelay = `${i * 0.1}s`;
            card.classList.add('fade-in');
            grid.appendChild(card);
        });
        wrapper.appendChild(grid);
    }

    projectsGrid.innerHTML = '';
    projectsGrid.appendChild(wrapper);

    projectsGrid.addEventListener('click', (e) => {
        const projectCard = e.target.closest('.project-card');
        if (projectCard) {
            const project = projects.find(p => p.id === projectCard.dataset.projectId);
            if (project) openProjectModal(project);
        }
    });
}

function createProjectCard(project) {
    const projectCard = document.createElement('div');
    projectCard.className = 'project-card';
    projectCard.dataset.projectId = project.id;

    const imageContent = project.thumbnailUrl
        ? `<img src="${project.thumbnailUrl}"
                alt="${project.title}"
                style="width: 100%; height: 100%; object-fit: cover;"
                loading="lazy"
                onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
           <i class="${project.image}" style="display: none;"></i>`
        : `<i class="${project.image}"></i>`;

    const isJam = project.type === 'gamejam';
    const durationHtml = isJam && project.duration
        ? `<div class="duration-tag"><i class="fas fa-clock"></i> ${project.duration}</div>`
        : '';

    projectCard.innerHTML = `
        <div class="project-image">
            ${imageContent}
        </div>
        <div class="project-content">
            <div class="project-header">
                <h3>${project.title}</h3>
                ${isJam ? '<span class="gamejam-badge">Game Jam</span>' : ''}
            </div>
            ${durationHtml}
            <p>${project.description}</p>
            <div class="project-tech">
                ${project.tech.map(tech => `<span class="tech-tag">${tech}</span>`).join('')}
            </div>
        </div>
    `;
    return projectCard;
}

function initializeModal() {
    modal = document.getElementById('projectModal');
    if (!modal) return;

    const closeBtn = modal.querySelector('.close');
    if (closeBtn) closeBtn.addEventListener('click', closeProjectModal);

    window.addEventListener('click', (e) => {
        if (e.target === modal) closeProjectModal();
    });

    const modalHeader = modal.querySelector('.modal-header');
    if (modalHeader) {
        modalHeader.addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-btn')) {
                switchModalTab(e.target.dataset.tab);
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === 'block') {
            closeProjectModal();
        }
    });
}

function openProjectModal(project) {
    if (!modal) return;

    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';

    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = project.title;

    const detailsTabBtn = modal.querySelector('.tab-btn[data-tab="details"]');
    if (detailsTabBtn) {
        detailsTabBtn.style.display = (project.detailsEnabled === false) ? 'none' : '';
    }

    switchModalTab('overview');

    requestAnimationFrame(() => populateModalContent(project));
}

function populateModalContent(project) {
    const overviewContent = document.getElementById('overview');
    if (overviewContent) overviewContent.innerHTML = createOverviewContent(project);

    const detailsContent = document.getElementById('details');
    if (detailsContent) {
        detailsContent.innerHTML = (project.detailsEnabled === false)
            ? ''
            : createDetailsContent(project);
    }

    if (project.media && project.media.length > 1) {
        setTimeout(() => initializeMediaShowcase(project.media), 0);
    }

    if (project.details.comparison.media && project.details.comparison.media.length > 1) {
        setTimeout(() => initializeComparisonGallery(project.details.comparison.media), 0);
    }
}

function createOverviewContent(project) {
    const playableBar = project.overview.status === 'Released' && project.overview.storeUrl
        ? `<div class="playable-bar">
               <span>This experience is playable</span>
               <a href="${project.overview.storeUrl}" target="_blank" rel="noopener noreferrer" class="playable-bar-link">Play →</a>
           </div>`
        : '';

    return `
        ${playableBar}
        ${createMediaShowcase(project.media, project.title)}

        <p class="modal-description">${project.overview.description}</p>

        <div class="modal-info-grid">
            <div class="modal-info-item">
                <h4>Platforms</h4>
                <p>${project.overview.platforms.join(', ')}</p>
            </div>
            <div class="modal-info-item">
                <h4>Status</h4>
                <p>${project.overview.status}</p>
            </div>
            <div class="modal-info-item">
                <h4>Role</h4>
                <p>${project.overview.role}</p>
            </div>
        </div>

        <h4>Key Features</h4>
        <ul class="modal-features">
            ${project.overview.features.map(feature => `<li>${feature}</li>`).join('')}
        </ul>

        <div class="modal-tech-stack">
            <h4>Technology Stack</h4>
            <div class="modal-tech-tags">
                ${project.tech.map(tech => `<span class="tech-tag">${tech}</span>`).join('')}
            </div>
        </div>
    `;
}

function createDetailsContent(project) {
    return `
        <div class="details-section">
            <h4>Challenges</h4>
            <ul>
                ${project.details.challenges.map(challenge => `<li>${challenge}</li>`).join('')}
            </ul>
        </div>

        <div class="details-section">
            <h4>Solutions</h4>
            <ul>
                ${project.details.solutions.map(solution => `<li>${solution}</li>`).join('')}
            </ul>
        </div>

        <div class="details-section">
            <h4>Lessons Learned</h4>
            <ul>
                ${project.details.lessons.map(lesson => `<li>${lesson}</li>`).join('')}
            </ul>
        </div>

        ${createComparisonSection(project.details.comparison)}
    `;
}

function createComparisonSection(comparison) {
    return `
        <div class="comparison-section">
            <h4>${comparison.title}</h4>

            ${createComparisonGallery(comparison.media, comparison.title)}

            <div class="comparison-analysis">
                <div class="analysis-grid">
                    <div class="analysis-side our-approach">
                        <h5 class="analysis-side-title">${comparison.analysis.ourApproach.title}</h5>
                        <p class="analysis-description">${comparison.analysis.ourApproach.description}</p>
                        <ul class="analysis-points success">
                            ${comparison.analysis.ourApproach.whatWorked.map(point => `<li>${point}</li>`).join('')}
                        </ul>
                    </div>

                    <div class="analysis-side traditional-approach">
                        <h5 class="analysis-side-title">${comparison.analysis.traditionalApproach.title}</h5>
                        <p class="analysis-description">${comparison.analysis.traditionalApproach.description}</p>
                        <ul class="analysis-points limitations">
                            ${comparison.analysis.traditionalApproach.whatDidntWork.map(point => `<li>${point}</li>`).join('')}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function switchModalTab(tabName) {
    if (!modal) return;

    modal.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const activeTabBtn = modal.querySelector(`[data-tab="${tabName}"]`);
    if (activeTabBtn) activeTabBtn.classList.add('active');

    modal.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    const activeContent = document.getElementById(tabName);
    if (activeContent) activeContent.classList.add('active');

    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) modalContent.scrollTop = 0;
}

function closeProjectModal() {
    if (!modal) return;

    modal.style.display = 'none';
    document.body.style.overflow = 'auto';

    resetMediaShowcase();
}

function initializeScrollEffects() {
    const navbar = document.querySelector('.navbar');
    const heroBackground = document.querySelector('.hero-background');
    let ticking = false;

    function handleScroll() {
        const scrollY = window.scrollY;

        if (navbar) {
            if (scrollY > 50) {
                navbar.classList.add('visible');
                navbar.style.backgroundColor = scrollY > 100
                    ? 'rgba(12, 12, 12, 0.97)'
                    : 'rgba(12, 12, 12, 0.90)';
            } else {
                navbar.classList.remove('visible');
                navbar.style.backgroundColor = 'rgba(12, 12, 12, 0.90)';
            }
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

