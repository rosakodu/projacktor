const Navbar = {
    init() {
        const searchInput = document.getElementById('searchInput');
        
        // Debounce search
        let timeout = null;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                this.doSearch(e.target.value);
            }, 800);
        });
        
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                clearTimeout(timeout);
                this.doSearch(e.target.value);
            }
        });
        
        this.updateBadge();
        setInterval(() => this.updateBadge(), 5000);
    },
    
    doSearch(query) {
        query = query.trim();
        if (query) {
            window.location.hash = `#/search?q=${encodeURIComponent(query)}`;
            document.activeElement.blur(); // dismiss keyboard on deck
        }
    },
    
    setActive(page) {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.page === page);
        });
    },
    
    async updateBadge() {
        try {
            const stats = await API.downloads.stats();
            const badge = document.getElementById('downloadBadge');
            if (stats.active_count > 0) {
                badge.textContent = stats.active_count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        } catch (e) {
            // ignore
        }
    }
};
