const LibraryPage = {
    async render(container) {
        Navbar.setActive('library');
        container.innerHTML = `
            <div style="padding: 10px 24px;">
                <h2 class="section-title">Библиотека</h2>
                <div id="libraryGrid" class="media-grid" style="padding: 10px 0;"></div>
            </div>
        `;
        
        Spinner.show();
        try {
            const items = await API.library.list();
            const grid = document.getElementById('libraryGrid');
            
            if (items.length === 0) {
                grid.innerHTML = '<p>Библиотека пуста. Скачайте что-нибудь!</p>';
                grid.classList.remove('media-grid');
                return;
            }
            
            items.forEach(item => {
                const card = Card.createCard(item, item.media_type);
                // Override click to go to detail page where they can play
                card.onclick = () => window.location.hash = `#/${item.media_type}/${item.tmdb_id}`;
                grid.appendChild(card);
            });
            
            if (GamepadNav) setTimeout(() => GamepadNav.updateFocusables(), 100);
            
        } catch (error) {
            Toast.show('Ошибка загрузки библиотеки', 'error');
        } finally {
            Spinner.hide();
        }
    }
};
