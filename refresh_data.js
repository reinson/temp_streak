const fs = require('fs');
const https = require('https');
const readline = require('readline');

const outputFile = '/Users/tormireinson/code/temps/all_data.csv';

/**
 * Fetches data for a specific date range from the University of Tartu weather archive.
 */
async function fetchDataRange(start, end) {
    const url = `https://meteo.physic.ut.ee/et/archive.php?do=data&` +
        `begin%5Byear%5D=${start.year}&begin%5Bmon%5D=${start.month}&begin%5Bmday%5D=${start.day}&` +
        `end%5Byear%5D=${end.year}&end%5Bmon%5D=${end.month}&end%5Bmday%5D=${end.day}&9=1&ok=+Esita+p%C3%A4ring+`;

    console.log(`Fetching data from ${start.year}-${start.month}-${start.day} to ${end.year}-${end.month}-${end.day}...`);

    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`Request Failed. Status Code: ${res.statusCode}`));
                return;
            }
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve(data));
        }).on('error', (e) => reject(e));
    });
}

/**
 * Gets the latest date from the existing all_data.csv file.
 */
async function getLatestDateInFile() {
    if (!fs.existsSync(outputFile)) return null;

    const fileStream = fs.createReadStream(outputFile);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let lastLine = '';
    for await (const line of rl) {
        if (line.trim() && !line.startsWith('Aeg')) {
            lastLine = line;
        }
    }

    if (!lastLine) return null;
    const dateStr = lastLine.split(', ')[0];
    return new Date(dateStr);
}

async function refreshData() {
    const latestDate = await getLatestDateInFile();
    const now = new Date();
    
    let startDate;
    if (!latestDate) {
        console.log("No existing data found. Starting from 1999-11-01.");
        startDate = new Date('1999-11-01 00:00:00');
        fs.writeFileSync(outputFile, 'Aeg, Temperatuur\n');
    } else {
        console.log(`Latest data point in file: ${latestDate.toISOString().replace('T', ' ').substring(0, 19)}`);
        // Start from the next 5-minute interval
        startDate = new Date(latestDate.getTime() + 5 * 60 * 1000);
    }

    if (startDate >= now) {
        console.log("Data is already up to date.");
        return;
    }

    // Fetch in chunks of 1 year to avoid server timeouts
    let currentStart = startDate;
    while (currentStart < now) {
        let currentEnd = new Date(currentStart);
        currentEnd.setFullYear(currentStart.getFullYear() + 1);
        if (currentEnd > now) currentEnd = now;

        const startParams = {
            year: currentStart.getFullYear(),
            month: currentStart.getMonth() + 1,
            day: currentStart.getDate()
        };
        const endParams = {
            year: currentEnd.getFullYear(),
            month: currentEnd.getMonth() + 1,
            day: currentEnd.getDate()
        };

        try {
            const rawData = await fetchDataRange(startParams, endParams);
            const lines = rawData.split('\n');
            const dataLines = lines.filter(line => {
                const trimmed = line.trim();
                return trimmed && !trimmed.startsWith('Aeg') && !trimmed.startsWith('<');
            });

            if (dataLines.length > 0) {
                fs.appendFileSync(outputFile, dataLines.join('\n') + '\n');
                console.log(`  Saved ${dataLines.length} new records.`);
            } else {
                console.log(`  No new data found for this period.`);
            }
        } catch (error) {
            console.error(`  Error fetching data:`, error.message);
            break;
        }

        currentStart = currentEnd;
        if (currentStart < now) await new Promise(r => setTimeout(r, 1000));
    }

    console.log("Refresh complete.");
}

refreshData();

