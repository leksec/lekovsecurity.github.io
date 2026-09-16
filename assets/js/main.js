document.addEventListener('DOMContentLoaded', () => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const reveals = document.querySelectorAll('.reveal');
    if (!reduceMotion && 'IntersectionObserver' in window) {
        const io = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    io.unobserve(entry.target);
                }
            });
        }, { threshold: .12, rootMargin: '0px 0px -7% 0px' });
        reveals.forEach(el => io.observe(el));
    } else {
        reveals.forEach(el => el.classList.add('is-visible'));
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
        mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
    }

    const glow = document.querySelector('.cursor-glow');
    if (glow && !reduceMotion && window.matchMedia('(pointer:fine)').matches) {
        window.addEventListener('pointermove', e => {
            glow.style.left = e.clientX + 'px';
            glow.style.top = e.clientY + 'px';
        }, { passive: true });
    }

    document.querySelectorAll('.capability-card').forEach(card => {
        card.addEventListener('pointermove', e => {
            const r = card.getBoundingClientRect();
            card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
            card.style.setProperty('--my', (e.clientY - r.top) + 'px');
        }, { passive: true });
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
        linux: 'green'
    };

    const edgePairs = [
        ['web', 'linux'], ['web', 'api'], ['web', 'windows'],
        ['linux', 'vpn'], ['linux', 'db'], ['linux', 'api'],
        ['vpn', 'api'], ['vpn', 'dc'], ['api', 'dc'],
        ['api', 'db'], ['dc', 'windows'], ['db', 'windows']
    ];

    const nodeNames = ['web', 'vpn', 'api', 'dc', 'db', 'windows', 'linux'];
    let nodeCoords = {};

    const publicNodes = ['web', 'api', 'vpn'];
    const nodeMap = Object.fromEntries(nodes.map(n => [n.dataset.node, n]));
    const adjacency = Object.fromEntries(nodeNames.map(name => [name, []]));
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
                y: bounds.minY + Math.random() * (bounds.maxY - bounds.minY)
            };

            if (Math.hypot(candidate.x - 50, candidate.y - 50) < centerExclusion) continue;

            if (points.some(point => Math.hypot(candidate.x - point.x, candidate.y - point.y) < minDistance)) continue;

            points.push(candidate);
        }

        if (points.length !== nodeNames.length) {
            points.splice(0, points.length,
                { x: 18, y: 20 }, { x: 76, y: 19 }, { x: 84, y: 55 },
                { x: 70, y: 81 }, { x: 31, y: 76 }, { x: 16, y: 55 }, { x: 45, y: 18 }
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
    const DISCOVERY_CHANCE = 0.90;

    function shuffle(list) {
        const a = [...list];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function wait(ms, t) {
        return new Promise(resolve => setTimeout(() => resolve(t === token), ms));
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
        edgeMap.forEach(line => {
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
        edgesLayer.querySelectorAll('line').forEach(line => line.classList.remove('active', 'compromise'));
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
        let deg = Math.atan2(p.y - 50, p.x - 50) * 180 / Math.PI;
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
        adjacency[name].forEach(neighbor => {
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

        return new Promise(resolve => {
            const startTime = performance.now();
            let lastPaint = 0;
            const frameInterval = mobileRadar ? 34 : 0;
            const frame = now => {
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
        const children = new Map(nodeNames.map(name => [name, []]));
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
        return ordered.map(n => nodeMap[n].dataset.name).join(' → ');
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
                if (!(await waitForDiscovery(target, t, `${scanVerb} ${nodeMap[from].dataset.name}`))) return;
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

    nodes.forEach(node => node.addEventListener('click', () => {
        const key = node.dataset.node;
        if (node.dataset.state !== 'pending') {
            status.textContent = `ASSET / ${node.dataset.name} / ${outcomes[key].toUpperCase()}`;
        }
    }));

    function startRadar() {
        setSweep(sweepAngle);
        sweepLastTime = performance.now();
        requestAnimationFrame(sweepTick);
        run();
    }

    const radarContainer = stage.closest('.hero-radar') || stage;
    if ('IntersectionObserver' in window) {
        const radarObserver = new IntersectionObserver(entries => {
            if (!entries.some(entry => entry.isIntersecting)) return;
            radarObserver.disconnect();
            startRadar();
        }, { threshold: 0.08 });
        radarObserver.observe(radarContainer);
    } else {
        startRadar();
    }
});
