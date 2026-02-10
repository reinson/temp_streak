const path = require('path');
const fs = require('fs');
const https = require('https');
const readline = require('readline');

// Keep local and CI runs deterministic by forcing one timezone baseline.
const DEFAULT_TIMEZONE = 'Europe/Tallinn';
if (!process.env.TZ) {
    process.env.TZ = DEFAULT_TIMEZONE;
}

const { generateStreaks } = require('./generate_streaks');

const baseDir = __dirname;
const dataDir = path.join(baseDir, 'data');
const outputFile = path.join(dataDir, 'all_data.csv');
const compactedFile = path.join(dataDir, 'compacted_data.csv');
const streaksFile = path.join(dataDir, 'streaks_data.json');
const intervalsFile = path.join(dataDir, 'streaks_intervals.csv');

const toravereRawFile = path.join(dataDir, 'toravere_compacted.csv'); 
const toravereStreaksFile = path.join(dataDir, 'toravere_streaks.json');
const toravereIntervalsFile = path.join(dataDir, 'toravere_intervals.csv');

/**
 * Formats a Date object to YYYY-MM-DD HH:mm:ss
 */
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Parses a "YYYY-MM-DD HH:mm:ss" string as local time in the configured TZ.
 */
function parseLocalTimestamp(dateStr) {
    const [d, t] = dateStr.split(' ');
    if (!d || !t) return null;

    const [year, month, day] = d.split('-').map(Number);
    const [hour, min, sec] = t.split(':').map(Number);
    if ([year, month, day, hour, min, sec].some(Number.isNaN)) return null;

    const date = new Date(year, month - 1, day, hour, min, sec);
    return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Compacts data from all_data.csv to compacted_data.csv
 */
async function compactData() {
    if (!fs.existsSync(outputFile)) {
        console.error(`Input file not found: ${outputFile}`);
        return;
    }

    console.log(`Compacting data to ${compactedFile}...`);

    const fileStream = fs.createReadStream(outputFile);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    const outputStream = fs.createWriteStream(compactedFile, { flags: 'w' });
    outputStream.on('error', (err) => console.error('STREAM ERROR:', err));
    outputStream.write('Aeg, MinTemp, MaxTemp, HourTemp\n');

    let currentHourMarkDate = null;
    let minTemp = Infinity;
    let maxTemp = -Infinity;
    let lastTemp = null;
    let isFirstLine = true;
    let rowsProcessed = 0;
    let hoursWritten = 0;

    for await (const line of rl) {
        if (isFirstLine) {
            isFirstLine = false;
            continue;
        }

        const parts = line.split(',');
        if (parts.length < 2) continue;
        
        const dateStr = parts[0].trim();
        const tempStr = parts[1].trim();
        
        if (!dateStr || !tempStr) continue;

        const date = parseLocalTimestamp(dateStr);
        if (!date) continue;
        const temp = parseFloat(tempStr);
        if (isNaN(temp)) continue;

        let targetHourMarkDate = new Date(date);
        if (targetHourMarkDate.getMinutes() !== 0 || targetHourMarkDate.getSeconds() !== 0) {
            targetHourMarkDate.setHours(targetHourMarkDate.getHours() + 1);
        }
        targetHourMarkDate.setMinutes(0, 0, 0);

        if (currentHourMarkDate === null) {
            currentHourMarkDate = targetHourMarkDate;
            minTemp = temp;
            maxTemp = temp;
            lastTemp = temp;
            rowsProcessed++;
            continue;
        }

        if (targetHourMarkDate.getTime() > currentHourMarkDate.getTime()) {
            // We've moved past the current hour mark. 
            // Write the completed hour's data.
            outputStream.write(`${formatDate(currentHourMarkDate)}, ${minTemp.toFixed(1)}, ${maxTemp.toFixed(1)}, ${lastTemp.toFixed(1)}\n`);
            hoursWritten++;

            // If there's a gap of more than one hour, we just move to the next available hour mark.
            currentHourMarkDate = targetHourMarkDate;
            minTemp = temp;
            maxTemp = temp;
            lastTemp = temp;
        } else {
            // Still in the same hour window
            minTemp = Math.min(minTemp, temp);
            maxTemp = Math.max(maxTemp, temp);
            lastTemp = temp;
        }

        rowsProcessed++;
        if (rowsProcessed % 100000 === 0) {
            process.stdout.write(`    Processed ${rowsProcessed} rows...\r`);
        }
    }

    if (currentHourMarkDate !== null) {
        outputStream.write(`${formatDate(currentHourMarkDate)}, ${minTemp.toFixed(1)}, ${maxTemp.toFixed(1)}, ${lastTemp.toFixed(1)}\n`);
        hoursWritten++;
    }

    await new Promise((resolve) => {
        outputStream.end(() => {
            console.log('  Stream closed.');
            resolve();
        });
    });

    console.log(`  Finished compaction! Processed ${rowsProcessed} rows, written ${hoursWritten} hourly records.`);
}

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
    return parseLocalTimestamp(dateStr);
}

async function refreshData() {
    const forceUpdate = process.argv.includes('--force');
    
    if (forceUpdate) {
        console.log("Force update requested. Re-fetching all data from scratch.");
    }

    const latestDate = forceUpdate ? null : await getLatestDateInFile();
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
    await compactData();
    await generateStreaks(compactedFile, streaksFile, intervalsFile);

    // Tartu (Tõravere) data is not updating, so we only compute streaks if they don't exist (or --force)
    if (forceUpdate || !fs.existsSync(toravereIntervalsFile)) {
        console.log(`Generating Tõravere streaks${forceUpdate ? ' (forced)' : ' (one-time)'}...`);
        await generateStreaks(toravereRawFile, toravereStreaksFile, toravereIntervalsFile);
    }
}

refreshData();

