// Continuous color scale using D3
const colorBelowZero = d3.scaleSequential()
    .domain([-30, 0])
    .interpolator(d3.interpolatePuBu);

const colorAboveZero = d3.scaleSequential()
    .domain([0, 30])
    .interpolator(d3.interpolateYlOrRd);

function getColor(temp) {
    if (temp === null || isNaN(temp)) return 'transparent';
    if (temp <= 0) {
        return colorBelowZero(temp);
    } else {
        return colorAboveZero(temp);
    }
}

function createLegend() {
    const legendContainer = document.getElementById('heatmap-legend');
    legendContainer.innerHTML = '';
    
    const temps = [-30, -20, -10, 0, 10, 20, 30];
    temps.forEach(t => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        const box = document.createElement('div');
        box.className = 'color-box';
        box.style.background = getColor(t);
        item.appendChild(box);
        item.appendChild(document.createTextNode(`${t}°C`));
        legendContainer.appendChild(item);
    });
}

async function parseHeatmapData(text) {
    const lines = text.split('\n');
    const years = {};
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const parts = line.split(', ');
        if (parts.length < 2) continue;
        
        const date = new Date(parts[0]);
        const temp = parseFloat(parts[3] || parts[1]);
        
        if (isNaN(temp)) continue;
        
        const year = date.getFullYear();
        const dayKey = date.toISOString().split('T')[0];
        
        if (!years[year]) years[year] = {};
        if (!years[year][dayKey]) years[year][dayKey] = { sum: 0, count: 0 };
        
        years[year][dayKey].sum += temp;
        years[year][dayKey].count++;
    }
    
    // Calculate averages
    const result = {};
    for (const year in years) {
        result[year] = [];
        for (let month = 0; month < 12; month++) {
            for (let day = 1; day <= 31; day++) {
                const d = new Date(year, month, day);
                if (d.getMonth() !== month) continue;
                
                const key = d.toISOString().split('T')[0];
                const data = years[year][key];
                result[year].push({
                    date: d,
                    avg: data ? data.sum / data.count : null
                });
            }
        }
    }
    return result;
}

function renderHeatmap(yearsData) {
    const tooltip = document.getElementById('tooltip');
    const container = document.getElementById('main-content');
    container.innerHTML = '';
    
    const heatmap = document.createElement('div');
    heatmap.className = 'heatmap-container';
    
    const sortedYears = Object.keys(yearsData).sort();
    
    sortedYears.forEach(year => {
        const row = document.createElement('div');
        row.className = 'year-row';
        
        const label = document.createElement('div');
        label.className = 'year-label';
        label.textContent = year;
        row.appendChild(label);
        
        const daysContainer = document.createElement('div');
        daysContainer.className = 'days-container';
        
        yearsData[year].forEach(day => {
            const stripe = document.createElement('div');
            stripe.className = 'day-stripe';
            if (day.avg !== null) {
                stripe.style.background = getColor(day.avg);
                stripe.onmouseover = (e) => {
                    tooltip.style.display = 'block';
                    tooltip.textContent = `${day.date.toLocaleDateString('et-EE')}: ${day.avg.toFixed(1)}°C`;
                    tooltip.style.left = (e.pageX + 10) + 'px';
                    tooltip.style.top = (e.pageY + 10) + 'px';
                };
                stripe.onmouseout = () => tooltip.style.display = 'none';
            } else {
                stripe.style.background = 'transparent';
            }
            daysContainer.appendChild(stripe);
        });
        
        row.appendChild(daysContainer);

        // Add month dividers
        let dayOffset = 0;
        for (let month = 0; month < 11; month++) {
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            dayOffset += daysInMonth;
            const percent = (dayOffset / yearsData[year].length) * 100;
            
            const divider = document.createElement('div');
            divider.className = 'month-divider';
            divider.style.left = `${percent}%`;
            daysContainer.appendChild(divider);
        }

        heatmap.appendChild(row);
    });
    
    container.appendChild(heatmap);
    
    // Add months axis
    const monthsAxis = document.createElement('div');
    monthsAxis.className = 'months-axis';
    ['Jaan', 'Veebr', 'Märts', 'Apr', 'Mai', 'Juuni', 'Juuli', 'Aug', 'Sept', 'Okt', 'Nov', 'Dets'].forEach(m => {
        const mLabel = document.createElement('div');
        mLabel.className = 'month-label';
        mLabel.textContent = m;
        monthsAxis.appendChild(mLabel);
    });
    container.appendChild(monthsAxis);
}

async function initHeatmap() {
    updateNavLinks('heatmap');
    updateDataSource();
    
    try {
        createLegend();
        const { dataFile } = window.appConfig;
        const response = await fetch('./' + dataFile);
        const text = await response.text();
        const data = await parseHeatmapData(text);
        renderHeatmap(data);
    } catch (e) {
        console.error(e);
        document.getElementById('main-content').innerHTML = '<div class="loading">Viga andmete laadimisel.</div>';
    }
}
