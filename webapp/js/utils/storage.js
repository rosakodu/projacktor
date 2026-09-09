const Storage = {
    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (e) {
            console.error('Error reading from localStorage', e);
            return defaultValue;
        }
    },

    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.error('Error writing to localStorage', e);
        }
    },

    remove(key) {
        localStorage.removeItem(key);
    },

    getSearchHistory() {
        return this.get('search_history', []);
    },

    addSearchHistory(query) {
        if (!query.trim()) return;
        let history = this.getSearchHistory();
        history = history.filter(q => q.toLowerCase() !== query.toLowerCase());
        history.unshift(query);
        if (history.length > 10) history.pop();
        this.set('search_history', history);
    },

    getWatchProgress(mediaId) {
        return this.get(`progress_${mediaId}`, 0);
    },

    setWatchProgress(mediaId, seconds) {
        this.set(`progress_${mediaId}`, seconds);
    }
};
