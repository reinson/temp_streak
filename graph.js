let graphStreaksData = null;

// Parse CSV data in chunks to avoid stack overflow
async function parseCSV(text) {
    const years = {};
    let minTemp = Infinity;
    let maxTemp = -Infinity;
    
    let currentPos = 0;
    let lineStart = 0;
    let lineNum = 0;
    
    while (currentPos < text.length) {
        let lineEnd = text.indexOf('\n', currentPos);
        if (lineEnd === -1) lineEnd = text.length;
        
        if (lineNum > 0) {
            const line = text.substring(lineStart, lineEnd).trim();
            if (line) {
                const parts = line.split(', ');
                if (parts.length >= 2) {
                    const dateStr = parts[0];
                    const temp = parseFloat(parts[3] || parts[1]);
                    
                    if (!isNaN(temp)) {
                        const date = new Date(dateStr);
                        const month = date.getMonth();
                        if (month > 3) continue;

                        const year = date.getFullYear();
                        
                        if (!years[year]) years[year] = [];
                        years[year].push({ date, temp });
                        
                        if (temp < minTemp) minTemp = temp;
                        if (temp > maxTemp) maxTemp = temp;
                    }
                }
            }
        }
        
        lineNum++;
        currentPos = lineEnd + 1;
        lineStart = currentPos;
        
        if (lineNum % 100000 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
    
    Object.keys(years).forEach(year => {
        years[year].sort((a, b) => a.date - b.date);
    });
    
    return { years, minTemp, maxTemp };
}

function getTopStreaks() {
    if (!graphStreaksData || !graphStreaksData["0"]) return [];
    return graphStreaksData["0"].top10.map((s, i) => ({
        num: i + 1,
        from: new Date(s.start),
        to: new Date(s.end),
        duration: formatDuration(s.durationMs) + (s.isOngoing ? ' (KÄIMAS)' : '')
    }));
}

// Downsample data to reduce points
function downsample(data, maxPoints = 3000) {
    if (data.length <= maxPoints) return data;
    
    const step = Math.ceil(data.length / maxPoints);
    const sampled = [];
    
    for (let i = 0; i < data.length; i += step) {
        sampled.push(data[i]);
    }
    
    if (sampled[sampled.length - 1] !== data[data.length - 1]) {
        sampled.push(data[data.length - 1]);
    }
    
    return sampled;
}

// Create a line chart for a year
function createYearChart(year, data) {
    const width = 1600;
    const height = 120;
    const expandedHeight = 400;
    const padding = { top: 25, right: 10, bottom: 20, left: 35 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const expandedChartHeight = expandedHeight - padding.top - padding.bottom;

    const displayData = downsample(data, 3000);
    
    let sum = 0;
    let minYearTemp = Infinity;
    let maxYearTemp = -Infinity;
    for (let i = 0; i < data.length; i++) {
        const temp = data[i].temp;
        sum += temp;
        if (temp < minYearTemp) minYearTemp = temp;
        if (temp > maxYearTemp) maxYearTemp = temp;
    }
    const avgTemp = sum / data.length;

    const container = document.createElement('div');
    container.className = 'chart-container';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'chart-svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', height);

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${padding.left}, ${padding.top})`);

    const fixedMinTemp = -30;
    const fixedMaxTemp = 35;
    
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 3, 30, 23, 59, 59);
    const yearDuration = yearEnd - yearStart;
    
    const xScale = (date) => {
        const dayOfYear = (date - yearStart) / yearDuration;
        return Math.max(0, Math.min(chartWidth, dayOfYear * chartWidth));
    };
    const getYScale = (h) => (temp) => h - ((temp - fixedMinTemp) / (fixedMaxTemp - fixedMinTemp)) * h;
    let yScale = getYScale(chartHeight);

    // Draw streaks for closed state
    getTopStreaks().forEach(streak => {
        const streakYearStart = new Date(year, 0, 1);
        const streakYearEnd = new Date(year, 3, 30, 23, 59, 59);
        if (streak.to >= streakYearStart && streak.from <= streakYearEnd) {
            const streakStart = Math.max(streak.from, streakYearStart);
            const streakEnd = Math.min(streak.to, streakYearEnd);
            const x1 = xScale(streakStart);
            const x2 = xScale(streakEnd);
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', x1);
            rect.setAttribute('y', 0);
            rect.setAttribute('width', Math.max(1, x2 - x1));
            rect.setAttribute('height', chartHeight);
            rect.setAttribute('class', 'streak-rect');
            g.appendChild(rect);
            
            if (streakEnd - streakStart >= (streak.to - streak.from) / 2) {
                const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                label.setAttribute('x', x1 + (x2 - x1) / 2);
                label.setAttribute('y', 8);
                label.setAttribute('class', 'streak-label');
                label.setAttribute('dominant-baseline', 'hanging');
                label.textContent = `#${streak.num}: ${streak.duration}`;
                g.appendChild(label);
            }
        }
    });

    // Create path segments
    function createPathSegments(data, h) {
        const segments = [];
        let currentSegment = null;
        const ys = getYScale(h);
        
        for (let i = 0; i < data.length; i++) {
            const point = data[i];
            const isAboveZero = point.temp > 0;
            const x = xScale(point.date);
            const y = ys(point.temp);
            
            if (currentSegment === null) {
                currentSegment = { isAboveZero, pathData: `M ${x} ${y}` };
            } else if (currentSegment.isAboveZero !== isAboveZero) {
                const prevPoint = data[i - 1];
                const prevX = xScale(prevPoint.date);
                const prevY = ys(prevPoint.temp);
                const t = -prevPoint.temp / (point.temp - prevPoint.temp);
                const zeroX = prevX + (x - prevX) * t;
                const zeroY = ys(0);
                currentSegment.pathData += ` L ${zeroX} ${zeroY}`;
                segments.push(currentSegment);
                currentSegment = { isAboveZero, pathData: `M ${zeroX} ${zeroY} L ${x} ${y}` };
            } else {
                currentSegment.pathData += ` L ${x} ${y}`;
            }
        }
        if (currentSegment !== null) segments.push(currentSegment);
        return segments;
    }
    
    // Month ticks
    const monthNames = ['Jaan', 'Veebr', 'Märts', 'Apr'];
    function drawMonthTicks(h) {
        const monthTicksGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        monthTicksGroup.setAttribute('class', 'month-ticks-group');
        for (let month = 0; month < 4; month++) {
            const monthDate = new Date(year, month, 1);
            const x = xScale(monthDate);
            
            const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            tick.setAttribute('x1', x);
            tick.setAttribute('y1', h);
            tick.setAttribute('x2', x);
            tick.setAttribute('y2', h + 4);
            tick.setAttribute('class', 'axis');
            monthTicksGroup.appendChild(tick);
            
            const monthLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            monthLabel.setAttribute('x', x + 4);
            monthLabel.setAttribute('y', h + 4);
            monthLabel.setAttribute('class', 'month-label');
            monthLabel.setAttribute('dominant-baseline', 'middle');
            monthLabel.textContent = monthNames[month];
            monthTicksGroup.appendChild(monthLabel);
        }
        return monthTicksGroup;
    }

    // Y-axis ticks
    function drawYAxis(h) {
        const yAxisGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        yAxisGroup.setAttribute('class', 'y-axis-group');
        const ys = getYScale(h);
        for (let t = -30; t <= 35; t += 10) {
            const y = ys(t);
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', -5);
            label.setAttribute('y', y);
            label.setAttribute('class', 'y-axis-label');
            label.setAttribute('dominant-baseline', 'middle');
            label.textContent = `${t}°`;
            yAxisGroup.appendChild(label);
        }
        return yAxisGroup;
    }

    // Zero line
    function drawZeroLine(h) {
        const ys = getYScale(h);
        const zeroY = ys(0);
        const zeroLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        zeroLine.setAttribute('x1', 0);
        zeroLine.setAttribute('y1', zeroY);
        zeroLine.setAttribute('x2', chartWidth);
        zeroLine.setAttribute('y2', zeroY);
        zeroLine.setAttribute('class', 'axis zero-line');
        zeroLine.setAttribute('stroke-width', '1.5');
        zeroLine.setAttribute('stroke-dasharray', '4,4');
        zeroLine.setAttribute('opacity', '0.7');
        return zeroLine;
    }

    // Initial render
    const segments = createPathSegments(displayData, chartHeight);
    segments.forEach(segment => {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', segment.pathData);
        path.setAttribute('class', `line ${segment.isAboveZero ? 'line-above-zero' : 'line-below-zero'}`);
        g.appendChild(path);
    });

    g.appendChild(drawZeroLine(chartHeight));
    g.appendChild(drawMonthTicks(chartHeight));
    g.appendChild(drawYAxis(chartHeight));

    // Hover elements
    const hoverLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    hoverLine.setAttribute('class', 'hover-line');
    hoverLine.setAttribute('y1', 0);
    hoverLine.setAttribute('y2', chartHeight);
    g.appendChild(hoverLine);

    const tooltipBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    tooltipBg.setAttribute('class', 'tooltip-bg');
    tooltipBg.setAttribute('height', 24);
    g.appendChild(tooltipBg);

    const tooltipText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    tooltipText.setAttribute('class', 'tooltip-text');
    tooltipText.setAttribute('dominant-baseline', 'middle');
    g.appendChild(tooltipText);

    svg.appendChild(g);

    // Static labels
    const yearLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    yearLabel.setAttribute('x', padding.left);
    yearLabel.setAttribute('y', 15);
    yearLabel.setAttribute('class', 'chart-label');
    yearLabel.setAttribute('dominant-baseline', 'middle');
    yearLabel.textContent = year;
    svg.appendChild(yearLabel);
    
    const statsText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    statsText.setAttribute('x', width - padding.right);
    statsText.setAttribute('y', 15);
    statsText.setAttribute('class', 'chart-stats-text');
    statsText.setAttribute('text-anchor', 'end');
    statsText.setAttribute('dominant-baseline', 'middle');
    statsText.textContent = `Keskm: ${avgTemp.toFixed(1)}°C | Min: ${minYearTemp.toFixed(1)}°C | Max: ${maxYearTemp.toFixed(1)}°C`;
    svg.appendChild(statsText);

    // Hover interaction - expand
    container.addEventListener('mouseenter', () => {
        container.classList.add('expanded');
        svg.setAttribute('viewBox', `0 0 ${width} ${expandedHeight}`);
        
        g.innerHTML = '';
        
        getTopStreaks().forEach(streak => {
            const sYearStart = new Date(year, 0, 1);
            const sYearEnd = new Date(year, 3, 30, 23, 59, 59);
            if (streak.to >= sYearStart && streak.from <= sYearEnd) {
                const streakStart = Math.max(streak.from, sYearStart);
                const streakEnd = Math.min(streak.to, sYearEnd);
                const x1 = xScale(streakStart);
                const x2 = xScale(streakEnd);
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('x', x1);
                rect.setAttribute('y', 0);
                rect.setAttribute('width', Math.max(1, x2 - x1));
                rect.setAttribute('height', expandedChartHeight);
                rect.setAttribute('class', 'streak-rect');
                g.appendChild(rect);
                
                if (streakEnd - streakStart >= (streak.to - streak.from) / 2) {
                    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    label.setAttribute('x', x1 + (x2 - x1) / 2);
                    label.setAttribute('y', 8);
                    label.setAttribute('class', 'streak-label');
                    label.setAttribute('dominant-baseline', 'hanging');
                    label.textContent = `#${streak.num}: ${streak.duration}`;
                    g.appendChild(label);
                }
            }
        });

        const expandedSegments = createPathSegments(displayData, expandedChartHeight);
        expandedSegments.forEach(segment => {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', segment.pathData);
            path.setAttribute('class', `line ${segment.isAboveZero ? 'line-above-zero' : 'line-below-zero'}`);
            g.appendChild(path);
        });

        g.appendChild(drawZeroLine(expandedChartHeight));
        g.appendChild(drawMonthTicks(expandedChartHeight));
        g.appendChild(drawYAxis(expandedChartHeight));
        
        hoverLine.setAttribute('y2', expandedChartHeight);
        g.appendChild(hoverLine);
        g.appendChild(tooltipBg);
        g.appendChild(tooltipText);
    });

    // Hover interaction - collapse
    container.addEventListener('mouseleave', () => {
        container.classList.remove('expanded');
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        hoverLine.style.display = 'none';
        tooltipBg.style.display = 'none';
        tooltipText.style.display = 'none';

        g.innerHTML = '';
        
        getTopStreaks().forEach(streak => {
            const sYearStart = new Date(year, 0, 1);
            const sYearEnd = new Date(year, 3, 30, 23, 59, 59);
            if (streak.to >= sYearStart && streak.from <= sYearEnd) {
                const streakStart = Math.max(streak.from, sYearStart);
                const streakEnd = Math.min(streak.to, sYearEnd);
                const x1 = xScale(streakStart);
                const x2 = xScale(streakEnd);
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('x', x1);
                rect.setAttribute('y', 0);
                rect.setAttribute('width', Math.max(1, x2 - x1));
                rect.setAttribute('height', chartHeight);
                rect.setAttribute('class', 'streak-rect');
                g.appendChild(rect);
                
                if (streakEnd - streakStart >= (streak.to - streak.from) / 2) {
                    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    label.setAttribute('x', x1 + (x2 - x1) / 2);
                    label.setAttribute('y', 8);
                    label.setAttribute('class', 'streak-label');
                    label.setAttribute('dominant-baseline', 'hanging');
                    label.textContent = `#${streak.num}: ${streak.duration}`;
                    g.appendChild(label);
                }
            }
        });

        const smallSegments = createPathSegments(displayData, chartHeight);
        smallSegments.forEach(segment => {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', segment.pathData);
            path.setAttribute('class', `line ${segment.isAboveZero ? 'line-above-zero' : 'line-below-zero'}`);
            g.appendChild(path);
        });
        g.appendChild(drawZeroLine(chartHeight));
        g.appendChild(drawMonthTicks(chartHeight));
        g.appendChild(drawYAxis(chartHeight));
        hoverLine.setAttribute('y2', chartHeight);
        g.appendChild(hoverLine);
        g.appendChild(tooltipBg);
        g.appendChild(tooltipText);
    });

    // Mouse move tooltip
    container.addEventListener('mousemove', (e) => {
        const rect = svg.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (width / rect.width);
        const chartX = x - padding.left;

        if (chartX >= 0 && chartX <= chartWidth) {
            hoverLine.style.display = 'block';
            hoverLine.setAttribute('x1', chartX);
            hoverLine.setAttribute('x2', chartX);

            const targetDate = new Date(yearStart.getTime() + (chartX / chartWidth) * yearDuration);
            
            let left = 0, right = data.length - 1;
            while (left < right) {
                let mid = Math.floor((left + right) / 2);
                if (data[mid].date < targetDate) left = mid + 1;
                else right = mid;
            }
            const point = data[left];

            if (point) {
                const timeStr = point.date.toLocaleTimeString('et-EE', { hour: '2-digit', minute: '2-digit' });
                const dateStr = point.date.toLocaleDateString('et-EE', { month: 'short', day: 'numeric' });
                const text = `${dateStr} ${timeStr}: ${point.temp.toFixed(1)}°C`;
                tooltipText.textContent = text;
                tooltipText.style.display = 'block';
                
                const textWidth = tooltipText.getComputedTextLength();
                tooltipBg.setAttribute('width', textWidth + 10);
                tooltipBg.style.display = 'block';

                let tooltipX = chartX + 10;
                if (tooltipX + textWidth + 10 > chartWidth) tooltipX = chartX - textWidth - 20;
                
                const fixedY = 5;
                
                tooltipBg.setAttribute('x', tooltipX);
                tooltipBg.setAttribute('y', fixedY);
                tooltipText.setAttribute('x', tooltipX + 5);
                tooltipText.setAttribute('y', fixedY + 12);
            }
        } else {
            hoverLine.style.display = 'none';
            tooltipBg.style.display = 'none';
            tooltipText.style.display = 'none';
        }
    });

    container.appendChild(svg);
    return container;
}

// Main function
async function loadAndVisualize() {
    const { dataFile, streaksDataFile } = window.appConfig;
    try {
        document.getElementById('charts-container').innerHTML = 
            '<div class="loading">Andmete laadimine (suurte failide puhul võib see aega võtta)...</div>';
        
        const [csvResponse, streaksResponse] = await Promise.all([
            fetch('./' + dataFile + '?t=' + new Date().getTime()),
            fetch('./' + streaksDataFile + '?t=' + new Date().getTime())
        ]);
        
        const text = await csvResponse.text();
        graphStreaksData = await streaksResponse.json();
        
        document.getElementById('charts-container').innerHTML = 
            '<div class="loading">Andmete töötlemine...</div>';
        
        const { years: yearsData } = await parseCSV(text);
        
        const years = Object.keys(yearsData).map(Number).sort((a, b) => a - b);
        
        const container = document.getElementById('charts-container');
        container.innerHTML = '';
        
        for (const year of years) {
            const chart = createYearChart(year, yearsData[year]);
            container.appendChild(chart);
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        
    } catch (error) {
        document.getElementById('charts-container').innerHTML = 
            `<div class="loading" style="color: #e74c3c;">Viga andmete laadimisel: ${error.message}</div>`;
        console.error(error);
    }
}

function initGraph() {
    updateNavLinks('graph');
    updateDataSource();
    loadAndVisualize();
}
