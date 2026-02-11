function updateNavLinks(activeView) {
    const { isToravere } = window.appConfig;
    const navLinks = document.getElementById('nav-links');
    if (!navLinks) return;

    const isStreaks = activeView === 'streaks';
    const isGraph = activeView === 'graph';
    const isHeatmap = activeView === 'heatmap';

    const loc = '?loc=toravere';

    navLinks.innerHTML = `
        <div style="margin-bottom: 10px;">
            <strong>Andmestik:</strong>
            <a href="${isStreaks ? 'index.html' : isGraph ? 'graph.html' : 'heatmap.html'}" style="${!isToravere ? 'font-weight: bold; text-decoration: underline;' : ''}">Tartu</a> | 
            <a href="${(isStreaks ? 'index.html' : isGraph ? 'graph.html' : 'heatmap.html') + loc}" style="${isToravere ? 'font-weight: bold; text-decoration: underline;' : ''}">Tõravere</a>
        </div>
    `;
}

function updateDataSource() {
    const { isToravere } = window.appConfig;
    const el = document.getElementById('data-source');
    if (!el) return;

    if (isToravere) {
        el.innerHTML = 'Andmed pärinevad Keskkonnaagentuuri kodulehelt (<a href="https://ilmateenistus.ee" target="_blank" style="color: inherit;">ilmateenistus.ee</a>). Andmestik 2004-2024 aasta kohta.';
    } else {
        el.innerHTML = 'Andmed pärinevad Tartu Ülikooli keskkonnafüüsika instituudi ilmajaamast (<a href="http://meteo.physic.ut.ee" target="_blank" style="color: inherit;">meteo.physic.ut.ee</a>). Andmed uuenevad kord päevas.';
    }
}

function formatDuration(ms) {
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
    
    let res = '';
    if (days > 0) res += days + 'p ';
    if (hours > 0) res += hours + 'h ';
    if (minutes > 0) res += minutes + 'm';
    return res.trim() || '0m';
}
