/**
 * PROJACKTOR — Steam Deck Gamepad & Spatial Navigation
 * Supports D-Pad, Left Stick, A/B/Y buttons, and Keyboard Arrow Keys
 */

const GamepadNav = {
    polling: false,
    lastActionTime: 0,
    actionCooldown: 180, // ms between repeated navigation steps
    buttonPressedState: {},

    init() {
        // Keyboard navigation (Arrow keys + Enter + Backspace/Escape)
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') {
                if (e.key === 'ArrowDown' || e.key === 'Escape') {
                    e.target.blur();
                    this.navigate('down');
                }
                return;
            }

            if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.navigate('up');
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.navigate('down');
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                this.navigate('left');
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                this.navigate('right');
            } else if (e.key === 'Enter') {
                if (document.activeElement && document.activeElement.click) {
                    document.activeElement.click();
                }
            } else if (e.key === 'Escape' || e.key === 'Backspace') {
                if (window.location.hash && window.location.hash !== '#/' && window.location.hash !== '') {
                    e.preventDefault();
                    history.back();
                }
            }
        });

        // Start gamepad polling loop immediately (without waiting for event)
        this.startPolling();

        window.addEventListener('gamepadconnected', () => {
            this.startPolling();
        });

        // When route or page content updates, ensure an element is focused
        window.addEventListener('hashchange', () => {
            setTimeout(() => this.ensureFocus(), 150);
        });

        // Initial focus after load
        setTimeout(() => this.ensureFocus(), 200);
    },

    getFocusables() {
        const selector = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]';
        return Array.from(document.querySelectorAll(selector))
            .filter(el => {
                if (el.classList.contains('hidden')) return false;
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';
            });
    },

    ensureFocus() {
        const active = document.activeElement;
        const focusables = this.getFocusables();
        if (focusables.length === 0) return;

        if (!active || active === document.body || !focusables.includes(active)) {
            // Prefer first card or first nav button
            const firstCard = document.querySelector('.media-card, .btn-primary, .nav-btn.active, .nav-btn');
            if (firstCard && focusables.includes(firstCard)) {
                firstCard.focus();
            } else {
                focusables[0].focus();
            }
        }
    },

    updateFocusables() {
        this.ensureFocus();
    },

    navigate(direction) {
        const focusables = this.getFocusables();
        if (focusables.length === 0) return;

        const current = document.activeElement && focusables.includes(document.activeElement)
            ? document.activeElement
            : focusables[0];

        const currentRect = current.getBoundingClientRect();
        const currentCenter = {
            x: currentRect.left + currentRect.width / 2,
            y: currentRect.top + currentRect.height / 2
        };

        let bestCandidate = null;
        let minScore = Infinity;

        for (const candidate of focusables) {
            if (candidate === current) continue;

            const rect = candidate.getBoundingClientRect();
            const center = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };

            let isValid = false;
            let primaryDist = 0;
            let secondaryDist = 0;

            if (direction === 'right') {
                if (center.x > currentCenter.x + 5) {
                    isValid = true;
                    primaryDist = center.x - currentCenter.x;
                    secondaryDist = Math.abs(center.y - currentCenter.y);
                }
            } else if (direction === 'left') {
                if (center.x < currentCenter.x - 5) {
                    isValid = true;
                    primaryDist = currentCenter.x - center.x;
                    secondaryDist = Math.abs(center.y - currentCenter.y);
                }
            } else if (direction === 'down') {
                if (center.y > currentCenter.y + 5) {
                    isValid = true;
                    primaryDist = center.y - currentCenter.y;
                    secondaryDist = Math.abs(center.x - currentCenter.x);
                }
            } else if (direction === 'up') {
                if (center.y < currentCenter.y - 5) {
                    isValid = true;
                    primaryDist = currentCenter.y - center.y;
                    secondaryDist = Math.abs(center.x - currentCenter.x);
                }
            }

            if (isValid) {
                // Score function: heavily penalize deviation in secondary axis
                const weight = (direction === 'left' || direction === 'right') ? 2.5 : 2.0;
                const score = primaryDist + secondaryDist * weight;
                if (score < minScore) {
                    minScore = score;
                    bestCandidate = candidate;
                }
            }
        }

        if (bestCandidate) {
            bestCandidate.focus();
            bestCandidate.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'nearest'
            });
        }
    },

    startPolling() {
        if (this.polling) return;
        this.polling = true;

        const poll = (time) => {
            const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
            let activeGamepad = null;

            for (let i = 0; i < gamepads.length; i++) {
                if (gamepads[i] && gamepads[i].connected) {
                    activeGamepad = gamepads[i];
                    break;
                }
            }

            if (activeGamepad) {
                const btns = activeGamepad.buttons;
                const axes = activeGamepad.axes || [];
                const now = time;

                // Thresholds
                const stickThreshold = 0.55;
                const stickLeft = axes[0] < -stickThreshold;
                const stickRight = axes[0] > stickThreshold;
                const stickUp = axes[1] < -stickThreshold;
                const stickDown = axes[1] > stickThreshold;

                const dpadUp = btns[12] && btns[12].pressed;
                const dpadDown = btns[13] && btns[13].pressed;
                const dpadLeft = btns[14] && btns[14].pressed;
                const dpadRight = btns[15] && btns[15].pressed;

                // Directional navigation with cooldown
                if (now - this.lastActionTime > this.actionCooldown) {
                    if (dpadUp || stickUp) {
                        this.navigate('up');
                        this.lastActionTime = now;
                    } else if (dpadDown || stickDown) {
                        this.navigate('down');
                        this.lastActionTime = now;
                    } else if (dpadLeft || stickLeft) {
                        this.navigate('left');
                        this.lastActionTime = now;
                    } else if (dpadRight || stickRight) {
                        this.navigate('right');
                        this.lastActionTime = now;
                    }
                }

                // A Button (Select / Click)
                if (btns[0] && btns[0].pressed) {
                    if (!this.buttonPressedState[0]) {
                        this.buttonPressedState[0] = true;
                        if (document.activeElement) {
                            document.activeElement.click();
                        }
                    }
                } else {
                    this.buttonPressedState[0] = false;
                }

                // B Button (Back)
                if (btns[1] && btns[1].pressed) {
                    if (!this.buttonPressedState[1]) {
                        this.buttonPressedState[1] = true;
                        if (window.location.hash && window.location.hash !== '#/' && window.location.hash !== '') {
                            history.back();
                        }
                    }
                } else {
                    this.buttonPressedState[1] = false;
                }

                // Y Button (Focus Search Input)
                if (btns[3] && btns[3].pressed) {
                    if (!this.buttonPressedState[3]) {
                        this.buttonPressedState[3] = true;
                        const search = document.getElementById('searchInput');
                        if (search) {
                            search.focus();
                        }
                    }
                } else {
                    this.buttonPressedState[3] = false;
                }

                // L1 / LB (Previous Section / Tab)
                if (btns[4] && btns[4].pressed) {
                    if (!this.buttonPressedState[4]) {
                        this.buttonPressedState[4] = true;
                        this.navigateTab(-1);
                    }
                } else {
                    this.buttonPressedState[4] = false;
                }

                // R1 / RB (Next Section / Tab)
                if (btns[5] && btns[5].pressed) {
                    if (!this.buttonPressedState[5]) {
                        this.buttonPressedState[5] = true;
                        this.navigateTab(1);
                    }
                } else {
                    this.buttonPressedState[5] = false;
                }
            }

            requestAnimationFrame(poll);
        };

        requestAnimationFrame(poll);
    },

    navigateTab(offset) {
        const tabs = Array.from(document.querySelectorAll('.nav-btn'));
        if (tabs.length === 0) return;

        const currentActiveIdx = tabs.findIndex(t => t.classList.contains('active'));
        let nextIdx = (currentActiveIdx + offset + tabs.length) % tabs.length;
        tabs[nextIdx].click();
    }
};
