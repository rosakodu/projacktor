const HomePage = {
    async render(container) {
        Navbar.setActive('home');
        container.innerHTML = '';
        Spinner.show();
        
        try {
            const [trendingMovies, popular, trendingTv, topRated] = await Promise.all([
                API.tmdb.trending('movie', 'week'),
                API.tmdb.popular(),
                API.tmdb.trending('tv', 'week'),
                API.tmdb.topRated()
            ]);
            
            const frag = document.createDocumentFragment();
            
            frag.appendChild(Row.createRow('В тренде: Фильмы', trendingMovies.results.slice(0, 20), null, 'movie'));
            frag.appendChild(Row.createRow('В тренде: Сериалы', trendingTv.results.slice(0, 20), null, 'tv'));
            frag.appendChild(Row.createRow('Популярные фильмы', popular.results.slice(0, 20), null, 'movie'));
            frag.appendChild(Row.createRow('Высокий рейтинг', topRated.results.slice(0, 20), null, 'movie'));
            
            container.appendChild(frag);
            
            // Initial focus update for gamepad
            setTimeout(() => {
                if (GamepadNav) GamepadNav.updateFocusables();
            }, 100);
            
        } catch (error) {
            Toast.show('Ошибка загрузки данных', 'error');
            console.error(error);
        } finally {
            Spinner.hide();
        }
    }
};
