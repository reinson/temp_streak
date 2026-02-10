const fs = require('fs');
const readline = require('readline');

// Keep local and CI runs deterministic by forcing one timezone baseline.
const DEFAULT_TIMEZONE = 'Europe/Tallinn';
if (!process.env.TZ) {
    process.env.TZ = DEFAULT_TIMEZONE;
}

/**
 * Generates streak data for thresholds 0 to -25.
 * For each threshold, it finds the top 10 longest streaks and the current streak.
 * Intervals are saved to a CSV file for efficient loading.
 */
async function generateStreaks(inputPath, streaksOutputPath, intervalsOutputPath) {
    if (!fs.existsSync(inputPath)) {
        console.error(`Input file not found: ${inputPath}`);
        return;
    }

    console.log(`Generating streaks from ${inputPath}...`);

    const thresholds = [];
    for (let i = 0; i >= -25; i--) {
        thresholds.push(i);
    }

    const streakData = {};
    const intervalsStream = fs.createWriteStream(intervalsOutputPath);
    intervalsStream.write('Threshold,Start,End\n');

    for (const threshold of thresholds) {
        console.log(`  Processing threshold ${threshold}°C...`);
        const result = await findStreaksForThreshold(inputPath, threshold, intervalsStream);
        streakData[threshold] = {
            top10: result.top10,
            current: result.current
        };
    }

    intervalsStream.end();
    fs.writeFileSync(streaksOutputPath, JSON.stringify(streakData, null, 2));
    console.log(`  Finished! Streak data written to ${streaksOutputPath}`);
    console.log(`  Intervals written to ${intervalsOutputPath}`);
}

function parseLocalTimestamp(dateStr) {
    const [d, t] = dateStr.split(' ');
    if (!d || !t) return null;

    const [year, month, day] = d.split('-').map(Number);
    const [hour, min, sec] = t.split(':').map(Number);
    if ([year, month, day, hour, min, sec].some(Number.isNaN)) return null;

    const date = new Date(year, month - 1, day, hour, min, sec);
    return Number.isNaN(date.getTime()) ? null : date;
}

function isMay(date) {
    return date.getMonth() === 4;
}

async function findStreaksForThreshold(filePath, threshold, intervalsStream) {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let streaks = [];
    let currentStreak = null;
    let isFirstLine = true;
    let lastDataPoint = null;

    for await (const line of rl) {
        if (isFirstLine) {
            isFirstLine = false;
            continue;
        }

        const parts = line.split(', ');
        if (parts.length < 2) continue;

        const dateStr = parts[0];
        const date = parseLocalTimestamp(dateStr);
        if (!date) continue;
        if (isMay(date)) continue;
        const temp = parseFloat(parts[3] || parts[1]);
        if (Number.isNaN(temp)) continue;
        lastDataPoint = { date, temp };

        if (currentStreak && (date - currentStreak.end > 24 * 60 * 60 * 1000)) {
            currentStreak.durationMs = currentStreak.end - currentStreak.start;
            streaks.push(currentStreak);
            if (intervalsStream) {
                intervalsStream.write(`${threshold},${currentStreak.start.toISOString()},${currentStreak.end.toISOString()}\n`);
            }
            currentStreak = null;
        }

        const conditionMet = temp <= threshold;

        if (conditionMet) {
            if (!currentStreak) {
                currentStreak = { start: date, end: date, count: 1 };
            } else {
                currentStreak.end = date;
                currentStreak.count++;
            }
        } else {
            if (currentStreak) {
                currentStreak.durationMs = currentStreak.end - currentStreak.start;
                streaks.push(currentStreak);
                if (intervalsStream) {
                    intervalsStream.write(`${threshold},${currentStreak.start.toISOString()},${currentStreak.end.toISOString()}\n`);
                }
                currentStreak = null;
            }
        }
    }

    let ongoingStreak = null;
    if (currentStreak) {
        const now = new Date();
        if (now - lastDataPoint.date < 48 * 60 * 60 * 1000) {
            currentStreak.isOngoing = true;
            currentStreak.durationMs = lastDataPoint.date - currentStreak.start;
            ongoingStreak = {
                start: currentStreak.start,
                end: lastDataPoint.date,
                durationMs: currentStreak.durationMs,
                isOngoing: true
            };
        }
        currentStreak.durationMs = currentStreak.end - currentStreak.start;
        streaks.push(currentStreak);
        if (intervalsStream) {
            intervalsStream.write(`${threshold},${currentStreak.start.toISOString()},${currentStreak.end.toISOString()}\n`);
        }
    }

    const top10 = streaks
        .sort((a, b) => b.durationMs - a.durationMs)
        .slice(0, 10)
        .map(s => ({
            start: s.start,
            end: s.end,
            durationMs: s.durationMs,
            isOngoing: s.isOngoing || false
        }));

    return {
        top10,
        current: ongoingStreak
    };
}

if (require.main === module) {
    const inputPath = process.argv[2] || './data/compacted_data.csv';
    const streaksOutputPath = process.argv[3] || './data/streaks_data.json';
    const intervalsOutputPath = process.argv[4] || './data/streaks_intervals.csv';
    generateStreaks(inputPath, streaksOutputPath, intervalsOutputPath).catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
}

module.exports = { generateStreaks };
