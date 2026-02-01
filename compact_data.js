const fs = require('fs');
const readline = require('readline');

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

async function compactData(inputPath, outputPath) {
    if (!fs.existsSync(inputPath)) {
        console.error(`Input file not found: ${inputPath}`);
        return;
    }

    const fileStream = fs.createReadStream(inputPath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    const outputStream = fs.createWriteStream(outputPath);
    outputStream.write('Aeg, MinTemp, MaxTemp, HourTemp\n');

    let currentHourMarkDate = null;
    let minTemp = Infinity;
    let maxTemp = -Infinity;
    let lastTemp = null;
    let isFirstLine = true;
    let rowsProcessed = 0;
    let hoursWritten = 0;

    console.log(`Processing ${inputPath}...`);

    for await (const line of rl) {
        if (isFirstLine) {
            isFirstLine = false;
            continue;
        }

        const parts = line.split(', ');
        if (parts.length < 2) continue;
        
        const dateStr = parts[0].trim();
        const tempStr = parts[1].trim();
        
        if (!dateStr || !tempStr) continue;

        const date = new Date(dateStr);
        const temp = parseFloat(tempStr);
        if (isNaN(temp)) continue;

        // Determine the end-of-hour mark for this reading.
        // If it's 12:00:00, target is 12:00:00.
        // If it's 12:00:01 - 13:00:00, target is 13:00:00.
        let targetHourMarkDate = new Date(date);
        if (targetHourMarkDate.getMinutes() !== 0 || targetHourMarkDate.getSeconds() !== 0) {
            targetHourMarkDate.setHours(targetHourMarkDate.getHours() + 1);
        }
        targetHourMarkDate.setMinutes(0, 0, 0);

        if (currentHourMarkDate === null) {
            currentHourMarkDate = targetHourMarkDate;
        }

        if (targetHourMarkDate > currentHourMarkDate) {
            // We've moved past the current hour mark. 
            // Write the completed hour's data.
            outputStream.write(`${formatDate(currentHourMarkDate)}, ${minTemp.toFixed(1)}, ${maxTemp.toFixed(1)}, ${lastTemp.toFixed(1)}\n`);
            hoursWritten++;

            // Check if there's a gap of more than one hour
            let gapHours = Math.floor((targetHourMarkDate - currentHourMarkDate) / (1000 * 60 * 60));
            if (gapHours > 1) {
                // If there's a gap, we just move to the next available hour mark.
                // We don't fill with nulls unless specifically requested, 
                // but we reset for the new hour.
            }

            // Reset for the new hour
            currentHourMarkDate = targetHourMarkDate;
            minTemp = temp;
            maxTemp = temp;
            lastTemp = temp;
        } else {
            // Still in the same hour window (or first reading)
            minTemp = Math.min(minTemp, temp);
            maxTemp = Math.max(maxTemp, temp);
            lastTemp = temp;
        }

        rowsProcessed++;
        if (rowsProcessed % 100000 === 0) {
            process.stdout.write(`Processed ${rowsProcessed} rows...\r`);
        }
    }

    // Write the last pending hour
    if (currentHourMarkDate !== null) {
        outputStream.write(`${formatDate(currentHourMarkDate)}, ${minTemp.toFixed(1)}, ${maxTemp.toFixed(1)}, ${lastTemp.toFixed(1)}\n`);
        hoursWritten++;
    }

    console.log(`\nFinished! Processed ${rowsProcessed} rows.`);
    console.log(`Written ${hoursWritten} hourly records to ${outputPath}`);
}

const inputPath = process.argv[2] || './all_data.csv';
const outputPath = process.argv[3] || './compacted_data.csv';

compactData(inputPath, outputPath).catch(err => {
    console.error('Error:', err);
});
