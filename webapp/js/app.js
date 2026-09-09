const App = {
    container: null,
    
    init() {
        this.container = document.getElementById('app');
        
        // Initialize common components
        Navbar.init();
        GamepadNav.init();
        
        // Handle routing
        window.addEventListener('hashchange', () => this.handleRoute());
        this.handleRoute(); // Initial route
    },
    
    handleRoute() {
        const hash = window.location.hash || '#/';
        
        // Clean up previous page resources if needed
        if (DownloadsPage.interval) DownloadsPage.destroy();
        
        if (hash === '#/') {
            HomePage.render(this.container);
        }
        else if (hash.startsWith('#/search')) {
            const urlParams = new URLSearchParams(hash.split('?')[1]);
            SearchPage.render(this.container, urlParams.get('q'));
        }
        else if (hash.startsWith('#/movie/')) {
            const id = hash.split('/')[2];
            DetailPage.render(this.container, 'movie', id);
        }
        else if (hash.startsWith('#/tv/')) {
            const id = hash.split('/')[2];
            DetailPage.render(this.container, 'tv', id);
        }
        else if (hash === '#/downloads') {
            DownloadsPage.render(this.container);
        }
        else if (hash === '#/library') {
            LibraryPage.render(this.container);
        }
        else if (hash.startsWith('#/player')) {
            const urlParams = new URLSearchParams(hash.split('?')[1]);
            Player.open(urlParams.get('file'), urlParams.get('title'));
        }
        else {
            // Fallback
            HomePage.render(this.container);
        }
        
        // Smooth scroll to top
        window.scrollTo(0, 0);
    }
};

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
