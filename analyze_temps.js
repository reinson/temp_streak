const fs = require('fs');
const readline = require('readline');

/**
 * Formats duration in milliseconds to "X days, Y hours, Z minutes"
 */
function formatDuration(ms) {
    const totalMinutes = Math.floor(ms / (1000 * 60));
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;

    const parts = [];
    if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
    if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
    if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
    
    return parts.length > 0 ? parts.join(', ') : '0 minutes';
}

/**
 * Finds the 10 longest streaks where temperature meets the condition
 */
async function findLongestStreaks(filePath, threshold, mode = 'below') {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let streaks = [];
    let currentStreak = null;
    let isFirstLine = true;

    for await (const line of rl) {
        if (isFirstLine) {
            isFirstLine = false;
            continue;
        }

        const [dateStr, tempStr] = line.split(', ');
        if (!dateStr || !tempStr) continue;

        const date = new Date(dateStr);
        const temp = parseFloat(tempStr);

        // Check for data gaps (more than 1 day)
        if (currentStreak && (date - currentStreak.end > 24 * 60 * 60 * 1000)) {
            currentStreak.durationMs = currentStreak.end - currentStreak.start;
            currentStreak.avgTemp = currentStreak.tempSum / currentStreak.count;
            streaks.push(currentStreak);
            currentStreak = null;
        }

        const conditionMet = mode === 'above' ? temp >= threshold : temp <= threshold;

        if (conditionMet) {
            if (!currentStreak) {
                currentStreak = { start: date, end: date, tempSum: temp, count: 1 };
            } else {
                currentStreak.end = date;
                currentStreak.tempSum += temp;
                currentStreak.count++;
            }
        } else {
            if (currentStreak) {
                currentStreak.durationMs = currentStreak.end - currentStreak.start;
                currentStreak.avgTemp = currentStreak.tempSum / currentStreak.count;
                streaks.push(currentStreak);
                currentStreak = null;
            }
        }
    }

    // Handle last streak if file ends during one
    if (currentStreak) {
        // If the streak is still ongoing at the end of the file, 
        // compare it to the current time to see if it's still active.
        const now = new Date();
        
        // Only consider it "ongoing" if the last data point is very recent (e.g., within the last 24 hours)
        // Otherwise, just close the streak at the last data point.
        const lastDataPoint = currentStreak.end;
        const oneDayInMs = 24 * 60 * 60 * 1000;
        
        if (now - lastDataPoint < oneDayInMs) {
            currentStreak.isOngoing = true;
            currentStreak.durationMs = now - currentStreak.start;
            currentStreak.end = now;
        } else {
            currentStreak.durationMs = currentStreak.end - currentStreak.start;
        }
        
        currentStreak.avgTemp = currentStreak.tempSum / currentStreak.count;
        streaks.push(currentStreak);
    }

    // Sort by duration descending and take top 10
    return streaks
        .sort((a, b) => b.durationMs - a.durationMs)
        .slice(0, 10);
}

// Example usage: Find streaks where temperature didn't go over 0 degrees
const threshold = parseFloat(process.argv[2]) || 0;
const mode = process.argv[3] === 'above' ? 'above' : 'below';
const dataPath = './all_data.csv';

console.log(`Searching for 10 longest streaks where temperature is ${mode} ${threshold}°C...`);

findLongestStreaks(dataPath, threshold, mode)
    .then(topStreaks => {
        console.log(`\nTop 10 Longest Streaks (${mode} ${threshold}°C):`);
        topStreaks.forEach((streak, index) => {
            const ongoingTag = streak.isOngoing ? ' (ONGOING)' : '';
            console.log(`${index + 1}. Duration: ${formatDuration(streak.durationMs)}${ongoingTag}`);
            console.log(`   Average Temp: ${streak.avgTemp.toFixed(2)}°C`);
            console.log(`   From: ${streak.start.toISOString().replace('T', ' ').substring(0, 19)}`);
            if (streak.isOngoing) {
                console.log(`   To:   Present`);
            } else {
                console.log(`   To:   ${streak.end.toISOString().replace('T', ' ').substring(0, 19)}`);
            }
            console.log('---');
        });
    })
    .catch(err => {
        console.error('Error processing data:', err);
    });

