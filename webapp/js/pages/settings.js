const SettingsPage = {
    async render(container) {
        Navbar.setActive('settings');
        container.innerHTML = `
            <div style="padding: 20px; max-width: 600px;">
                <h2>Настройки</h2>
                <div style="background: var(--bg-card); padding: 20px; border-radius: var(--radius); border: 1px solid var(--border);">
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 5px;">Ссылка Jackett</label>
                        <input type="text" id="settingJacredUrl" class="btn" style="width: 100%; text-align: left; background: var(--bg-primary); cursor: text;">
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 5px;">TMDB API Key</label>
                        <input type="text" id="settingTmdbKey" class="btn" style="width: 100%; text-align: left; background: var(--bg-primary); cursor: text;">
                    </div>
                    
                    <button id="btnSaveSettings" class="btn btn-primary">Сохранить</button>
                    <button id="btnCheckJacred" class="btn">Проверить JacRed</button>
                </div>
            </div>
        `;
        
        Spinner.show();
        try {
            const settings = await API.settings.get();
            document.getElementById('settingJacredUrl').value = settings.jacred_url || '';
            document.getElementById('settingTmdbKey').value = settings.tmdb_api_key || '';
            
            document.getElementById('btnSaveSettings').onclick = async () => {
                let url = (document.getElementById('settingJacredUrl').value || '').trim();
                if (url) {
                    if (!url.startsWith('http://') && !url.startsWith('https://')) {
                        url = 'https://' + url;
                    }
                    url = url.replace(/\/+$/, '');
                    document.getElementById('settingJacredUrl').value = url;
                }
                const data = {
                    jacred_url: url,
                    tmdb_api_key: document.getElementById('settingTmdbKey').value
                };
                try {
                    await API.settings.save(data);
                    Toast.show('Настройки сохранены', 'success');
                } catch (e) {
                    Toast.show('Ошибка сохранения', 'error');
                }
            };
            
            document.getElementById('btnCheckJacred').onclick = async () => {
                try {
                    const status = await API.jacred.status();
                    if (status.status === 'ok') {
                        Toast.show('JacRed доступен', 'success');
                    } else {
                        Toast.show('JacRed недоступен', 'error');
                    }
                } catch (e) {
                    Toast.show('Ошибка соединения с JacRed', 'error');
                }
            };
            
            if (GamepadNav) setTimeout(() => GamepadNav.updateFocusables(), 100);
            
        } catch (error) {
            Toast.show('Ошибка загрузки настроек', 'error');
        } finally {
            Spinner.hide();
        }
    }
};
