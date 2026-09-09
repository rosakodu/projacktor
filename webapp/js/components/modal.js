const Modal = {
    container: null,
    
    init() {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'modal-overlay hidden';
            this.container.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header" id="modalTitle"></div>
                    <div class="modal-body" id="modalBody"></div>
                    <div class="modal-buttons" id="modalButtons"></div>
                </div>
            `;
            document.body.appendChild(this.container);
            
            // Close on background click
            this.container.addEventListener('click', (e) => {
                if (e.target === this.container) this.close();
            });
            
            // Close on escape
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && !this.container.classList.contains('hidden')) {
                    this.close();
                }
            });
        }
    },
    
    show(options) {
        this.init();
        const { title, body, buttons } = options;
        
        document.getElementById('modalTitle').textContent = title;
        const bodyEl = document.getElementById('modalBody');
        
        if (typeof body === 'string') {
            bodyEl.innerHTML = body;
        } else {
            bodyEl.innerHTML = '';
            bodyEl.appendChild(body);
        }
        
        const buttonsEl = document.getElementById('modalButtons');
        buttonsEl.innerHTML = '';
        
        if (buttons && buttons.length) {
            buttons.forEach(btn => {
                const b = document.createElement('button');
                b.className = `btn ${btn.class || ''}`;
                b.textContent = btn.text;
                b.tabIndex = 0;
                b.onclick = () => {
                    if (btn.onClick) btn.onClick();
                    this.close();
                };
                buttonsEl.appendChild(b);
            });
        } else {
            const b = document.createElement('button');
            b.className = 'btn btn-primary';
            b.textContent = 'ОК';
            b.tabIndex = 0;
            b.onclick = () => this.close();
            buttonsEl.appendChild(b);
        }
        
        this.container.classList.remove('hidden');
        
        // Focus first button
        setTimeout(() => {
            const firstBtn = buttonsEl.querySelector('button');
            if (firstBtn) firstBtn.focus();
            if (GamepadNav) GamepadNav.updateFocusables();
        }, 100);
    },
    
    confirm(title, message) {
        return new Promise(resolve => {
            this.show({
                title,
                body: `<p>${message}</p>`,
                buttons: [
                    { text: 'Отмена', class: '', onClick: () => resolve(false) },
                    { text: 'ОК', class: 'btn-primary', onClick: () => resolve(true) }
                ]
            });
        });
    },
    
    close() {
        if (this.container) {
            this.container.classList.add('hidden');
            if (GamepadNav) setTimeout(() => GamepadNav.updateFocusables(), 100);
        }
    }
};
