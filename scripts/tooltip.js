/**
 * Moonweft Custom Retro Tooltip System
 * Replaces default browser tooltips with a retro-styled custom tooltip matching the site aesthetic.
 */
(function () {
    // 1. Create singleton tooltip DOM element
    const tooltipEl = document.createElement('div');
    tooltipEl.className = 'retro-tooltip';
    tooltipEl.id = 'retro-tooltip';
    tooltipEl.setAttribute('role', 'tooltip');
    tooltipEl.setAttribute('aria-hidden', 'true');
    tooltipEl.innerHTML = '<span class="retro-tooltip-text"></span><div class="retro-tooltip-arrow"></div>';
    document.body.appendChild(tooltipEl);

    const textEl = tooltipEl.querySelector('.retro-tooltip-text');
    const arrowEl = tooltipEl.querySelector('.retro-tooltip-arrow');

    let activeTarget = null;
    let showTimeout = null;

    // Helper: sanitize and convert title attribute into data-tooltip to suppress native tooltips
    function sanitizeTitle(el) {
        if (!el || !(el instanceof Element)) return;
        if (el.hasAttribute('title')) {
            const val = el.getAttribute('title');
            if (val && val.trim()) {
                el.setAttribute('data-tooltip', val.trim());
            }
            el.removeAttribute('title');
        }
    }

    // Helper: find closest tooltip-bearing element
    function getTooltipTarget(node) {
        if (!node || !(node instanceof Element)) return null;
        return node.closest('[data-tooltip], [title]');
    }

    // Sanitize any existing titles across the document
    function sanitizeAllTitles(root = document) {
        root.querySelectorAll('[title]').forEach(sanitizeTitle);
    }

    sanitizeAllTitles();

    // Observe DOM mutations to catch any dynamically injected titles (e.g. innerHTML updates)
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node instanceof Element) {
                        sanitizeTitle(node);
                        sanitizeAllTitles(node);
                    }
                });
            } else if (mutation.type === 'attributes' && mutation.attributeName === 'title') {
                sanitizeTitle(mutation.target);
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['title']
    });

    function updatePosition(target) {
        if (!target || !document.body.contains(target)) {
            hide();
            return;
        }

        const targetRect = target.getBoundingClientRect();
        // Check if target is hidden or offscreen
        if (targetRect.width === 0 && targetRect.height === 0) {
            hide();
            return;
        }
        if (targetRect.bottom < 0 || targetRect.top > window.innerHeight ||
            targetRect.right < 0 || targetRect.left > window.innerWidth) {
            hide();
            return;
        }

        const tooltipRect = tooltipEl.getBoundingClientRect();
        const gap = 8;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Vertical position: above target by default, flip below if tight on top
        let top = targetRect.top - tooltipRect.height - gap;
        let isBottom = false;

        if (top < 10) {
            top = targetRect.bottom + gap;
            isBottom = true;
        }

        // Clamp top to viewport
        top = Math.max(10, Math.min(viewportHeight - tooltipRect.height - 10, top));

        if (isBottom) {
            tooltipEl.classList.add('tooltip-bottom');
        } else {
            tooltipEl.classList.remove('tooltip-bottom');
        }

        // Horizontal position: center aligned with target
        let left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);

        // Clamp to stay within viewport
        const minLeft = 10;
        const maxLeft = viewportWidth - tooltipRect.width - 10;
        const clampedLeft = Math.max(minLeft, Math.min(maxLeft, left));

        tooltipEl.style.top = `${Math.round(top)}px`;
        tooltipEl.style.left = `${Math.round(clampedLeft)}px`;

        // Arrow positioning: points to horizontal center of target
        const targetCenter = targetRect.left + (targetRect.width / 2);
        let arrowLeft = targetCenter - clampedLeft;
        arrowLeft = Math.max(12, Math.min(tooltipRect.width - 12, arrowLeft));
        arrowEl.style.left = `${Math.round(arrowLeft)}px`;
    }

    function show(target, text) {
        if (!target || !document.body.contains(target) || !text) {
            hide();
            return;
        }

        textEl.textContent = text;
        tooltipEl.setAttribute('aria-hidden', 'false');

        // Render invisible first to measure accurate dimensions
        tooltipEl.style.visibility = 'hidden';
        tooltipEl.style.display = 'block';
        tooltipEl.classList.remove('is-visible');

        updatePosition(target);

        tooltipEl.style.visibility = 'visible';
        tooltipEl.classList.add('is-visible');
    }

    function hide() {
        clearTimeout(showTimeout);
        activeTarget = null;
        tooltipEl.classList.remove('is-visible');
        tooltipEl.setAttribute('aria-hidden', 'true');
    }

    // Event delegation for mouse hover
    document.addEventListener('mouseover', (e) => {
        const target = getTooltipTarget(e.target);
        if (!target) {
            if (activeTarget && !activeTarget.contains(e.target)) {
                hide();
            }
            return;
        }

        sanitizeTitle(target);
        const text = target.getAttribute('data-tooltip');
        if (!text || !text.trim()) {
            hide();
            return;
        }

        if (activeTarget === target) return;
        activeTarget = target;

        clearTimeout(showTimeout);
        // Snappy transition if a tooltip is already active, short debounce otherwise
        const delay = tooltipEl.classList.contains('is-visible') ? 0 : 120;
        showTimeout = setTimeout(() => {
            if (activeTarget === target) {
                show(target, text.trim());
            }
        }, delay);
    });

    document.addEventListener('mouseout', (e) => {
        const target = getTooltipTarget(e.target);
        if (target && target === activeTarget) {
            const related = e.relatedTarget;
            if (!related || !target.contains(related)) {
                hide();
            }
        }
    });

    // Window scroll and resize adjustments
    window.addEventListener('scroll', () => {
        if (activeTarget) {
            updatePosition(activeTarget);
        }
    }, { passive: true });

    window.addEventListener('resize', () => {
        if (activeTarget) {
            updatePosition(activeTarget);
        }
    }, { passive: true });

    // Keyboard focus support for accessibility
    document.addEventListener('focusin', (e) => {
        const target = getTooltipTarget(e.target);
        if (target) {
            sanitizeTitle(target);
            const text = target.getAttribute('data-tooltip');
            if (text && text.trim()) {
                activeTarget = target;
                show(target, text.trim());
            }
        }
    });

    document.addEventListener('focusout', () => {
        hide();
    });

    // Dismiss on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hide();
        }
    });

    // Dismiss on touch interactions to prevent sticky tooltips on mobile
    document.addEventListener('touchstart', () => {
        hide();
    }, { passive: true });
})();
