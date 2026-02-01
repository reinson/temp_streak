const fs = require('fs');
const readline = require('readline');

/**
 * Formats components to YYYY-MM-DD HH:mm:ss
 */
function formatDateTime(year, month, day, time) {
    const pad = (n) => String(n).padStart(2, '0');
    // time is "H:mm" or "HH:mm"
    const [hours, minutes] = time.split(':');
    return `${year}-${pad(month)}-${pad(day)} ${pad(hours)}:${pad(minutes)}:00`;
}

async function convertToravereData(inputPath, outputPath) {
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

    let lineNum = 0;
    let rowsProcessed = 0;

    console.log(`Processing ${inputPath}...`);

    for await (const line of rl) {
        lineNum++;
        if (lineNum <= 3) continue; // Skip the first 3 lines of header/metadata

        const parts = line.split(',');
        if (parts.length < 12) continue;

        const year = parts[0];
        const month = parts[1];
        const day = parts[2];
        const time = parts[3];
        
        const temp = parseFloat(parts[9]);
        const minTemp = parseFloat(parts[10]);
        const maxTemp = parseFloat(parts[11]);

        if (isNaN(temp)) continue;

        const formattedDate = formatDateTime(year, month, day, time);
        
        // Use min/max if available, otherwise fallback to temp
        const outMin = isNaN(minTemp) ? temp : minTemp;
        const outMax = isNaN(maxTemp) ? temp : maxTemp;

        outputStream.write(`${formattedDate}, ${outMin.toFixed(1)}, ${outMax.toFixed(1)}, ${temp.toFixed(1)}\n`);

        rowsProcessed++;
        if (rowsProcessed % 10000 === 0) {
            process.stdout.write(`Processed ${rowsProcessed} rows...\r`);
        }
    }

    console.log(`\nFinished! Processed ${rowsProcessed} rows.`);
    console.log(`Written to ${outputPath}`);
}

const inputPath = './Tõravere ilma andmed - Leht1.csv';
const outputPath = './toravere_compacted.csv';

convertToravereData(inputPath, outputPath).catch(err => {
    console.error('Error:', err);
});
