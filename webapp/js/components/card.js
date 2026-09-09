const Card = {
    createCard(media, type = 'movie') {
        const el = document.createElement('div');
        el.className = 'media-card';
        el.tabIndex = 0;
        
        // Get correct title and date fields depending on movie/tv
        const title = media.title || media.name;
        const date = media.release_date || media.first_air_date;
        const year = Format.formatYear(date);
        
        const posterSrc = API.tmdb.posterUrl(media.poster_path) || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="154" height="231" style="background:%23141d27"><rect width="100%" height="100%" fill="%23141d27"/><path d="M50 85 L104 85 L77 45 Z" fill="%2326384a"/></svg>';
        
        const typeStr = media.media_type || type;
        const rating = Format.formatRating(media.vote_average);
        
        el.innerHTML = `
            <img src="${posterSrc}" alt="${title}" loading="lazy">
            ${rating && rating !== '0.0' ? `<div class="rating">${rating}</div>` : ''}
            <div class="title-overlay">
                <div class="title">${title}</div>
                <div class="year">${year}</div>
            </div>
        `;
        
        el.addEventListener('click', () => {
            window.location.hash = `#/${typeStr}/${media.id}`;
        });
        
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                window.location.hash = `#/${typeStr}/${media.id}`;
            }
        });
        
        return el;
    }
};
