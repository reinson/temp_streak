let cachedStreaksData = null;
let cachedIntervalsData = {}; // threshold -> [{from, to}]
let currentThreshold = 0;

async function loadStreaksData() {
    const { streaksDataFile, intervalsDataFile } = window.appConfig;
    const [streaksRes, intervalsRes] = await Promise.all([
        fetch(streaksDataFile + '?t=' + new Date().getTime()),
        fetch(intervalsDataFile + '?t=' + new Date().getTime())
    ]);

    cachedStreaksData = await streaksRes.json();
    const intervalsText = await intervalsRes.text();
    
    const lines = intervalsText.split('\n');
    cachedIntervalsData = {};
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const [threshold, start, end] = line.split(',');
        if (!cachedIntervalsData[threshold]) cachedIntervalsData[threshold] = [];
        cachedIntervalsData[threshold].push({
            from: new Date(start),
            to: new Date(end)
        });
    }
}

function analyzeStreaksData(threshold) {
    const precomputed = cachedStreaksData[threshold] || { top10: [], current: null };
    const intervals = cachedIntervalsData[threshold] || [];
    
    const top10 = precomputed.top10.map(s => ({
        ...s,
        from: new Date(s.start),
        to: new Date(s.end),
        durationMs: s.durationMs
    }));

    let currentOngoingStreak = null;
    if (precomputed.current) {
        currentOngoingStreak = {
            ...precomputed.current,
            from: new Date(precomputed.current.start),
            to: new Date(precomputed.current.end),
            isCurrent: true
        };
    }

    const winters = {};
    const allThreshold0 = cachedIntervalsData["0"] || [];
    allThreshold0.forEach(interval => {
        const d = new Date(interval.from);
        const month = d.getMonth();
        const year = d.getFullYear();
        const winterKey = (month <= 3) ? `${year-1}/${year}` : `${year}/${year+1}`;
        if (!winters[winterKey]) winters[winterKey] = [];
    });

    intervals.forEach(interval => {
        const { from, to } = interval;
        const month = from.getMonth();
        const year = from.getFullYear();
        const winterKey = (month <= 3) ? `${year-1}/${year}` : `${year}/${year+1}`;
        if (!winters[winterKey]) winters[winterKey] = [];
        winters[winterKey].push({ from, to });
    });

    const sortedWinters = {};
    Object.keys(winters).sort().forEach(key => {
        sortedWinters[key] = winters[key];
    });

    return { winters: sortedWinters, top10, currentStreak: currentOngoingStreak };
}

function renderStreaks(data) {
    const { winters, top10 } = data;
    const container = document.getElementById('heatmap-content');
    const listContainer = document.getElementById('streaks-list');
    const tooltip = document.getElementById('tooltip');
    
    container.innerHTML = '';
    listContainer.innerHTML = '';

    top10.forEach((s, i) => {
        const isOngoing = s.isOngoing;
        const card = document.createElement('div');
        card.className = 'streak-card';
        
        const durationDays = s.durationMs / (24 * 60 * 60 * 1000);
        let circleColor = '#bdc3c7';
        if (isOngoing) circleColor = '#2ecc71';
        else if (durationDays > 7) circleColor = '#2e86c1';
        else if (durationDays > 1) circleColor = '#5dade2';

        card.innerHTML = `
            <div class="streak-num" style="background: ${circleColor}; color: white;">${i + 1}</div>
            <div class="streak-info">
                <div class="streak-dates">
                    ${s.from.toLocaleDateString('et-EE')} - ${s.to.toLocaleDateString('et-EE')}
                    <span class="streak-duration" style="margin-left: 8px; font-weight: normal;">
                        (${formatDuration(s.durationMs)}${isOngoing ? ' KÄIMAS' : ''})
                    </span>
                </div>
            </div>
        `;
        listContainer.appendChild(card);
    });

    if (data.currentStreak && !top10.find(s => s.from.getTime() === data.currentStreak.from.getTime())) {
        const s = data.currentStreak;
        const separator = document.createElement('div');
        separator.style.margin = '15px 0 10px 0';
        separator.style.borderTop = '1px dashed #ccc';
        listContainer.appendChild(separator);

        const card = document.createElement('div');
        card.className = 'streak-card';
        card.style.border = '1px solid #2ecc71';
        card.innerHTML = `
            <div class="streak-num" style="background: #2ecc71; color: white;"></div>
            <div class="streak-info">
                <div class="streak-dates">
                    ${s.from.toLocaleDateString('et-EE')} - ${s.to.toLocaleDateString('et-EE')}
                    <span class="streak-duration" style="margin-left: 8px; font-weight: normal;">
                        (${formatDuration(s.durationMs)} KÄIMAS)
                    </span>
                </div>
            </div>
        `;
        listContainer.appendChild(card);
    }

    const sortedWinterKeys = Object.keys(winters);
    const rowHeight = 26;
    const rowGap = 3;
    const labelWidth = 100;
    const chartWidth = 1200;
    const totalWidth = labelWidth + chartWidth;
    const totalHeight = sortedWinterKeys.length * (rowHeight + rowGap) + 40;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "visualization-svg");
    svg.setAttribute("viewBox", `0 0 ${totalWidth} ${totalHeight}`);
    container.appendChild(svg);

    const templateStart = new Date(2021, 9, 1, 0, 0, 0);
    const templateEnd = new Date(2022, 3, 30, 23, 59, 59);
    const templateDuration = templateEnd - templateStart;

    sortedWinterKeys.forEach((key, rowIndex) => {
        const y = rowIndex * (rowHeight + rowGap);
        
        if ((rowIndex + 1) % 5 === 0 && rowIndex !== sortedWinterKeys.length - 1) {
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", 0);
            line.setAttribute("y1", y + rowHeight + rowGap / 2);
            line.setAttribute("x2", totalWidth);
            line.setAttribute("y2", y + rowHeight + rowGap / 2);
            line.setAttribute("stroke", "rgba(0,0,0,0.15)");
            line.setAttribute("stroke-width", "1");
            line.setAttribute("shape-rendering", "crispEdges");
            svg.appendChild(line);
        }

        const rowBg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rowBg.setAttribute("x", 0);
        rowBg.setAttribute("y", y);
        rowBg.setAttribute("width", totalWidth);
        rowBg.setAttribute("height", rowHeight);
        rowBg.setAttribute("fill", "transparent");
        rowBg.setAttribute("class", "row-hover-bg");
        svg.appendChild(rowBg);

        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", 5);
        label.setAttribute("y", y + rowHeight / 2);
        label.setAttribute("class", "year-label");
        label.textContent = key;
        svg.appendChild(label);

        winters[key].forEach(interval => {
            const { from, to } = interval;
            const normalize = (d) => {
                const m = d.getMonth();
                const day = d.getDate();
                const h = d.getHours();
                return (m >= 9) ? new Date(2021, m, day, h, 0, 0) : new Date(2022, m, day, h, 0, 0);
            };

            const normFrom = normalize(from);
            const normTo = normalize(to);
            const x1 = labelWidth + ((normFrom - templateStart) / templateDuration) * chartWidth;
            const x2 = labelWidth + ((normTo - templateStart) / templateDuration) * chartWidth;
            const width = Math.max(1, x2 - x1);
                
            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("x", x1);
            rect.setAttribute("y", y);
            rect.setAttribute("width", width);
            rect.setAttribute("height", rowHeight);
            
            let rectClass = "hour-rect ";
            const durationDays = (to - from) / (24 * 60 * 60 * 1000);
            if (durationDays > 7) rectClass += "long";
            else if (durationDays > 1) rectClass += "medium";
            else rectClass += "below-zero";

            const isTop10 = top10.find(s => from >= s.from && to <= s.to);
            const isCurrent = data.currentStreak && from >= data.currentStreak.from && to <= data.currentStreak.to;
            
            if (isCurrent) rectClass += " current-streak";
            else if (isTop10) rectClass += " streak";
                
            rect.setAttribute("class", rectClass);
            rect.onmouseover = (e) => {
                tooltip.style.display = 'block';
                const durationMs = to - from;
                const days = Math.floor(durationMs / (24 * 60 * 60 * 1000));
                const hours = Math.floor((durationMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                tooltip.textContent = `${days}p ${hours}h`;
                tooltip.style.left = (e.pageX + 10) + 'px';
                tooltip.style.top = (e.pageY + 10) + 'px';
            };
            rect.onmouseout = () => tooltip.style.display = 'none';
            svg.appendChild(rect);
        });
    });

    sortedWinterKeys.forEach((key, rowIndex) => {
        const y = rowIndex * (rowHeight + rowGap);
        const winterIntervals = winters[key];
        const top10InYear = winterIntervals.filter(interval => 
            top10.find(s => interval.from >= s.from && interval.to <= s.to)
        );

        winterIntervals.forEach((interval) => {
            const { from, to } = interval;
            const isTop10 = top10.find(s => from >= s.from && to <= s.to);
            
            if (isTop10) {
                const rank = top10.indexOf(isTop10) + 1;
                const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                const normalize = (d) => {
                    const m = d.getMonth();
                    const day = d.getDate();
                    const h = d.getHours();
                    return (m >= 9) ? new Date(2021, m, day, h, 0, 0) : new Date(2022, m, day, h, 0, 0);
                };
                const normFrom = normalize(from);
                const normTo = normalize(to);
                const x1 = labelWidth + ((normFrom - templateStart) / templateDuration) * chartWidth;
                const x2 = labelWidth + ((normTo - templateStart) / templateDuration) * chartWidth;
                const width = Math.max(1, x2 - x1);
                const durationDays = (to - from) / (24 * 60 * 60 * 1000);
                
                if (durationDays < 2) {
                    text.setAttribute("x", x1 + width / 2);
                    text.setAttribute("text-anchor", "middle");
                } else {
                    text.setAttribute("x", x1 + 4);
                    text.setAttribute("text-anchor", "start");
                }

                let yOffset = 17;
                if (currentThreshold <= -21 && top10InYear.length > 1) {
                    const streakIdx = top10InYear.indexOf(interval);
                    yOffset = (streakIdx % 2 === 0) ? 12 : 22;
                }
                text.setAttribute("y", y + yOffset);
                text.setAttribute("class", "streak-marker");
                if (durationDays < 1) {
                    text.setAttribute("style", "font-size: 11px; fill: #2c3e50; text-shadow: none; pointer-events: none;");
                } else {
                    text.setAttribute("style", "font-size: 11px; pointer-events: none;");
                }
                text.textContent = rank;
                svg.appendChild(text);
            }
        });
    });

    const dividerMonths = [
        { m: 10, y: 2021, label: 'Nov' }, { m: 11, y: 2021, label: 'Dets' }, 
        { m: 0, y: 2022, label: 'Jaan' }, { m: 1, y: 2022, label: 'Veebr' }, 
        { m: 2, y: 2022, label: 'Märts' }, { m: 3, y: 2022, label: 'Apr' }
    ];

    dividerMonths.forEach(dm => {
        const dividerDate = new Date(dm.y, dm.m, 1, 0, 0, 0);
        const x = labelWidth + ((dividerDate - templateStart) / templateDuration) * chartWidth;
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", x);
        line.setAttribute("y1", 0);
        line.setAttribute("x2", x);
        line.setAttribute("y2", sortedWinterKeys.length * (rowHeight + rowGap));
        line.setAttribute("class", "month-divider");
        svg.appendChild(line);

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", x + 5);
        text.setAttribute("y", sortedWinterKeys.length * (rowHeight + rowGap) + 15);
        text.setAttribute("style", "font-size: 14px; fill: #2c3e50; font-weight: 500;");
        text.textContent = dm.label;
        svg.appendChild(text);
    });

    const oktLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    oktLabel.setAttribute("x", labelWidth + 5);
    oktLabel.setAttribute("y", sortedWinterKeys.length * (rowHeight + rowGap) + 15);
    oktLabel.setAttribute("style", "font-size: 14px; fill: #2c3e50; font-weight: 500;");
    oktLabel.textContent = "Okt";
    svg.appendChild(oktLabel);
}

function updateStreaksVisualization() {
    const thresholdSlider = document.getElementById('temp-threshold');
    const thresholdDisplay = document.getElementById('temp-display');
    currentThreshold = parseInt(thresholdSlider.value);
    thresholdDisplay.textContent = `${currentThreshold}°C`;
    const analyzedData = analyzeStreaksData(currentThreshold);
    renderStreaks(analyzedData);
}

async function initStreaks() {
    updateNavLinks('streaks');
    updateDataSource();
    const thresholdSlider = document.getElementById('temp-threshold');
    thresholdSlider.oninput = updateStreaksVisualization;
    window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            thresholdSlider.focus();
        }
    });

    try {
        await loadStreaksData();
        thresholdSlider.focus();
        updateStreaksVisualization();
    } catch (err) {
        console.error(err);
        document.getElementById('heatmap-content').innerHTML = '<div class="loading">Viga andmete laadimisel.</div>';
    }
}
