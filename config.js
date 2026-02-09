(function() {
    const params = new URLSearchParams(window.location.search);
    const isToravere = params.get('loc') === 'toravere';
    const dataFile = isToravere ? 'data/toravere_compacted.csv' : 'data/compacted_data.csv';
    const streaksDataFile = isToravere ? 'data/toravere_streaks.json' : 'data/streaks_data.json';
    const intervalsDataFile = isToravere ? 'data/toravere_intervals.csv' : 'data/streaks_intervals.csv';
    const locationName = isToravere ? 'Tõravere' : 'Tartu';

    window.appConfig = {
        isToravere,
        dataFile,
        streaksDataFile,
        intervalsDataFile,
        locationName
    };
})();
