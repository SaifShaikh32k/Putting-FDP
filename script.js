// --- Configuration ---
// Import configuration from config.js
const { API_KEY, SPREADSHEET_ID, RANGES } = CONFIG;

// --- Data variables ---
let data1 = [];
let data2 = [];
let imageLinks = []; // Changed from imageData object to imageLinks array
let isDataLoaded = false;
let dataLoadError = false;

// Get DOM elements
const categoryInput = document.getElementById('categoryInput');
const findBinsButton = document.getElementById('findBinsButton');
const resultsTableBody = document.querySelector('#resultsTable tbody');
const fsnImage = document.getElementById('fsnImage'); // Get the image element
const imageContainer = document.getElementById('imageContainer'); // Get image container

// Function to fetch and process data from Google Sheets
async function fetchData() {
    findBinsButton.classList.add('loading');
    findBinsButton.disabled = true;
    // Clear previous results and show loading in table
    resultsTableBody.innerHTML = '<tr><td class="message">Loading data from Google Sheet...</td></tr>';
    // Hide image initially
    imageContainer.style.display = 'none';
    fsnImage.style.display = 'none';
    fsnImage.src = '';

    const urlData1 = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${RANGES.DATA1}?key=${API_KEY}`;
    const urlData2 = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${RANGES.DATA2}?key=${API_KEY}`;
    const urlImageLinks = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${RANGES.IMAGE_LINKS}?key=${API_KEY}`;
    console.log("Fetching data...");

    try {
        const [response1, response2, responseImages] = await Promise.all([
            fetch(urlData1),
            fetch(urlData2),
            fetch(urlImageLinks)
        ]);

        if (!response1.ok) throw new Error(`Failed to fetch Data1: ${response1.status} ${response1.statusText}`);
        if (!response2.ok) throw new Error(`Failed to fetch Data2: ${response2.status} ${response2.statusText}`);
        if (!responseImages.ok) throw new Error(`Failed to fetch Imagelink: ${responseImages.status} ${responseImages.statusText}`);

        const [json1, json2, jsonImages] = await Promise.all([
            response1.json(),
            response2.json(),
            responseImages.json()
        ]);

        console.log("Raw Data1:", json1);
        console.log("Raw Data2:", json2);
        console.log("Raw ImageLinks:", jsonImages);

        // Process data1 (Category, Storage Zone)
        data1 = processSheetData(json1, ['category', 'storageZone']);

        // Process data2 (Storage Zone, Bin)
        data2 = processSheetData(json2, ['storageZone', 'bin']);

        // Process image links
        imageLinks = processImageLinks(jsonImages);
        console.log("Processed Data:", { data1, data2, imageLinks });

        isDataLoaded = true;
        dataLoadError = false;
        resultsTableBody.innerHTML = '<tr><td class="message">Data loaded. Enter a category, storage zone, or FSN.</td></tr>';
        return true;

    } catch (error) {
        console.error('Error fetching or parsing Google Sheets data:', error);
        resultsTableBody.innerHTML = `<tr><td class="message">Error loading data: ${error.message}.<br>Check console & ensure sheet is shared correctly.</td></tr>`;
        isDataLoaded = false;
        dataLoadError = true;
        return false;
    } finally {
        findBinsButton.classList.remove('loading');
        findBinsButton.disabled = false;
    }
}

// Helper function to process sheet data
function processSheetData(json, fields) {
    if (!json.values || json.values.length <= 1) {
        console.warn(`No data found or only header in range processed by ${fields.join(', ')}.`);
        return [];
    }

    return json.values.slice(1)
        .map(row => ({
            [fields[0]]: row[0] ? String(row[0]).trim() : '',
            [fields[1]]: row[1] ? String(row[1]).trim() : ''
        }))
        .filter(item => item[fields[0]] || item[fields[1]]); // Keep row if at least one field has value
}

// Helper function to process image links
function processImageLinks(json) {
    if (!json.values || json.values.length <= 1) {
        console.warn('No image links found or only header in image links range.');
        return [];
    }

    return json.values.slice(1)
        .map(row => ({
            fsn: row[0] ? String(row[0]).trim() : '',
            imageUrl: row[1] ? String(row[1]).trim() : ''
        }))
        .filter(item => item.fsn && item.imageUrl);
}

// Helper function to find matching bins based on category or storage zone input
function findMatchingBins(inputLower) {
    const relevantStorageZones = new Set();

    // Find storage zones by matching category in Data1
    data1.forEach(item => {
        if (item.category && item.category.toLowerCase() === inputLower && item.storageZone) {
            // Split storage zones by comma and trim each zone
            const zones = item.storageZone.split(',').map(zone => zone.trim().toLowerCase());
            zones.forEach(zone => {
                if (zone) { // Only add non-empty zones
                    relevantStorageZones.add(zone);
                }
            });
        }
    });

    // Check if input is a storage zone in Data2
    data2.forEach(item => {
        if(item.storageZone) {
            const itemZones = item.storageZone.split(',').map(zone => zone.trim().toLowerCase());
            if (itemZones.some(zone => zone === inputLower)) {
                relevantStorageZones.add(inputLower);
            }
        }
    });

    // Find bins associated with relevant storage zones
    const matchingBins = new Set();
    data2.forEach(item => {
        if (item.storageZone && item.bin) {
            const itemZones = item.storageZone.split(',').map(zone => zone.trim().toLowerCase());
            if (itemZones.some(zone => relevantStorageZones.has(zone))) {
                 const binsList = item.bin.split(',').map(b => b.trim()).filter(b => b);
                 binsList.forEach(b => matchingBins.add(b));
            }
        }
    });

    return [...matchingBins].sort();
}

// Helper function to display bin results in the table
function displayBinResults(bins, inputValue) {
    resultsTableBody.innerHTML = ''; // Clear previous results

    if (bins.length === 0) {
        // Keep the message specific if an image was found
        if (fsnImage.style.display !== 'none') {
             resultsTableBody.innerHTML = '<tr><td class="message">Image found for FSN, but no associated bins found for category/storage zone.</td></tr>';
        } else {
             resultsTableBody.innerHTML = `<tr><td class="message">No matching bins found for category or storage zone: "${inputValue}".</td></tr>`;
        }
        return;
    }

    // Add each unique bin to the table
    bins.forEach(bin => {
        const row = resultsTableBody.insertRow();
        const cell = row.insertCell();
        cell.textContent = bin;
    });
}

// Helper function to find and display FSN image
function displayFSNImage(inputLower) {
    const matchingImage = imageLinks.find(item =>
        item.fsn && item.fsn.toLowerCase() === inputLower
    );

    if (matchingImage && matchingImage.imageUrl) {
        fsnImage.src = matchingImage.imageUrl;
        fsnImage.style.display = 'block';
        imageContainer.style.display = 'flex'; // Show container
        return true; // Indicate image was found
    } else {
        fsnImage.src = '';
        fsnImage.style.display = 'none';
        imageContainer.style.display = 'none'; // Hide container
        return false; // Indicate image was not found
    }
}

// Main function to handle search
function handleSearch() {
    resultsTableBody.innerHTML = '';
    findBinsButton.classList.add('loading');
    findBinsButton.disabled = true;
    resultsTableBody.innerHTML = '<tr><td class="message">Searching...</td></tr>';
    imageContainer.style.display = 'none'; // Hide image while searching
    fsnImage.style.display = 'none';

    setTimeout(() => {
        try {
            if (dataLoadError) {
                resultsTableBody.innerHTML = '<tr><td class="message">Could not load data. Please check sheet sharing or API key and refresh.</td></tr>';
                return;
            }
            if (!isDataLoaded) {
                resultsTableBody.innerHTML = '<tr><td class="message">Data is still loading. Please wait...</td></tr>';
                return;
            }

            const inputValue = categoryInput.value.trim();
            const inputLower = inputValue.toLowerCase();

            if (!inputValue) {
                resultsTableBody.innerHTML = '<tr><td class="message">Please enter a category, storage zone, or FSN.</td></tr>';
                imageContainer.style.display = 'none';
                fsnImage.style.display = 'none';
                return;
            }

            // 1. Try to display image if input matches FSN
            const imageFound = displayFSNImage(inputLower);

            // 2. Find matching bins based on input as category/storage zone
            const matchingBins = findMatchingBins(inputLower);

            // 3. Display bin results
            displayBinResults(matchingBins, inputValue);

            // If neither image nor bins were found, show a general message
            if (!imageFound && matchingBins.length === 0) {
                 resultsTableBody.innerHTML = '<tr><td class="message">No matching category, storage zone, or FSN found.</td></tr>';
            }

        } catch (error) {
            console.error("Error during search display:", error);
            resultsTableBody.innerHTML = `<tr><td class="message">An error occurred during the search.</td></tr>`;
            imageContainer.style.display = 'none'; // Hide image on error
            fsnImage.style.display = 'none';
        } finally {
            findBinsButton.classList.remove('loading');
            findBinsButton.disabled = false;
        }
    }, 50);
}

// --- Event Listeners ---
findBinsButton.addEventListener('click', handleSearch);

categoryInput.addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
        handleSearch();
    }
});

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', async () => {
    await fetchData();
}); 