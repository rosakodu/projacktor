const DetailPage = {
    async render(container, type, id) {
        Navbar.setActive('');
        container.innerHTML = '';
        Spinner.show();
        
        try {
            const data = type === 'movie' ? await API.tmdb.movieDetails(id) : await API.tmdb.tvDetails(id);
            
            const title = data.title || data.name;
            const originalTitle = data.original_title || data.original_name;
            const year = Format.formatYear(data.release_date || data.first_air_date);
            const runtime = type === 'movie' ? Format.formatDuration(data.runtime) : 
                (data.episode_run_time && data.episode_run_time[0] ? Format.formatDuration(data.episode_run_time[0]) : '');
            const genres = (data.genres || []).map(g => g.name).join(', ');
            
            const backdropUrl = API.tmdb.backdropUrl(data.backdrop_path);
            const posterUrl = API.tmdb.posterUrl(data.poster_path, 'w500');
            const vote = Format.formatRating(data.vote_average);
            
            // Steam Big Picture layout
            container.innerHTML = `
                <div class="detail-backdrop" style="background-image: url('${backdropUrl || ''}')"></div>
                <div class="detail-content">
                    <img src="${posterUrl}" alt="${title}" class="detail-poster">
                    <div class="detail-info">
                        <h1>${title} ${year ? `(${year})` : ''}</h1>
                        ${originalTitle && originalTitle !== title ? `<div class="original-title">${originalTitle}</div>` : ''}
                        
                        <div class="meta-line">
                            ${year ? `<span class="meta-pill">${year}</span>` : ''}
                            ${runtime ? `<span class="meta-pill">${runtime}</span>` : ''}
                            ${vote && vote !== '0.0' ? `<span class="meta-pill rating">${vote} TMDB</span>` : ''}
                            ${genres ? `<span class="meta-pill">${genres}</span>` : ''}
                        </div>
                        
                        <div class="detail-actions">
                            <button id="btnSearchTorrents" class="btn btn-primary" tabindex="0">Найти раздачи</button>
                            <button id="btnPlayLocal" class="btn btn-success hidden" tabindex="0">Смотреть</button>
                        </div>
                        
                        <div class="overview">${data.overview || 'Описание отсутствует.'}</div>
                        
                        <div id="torrentsContainer" class="torrent-section hidden">
                            <h3>Доступные раздачи</h3>
                            <div id="torrentsList" class="torrent-list"></div>
                        </div>
                    </div>
                </div>
            `;
            
            // Check library for existing downloaded media
            this.checkLibrary(id, type).then(localItem => {
                if (localItem && localItem.status === 'downloaded') {
                    const btnPlay = document.getElementById('btnPlayLocal');
                    if (btnPlay) {
                        btnPlay.classList.remove('hidden');
                        btnPlay.onclick = () => {
                            window.location.hash = `#/player?file=${encodeURIComponent(localItem.path)}&title=${encodeURIComponent(title)}`;
                        };
                    }
                }
            });
            
            document.getElementById('btnSearchTorrents').onclick = () => {
                this.searchTorrents(title, originalTitle, year, type, id, posterUrl);
            };
            
            if (GamepadNav) setTimeout(() => GamepadNav.updateFocusables(), 100);
            
        } catch (error) {
            Toast.show('Ошибка загрузки данных', 'error');
            console.error(error);
        } finally {
            Spinner.hide();
        }
    },
    
    async checkLibrary(tmdbId, mediaType) {
        try {
            const library = await API.library.list();
            return library.find(i => i.tmdb_id === tmdbId && i.media_type === mediaType);
        } catch (e) {
            return null;
        }
    },
    
    async searchTorrents(title, originalTitle, year, type, id, posterUrl) {
        const container = document.getElementById('torrentsContainer');
        const list = document.getElementById('torrentsList');
        
        container.classList.remove('hidden');
        list.innerHTML = '';
        list.appendChild(Spinner.createInline());
        
        // Scroll smoothly to torrents section
        setTimeout(() => {
            container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
        
        try {
            const cat = type === 'movie' ? 2000 : 5000;
            let results = await API.jacred.search(`${title} ${year}`, cat);
            let items = Array.isArray(results) ? results : (results?.Results || []);
            
            // Fallback: search without year if not found
            if (items.length === 0) {
                results = await API.jacred.search(title, cat);
                items = Array.isArray(results) ? results : (results?.Results || []);
            }
            
            // Fallback: search by original title if still not found
            if (items.length === 0 && originalTitle && originalTitle !== title) {
                results = await API.jacred.search(`${originalTitle} ${year}`, cat);
                items = Array.isArray(results) ? results : (results?.Results || []);
            }
            
            list.innerHTML = '';
            
            if (items.length === 0) {
                list.innerHTML = '<p style="color:var(--text-secondary); padding: 12px 0;">Раздачи не найдены по запросу.</p>';
                return;
            }
            
            // Sort by seeders descending
            items.sort((a, b) => (b.seeders || 0) - (a.seeders || 0));
            
            items.slice(0, 20).forEach(torrent => {
                const item = document.createElement('div');
                item.className = 'torrent-item';
                item.tabIndex = 0;
                
                const seeders = torrent.seeders || 0;
                const seederClass = Format.formatSeederColor(seeders);
                
                // Parse resolution
                let qualityClass = '';
                const rawTitle = torrent.title || '';
                if (rawTitle.includes('2160p') || rawTitle.includes('4K') || rawTitle.includes('UHD')) qualityClass = 'q-2160p';
                else if (rawTitle.includes('1080p') || rawTitle.includes('FHD')) qualityClass = 'q-1080p';
                
                item.innerHTML = `
                    <div class="torrent-item-title">
                        <div>${rawTitle}</div>
                        <div class="torrent-item-tags">
                            ${qualityClass ? `<span class="badge-quality ${qualityClass}">${qualityClass.replace('q-','')}</span>` : ''}
                            <span class="badge-tracker">${torrent.tracker || 'TRACKER'}</span>
                        </div>
                    </div>
                    <div class="torrent-item-meta">
                        <span class="torrent-size">${Format.formatBytes(torrent.size || 0)}</span>
                        <span class="torrent-seeders ${seederClass}">${seeders} сид.</span>
                        <button class="btn btn-primary btn-download" tabindex="-1">Скачать</button>
                    </div>
                `;
                
                const triggerDownload = (e) => {
                    if (e) e.stopPropagation();
                    this.startDownload(torrent, { title, year, type, id, posterUrl });
                };
                
                item.addEventListener('click', (e) => {
                    triggerDownload(e);
                });
                
                item.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') triggerDownload(e);
                });
                
                list.appendChild(item);
            });
            
            if (GamepadNav) GamepadNav.updateFocusables();
            
        } catch (error) {
            list.innerHTML = '<p style="color:var(--steam-red); padding: 12px 0;">Ошибка соединения с парсером.</p>';
            console.error('JacRed search error:', error);
        }
    },
    
    async startDownload(torrent, mediaInfo) {
        if (!torrent.magnet) {
            Toast.show('Magnet-ссылка отсутствует', 'error');
            return;
        }
        try {
            const rawTitle = torrent.title || '';
            const quality = rawTitle.includes('2160p') ? '2160p' : (rawTitle.includes('1080p') ? '1080p' : 'HD');
            
            await API.downloads.add({
                magnet: torrent.magnet,
                tmdb_id: parseInt(mediaInfo.id),
                title: mediaInfo.title,
                year: parseInt(mediaInfo.year) || 0,
                media_type: mediaInfo.type,
                poster_path: mediaInfo.posterUrl,
                quality: quality
            });
            Toast.show(`Загрузка добавлена (${quality})`, 'success');
        } catch (error) {
            Toast.show('Ошибка добавления: ' + error.message, 'error');
        }
    }
};
