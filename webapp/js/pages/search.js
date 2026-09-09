const SearchPage = {
    async render(container, query) {
        Navbar.setActive('');
        document.getElementById('searchInput').value = query || '';
        
        container.innerHTML = `
            <div style="padding: 20px;">
                <h2>Поиск: ${query}</h2>
                <div id="searchResults" class="media-grid"></div>
            </div>
        `;
        
        if (!query) return;
        
        Spinner.show();
        try {
            // For simplicity, searching both and combining
            const [moviesRes, tvRes] = await Promise.all([
                API.tmdb.search('movie', query),
                API.tmdb.search('tv', query)
            ]);
            
            let combined = [];
            moviesRes.results.forEach(m => { m.media_type = 'movie'; combined.push(m); });
            tvRes.results.forEach(t => { t.media_type = 'tv'; combined.push(t); });
            
            // Sort by popularity
            combined.sort((a, b) => b.popularity - a.popularity);
            
            const resultsContainer = document.getElementById('searchResults');
            
            if (combined.length === 0) {
                resultsContainer.innerHTML = '<p>Ничего не найдено</p>';
                resultsContainer.classList.remove('media-grid');
            } else {
                combined.forEach(item => {
                    resultsContainer.appendChild(Card.createCard(item, item.media_type));
                });
            }
            
            if (GamepadNav) setTimeout(() => GamepadNav.updateFocusables(), 100);
            
        } catch (error) {
            Toast.show('Ошибка поиска', 'error');
            console.error(error);
        } finally {
            Spinner.hide();
        }
    }
};
