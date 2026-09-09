const DownloadsPage = {
    interval: null,
    
    render(container) {
        Navbar.setActive('downloads');
        container.innerHTML = `
            <div class="downloads-page">
                <h2>Загрузки</h2>
                <div id="diskInfo" class="disk-info">Загрузка информации о диске...</div>
                
                <h3>Активные</h3>
                <div id="activeDownloads" class="download-list"></div>
                
                <h3>Завершенные</h3>
                <div id="completedDownloads" class="download-list"></div>
            </div>
        `;
        
        this.fetchData();
        this.interval = setInterval(() => this.fetchData(), 3000);
    },
    
    destroy() {
        if (this.interval) clearInterval(this.interval);
    },
    
    async fetchData() {
        try {
            const [downloads, disk] = await Promise.all([
                API.downloads.list(),
                API.system.disk()
            ]);
            
            this.renderDisk(disk);
            this.renderDownloads(downloads);
            
        } catch (error) {
            console.error('Ошибка обновления загрузок:', error);
        }
    },
    
    renderDisk(disk) {
        const diskEl = document.getElementById('diskInfo');
        if (!diskEl) return;
        
        const percent = (disk.used / disk.total) * 100;
        
        diskEl.innerHTML = `
            <div class="disk-info-header">
                <span>Свободно: ${Format.formatBytes(disk.free)}</span>
                <span>${percent.toFixed(1)}%</span>
            </div>
            <div class="progress-container">
                <div class="progress-bar-fill" style="width: ${percent}%"></div>
            </div>
        `;
    },
    
    renderDownloads(downloads) {
        const activeContainer = document.getElementById('activeDownloads');
        const completedContainer = document.getElementById('completedDownloads');
        if (!activeContainer || !completedContainer) return;
        
        const active = downloads.filter(d => d.status !== 'completed');
        const completed = downloads.filter(d => d.status === 'completed');
        
        this.renderList(activeContainer, active, true);
        this.renderList(completedContainer, completed, false);
    },
    
    renderList(container, items, isActive) {
        if (items.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary)">Пусто</p>';
            return;
        }
        
        let html = '';
        items.forEach(item => {
            const progress = (item.progress * 100).toFixed(1);
            
            let statusText = item.status;
            let statusClass = 'status-downloading';
            if (item.status === 'paused') { statusText = 'Пауза'; statusClass = 'status-paused'; }
            if (item.status === 'seeding') { statusText = 'Раздача'; statusClass = 'status-seeding'; }
            if (item.status === 'error') { statusText = 'Ошибка'; statusClass = 'status-error'; }
            
            const poster = item.poster_path || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="90" style="background:%23141d27"></svg>';
            
            html += `
                <div class="download-item" tabindex="0">
                    <img src="${poster}" class="download-poster" alt="${item.title}">
                    <div class="download-info">
                        <div class="download-header">
                            <div class="download-title">${item.title} ${item.year ? `(${item.year})` : ''}</div>
                            <div class="status-badge ${statusClass}">${statusText}</div>
                        </div>
                        
                        ${isActive ? `
                            <div class="download-progress-area">
                                <div class="progress-container">
                                    <div class="progress-bar-fill" style="width: ${progress}%"></div>
                                </div>
                                <div class="progress-text">
                                    <span>${progress}%</span>
                                    <span>${Format.formatSpeed(item.download_speed)}</span>
                                    <span>${Format.formatETA(item.eta)}</span>
                                </div>
                            </div>
                        ` : `
                            <div class="download-meta">
                                <span>Размер: ${Format.formatBytes(item.size)}</span>
                            </div>
                        `}
                    </div>
                    <div class="download-actions">
                        ${isActive ? `
                            <button class="btn" onclick="DownloadsPage.action('${item.id}', '${item.status === 'paused' ? 'resume' : 'pause'}')">
                                ${item.status === 'paused' ? 'Продолжить' : 'Пауза'}
                            </button>
                            <button class="btn btn-danger" onclick="DownloadsPage.remove('${item.id}')">Отмена</button>
                        ` : `
                            <button class="btn btn-primary" onclick="window.location.hash='#/player?file=${encodeURIComponent(item.path)}&title=${encodeURIComponent(item.title)}'">Смотреть</button>
                            <button class="btn btn-danger" onclick="DownloadsPage.remove('${item.id}')">Удалить</button>
                        `}
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
        if (GamepadNav) GamepadNav.updateFocusables();
    },
    
    async action(id, type) {
        try {
            await API.downloads.action(id, type);
            this.fetchData();
        } catch (e) {
            Toast.show('Ошибка', 'error');
        }
    },
    
    async remove(id) {
        if (await Modal.confirm('Удаление', 'Удалить эту загрузку и файлы?')) {
            try {
                await API.downloads.remove(id);
                this.fetchData();
                Toast.show('Удалено', 'info');
            } catch (e) {
                Toast.show('Ошибка удаления', 'error');
            }
        }
    }
};
