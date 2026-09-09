const Format = {
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    formatDuration(minutes) {
        if (!minutes) return '';
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return h > 0 ? `${h}ч ${m}м` : `${m}м`;
    },

    formatDate(dateStr) {
        if (!dateStr) return '';
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        return new Date(dateStr).toLocaleDateString('ru-RU', options);
    },

    formatTimeAgo(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);
        
        let interval = seconds / 31536000;
        if (interval > 1) return Math.floor(interval) + ' лет назад';
        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + ' месяцев назад';
        interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + ' дней назад';
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + ' часов назад';
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + ' минут назад';
        return 'только что';
    },

    formatSpeed(bytesPerSec) {
        return this.formatBytes(bytesPerSec) + '/s';
    },

    formatETA(seconds) {
        if (!seconds || seconds === Infinity) return '∞';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return `${h} ч ${m} мин`;
        return `${m} мин`;
    },

    formatRating(vote) {
        return vote ? vote.toFixed(1) : 'NR';
    },

    formatYear(dateStr) {
        if (!dateStr) return '';
        return dateStr.substring(0, 4);
    },

    formatSeederColor(count) {
        if (count >= 50) return 'seeders-high';
        if (count >= 10) return 'seeders-mid';
        return 'seeders-low';
    },

    truncateText(text, maxLen) {
        if (!text) return '';
        if (text.length <= maxLen) return text;
        return text.substring(0, maxLen) + '...';
    },
    
    formatTimeSec(seconds) {
        if (!seconds) return '0:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const mStr = m < 10 && h > 0 ? `0${m}` : m;
        const sStr = s < 10 ? `0${s}` : s;
        if (h > 0) return `${h}:${mStr}:${sStr}`;
        return `${m}:${sStr}`;
    }
};
