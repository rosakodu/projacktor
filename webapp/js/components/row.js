const Row = {
    createRow(title, items, viewAllLink = null, type = 'movie') {
        const container = document.createElement('div');
        container.className = 'media-row-container';
        
        let headerHtml = `<h2>${title}</h2>`;
        if (viewAllLink) {
            headerHtml = `
                <div class="media-row-header">
                    <h2>${title}</h2>
                    <a href="${viewAllLink}" tabindex="0">Все →</a>
                </div>
            `;
        }
        
        const row = document.createElement('div');
        row.className = 'media-row';
        
        items.forEach(item => {
            row.appendChild(Card.createCard(item, type));
        });
        
        container.innerHTML = headerHtml;
        container.appendChild(row);
        
        return container;
    }
};
