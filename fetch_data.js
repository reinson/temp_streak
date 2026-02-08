const fs = require('fs');
const https = require('https');

/**
 * Fetches data for a specific date range from the University of Tartu weather archive.
 * The archive seems to provide data in 5-minute intervals.
 */
async function fetchData(begin, end) {
    // URL parameters based on the provided example:
    // begin[year], begin[mon], begin[mday]
    // end[year], end[mon], end[mday]
    // 9=1 (likely temperature sensor ID)
    const url = `https://meteo.physic.ut.ee/et/archive.php?do=data&begin%5Byear%5D=${begin.year}&begin%5Bmon%5D=${begin.month}&begin%5Bmday%5D=${begin.day}&end%5Byear%5D=${end.year}&end%5Bmon%5D=${end.month}&end%5Bmday%5D=${end.day}&9=1&ok=+Esita+p%C3%A4ring+`;

    console.log(`Fetching data from ${begin.year}-${begin.month}-${begin.day} to ${end.year}-${end.month}-${end.day}...`);

    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`Request Failed. Status Code: ${res.statusCode}`));
                return;
            }

            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                // The response is HTML containing the CSV-like data
                // We need to extract the actual data lines.
                // Based on the archive behavior, it usually returns the data in a <pre> tag or directly.
                // Looking at the snippet, it's "Aeg, Temperatuur" followed by lines.
                resolve(data);
            });
        }).on('error', (e) => {
            reject(e);
        });
    });
}

async function main() {
    const startYear = 1999;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();
    const outputFile = '/Users/tormi/Documents/code/temp_streak/all_data.csv';

    // Clear or create the file with the header
    fs.writeFileSync(outputFile, 'Aeg, Temperatuur\n');

    // Fetch historical data in 1-year chunks (Nov 1 to Nov 1)
    for (let year = startYear; year < currentYear; year++) {
        try {
            const begin = { year, month: 11, day: 1 };
            const end = { year: year + 1, month: 11, day: 1 };
            
            // If the next Nov 1 is in the future, we stop this loop
            if (year + 1 > currentYear || (year + 1 === currentYear && currentMonth < 11)) {
                break;
            }

            const rawData = await fetchData(begin, end);
            
            // Basic cleaning: remove the header from subsequent fetches and any HTML tags if present
            let lines = rawData.split('\n');
            
            // Filter out the header line "Aeg, Temperatuur" and empty lines
            const dataLines = lines.filter(line => {
                const trimmed = line.trim();
                return trimmed && !trimmed.startsWith('Aeg') && !trimmed.startsWith('<');
            });

            if (dataLines.length > 0) {
                fs.appendFileSync(outputFile, dataLines.join('\n') + '\n');
                console.log(`  Saved ${dataLines.length} records for period starting ${year}-11-01.`);
            } else {
                console.log(`  No data found for period starting ${year}-11-01.`);
            }

            // Small delay to be polite to the server
            await new Promise(r => setTimeout(r, 1000));
            
        } catch (error) {
            console.error(`  Error fetching data for year ${year}:`, error.message);
        }
    }

    // Fetch the remaining data from the last Nov 1 until today
    try {
        let lastNovYear = currentYear;
        if (currentMonth < 11) {
            lastNovYear = currentYear - 1;
        }

        const begin = { year: lastNovYear, month: 11, day: 1 };
        const end = { year: currentYear, month: currentMonth, day: currentDay };

        console.log(`Fetching remaining data from ${begin.year}-11-01 up to today (${end.year}-${end.month}-${end.day})...`);
        const rawData = await fetchData(begin, end);
        
        let lines = rawData.split('\n');
        const dataLines = lines.filter(line => {
            const trimmed = line.trim();
            return trimmed && !trimmed.startsWith('Aeg') && !trimmed.startsWith('<');
        });

        if (dataLines.length > 0) {
            fs.appendFileSync(outputFile, dataLines.join('\n') + '\n');
            console.log(`  Saved ${dataLines.length} records for the final period.`);
        }
    } catch (error) {
        console.error(`  Error fetching final data chunk:`, error.message);
    }

    console.log(`\nAll data saved to ${outputFile}`);
}

main();

