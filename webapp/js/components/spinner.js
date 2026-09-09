const Spinner = {
    overlay: null,
    
    init() {
        if (!this.overlay) {
            this.overlay = document.createElement('div');
            this.overlay.className = 'spinner-overlay hidden';
            this.overlay.innerHTML = '<div class="spinner"></div>';
            document.body.appendChild(this.overlay);
        }
    },
    
    show() {
        this.init();
        this.overlay.classList.remove('hidden');
    },
    
    hide() {
        if (this.overlay) {
            this.overlay.classList.add('hidden');
        }
    },
    
    createInline() {
        const div = document.createElement('div');
        div.className = 'spinner spinner-inline';
        return div;
    }
};
