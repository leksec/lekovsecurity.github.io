window.dataLayer = window.dataLayer || [];
function gtag() {
    dataLayer.push(arguments);
}
gtag('js', new Date());

gtag('config', 'G-KB54M68BRK');

document.addEventListener('DOMContentLoaded', () => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const reveals = document.querySelectorAll('.reveal');
    if (!reduceMotion && 'IntersectionObserver' in window) {
        const io = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                        io.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.12, rootMargin: '0px 0px -7% 0px' },
        );
        reveals.forEach((el) => io.observe(el));
    } else {
        reveals.forEach((el) => el.classList.add('is-visible'));
    }

    const menuToggle = document.querySelector('.menu-toggle');
    const mobileNav = document.getElementById('mobile-nav');
    if (menuToggle && mobileNav) {
        const closeMenu = () => {
            menuToggle.setAttribute('aria-expanded', 'false');
            mobileNav.classList.remove('open');
            mobileNav.setAttribute('aria-hidden', 'true');
        };
        menuToggle.addEventListener('click', () => {
            const open = menuToggle.getAttribute('aria-expanded') === 'true';
            menuToggle.setAttribute('aria-expanded', String(!open));
            mobileNav.classList.toggle('open', !open);
            mobileNav.setAttribute('aria-hidden', String(open));
        });
        mobileNav.querySelectorAll('a').forEach((a) => a.addEventListener('click', closeMenu));
    }

    const glow = document.querySelector('.cursor-glow');
    if (glow && !reduceMotion && window.matchMedia('(pointer:fine)').matches) {
        window.addEventListener(
            'pointermove',
            (e) => {
                glow.style.left = e.clientX + 'px';
                glow.style.top = e.clientY + 'px';
            },
            { passive: true },
        );
    }

    document.querySelectorAll('.capability-card').forEach((card) => {
        card.addEventListener(
            'pointermove',
            (e) => {
                const r = card.getBoundingClientRect();
                card.style.setProperty('--mx', e.clientX - r.left + 'px');
                card.style.setProperty('--my', e.clientY - r.top + 'px');
            },
            { passive: true },
        );
    });

    const stage = document.getElementById('radar-stage');
    const svg = stage?.querySelector('.radar-network');
    const edgesLayer = document.getElementById('radar-edges');
    const pulsesLayer = document.getElementById('radar-pulses');
    const nodes = [...document.querySelectorAll('.radar-node')];
    const status = document.getElementById('radar-status-text');
    const compromise = document.getElementById('radar-compromise');
    const mobileRadar = window.matchMedia('(max-width: 640px), (pointer: coarse)').matches;

    if (!stage || !svg || !edgesLayer || !pulsesLayer || !nodes.length) return;

    const outcomes = {
        web: 'orange',
        vpn: 'green',
        api: 'red',
        dc: 'red',
        db: 'orange',
        windows: 'red',
        linux: 'green',
    };

    const edgePairs = [
        ['web', 'linux'],
        ['web', 'api'],
        ['web', 'windows'],
        ['linux', 'vpn'],
        ['linux', 'db'],
        ['linux', 'api'],
        ['vpn', 'api'],
        ['vpn', 'dc'],
        ['api', 'dc'],
        ['api', 'db'],
        ['dc', 'windows'],
        ['db', 'windows'],
    ];

    const nodeNames = ['web', 'vpn', 'api', 'dc', 'db', 'windows', 'linux'];
    let nodeCoords = {};

    const publicNodes = ['web', 'api', 'vpn'];
    const nodeMap = Object.fromEntries(nodes.map((n) => [n.dataset.node, n]));
    const adjacency = Object.fromEntries(nodeNames.map((name) => [name, []]));
    edgePairs.forEach(([a, b]) => {
        adjacency[a].push(b);
        adjacency[b].push(a);
    });

    function randomizeNodeCoords() {
        const points = [];
        const minDistance = 17.5;
        const centerExclusion = 15;
        const bounds = { minX: 12, maxX: 88, minY: 13, maxY: 87 };
        let attempts = 0;

        while (points.length < nodeNames.length && attempts < 50000) {
            attempts++;
            const candidate = {
                x: bounds.minX + Math.random() * (bounds.maxX - bounds.minX),
                y: bounds.minY + Math.random() * (bounds.maxY - bounds.minY),
            };

            if (Math.hypot(candidate.x - 50, candidate.y - 50) < centerExclusion) continue;

            if (
                points.some(
                    (point) =>
                        Math.hypot(candidate.x - point.x, candidate.y - point.y) < minDistance,
                )
            )
                continue;

            points.push(candidate);
        }

        if (points.length !== nodeNames.length) {
            points.splice(
                0,
                points.length,
                { x: 18, y: 20 },
                { x: 76, y: 19 },
                { x: 84, y: 55 },
                { x: 70, y: 81 },
                { x: 31, y: 76 },
                { x: 16, y: 55 },
                { x: 45, y: 18 },
            );
        }

        const shuffledNames = shuffle(nodeNames);
        nodeCoords = {};
        shuffledNames.forEach((name, index) => {
            nodeCoords[name] = points[index];
            const node = nodeMap[name];
            const point = points[index];
            if (node && point) {
                node.style.setProperty('--node-x', `${point.x}%`);
                node.style.setProperty('--node-y', `${point.y}%`);
            }
        });
    }

    let rafHandles = [];
    let token = 0;
    let edgeMap = new Map();
    let sweepAngle = 0;
    let sweepLastTime = performance.now();
    let sweepRunning = true;
    let discovered = new Set();
    let compromised = new Set();
    let compromisedEdges = new Set();
    let discoverable = new Set(publicNodes);
    let pingedThisSweep = new Set();
    const SWEEP_PERIOD = 3600;
    const SWEEP_SPEED = 360 / SWEEP_PERIOD;
    const DISCOVERY_CHANCE = 0.9;

    function shuffle(list) {
        const a = [...list];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function wait(ms, t) {
        return new Promise((resolve) => setTimeout(() => resolve(t === token), ms));
    }

    function jitter(base, spread) {
        return Math.max(0, base + (Math.random() * 2 - 1) * spread);
    }

    function pick(options) {
        return options[Math.floor(Math.random() * options.length)];
    }

    function makeSvg(tag) {
        return document.createElementNS('http://www.w3.org/2000/svg', tag);
    }

    function buildEdges() {
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('preserveAspectRatio', 'none');
        edgesLayer.innerHTML = '';
        edgeMap.clear();
        edgePairs.forEach(([a, b]) => {
            const p1 = nodeCoords[a];
            const p2 = nodeCoords[b];
            const line = makeSvg('line');
            line.setAttribute('x1', p1.x);
            line.setAttribute('y1', p1.y);
            line.setAttribute('x2', p2.x);
            line.setAttribute('y2', p2.y);
            line.classList.add('radar-edge');
            const edgeKey = [a, b].sort().join('|');
            if (compromisedEdges.has(edgeKey)) line.classList.add('compromise');
            line.dataset.from = a;
            line.dataset.to = b;
            edgesLayer.appendChild(line);
            edgeMap.set(edgeKey, line);
        });
        updateEdgeVisibility();
    }

    function updateEdgeVisibility() {
        edgeMap.forEach((line) => {
            line.classList.remove('visible', 'active');
        });
    }

    function getEdge(a, b) {
        return edgeMap.get([a, b].sort().join('|')) || null;
    }

    function cancelAnimations() {
        rafHandles.forEach(cancelAnimationFrame);
        rafHandles = [];
    }

    function clearLayers() {
        cancelAnimations();
        edgesLayer
            .querySelectorAll('line')
            .forEach((line) => line.classList.remove('active', 'compromise'));
        pulsesLayer.innerHTML = '';
    }

    function setNode(name, state) {
        const node = nodeMap[name];
        if (!node) return;
        node.dataset.state = state;
        node.classList.remove('scan-hit', 'attack-hit');
        void node.offsetWidth;
        node.classList.add(state === 'compromised' ? 'attack-hit' : 'scan-hit');
    }

    function pingNode(name, reason = 'scan') {
        const node = nodeMap[name];
        if (!node) return;
        const state = node.dataset.state || 'pending';
        const color = state === 'red' ? '#ff5548' : state === 'orange' ? '#ff9b43' : '#b8ff35';
        node.style.setProperty('--ping-color', color);
        node.dataset.pingReason = reason;
        node.classList.remove('radar-ping');
        void node.offsetWidth;
        node.classList.add('radar-ping');
        window.setTimeout(() => node.classList.remove('radar-ping'), 620);
    }

    function nodeAngle(name) {
        const p = nodeCoords[name];
        let deg = (Math.atan2(p.y - 50, p.x - 50) * 180) / Math.PI;
        return (deg + 360) % 360;
    }

    function crossed(prev, curr, target) {
        if (curr >= prev) return target >= prev && target < curr;
        return target >= prev || target < curr;
    }

    function setSweep(angle) {
        sweepAngle = (angle + 360) % 360;
        const sweep = stage.querySelector('.radar-sweep');
        if (sweep) sweep.style.transform = `rotate(${sweepAngle}deg)`;
    }

    function sweepTick(now) {
        if (!sweepRunning) return;
        const elapsed = Math.min(80, now - sweepLastTime);
        sweepLastTime = now;
        const previous = sweepAngle;
        const next = (sweepAngle + elapsed * SWEEP_SPEED) % 360;
        if (next < previous) pingedThisSweep.clear();
        setSweep(next);

        for (const name of nodeNames) {
            if (!discoverable.has(name) || discovered.has(name)) continue;
            if (!crossed(previous, next, nodeAngle(name))) continue;

            if (Math.random() <= DISCOVERY_CHANCE) {
                revealNode(name);
                updateRadarSummary();
            } else {
                status.textContent = `${pick(['SCANNING', 'PROBING', 'ENUMERATING'])} / ${nodeMap[name].dataset.name} / NOISE`;
            }
        }

        for (const name of discovered) {
            if (pingedThisSweep.has(name)) continue;
            if (!crossed(previous, next, nodeAngle(name))) continue;
            pingedThisSweep.add(name);
            pingNode(name, compromised.has(name) ? 'sweep-compromised' : 'sweep');
        }

        requestAnimationFrame(sweepTick);
    }

    function hideNode(name) {
        const node = nodeMap[name];
        if (!node) return;
        node.dataset.state = 'pending';
        node.classList.remove('radar-ping', 'scan-hit', 'attack-hit');
        node.style.removeProperty('--ping-color');
        node.removeAttribute('data-ping-reason');
    }

    function revealNode(name, source = null) {
        if (discovered.has(name)) return;
        discovered.add(name);
        setNode(name, outcomes[name]);
        pingNode(name, source ? 'lateral' : 'scan');
        updateEdgeVisibility();
        if (source) {
            status.textContent = `NEW ASSET / ${nodeMap[name].dataset.name} / REACHED VIA ${nodeMap[source].dataset.name}`;
        } else {
            status.textContent = `EXTERNAL / ${nodeMap[name].dataset.name} DISCOVERED`;
        }
    }

    function unlockFrom(name) {
        adjacency[name].forEach((neighbor) => {
            if (!discovered.has(neighbor)) discoverable.add(neighbor);
        });
    }

    function resetCycle() {
        token++;
        clearLayers();
        discovered = new Set();
        compromised = new Set();
        compromisedEdges = new Set();
        discoverable = new Set(publicNodes);
        pingedThisSweep.clear();
        nodeNames.forEach(hideNode);
        buildEdges();
        status.textContent = 'MAPPING EXTERNAL SURFACE';
        updateRadarSummary();
    }

    async function pulseAlong(a, b, attack = false, duration = 650, t = token) {
        const p1 = nodeCoords[a];
        const p2 = nodeCoords[b];
        if (!p1 || !p2) return false;
        const pulse = makeSvg('circle');
        pulse.classList.add('radar-pulse');
        if (attack) pulse.classList.add('attack');
        pulse.setAttribute('cx', p1.x);
        pulse.setAttribute('cy', p1.y);
        pulsesLayer.appendChild(pulse);

        return new Promise((resolve) => {
            const startTime = performance.now();
            let lastPaint = 0;
            const frameInterval = mobileRadar ? 34 : 0;
            const frame = (now) => {
                if (t !== token) {
                    pulse.remove();
                    resolve(false);
                    return;
                }
                const p = Math.min(1, (now - startTime) / duration);
                if (!frameInterval || now - lastPaint >= frameInterval || p >= 1) {
                    const eased = 1 - Math.pow(1 - p, 3);
                    pulse.setAttribute('cx', p1.x + (p2.x - p1.x) * eased);
                    pulse.setAttribute('cy', p1.y + (p2.y - p1.y) * eased);
                    lastPaint = now;
                }
                if (p < 1) {
                    const h = requestAnimationFrame(frame);
                    rafHandles.push(h);
                } else {
                    pulse.remove();
                    resolve(true);
                }
            };
            rafHandles.push(requestAnimationFrame(frame));
        });
    }

    async function waitForDiscovery(name, t, label = 'SCANNING') {
        while (token === t && !discovered.has(name)) {
            status.textContent = `${label} / ${nodeMap[name].dataset.name}`;
            if (!(await wait(100, t))) return false;
        }
        return token === t;
    }

    function chooseAttackPlan(root) {
        const children = new Map(nodeNames.map((name) => [name, []]));
        const visited = new Set([root]);

        function grow(current) {
            for (const next of shuffle(adjacency[current])) {
                if (visited.has(next)) continue;
                visited.add(next);
                children.get(current).push(next);
                grow(next);
            }
        }
        grow(root);

        if (visited.size !== nodeNames.length) return null;

        const steps = [];
        function flatten(current) {
            for (const child of shuffle(children.get(current))) {
                steps.push([current, child]);
                flatten(child);
            }
        }
        flatten(root);

        return { root, children, steps };
    }

    function renderCompromisePath() {
        const ordered = [...compromised];
        return ordered.map((n) => nodeMap[n].dataset.name).join(' → ');
    }

    function updateRadarSummary() {
        compromise.innerHTML = `<strong>${compromised.size} / ${nodeNames.length}</strong> ASSETS COMPROMISED`;
    }

    async function run() {
        randomizeNodeCoords();
        resetCycle();
        const t = token;

        const rootCandidates = shuffle(publicNodes);
        const root = rootCandidates[0];
        const plan = chooseAttackPlan(root);
        if (!plan) return;

        while (token === t && discovered.size < 1) {
            await wait(100, t);
        }
        if (t !== token) return;

        if (!discovered.has(root)) {
            if (!(await waitForDiscovery(root, t, 'SCANNING ENTRY'))) return;
        }

        compromised.add(root);
        setNode(root, 'compromised');
        unlockFrom(root);
        status.textContent = `INITIAL ACCESS / ${nodeMap[root].dataset.name}`;
        updateRadarSummary();
        await wait(jitter(420, 90), t);
        if (t !== token) return;

        for (const [from, target] of plan.steps) {
            if (t !== token) return;
            if (!compromised.has(from) || compromised.has(target)) continue;

            unlockFrom(from);

            if (!discovered.has(target)) {
                const scanVerb = pick(['SCANNING FROM', 'PROBING FROM', 'ENUMERATING FROM']);
                status.textContent = `PIVOT / ${nodeMap[from].dataset.name} / ${scanVerb.split(' ')[0]}`;
                updateRadarSummary();
                if (
                    !(await waitForDiscovery(
                        target,
                        t,
                        `${scanVerb} ${nodeMap[from].dataset.name}`,
                    ))
                )
                    return;
                await wait(jitter(220, 60), t);
                if (t !== token) return;
            } else {
                status.textContent = `REASSESS / ${nodeMap[from].dataset.name} → ${nodeMap[target].dataset.name}`;
                await wait(jitter(220, 60), t);
                if (t !== token) return;
            }

            const edge = getEdge(from, target);
            if (!edge || !discovered.has(from) || !discovered.has(target)) return;

            compromisedEdges.add([from, target].sort().join('|'));
            edge.classList.add('compromise');
            status.textContent = `${pick(['EXPLOITING', 'ATTACKING'])} / ${nodeMap[from].dataset.name} → ${nodeMap[target].dataset.name}`;
            if (!(await pulseAlong(from, target, true, jitter(670, 90), t))) return;

            compromised.add(target);
            setNode(target, 'compromised');
            unlockFrom(target);
            updateRadarSummary();
            await wait(jitter(240, 70), t);
        }

        status.textContent = `COMPROMISE COMPLETE / ${compromised.size} ASSETS`;
        updateRadarSummary();
        await wait(reduceMotion ? 2800 : jitter(1450, 220), t);
        if (t !== token) return;

        run();
    }

    window.addEventListener('resize', () => buildEdges(), { passive: true });

    nodes.forEach((node) =>
        node.addEventListener('click', () => {
            const key = node.dataset.node;
            if (node.dataset.state !== 'pending') {
                status.textContent = `ASSET / ${node.dataset.name} / ${outcomes[key].toUpperCase()}`;
            }
        }),
    );

    function startRadar() {
        setSweep(sweepAngle);
        sweepLastTime = performance.now();
        requestAnimationFrame(sweepTick);
        run();
    }

    const radarContainer = stage.closest('.hero-radar') || stage;
    if ('IntersectionObserver' in window) {
        const radarObserver = new IntersectionObserver(
            (entries) => {
                if (!entries.some((entry) => entry.isIntersecting)) return;
                radarObserver.disconnect();
                startRadar();
            },
            { threshold: 0.08 },
        );
        radarObserver.observe(radarContainer);
    } else {
        startRadar();
    }
});

const LEKOV_PRICING = {
    currency: 'EUR',
    rounding: 50,
    services: {
        web: {
            label: 'Web and API Penetration Testing',
            short: 'Web and API testing',
            description:
                'Test application logic, authentication, authorization and exploitable input handling.',
            base: 1500,
            increment: 1500,
            groupSize: 1,
            defaultQuantity: 1,
            max: 10,
            baseDays: 3,
            incrementDays: 3,
            quantityLabel: 'APPLICATIONS OR APIS',
            quantityDescription: 'Count each independently scoped application or API.',
            singular: 'application or API',
            plural: 'applications or APIs',
            coverageLabel: 'APPLICATION SIZE',
            tiers: [
                {
                    label: 'Small',
                    hint: 'Up to 15',
                    multiplier: 1,
                    detail: 'Up to 15 functional pages or API endpoints, with a limited number of user roles. Size is per application or API.',
                },
                {
                    label: 'Standard',
                    hint: '16–40',
                    multiplier: 1.6,
                    detail: '16–40 functional pages or API endpoints, with multiple user roles and business workflows. Size is per application or API.',
                },
                {
                    label: 'Complex',
                    hint: '41–80',
                    multiplier: 2.6,
                    detail: '41–80 functional pages or API endpoints, with extensive workflows or complex authorization. Size is per application or API.',
                },
            ],
        },
        code: {
            label: 'Source Code Security Review',
            short: 'Source code review',
            description:
                'Review security-sensitive code, trust boundaries and exploitable implementation flaws.',
            base: 2000,
            increment: 2000,
            groupSize: 1,
            defaultQuantity: 1,
            max: 10,
            baseDays: 4,
            incrementDays: 4,
            quantityLabel: 'CODEBASES',
            quantityDescription: 'Count independently scoped codebases or repositories.',
            singular: 'codebase',
            plural: 'codebases',
            coverageLabel: 'REVIEW SIZE',
            tiers: [
                {
                    label: 'Focused',
                    hint: 'Up to 5k LOC',
                    multiplier: 1,
                    detail: 'A focused review of up to 5,000 relevant lines of code per codebase. Dependencies and generated code are excluded.',
                },
                {
                    label: 'Standard',
                    hint: '5–15k LOC',
                    multiplier: 1.6,
                    detail: '5,001–15,000 relevant lines of code per codebase, covering several security-sensitive components.',
                },
                {
                    label: 'Extensive',
                    hint: '15–30k LOC',
                    multiplier: 2.5,
                    detail: '15,001–30,000 relevant lines of code per codebase, spanning broader application logic and trust boundaries.',
                },
            ],
        },
        network: {
            label: 'Network and Infrastructure Testing',
            short: 'Network and infrastructure',
            description:
                'Assess exposed services, configurations, segmentation and paths into your infrastructure.',
            base: 1500,
            increment: 600,
            groupSize: 10,
            defaultQuantity: 10,
            max: 100,
            baseDays: 3,
            incrementDays: 1,
            quantityLabel: 'HOSTS IN SCOPE',
            quantityDescription: 'Count unique reachable hosts or IP addresses to test.',
            singular: 'host',
            plural: 'hosts',
            coverageLabel: 'TESTING PERSPECTIVE',
            tiers: [
                {
                    label: 'External',
                    hint: 'From outside',
                    multiplier: 1,
                    detail: 'Testing from outside your network against the internet-facing hosts you authorize.',
                },
                {
                    label: 'Internal',
                    hint: 'From inside',
                    multiplier: 1.4,
                    detail: 'Testing from an agreed internal position, including service exposure, segmentation and lateral movement paths.',
                },
                {
                    label: 'Both',
                    hint: 'Both views',
                    multiplier: 1.8,
                    detail: 'An external and internal assessment of the hosts in scope, across both testing perspectives.',
                },
            ],
        },
        identity: {
            label: 'Active Directory and Identity Testing',
            short: 'Active Directory and identity',
            description:
                'Explore credential abuse, delegation, trust relationships and paths to higher privileges.',
            base: 2500,
            increment: 1500,
            groupSize: 1,
            defaultQuantity: 1,
            max: 5,
            baseDays: 5,
            incrementDays: 2,
            quantityLabel: 'DOMAINS IN SCOPE',
            quantityDescription: 'Count Active Directory domains included in testing.',
            singular: 'domain',
            plural: 'domains',
            coverageLabel: 'ENVIRONMENT SIZE',
            tiers: [
                {
                    label: 'Small',
                    hint: '≤250 users',
                    multiplier: 1,
                    detail: 'Up to 250 user accounts across the scoped environment, with a straightforward domain and trust structure.',
                },
                {
                    label: 'Medium',
                    hint: '251–1,000',
                    multiplier: 1.5,
                    detail: '251–1,000 user accounts across the scoped environment, with broader privileges, delegation or trust relationships.',
                },
                {
                    label: 'Large',
                    hint: '1,001–2,500',
                    multiplier: 2.2,
                    detail: '1,001–2,500 user accounts across the scoped environment, requiring wider attack-path exploration.',
                },
            ],
        },
        system: {
            label: 'System Security Assessment',
            short: 'System security assessment',
            description:
                'Assess Windows and Linux systems for unsafe configurations and privilege escalation paths.',
            base: 750,
            increment: 450,
            groupSize: 1,
            defaultQuantity: 1,
            max: 20,
            baseDays: 1,
            incrementDays: 1,
            quantityLabel: 'SYSTEMS IN SCOPE',
            quantityDescription: 'Count individual servers, workstations or system images.',
            singular: 'system',
            plural: 'systems',
            coverageLabel: 'SYSTEM COMPLEXITY',
            tiers: [
                {
                    label: 'Standard',
                    hint: 'Typical',
                    multiplier: 1,
                    detail: 'A focused assessment of typical server or workstation configurations and local privilege paths.',
                },
                {
                    label: 'Advanced',
                    hint: 'Services',
                    multiplier: 1.3,
                    detail: 'Systems with several application services, configurations and broader privilege boundaries to review.',
                },
                {
                    label: 'Complex',
                    hint: 'Custom',
                    multiplier: 1.7,
                    detail: 'Specialized or heavily customized systems requiring deeper manual analysis.',
                },
            ],
        },
        external: {
            label: 'External Attack Surface Assessment',
            short: 'External attack surface',
            description:
                'Discover your internet exposure and prioritize the assets and weaknesses worth investigating.',
            base: 750,
            increment: 250,
            groupSize: 5,
            defaultQuantity: 5,
            max: 100,
            baseDays: 1,
            incrementDays: 0.5,
            quantityLabel: 'ASSETS IN SCOPE',
            quantityDescription: 'Count known domains or public IPs as starting assets.',
            singular: 'starting asset',
            plural: 'starting assets',
            coverageLabel: 'ASSESSMENT DEPTH',
            tiers: [
                {
                    label: 'Discovery',
                    hint: 'Map exposure',
                    multiplier: 1,
                    detail: 'Asset discovery and exposed-service inventory, with a prioritized overview of your external surface.',
                },
                {
                    label: 'Validation',
                    hint: 'Verify risks',
                    multiplier: 1.6,
                    detail: 'Discovery plus targeted manual validation of the most relevant exposed services and suspected weaknesses.',
                },
                {
                    label: 'Deep review',
                    hint: 'Attack paths',
                    multiplier: 2.3,
                    detail: 'Broader manual validation and attack-path exploration. Full application or network testing is scoped separately.',
                },
            ],
        },
        training: {
            label: 'Security Training',
            short: 'Security training',
            isTraining: true,
            description:
                'Practical sessions on everyday security, phishing resilience and safer software development.',
            base: 500,
            increment: 500,
            groupSize: 10,
            defaultQuantity: 10,
            max: 60,
            baseDays: 0.5,
            incrementDays: 0.5,
            quantityLabel: 'PARTICIPANTS',
            quantityDescription:
                'Count attendees; pricing rises at ten-participant milestones from 20 participants.',
            singular: 'participant',
            plural: 'participants',
            coverageLabel: 'TRAINING FOCUS',
            tiers: [
                {
                    label: 'Awareness',
                    hint: 'All staff',
                    multiplier: 1,
                    detail: 'Help staff protect accounts, handle sensitive information and make safer everyday decisions through realistic examples.',
                },
                {
                    label: 'Phishing',
                    hint: 'Spot scams',
                    multiplier: 1.5,
                    detail: 'Learn to recognize deceptive messages, verify unusual requests and report suspected phishing through guided scenarios.',
                },
                {
                    label: 'Secure coding',
                    hint: 'Developers',
                    multiplier: 3,
                    detail: 'Hands-on workshops covering input handling, authentication, authorization and common implementation flaws in code.',
                },
            ],
        },
    },
};

document.addEventListener('DOMContentLoaded', () => {
    const byId = (id) => document.getElementById(id);
    const dialog = byId('price-estimator');
    if (!dialog) return;
    const serviceSelect = byId('estimator-service');
    const quantityInput = byId('estimator-quantity');
    const continueButton = byId('estimator-continue');
    const euro = (value) =>
        new Intl.NumberFormat('en-IE', {
            style: 'currency',
            currency: LEKOV_PRICING.currency,
            maximumFractionDigits: 0,
        }).format(value);
    const roundUp = (value) => Math.ceil(value / LEKOV_PRICING.rounding) * LEKOV_PRICING.rounding;
    const roundDays = (value) => Math.ceil(value);
    const daysText = (value) => `${value}+ working ${value === 1 ? 'day' : 'days'}`;
    const drafts = Object.fromEntries(
        Object.entries(LEKOV_PRICING.services).map(([key, service]) => [
            key,
            { tier: 0, quantity: String(service.defaultQuantity) },
        ]),
    );
    let serviceKey = 'web';
    let lastTrigger = null;
    let scrollPosition = { x: 0, y: 0 };
    let originalBodyStyle = '';
    let pendingContact = null;
    let contactQuote = null;
    let automaticSubject = null;
    let automaticMessagePrefix = null;
    const additionalDetailsMarker = '\n- Additional details: ';
    const enquiryClosing = '\n\nKind regards';
    let bodyLocked = false;

    function buildCopyStack(id, entries) {
        const container = byId(id);
        container.replaceChildren();
        entries.forEach(([key, text]) => {
            const paragraph = document.createElement('p');
            paragraph.dataset.copy = key;
            paragraph.textContent = text;
            paragraph.setAttribute('aria-hidden', 'true');
            container.append(paragraph);
        });
    }
    function showCopy(id, key) {
        [...byId(id).children].forEach((paragraph) => {
            const active = paragraph.dataset.copy === key;
            paragraph.classList.toggle('is-active', active);
            paragraph.setAttribute('aria-hidden', String(!active));
        });
    }

    function captureDraft() {
        const draft = drafts[serviceKey];
        draft.quantity = quantityInput.value;
        const checked = dialog.querySelector('input[name="estimator-coverage"]:checked');
        if (checked) draft.tier = Number(checked.value);
    }

    function buildCoverage() {
        const service = LEKOV_PRICING.services[serviceKey];
        const draft = drafts[serviceKey];
        const options = byId('estimator-options');
        options.replaceChildren();
        service.tiers.forEach((tier, index) => {
            const label = document.createElement('label');
            label.className = 'estimator-option';
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = 'estimator-coverage';
            input.value = String(index);
            input.checked = index === draft.tier;
            const span = document.createElement('span');
            const title = document.createElement('b');
            title.textContent = tier.label;
            const hint = document.createElement('small');
            hint.textContent = tier.hint;
            span.append(title, hint);
            label.append(input, span);
            options.append(label);
        });
    }

    function loadService(key) {
        if (!LEKOV_PRICING.services[key]) return;
        serviceKey = key;
        const service = LEKOV_PRICING.services[key];
        const draft = drafts[key];
        serviceSelect.value = key;
        quantityInput.value = draft.quantity;
        quantityInput.max = String(service.max);
        byId('estimator-coverage-label').textContent = '02 / ' + service.coverageLabel;
        byId('estimator-quantity-label').textContent = service.quantityLabel;
        showCopy('estimator-scope-detail', key);
        const training = Boolean(service.isTraining);
        byId('estimator-retest-option').classList.toggle('is-active', !training);
        byId('estimator-retest-option').setAttribute('aria-hidden', String(training));
        byId('estimator-training-materials').classList.toggle('is-active', training);
        byId('estimator-training-materials').setAttribute('aria-hidden', String(!training));
        const included = training
            ? ['Practical team sessions', 'Exercises and reusable materials', 'Security guidance']
            : ['Manual security testing', 'Technical report', 'Remediation guidance'];
        byId('estimator-included')
            .querySelectorAll('[data-included-text]')
            .forEach((text, index) => {
                text.textContent = included[index];
            });
        buildCoverage();
        updateEstimate();
    }

    function getQuote(forceCustom = false) {
        const service = LEKOV_PRICING.services[serviceKey];
        const draft = drafts[serviceKey];
        const quantity = Number(draft.quantity);
        const valid =
            draft.quantity.trim() !== '' && Number.isSafeInteger(quantity) && quantity >= 1;
        const custom = (valid && quantity > service.max) || forceCustom;
        const tier = service.tiers[draft.tier];

        const groupCount = service.isTraining
            ? Math.max(1, Math.floor(quantity / service.groupSize))
            : Math.ceil(quantity / service.groupSize);
        const assessment =
            valid && !custom
                ? roundUp((service.base + (groupCount - 1) * service.increment) * tier.multiplier)
                : null;
        const days =
            valid && !custom
                ? roundDays(
                      (service.baseDays + (groupCount - 1) * service.incrementDays) *
                          tier.multiplier,
                  )
                : null;
        return {
            key: serviceKey,
            label: service.label,
            short: service.short,
            tier: draft.tier,
            coverage: tier.label + ' · ' + tier.hint,
            quantity: valid ? quantity : null,
            quantityText: valid
                ? `${quantity} ${quantity === 1 ? service.singular : service.plural}`
                : 'To confirm',
            retest: !service.isTraining,
            isTraining: Boolean(service.isTraining),
            valid,
            custom,
            assessment,
            retestCost: 0,
            days,
            effortText: days === null ? 'Effort to confirm' : daysText(days),
            total: assessment,
        };
    }

    function updateEstimate() {
        captureDraft();
        const quote = getQuote();
        const value =
            quote.total === null ? (quote.custom ? 'Custom quote' : '—') : euro(quote.total);
        byId('estimator-price').textContent = value;
        byId('estimator-price').classList.toggle('is-custom', quote.total === null);
        byId('estimator-from').textContent = quote.custom ? 'Scope to confirm' : 'Starting from';
        byId('estimator-effort').textContent =
            quote.days === null ? (quote.custom ? 'To confirm' : '—') : String(quote.days) + '+';
        byId('estimator-effort').classList.toggle('is-custom', quote.days === null);
        const error = byId('estimator-quantity-error');
        error.hidden = quote.valid;
        error.textContent = quote.valid ? '' : 'Enter a whole number, 1 or more.';
        quantityInput.setAttribute('aria-invalid', String(!quote.valid));
        byId('estimator-decrease').disabled = !quote.valid || quote.quantity <= 1;
        byId('estimator-increase').disabled =
            !quote.valid || quote.quantity >= LEKOV_PRICING.services[serviceKey].max;
        continueButton.disabled = !quote.valid;
        byId('estimator-continue-label').textContent = quote.custom
            ? 'Discuss a custom scope'
            : 'Discuss this scope';
        byId('estimator-announcement').textContent = !quote.valid
            ? 'Enter a valid quantity to see your estimate.'
            : quote.custom
              ? 'This scope needs a custom quote.'
              : `Starting from ${value}. Indicative effort: ${quote.effortText}.${quote.retest ? ' Remediation re-test included free.' : ''}`;
    }

    function closeMobileMenu() {
        const toggle = document.querySelector('.menu-toggle');
        const menu = byId('mobile-nav');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
        if (menu) {
            menu.classList.remove('open');
            menu.setAttribute('aria-hidden', 'true');
        }
    }

    function openEstimator(trigger, key) {
        if (dialog.open) return;
        lastTrigger = trigger;
        captureDraft();
        loadService(key || serviceKey);
        closeMobileMenu();
        scrollPosition = { x: window.scrollX, y: window.scrollY };
        originalBodyStyle = document.body.style.cssText;
        Object.assign(document.body.style, {
            position: 'fixed',
            top: `-${scrollPosition.y}px`,
            left: '0',
            right: '0',
            width: '100%',
            overflow: 'hidden',
        });
        bodyLocked = true;
        dialog.showModal();
        serviceSelect.focus({ preventScroll: true });
    }

    document.querySelectorAll('[data-open-estimator]').forEach((trigger) => {
        trigger.addEventListener('click', () =>
            openEstimator(trigger, trigger.dataset.openEstimator),
        );
    });
    byId('estimator-close').addEventListener('click', () => dialog.close());
    let backdropStarted = false;
    const outsideDialog = (event) => {
        const box = dialog.getBoundingClientRect();
        return (
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom
        );
    };
    dialog.addEventListener('pointerdown', (event) => {
        backdropStarted = event.target === dialog && outsideDialog(event);
    });
    dialog.addEventListener('click', (event) => {
        if (backdropStarted && event.target === dialog && outsideDialog(event)) dialog.close();
        backdropStarted = false;
    });
    dialog.addEventListener('close', () => {
        captureDraft();
        if (bodyLocked) {
            document.body.style.cssText = originalBodyStyle;
            window.scrollTo({ left: scrollPosition.x, top: scrollPosition.y, behavior: 'instant' });
            bodyLocked = false;
        }
        if (pendingContact) {
            applyQuoteToContact(pendingContact);
            pendingContact = null;
        } else if (lastTrigger && lastTrigger.isConnected) {
            const focusTarget = lastTrigger.closest('#mobile-nav')
                ? document.querySelector('.menu-toggle')
                : lastTrigger;
            focusTarget?.focus({ preventScroll: true });
        }
    });
    serviceSelect.addEventListener('change', () => loadService(serviceSelect.value));
    byId('estimator-controls').addEventListener('submit', (event) => event.preventDefault());
    byId('estimator-options').addEventListener('change', updateEstimate);
    quantityInput.addEventListener('input', updateEstimate);
    byId('estimator-decrease').addEventListener('click', () => {
        quantityInput.value = String(Math.max(1, Number(quantityInput.value) - 1));
        updateEstimate();
    });
    byId('estimator-increase').addEventListener('click', () => {
        const max = LEKOV_PRICING.services[serviceKey].max;
        quantityInput.value = String(Math.min(max, Number(quantityInput.value) + 1));
        updateEstimate();
    });
    function discussScope(custom) {
        captureDraft();
        pendingContact = getQuote(custom);
        dialog.close();
    }
    continueButton.addEventListener('click', () => discussScope(false));
    byId('estimator-custom-request').addEventListener('click', () => discussScope(true));

    function enquiryNotes(value) {
        if (automaticMessagePrefix === null) return value;
        const boundary = value.indexOf(additionalDetailsMarker);
        let notes = value.startsWith(automaticMessagePrefix)
            ? value.slice(automaticMessagePrefix.length)
            : boundary === -1
              ? value
              : value.slice(boundary + additionalDetailsMarker.length);
        if (notes.endsWith(enquiryClosing)) notes = notes.slice(0, -enquiryClosing.length);
        return notes.trim() === '/' ? '' : notes;
    }

    function fitEnquiryMessage() {
        const message = byId('contact-form').elements.namedItem('message');
        message.style.height = 'auto';
        message.style.height = `${message.scrollHeight + 2}px`;
    }

    function enquiryMessagePrefix(quote) {
        const tier = LEKOV_PRICING.services[quote.key].tiers[quote.tier];
        return (
            [
                'Hello Lekov Security,',
                '',
                'I would like to discuss the following project:',
                '',
                `- Service: ${quote.label}`,
                `- Coverage: ${tier.label}`,
                `- Scope details: ${tier.detail}`,
                `- Quantity: ${quote.quantityText}`,
            ].join('\n') + additionalDetailsMarker
        );
    }

    function applyQuoteToContact(quote) {
        contactQuote = quote;
        const form = byId('contact-form');
        const subject = form.elements.namedItem('subject');
        const message = form.elements.namedItem('message');
        const card = byId('estimate-contact-card');
        byId('estimate-contact-price').textContent =
            quote.total === null ? 'Custom quote' : 'From ' + euro(quote.total);
        byId('estimate-contact-days').textContent = quote.effortText;
        byId('estimate-contact-description').textContent =
            `${quote.label} · ${quote.coverage} · ${quote.quantityText}${quote.retest ? ' · Free remediation re-test included' : ''}`;
        card.hidden = false;
        const notes = enquiryNotes(message.value);
        automaticMessagePrefix = enquiryMessagePrefix(quote);
        message.value = automaticMessagePrefix + (notes || '/') + enquiryClosing;
        fitEnquiryMessage();
        if (!subject.value.trim() || subject.value === automaticSubject) {
            automaticSubject = quote.label + ' - Scope Enquiry';
            subject.value = automaticSubject;
        }
        const focusField =
            ['name', 'email', 'message']
                .map((name) => form.elements.namedItem(name))
                .find((field) => !field.value.trim()) || form.elements.namedItem('message');
        form.scrollIntoView({
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                ? 'auto'
                : 'smooth',
            block: 'start',
        });
        focusField.focus({ preventScroll: true });
    }
    byId('estimate-contact-edit').addEventListener('click', (event) => {
        if (!contactQuote) return;
        drafts[contactQuote.key] = {
            tier: contactQuote.tier,
            quantity: contactQuote.quantity === null ? '' : String(contactQuote.quantity),
        };

        if (serviceKey === contactQuote.key) {
            quantityInput.value = drafts[contactQuote.key].quantity;
            const savedRadio = dialog.querySelector(
                `input[name="estimator-coverage"][value="${contactQuote.tier}"]`,
            );
            if (savedRadio) savedRadio.checked = true;
        }
        openEstimator(event.currentTarget, contactQuote.key);
    });
    byId('estimate-contact-remove').addEventListener('click', () => {
        const form = byId('contact-form');
        const subject = form.elements.namedItem('subject');
        const message = form.elements.namedItem('message');
        byId('estimate-contact-card').hidden = true;
        message.value = enquiryNotes(message.value);
        automaticMessagePrefix = null;
        fitEnquiryMessage();
        if (subject.value === automaticSubject) subject.value = '';
        automaticSubject = null;
        contactQuote = null;
        subject.focus({ preventScroll: true });
    });
    byId('contact-form').elements.namedItem('message').addEventListener('input', fitEnquiryMessage);
    buildCopyStack(
        'estimator-scope-detail',
        Object.entries({
            web: 'Pages or API endpoints, per application.',
            code: 'Lines of code, per codebase.',
            network: 'External, internal or combined testing.',
            identity: 'User accounts in the scoped environment.',
            system: 'Configuration, access and hardening.',
            external: 'Discovery, validation or in-depth testing.',
            training: 'Practical skills for your team.',
        }),
    );
    loadService(serviceKey);
});

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('contact-form');

    if (!form) {
        return;
    }

    const button = form.querySelector('button[type="submit"]');
    const label = button.querySelector('[data-submit-label]');
    const status = document.getElementById('contact-form-status');
    const originalLabel = label.textContent;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (button.disabled) {
            return;
        }

        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        label.textContent = 'Sending...';
        status.hidden = true;

        try {
            const values = new FormData(form);
            const response = await fetch(form.action, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    name: values.get('name'),
                    email: values.get('email'),
                    subject: values.get('subject'),
                    message: values.get('message'),
                }),
            });

            if (!response.ok) {
                throw new Error(`Contact request failed: HTTP ${response.status}`);
            }

            window.location.assign(new URL(form.dataset.successUrl, window.location.href));
        } catch {
            status.textContent =
                'Your message could not be sent. Please try again or contact us by email.';
            status.hidden = false;
        } finally {
            button.disabled = false;
            button.removeAttribute('aria-busy');
            label.textContent = originalLabel;
        }
    });
});
