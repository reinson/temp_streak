function updateNavLinks(activeView) {
    const { isToravere } = window.appConfig;
    const navLinks = document.getElementById('nav-links');
    if (!navLinks) return;

    const currentPath = window.location.pathname;
    const isStreaks = activeView === 'streaks';
    const isGraph = activeView === 'graph';
    const isHeatmap = activeView === 'heatmap';

    navLinks.innerHTML = `
        <div style="margin-bottom: 10px;">
            <strong>Andmestik:</strong>
            <a href="${isGraph ? 'index.html' : isHeatmap ? 'heatmap.html' : 'streaks.html'}" style="${!isToravere ? 'font-weight: bold; text-decoration: underline;' : ''}">Tartu</a> | 
            <a href="${isGraph ? 'toravere.html' : isHeatmap ? 'toravere-heatmap.html' : 'toravere-streaks.html'}" style="${isToravere ? 'font-weight: bold; text-decoration: underline;' : ''}">Tõravere</a>
        </div>
        <div>
            <strong>Vaade:</strong>
            <a href="${isToravere ? 'toravere.html' : 'index.html'}" style="${isGraph ? 'font-weight: bold; text-decoration: underline;' : ''}">Graafik</a> | 
            <a href="${isToravere ? 'toravere-heatmap.html' : 'heatmap.html'}" style="${isHeatmap ? 'font-weight: bold; text-decoration: underline;' : ''}">Soojuskaart</a> | 
            <a href="${isToravere ? 'toravere-streaks.html' : 'streaks.html'}" style="${isStreaks ? 'font-weight: bold; text-decoration: underline;' : ''}">Perioodid</a>
        </div>
    `;
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
