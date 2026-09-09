const Player = {
    container: null,
    video: null,
    controlsTimeout: null,
    filePath: '',
    
    init() {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'player-container';
            this.container.innerHTML = `
                <video class="player-video"></video>
                <div class="player-overlay">
                    <div class="player-top">
                        <button class="player-btn" id="playerBack">←</button>
                        <div class="player-title" id="playerTitle">Название</div>
                    </div>
                    <div class="player-controls">
                        <div class="player-buttons">
                            <button class="player-btn player-btn-large" id="playerPlayPause">▶</button>
                        </div>
                        <div class="player-seekbar-container">
                            <span class="player-time" id="playerCurrentTime">0:00</span>
                            <input type="range" class="player-seekbar" id="playerSeek" value="0" step="1">
                            <span class="player-time" id="playerTotalTime">0:00</span>
                        </div>
                    </div>
                </div>
                <div class="player-loading">
                    <div class="spinner"></div>
                </div>
            `;
            document.body.appendChild(this.container);
            
            this.video = this.container.querySelector('.player-video');
            this.bindEvents();
        }
    },
    
    bindEvents() {
        const overlay = this.container.querySelector('.player-overlay');
        const playBtn = this.container.querySelector('#playerPlayPause');
        const seek = this.container.querySelector('#playerSeek');
        const backBtn = this.container.querySelector('#playerBack');
        
        const showControls = () => {
            overlay.classList.remove('idle');
            clearTimeout(this.controlsTimeout);
            if (!this.video.paused) {
                this.controlsTimeout = setTimeout(() => overlay.classList.add('idle'), 3000);
            }
        };
        
        this.container.addEventListener('mousemove', showControls);
        this.container.addEventListener('click', showControls);
        
        playBtn.onclick = () => this.togglePlay();
        backBtn.onclick = () => this.close();
        
        seek.addEventListener('input', (e) => {
            this.video.currentTime = (e.target.value / 100) * this.video.duration;
        });
        
        this.video.addEventListener('timeupdate', () => {
            if (!this.video.duration) return;
            const percent = (this.video.currentTime / this.video.duration) * 100;
            seek.value = percent;
            this.container.querySelector('#playerCurrentTime').textContent = Format.formatTimeSec(this.video.currentTime);
            // Save progress periodically
            if (Math.floor(this.video.currentTime) % 10 === 0) {
                Storage.setWatchProgress(this.filePath, this.video.currentTime);
            }
        });
        
        this.video.addEventListener('loadedmetadata', () => {
            this.container.querySelector('#playerTotalTime').textContent = Format.formatTimeSec(this.video.duration);
        });
        
        this.video.addEventListener('play', () => playBtn.textContent = '⏸');
        this.video.addEventListener('pause', () => {
            playBtn.textContent = '▶';
            showControls();
        });
        
        this.video.addEventListener('waiting', () => this.container.classList.add('loading'));
        this.video.addEventListener('playing', () => this.container.classList.remove('loading'));
        
        // Gamepad specifics for player
        document.addEventListener('keydown', (e) => {
            if (!this.container.classList.contains('active')) return;
            showControls();
            
            if (e.key === ' ') {
                this.togglePlay();
                e.preventDefault();
            } else if (e.key === 'ArrowRight') {
                this.video.currentTime += 10;
            } else if (e.key === 'ArrowLeft') {
                this.video.currentTime -= 10;
            } else if (e.key === 'Escape') {
                this.close();
            }
        });
    },
    
    async open(filePath, title) {
        this.init();
        this.filePath = filePath;
        this.container.classList.add('active');
        this.container.querySelector('#playerTitle').textContent = title;
        
        this.container.classList.add('loading');
        try {
            // Check if probe needs transcoding (simplified, backend should handle it ideally)
            const probe = await API.stream.probe(filePath);
            const needsTranscoding = probe.format === 'mkv'; // basic assumption
            
            this.video.src = API.stream.url(filePath, needsTranscoding);
            
            const savedTime = Storage.getWatchProgress(filePath);
            if (savedTime > 0) {
                this.video.currentTime = savedTime;
            }
            
            this.video.play().catch(e => console.log('Autoplay prevented'));
            
            // Re-route gamepad
            if (GamepadNav) {
                GamepadNav.active = false; // Disable normal UI nav
            }
            
        } catch (error) {
            Toast.show('Ошибка воспроизведения', 'error');
            this.close();
        }
    },
    
    togglePlay() {
        if (this.video.paused) this.video.play();
        else this.video.pause();
    },
    
    close() {
        if (this.video) {
            Storage.setWatchProgress(this.filePath, this.video.currentTime);
            this.video.pause();
            this.video.src = '';
        }
        this.container.classList.remove('active');
        if (GamepadNav) {
            GamepadNav.active = true;
            GamepadNav.updateFocusables();
        }
        window.history.back();
    }
};
