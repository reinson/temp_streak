const fs = require('fs');
const https = require('https');

/**
 * Fetches data for a specific year range from the University of Tartu weather archive.
 * The archive seems to provide data in 5-minute intervals.
 */
async function fetchYearData(startYear) {
    const endYear = startYear + 1;
    // URL parameters based on the provided example:
    // begin[year], begin[mon]=11, begin[mday]=1
    // end[year], end[mon]=11, end[mday]=1
    // 9=1 (likely temperature sensor ID)
    const url = `https://meteo.physic.ut.ee/et/archive.php?do=data&begin%5Byear%5D=${startYear}&begin%5Bmon%5D=11&begin%5Bmday%5D=1&end%5Byear%5D=${endYear}&end%5Bmon%5D=11&end%5Bmday%5D=1&9=1&ok=+Esita+p%C3%A4ring+`;

    console.log(`Fetching data from ${startYear}-11-01 to ${endYear}-11-01...`);

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
    const currentYear = new Date().getFullYear();
    const outputFile = '/Users/tormireinson/code/temps/all_data.csv';

    // Clear or create the file with the header
    fs.writeFileSync(outputFile, 'Aeg, Temperatuur\n');

    for (let year = startYear; year < currentYear; year++) {
        try {
            const rawData = await fetchYearData(year);
            
            // Basic cleaning: remove the header from subsequent fetches and any HTML tags if present
            // The archive often returns plain text but let's be safe.
            let lines = rawData.split('\n');
            
            // Filter out the header line "Aeg, Temperatuur" and empty lines
            const dataLines = lines.filter(line => {
                const trimmed = line.trim();
                return trimmed && !trimmed.startsWith('Aeg') && !trimmed.startsWith('<');
            });

            if (dataLines.length > 0) {
                fs.appendFileSync(outputFile, dataLines.join('\n') + '\n');
                console.log(`  Saved ${dataLines.length} records for period starting ${year}.`);
            } else {
                console.log(`  No data found for period starting ${year}.`);
            }

            // Small delay to be polite to the server
            await new Promise(r => setTimeout(r, 1000));
            
        } catch (error) {
            console.error(`  Error fetching data for year ${year}:`, error.message);
        }
    }

    console.log(`\nAll data saved to ${outputFile}`);
}

main();

