// Initialize the map centered on Denmark
const map = L.map('map').setView([56.0, 10.0], 6);

// Add OpenStreetMap tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Initialize feature group to store drawn items
const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

// Initialize feature group for water level stations
const stationsLayer = new L.FeatureGroup();
map.addLayer(stationsLayer);

// Initialize draw control
const drawControl = new L.Control.Draw({
    draw: {
        marker: false,
        circlemarker: false,
        circle: false,
        polyline: false,
        polygon: {
            allowIntersection: false,
            drawError: {
                color: '#e1e100',
                message: '<strong>Error:</strong> Polygon edges cannot cross!'
            },
            shapeOptions: {
                color: '#3388ff'
            }
        },
        rectangle: {
            shapeOptions: {
                color: '#3388ff'
            }
        }
    },
    edit: {
        featureGroup: drawnItems,
        remove: true
    }
});
map.addControl(drawControl);

// Handle draw created event
map.on(L.Draw.Event.CREATED, function(event) {
    drawnItems.clearLayers();
    drawnItems.addLayer(event.layer);
});

// Handle draw deleted event
map.on(L.Draw.Event.DELETED, function(event) {
    const layers = event.layers;
    layers.eachLayer(function(layer) {
        drawnItems.removeLayer(layer);
    });
});

// DOM elements
const geometryTypeRadios = document.querySelectorAll('input[name="geometryType"]');
const drawInstructions = document.getElementById('drawInstructions');
const importOptions = document.getElementById('importOptions');
const searchButton = document.getElementById('searchButton');
const resultsButton = document.getElementById('resultsButton');
const resultsCount = document.getElementById('resultsCount');
const resultsTableBody = document.getElementById('resultsTableBody');
const loadingIndicator = document.querySelector('.loading');
const dateFromInput = document.getElementById('dateFrom');
const dateToInput = document.getElementById('dateTo');
const cloudCoverageSlider = document.getElementById('cloudCoverage');
const cloudCoverageValue = document.getElementById('cloudCoverageValue');
const previewImage = document.getElementById('previewImage');
const showStationsCheckbox = document.getElementById('showStations');
const resultsPerPageSelect = document.getElementById('resultsPerPage');
const paginationContainer = document.getElementById('paginationContainer');

// Store search state globally
let searchState = {
    currentPage: 1,
    resultsPerPage: 20,
    totalResults: 0,
    hasNextPage: false,
    hasPrevPage: false,
    geometry: null,
    startDate: null,
    endDate: null,
    maxCloudCoverage: 20,
    sortBy: 'datetime',
    sortDirection: 'desc'
};

// Store search results globally
let searchResults = [];
let waterLevelStations = [];

// Function to check if elements exist in the DOM
function elementExists(element) {
    return element !== null && element !== undefined;
}

// Show/hide appropriate options based on selected geometry type
function toggleOptions(option
) {
    if (!option || !option.value) {
        console.warn("Invalid option provided to toggleOptions");
        return; // Early return to prevent errors
    }

    const selectedType = document.querySelector('input[name="geometryType"]:checked').value;

    if (elementExists(drawInstructions)) {
        drawInstructions.style.display = selectedType === 'draw' ? 'block' : 'none';
    }

    if (elementExists(importOptions)) {
        importOptions.style.display = selectedType === 'import' ? 'block' : 'none';
    }

    // Toggle draw control
    if (selectedType === 'draw' && !map.drawControl) {
        map.addControl(drawControl);
    } else if (selectedType === 'import' && map.drawControl) {
        map.removeControl(drawControl);
    }
}

// Initialize the options display
toggleOptions();

// Add event listeners to the radio buttons
geometryTypeRadios.forEach(function(radio) {
    radio.addEventListener('change', toggleOptions);
});

// Initialize date pickers with default values
if (elementExists(dateFromInput) && elementExists(dateToInput)) {
    // Set default date range (15 days ago to today)
    const today = new Date();
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(today.getDate() - 15);

    dateFromInput.valueAsDate = twoWeeksAgo;
    dateToInput.valueAsDate = today;
}

// Initialize cloud coverage slider
if (elementExists(cloudCoverageSlider) && elementExists(cloudCoverageValue)) {
    cloudCoverageSlider.addEventListener('input', function() {
        cloudCoverageValue.textContent = this.value;
    });
}

// Initialize results per page dropdown if it exists
if (elementExists(resultsPerPageSelect)) {
    resultsPerPageSelect.addEventListener('change', function() {
        searchState.resultsPerPage = parseInt(this.value);
        if (searchResults.length > 0) {
            // If we already have results, re-search with new page size
            searchState.currentPage = 1; // Reset to first page when changing page size
            performSearch();
        }
    });
}

// Event listener for sorting change
document.addEventListener('DOMContentLoaded', function() {
    const sortDirectionSelect = document.getElementById('sortDirection');
    if (sortDirectionSelect) {
        sortDirectionSelect.addEventListener('change', function() {
            searchState.sortDirection = this.value;
            performSearch(1); // Reset to first page when changing sort
        });
    }
});

// Load water level stations if checkbox exists
if (elementExists(showStationsCheckbox)) {
    showStationsCheckbox.addEventListener('change', function() {
        if (this.checked) {
            loadAndDisplayStations();
        } else {
            stationsLayer.clearLayers();
        }
    });

    // Load stations on page load if checkbox is checked
    if (showStationsCheckbox.checked) {
        loadAndDisplayStations();
    }
}

// Function to load and display water level stations
function loadAndDisplayStations() {
    if (waterLevelStations.length > 0) {
        // If stations are already loaded, just display them
        displayStations(waterLevelStations);
        return;
    }

    // Show loading indicator
    if (elementExists(loadingIndicator)) {
        loadingIndicator.style.display = 'block';
    }

    // Fetch stations from API
    fetch('/api/water_level_stations')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            // Hide loading indicator
            if (elementExists(loadingIndicator)) {
                loadingIndicator.style.display = 'none';
            }

            // Store stations globally
            waterLevelStations = data.stations || [];

            // Display stations on the map
            displayStations(waterLevelStations);
        })
        .catch(error => {
            console.error('Error fetching water level stations:', error);

            // Hide loading indicator
            if (elementExists(loadingIndicator)) {
                loadingIndicator.style.display = 'none';
            }

            alert(`Error fetching water level stations: ${error.message}`);
        });
}

// Function to display water level stations on the map
function displayStations(stations) {
    // Clear previous stations
    stationsLayer.clearLayers();

    // Add each station to the map
    stations.forEach(station => {
        if (station.coordinates && station.coordinates.length === 2) {
            const [lon, lat] = station.coordinates;

            // Create marker
            const marker = L.circleMarker([lat, lon], {
                radius: 5,
                fillColor: '#0066ff',
                color: '#003399',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
            });

            // Add popup
            marker.bindPopup(`
                <div class="station-popup">
                    <h6>${station.name}</h6>
                    <p><strong>Station ID:</strong> ${station.stationId}</p>
                    <p><strong>Available parameters:</strong> ${station.parameterId.join(', ')}</p>
                </div>
            `);

            // Add to layer
            stationsLayer.addLayer(marker);
        }
    });

    // Adjust map view if needed
    if (stationsLayer.getLayers().length > 0 && map.getZoom() < 7) {
        map.fitBounds(stationsLayer.getBounds());
    }
}

// Main search function that can be called with pagination parameters
function performSearch(page = 1) {
    // Show loading state
    searchButton.disabled = true;
    searchButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Searching...';

    // Show loading indicator
    if (elementExists(loadingIndicator)) {
        loadingIndicator.style.display = 'block';
    }

    // Hide results button (will show again when results are ready)
    if (elementExists(resultsButton)) {
        resultsButton.style.display = 'none';
    }

    // Update current page in search state
    searchState.currentPage = page;

    // Prepare search parameters
    const searchParams = {
        geometry: searchState.geometry,
        start_date: searchState.startDate,
        end_date: searchState.endDate,
        max_cloud_coverage: searchState.maxCloudCoverage,
        page: searchState.currentPage,
        limit: searchState.resultsPerPage,
        sort_by: searchState.sortBy,
        sort_direction: searchState.sortDirection
    };

    // Call the API to search for images
    fetch('/api/search_images', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(searchParams)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
        }
        return response.json();
    })
    .then(data => {
        // Reset button state
        searchButton.disabled = false;
        searchButton.textContent = 'Search for Images';

        // Hide loading indicator
        if (elementExists(loadingIndicator)) {
            loadingIndicator.style.display = 'none';
        }

        // Store the results globally
        searchResults = data.images || [];

        // Update pagination state
        if (data.pagination) {
            searchState.totalResults = data.pagination.total;
            searchState.hasNextPage = data.pagination.next;
            searchState.hasPrevPage = data.pagination.prev;

            // Update the pagination UI
            updatePagination(data.pagination);
        }

        // Display results count and show results button
        updateResultsButton(searchResults.length, searchState.totalResults);

        // Clear and populate results table
        populateResultsTable(searchResults);

        // If we're in the results modal, update the modal content directly
        const resultsModal = document.getElementById('resultsModal');
        if (resultsModal && resultsModal.classList.contains('show')) {
            // The modal is open, update the counts
            const resultsModalCount = document.getElementById('resultsModalCount');
            if (resultsModalCount) {
                resultsModalCount.textContent = `${searchState.totalResults} images (showing ${searchState.currentPage * searchState.resultsPerPage - searchState.resultsPerPage + 1}-${Math.min(searchState.currentPage * searchState.resultsPerPage, searchState.totalResults)})`;
            }
        }
    })
    .catch(error => {
        console.error('Error:', error);

        // Reset button state
        searchButton.disabled = false;
        searchButton.textContent = 'Search for Images';

        // Hide loading indicator
        if (elementExists(loadingIndicator)) {
            loadingIndicator.style.display = 'none';
        }

        alert(`An error occurred while searching for images: ${error.message}`);
    });
}

// Handle search button click
searchButton.addEventListener('click', function() {
    const selectedType = document.querySelector('input[name="geometryType"]:checked').value;
    let geometry = null;

    if (selectedType === 'draw') {
        if (drawnItems.getLayers().length === 0) {
            alert('Please draw a polygon or rectangle on the map first.');
            return;
        }

        const layer = drawnItems.getLayers()[0];
        geometry = layer.toGeoJSON().geometry;
    } else if (selectedType === 'import') {
        const wktText = document.getElementById('wktInput').value.trim();
        const fileInput = document.getElementById('fileInput');

        if (!wktText && (!fileInput || !fileInput.files.length)) {
            alert('Please select a file or paste WKT.');
            return;
        }

        // If using WKT, send it for processing
        if (wktText) {
            // This would require a server-side WKT parser
            alert('WKT parsing is not implemented yet. Please draw on the map instead.');
            return;
        } else if (fileInput && fileInput.files.length) {
            // Handle file processing via FormData
            alert('File import is not implemented yet. Please draw on the map instead.');
            return;
        }
    }

    // Get date range and cloud coverage
    let startDate = null;
    let endDate = null;
    let maxCloudCoverage = 20;

    if (elementExists(dateFromInput) && elementExists(dateToInput)) {
        startDate = dateFromInput.value;
        endDate = dateToInput.value;
    }

    if (elementExists(cloudCoverageSlider)) {
        maxCloudCoverage = parseInt(cloudCoverageSlider.value);
    }

    // Get results per page if the element exists
    if (elementExists(resultsPerPageSelect)) {
        searchState.resultsPerPage = parseInt(resultsPerPageSelect.value);
    }

    // Update search state
    searchState.geometry = geometry;
    searchState.startDate = startDate;
    searchState.endDate = endDate;
    searchState.maxCloudCoverage = maxCloudCoverage;
    searchState.currentPage = 1; // Reset to page 1 for a new search

    // Perform the search
    performSearch(1);
});

// Function to update the results button
function updateResultsButton(count, totalCount = null) {
    if (count > 0) {
        // Display the count differently based on whether we have pagination
        if (totalCount && totalCount > count) {
            // For paginated results, show total and current page info
            const start = (searchState.currentPage - 1) * searchState.resultsPerPage + 1;
            const end = Math.min(searchState.currentPage * searchState.resultsPerPage, totalCount);
            resultsCount.textContent = `${totalCount} (showing ${start}-${end})`;
        } else {
            // Without pagination or on a single page
            resultsCount.textContent = count;
        }

        resultsButton.style.display = 'block';

        // Also update the count in the modal header
        const modalCount = document.getElementById('resultsModalCount');
        if (modalCount) {
            if (totalCount && totalCount > count) {
                const start = (searchState.currentPage - 1) * searchState.resultsPerPage + 1;
                const end = Math.min(searchState.currentPage * searchState.resultsPerPage, totalCount);
                modalCount.textContent = `${totalCount} images (showing ${start}-${end})`;
            } else {
                modalCount.textContent = count + ' images';
            }
        }

        // Add export functionality
        const exportBtn = document.getElementById('exportResultsBtn');
        if (exportBtn) {
            // Remove previous event listeners to avoid duplicates
            exportBtn.replaceWith(exportBtn.cloneNode(true));

            // Get the new element reference after cloning
            const newExportBtn = document.getElementById('exportResultsBtn');
            if (newExportBtn) {
                newExportBtn.addEventListener('click', exportResults);
            }
        }
    } else {
        resultsButton.style.display = 'none';
        // Show a message for no results
        alert('No images found for the selected area and time period.');
    }
}

// Function to create and update pagination controls
function updatePagination(paginationData) {
    if (!elementExists(paginationContainer)) {
        return;
    }

    // Clear existing pagination
    paginationContainer.innerHTML = '';

    // Calculate total pages
    const totalPages = Math.ceil(paginationData.total / paginationData.limit);

    // Don't show pagination if only one page
    if (totalPages <= 1) {
        return;
    }

    // Create the pagination element
    const paginationNav = document.createElement('nav');
    paginationNav.setAttribute('aria-label', 'Search results pagination');

    const paginationUl = document.createElement('ul');
    paginationUl.className = 'pagination justify-content-center';

    // Previous button
    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${!paginationData.prev ? 'disabled' : ''}`;

    const prevLink = document.createElement('a');
    prevLink.className = 'page-link';
    prevLink.href = '#';
    prevLink.innerHTML = '&laquo;';
    prevLink.setAttribute('aria-label', 'Previous');

    if (paginationData.prev) {
        prevLink.addEventListener('click', function(e) {
            e.preventDefault();
            performSearch(paginationData.page - 1);
        });
    }

    prevLi.appendChild(prevLink);
    paginationUl.appendChild(prevLi);

    // Page numbers - we'll show up to 5 page numbers
    const maxVisiblePages = 5;
    let startPage = Math.max(1, paginationData.page - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    // Adjust if we're near the end
    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    // Add ellipsis at the beginning if needed
    if (startPage > 1) {
        const ellipsisStart = document.createElement('li');
        ellipsisStart.className = 'page-item disabled';
        const ellipsisStartLink = document.createElement('a');
        ellipsisStartLink.className = 'page-link';
        ellipsisStartLink.href = '#';
        ellipsisStartLink.textContent = '...';
        ellipsisStart.appendChild(ellipsisStartLink);
        paginationUl.appendChild(ellipsisStart);
    }

    // Add page numbers
    for (let i = startPage; i <= endPage; i++) {
        const pageLi = document.createElement('li');
        pageLi.className = `page-item ${i === paginationData.page ? 'active' : ''}`;

        const pageLink = document.createElement('a');
        pageLink.className = 'page-link';
        pageLink.href = '#';
        pageLink.textContent = i;

        if (i !== paginationData.page) {
            pageLink.addEventListener('click', function(e) {
                e.preventDefault();
                performSearch(i);
            });
        }

        pageLi.appendChild(pageLink);
        paginationUl.appendChild(pageLi);
    }

    // Add ellipsis at the end if needed
    if (endPage < totalPages) {
        const ellipsisEnd = document.createElement('li');
        ellipsisEnd.className = 'page-item disabled';
        const ellipsisEndLink = document.createElement('a');
        ellipsisEndLink.className = 'page-link';
        ellipsisEndLink.href = '#';
        ellipsisEndLink.textContent = '...';
        ellipsisEnd.appendChild(ellipsisEndLink);
        paginationUl.appendChild(ellipsisEnd);
    }

    // Next button
    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${!paginationData.next ? 'disabled' : ''}`;

    const nextLink = document.createElement('a');
    nextLink.className = 'page-link';
    nextLink.href = '#';
    nextLink.innerHTML = '&raquo;';
    nextLink.setAttribute('aria-label', 'Next');

    if (paginationData.next) {
        nextLink.addEventListener('click', function(e) {
            e.preventDefault();
            performSearch(paginationData.page + 1);
        });
    }

    nextLi.appendChild(nextLink);
    paginationUl.appendChild(nextLi);

    // Add to the container
    paginationNav.appendChild(paginationUl);
    paginationContainer.appendChild(paginationNav);
}

// Export results as CSV - now supports pagination
function exportResults() {
    if (!searchResults || searchResults.length === 0) {
        alert('No results to export');
        return;
    }

    // Show loading indicator
    if (elementExists(loadingIndicator)) {
        loadingIndicator.style.display = 'block';
    }

    // If we have pagination and there are more results than what's currently loaded,
    // we'll need to fetch all results for the export
    if (searchState.totalResults > searchResults.length) {
        const confirmed = confirm(`You are about to export all ${searchState.totalResults} results, which may take some time. Continue?`);
        if (!confirmed) {
            if (elementExists(loadingIndicator)) {
                loadingIndicator.style.display = 'none';
            }
            return;
        }

        // We'll need to fetch all pages
        fetchAllPagesForExport();
        return;
    }

    // If we're here, we can just export the current results
    exportToCSV(searchResults);

    // Hide loading indicator
    if (elementExists(loadingIndicator)) {
        loadingIndicator.style.display = 'none';
    }
}

// Function to fetch all pages for export
function fetchAllPagesForExport() {
    // Create a copy of the search state with a large limit to minimize requests
    const exportSearchParams = {
        geometry: searchState.geometry,
        start_date: searchState.startDate,
        end_date: searchState.endDate,
        max_cloud_coverage: searchState.maxCloudCoverage,
        page: 1,
        limit: 1000, // Maximum allowed by the API
        sort_by: searchState.sortBy,
        sort_direction: searchState.sortDirection
    };

    let allResults = [];
    let currentPage = 1;
    let hasNextPage = true;

    // Define the recursive function to fetch pages
    function fetchNextPage() {
        exportSearchParams.page = currentPage;

        fetch('/api/search_images', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(exportSearchParams)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            // Add the images from this page to our collection
            allResults = allResults.concat(data.images || []);

            // Check if there are more pages
            hasNextPage = data.pagination && data.pagination.next;

            if (hasNextPage) {
                // If there are more pages, fetch the next one
                currentPage++;
                fetchNextPage();
            } else {
                // If no more pages, export the results
                exportToCSV(allResults);

                // Hide loading indicator
                if (elementExists(loadingIndicator)) {
                    loadingIndicator.style.display = 'none';
                }
            }
        })
        .catch(error => {
            console.error('Error fetching all pages:', error);
            alert(`Error fetching all results for export: ${error.message}`);

            // Hide loading indicator
            if (elementExists(loadingIndicator)) {
                loadingIndicator.style.display = 'none';
            }
        });
    }

    // Start fetching pages
    fetchNextPage();
}

// Function to export results to CSV
function exportToCSV(results) {
    // Create CSV content
    let csvContent = 'data:text/csv;charset=utf-8,';

    // Add header row - now with water level columns
    csvContent += 'ID,Date,Cloud Coverage,Sun Elevation,Sun Azimuth,Water Level,Station ID,Station Name,Preview URL\n';

    // Add data rows
    results.forEach(image => {
        // Extract water level data if available
        const waterLevel = image.waterLevel ? image.waterLevel.value : '';
        const stationId = image.waterLevel ? image.waterLevel.stationId : '';
        const stationName = image.waterLevel ? image.waterLevel.stationName : '';

        const row = [
            image.id,
            image.date,
            image.cloudCoverage,
            image.sun_elevation || '',
            image.sun_azimuth || '',
            waterLevel,
            stationId,
            stationName,
            image.preview_url || ''
        ];

        // Escape any fields with commas by wrapping in quotes
        const escapedRow = row.map(field => {
            if (field && field.toString().includes(',')) {
                return `"${field}"`;
            }
            return field;
        });

        csvContent += escapedRow.join(',') + '\n';
    });

    // Create download link
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'sentinel_search_results.csv');
    document.body.appendChild(link);

    // Trigger download
    link.click();

    // Clean up
    document.body.removeChild(link);
}

// Function to populate the results table
function populateResultsTable(images) {
    // Clear previous results
    resultsTableBody.innerHTML = '';

    // Check if we have any images
    if (!images || images.length === 0) {
        return;
    }

    // Add each image to the table
    images.forEach((image, index) => {
        // Format date
        let dateDisplay = 'Unknown date';
        try {
            const date = new Date(image.date);
            dateDisplay = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        } catch (e) {
            console.error('Error formatting date:', e);
        }

        // Format water level data if available
        let waterLevelDisplay = '<span class="text-muted">Not available</span>';
        if (image.waterLevel && image.waterLevel.value !== null) {
            waterLevelDisplay = `
                <span class="badge bg-info">
                    ${parseFloat(image.waterLevel.value).toFixed(1)} cm
                </span>
                <small class="d-block text-muted">
                    Station: ${image.waterLevel.stationName || image.waterLevel.stationId}
                </small>
            `;
        } else if (image.waterLevel && image.waterLevel.stationId) {
            waterLevelDisplay = `
                <span class="text-muted">No data</span>
                <small class="d-block text-muted">
                    Station: ${image.waterLevel.stationName || image.waterLevel.stationId}
                </small>
            `;
        }

        // Create table row
        const row = document.createElement('tr');

        // Create cells
        row.innerHTML = `
            <td>
                ${image.preview_url
                    ? `<img src="${image.preview_url}" class="preview-thumbnail"
                         alt="Preview" onclick="showPreview('${image.preview_url}', '${image.id}')">`
                    : '<div class="text-center text-muted"><i class="bi bi-image"></i> No preview</div>'
                }
            </td>
            <td title="${image.id}">${truncateText(image.id, 20)}</td>
            <td>${dateDisplay}</td>
            <td>${image.cloudCoverage}%</td>
            <td>${waterLevelDisplay}</td>
            <td>
                <div class="btn-group">
                    <button class="btn btn-sm btn-outline-primary view-details-btn" data-image-id="${image.id}">
                        <i class="bi bi-info-circle"></i> Details
                    </button>
                    <button class="btn btn-sm btn-outline-success download-btn" data-image-id="${image.id}">
                        <i class="bi bi-download"></i> Download
                    </button>
                </div>
            </td>
        `;

        resultsTableBody.appendChild(row);
    });

    // Add event listeners to the buttons
    document.querySelectorAll('.download-btn').forEach(button => {
        button.addEventListener('click', function() {
            const imageId = this.getAttribute('data-image-id');
            showDownloadOptions(imageId);
        });
    });

    document.querySelectorAll('.view-details-btn').forEach(button => {
        button.addEventListener('click', function() {
            const imageId = this.getAttribute('data-image-id');
            viewImageDetails(imageId);
        });
    });
}

// Helper function to truncate text with ellipsis
function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
}

// Function to show image preview in modal
function showPreview(url, imageId) {
    // Set the image source
    if (elementExists(previewImage)) {
        previewImage.src = url;

        // Set the modal title
        const previewModalLabel = document.getElementById('previewModalLabel');
        if (previewModalLabel) {
            previewModalLabel.textContent = `Preview: ${imageId}`;
        }

        // Show the modal
        const previewModal = new bootstrap.Modal(document.getElementById('previewModal'));
        previewModal.show();
    }
}

// Make the showPreview function globally available
window.showPreview = showPreview;

// Function to open full-size image in a modal (preserved for backward compatibility)
function openFullSizeImage(url) {
    showPreview(url, 'Image');
}

// Make the openFullSizeImage function globally available
window.openFullSizeImage = openFullSizeImage;

// Function to toggle fullscreen for preview image
function toggleFullscreen() {
    const imageModal = document.getElementById('previewModal');

    if (!document.fullscreenElement) {
        // If not in fullscreen mode, enter fullscreen
        if (imageModal.requestFullscreen) {
            imageModal.requestFullscreen();
        } else if (imageModal.webkitRequestFullscreen) { /* Safari */
            imageModal.webkitRequestFullscreen();
        } else if (imageModal.msRequestFullscreen) { /* IE11 */
            imageModal.msRequestFullscreen();
        }
    } else {
        // If in fullscreen mode, exit fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) { /* Safari */
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) { /* IE11 */
            document.msExitFullscreen();
        }
    }
}

// Make toggleFullscreen function globally available
window.toggleFullscreen = toggleFullscreen;

// Function to show download options for an image
function showDownloadOptions(imageId) {
    // Fetch download links
    fetch(`/api/download_links/${imageId}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            // Create modal content
            let modalContent = `
                <div class="modal fade" id="downloadModal" tabindex="-1" aria-hidden="true">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">Download Options for ${imageId}</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body">
            `;

            // Add links for each band
            const links = data.links;
            if (Object.keys(links).length === 0) {
                modalContent += `<p>No download links available for this image.</p>`;
            } else {
                modalContent += `<h6>Available Bands:</h6><ul class="list-group">`;
                for (const [band, url] of Object.entries(links)) {
                    modalContent += `
                        <li class="list-group-item d-flex justify-content-between align-items-center">
                            ${band}
                            <a href="${url}" target="_blank" class="btn btn-sm btn-outline-primary">
                                <i class="bi bi-download"></i> Download
                            </a>
                        </li>
                    `;
                }
                modalContent += `</ul>`;
            }

            modalContent += `
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Add modal to document
            const modalContainer = document.createElement('div');
            modalContainer.innerHTML = modalContent;
            document.body.appendChild(modalContainer);

            // Show the modal
            const modal = new bootstrap.Modal(document.getElementById('downloadModal'));
            modal.show();

            // Remove modal from DOM after it's hidden
            document.getElementById('downloadModal').addEventListener('hidden.bs.modal', function () {
                document.body.removeChild(modalContainer);
            });
        })
        .catch(error => {
            console.error('Error fetching download links:', error);
            alert(`Error fetching download links: ${error.message}`);
        });
}

// Function to view image details
function viewImageDetails(imageId) {
    // Fetch image details
    fetch(`/api/image_details/${imageId}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(details => {
            // Find water level data
            const waterLevel = details.properties?.waterLevel || null;

            // Create modal to display the details
            let modalContent = `
                <div class="modal fade" id="detailsModal" tabindex="-1" aria-hidden="true">
                    <div class="modal-dialog modal-lg modal-dialog-scrollable">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">Details for ${imageId}</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body">
                                <ul class="nav nav-tabs" id="detailTabs" role="tablist">
                                    <li class="nav-item" role="presentation">
                                        <button class="nav-link active" id="summary-tab" data-bs-toggle="tab" data-bs-target="#summary" type="button" role="tab">Summary</button>
                                    </li>
                                    <li class="nav-item" role="presentation">
                                        <button class="nav-link" id="waterLevel-tab" data-bs-toggle="tab" data-bs-target="#waterLevel" type="button" role="tab">Water Level</button>
                                    </li>
                                    <li class="nav-item" role="presentation">
                                        <button class="nav-link" id="properties-tab" data-bs-toggle="tab" data-bs-target="#properties" type="button" role="tab">Properties</button>
                                    </li>
                                    <li class="nav-item" role="presentation">
                                        <button class="nav-link" id="assets-tab" data-bs-toggle="tab" data-bs-target="#assets" type="button" role="tab">Assets</button>
                                    </li>
                                    <li class="nav-item" role="presentation">
                                        <button class="nav-link" id="json-tab" data-bs-toggle="tab" data-bs-target="#json" type="button" role="tab">Raw JSON</button>
                                    </li>
                                </ul>
                                <div class="tab-content pt-3" id="detailTabsContent">
                                    <!-- Summary Tab -->
                                    <div class="tab-pane fade show active" id="summary" role="tabpanel">
                                        <div class="row">
                                            <div class="col-md-6">
                                                <h6>Basic Information</h6>
                                                <table class="table table-sm">
                                                    <tbody>
                                                        <tr>
                                                            <th scope="row">ID</th>
                                                            <td>${details.id || 'N/A'}</td>
                                                        </tr>
                                                        <tr>
                                                            <th scope="row">Date</th>
                                                            <td>${details.properties?.datetime || 'N/A'}</td>
                                                        </tr>
                                                        <tr>
                                                            <th scope="row">Cloud Cover</th>
                                                            <td>${details.properties?.['eo:cloud_cover'] !== undefined ? details.properties['eo:cloud_cover'] + '%' : 'N/A'}</td>
                                                        </tr>
                                                        <tr>
                                                            <th scope="row">Platform</th>
                                                            <td>${details.properties?.platform || 'N/A'}</td>
                                                        </tr>
                                                        <tr>
                                                            <th scope="row">Instrument</th>
                                                            <td>${details.properties?.instrument || 'N/A'}</td>
                                                        </tr>
                                                        ${waterLevel ? `
                                                        <tr>
                                                            <th scope="row">Water Level</th>
                                                            <td>${waterLevel.value !== null ? `${parseFloat(waterLevel.value).toFixed(1)} cm` : 'Not available'}</td>
                                                        </tr>
                                                        <tr>
                                                            <th scope="row">Station</th>
                                                            <td>${waterLevel.stationName || waterLevel.stationId || 'N/A'}</td>
                                                        </tr>` : ''}
                                                    </tbody>
                                                </table>
                                            </div>
                                            <div class="col-md-6">
                                                ${details.assets?.preview?.href ?
                                                    `<img src="${details.assets.preview.href}" class="img-fluid rounded" alt="Preview"
                                                         onclick="showPreview('${details.assets.preview.href}', '${details.id}')">` :
                                                    details.assets?.thumbnail?.href ?
                                                    `<img src="${details.assets.thumbnail.href}" class="img-fluid rounded" alt="Thumbnail"
                                                         onclick="showPreview('${details.assets.thumbnail.href}', '${details.id}')">` :
                                                    details.assets?.overview?.href ?
                                                    `<img src="${details.assets.overview.href}" class="img-fluid rounded" alt="Overview"
                                                         onclick="showPreview('${details.assets.overview.href}', '${details.id}')">` :
                                                    '<div class="alert alert-info">No preview available</div>'
                                                }
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Water Level Tab -->
                                    <div class="tab-pane fade" id="waterLevel" role="tabpanel">
                                        ${waterLevel ? `
                                        <div class="row">
                                            <div class="col-md-8">
                                                <div class="card">
                                                    <div class="card-header">
                                                        <h6 class="mb-0">Water Level Data</h6>
                                                    </div>
                                                    <div class="card-body">
                                                        <table class="table table-sm">
                                                            <tbody>
                                                                <tr>
                                                                    <th scope="row">Value</th>
                                                                    <td>${waterLevel.value !== null ? `${parseFloat(waterLevel.value).toFixed(1)} cm (${waterLevel.parameterId})` : 'Not available'}</td>
                                                                </tr>
                                                                <tr>
                                                                    <th scope="row">Observation Time</th>
                                                                    <td>${waterLevel.observed || 'N/A'}</td>
                                                                </tr>
                                                                <tr>
                                                                    <th scope="row">Station ID</th>
                                                                    <td>${waterLevel.stationId || 'N/A'}</td>
                                                                </tr>
                                                                <tr>
                                                                    <th scope="row">Station Name</th>
                                                                    <td>${waterLevel.stationName || 'N/A'}</td>
                                                                </tr>
                                                                <tr>
                                                                    <th scope="row">QC Status</th>
                                                                    <td>${waterLevel.qcStatus || 'N/A'}</td>
                                                                </tr>
                                                                <tr>
                                                                    <th scope="row">Distance from Image Center</th>
                                                                    <td>${waterLevel.stationDistance ? (waterLevel.stationDistance * 111).toFixed(2) + ' km (approx.)' : 'N/A'}</td>
                                                                </tr>
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                                <div class="alert alert-info mt-3">
                                                    <small>
                                                        <i class="bi bi-info-circle"></i> Water level data is provided from the nearest DMI station at the time of satellite image acquisition.
                                                        The station may be located some distance from the image center, so consider this when analyzing coastal changes.
                                                    </small>
                                                </div>
                                            </div>
                                            <div class="col-md-4">
                                                <div class="card">
                                                    <div class="card-header">
                                                        <h6 class="mb-0">About Water Level Data</h6>
                                                    </div>
                                                    <div class="card-body">
                                                        <p class="small">
                                                            <strong>Parameter ID:</strong> ${waterLevel.parameterId || 'N/A'}<br>
                                                            <strong>DVR90:</strong> Danish Vertical Reference 1990, which is a height reference system used in Denmark.
                                                        </p>
                                                        <hr>
                                                        <p class="small">
                                                            Water level is measured in centimeters relative to the DVR90 reference system.
                                                            Positive values indicate water levels above the reference, while negative values indicate levels below.
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        ` : `
                                        <div class="alert alert-warning">
                                            <h6><i class="bi bi-exclamation-triangle me-2"></i>No Water Level Data</h6>
                                            <p>Water level data is not available for this image. This could be because:</p>
                                            <ul>
                                                <li>No water level station was found near the image location</li>
                                                <li>The nearest station does not have data for the image acquisition time</li>
                                                <li>The DMI API key has not been configured</li>
                                            </ul>
                                        </div>
                                        `}
                                    </div>

                                    <!-- Properties Tab -->
                                    <div class="tab-pane fade" id="properties" role="tabpanel">
                                        <table class="table table-sm table-striped">
                                            <thead>
                                                <tr>
                                                    <th>Property</th>
                                                    <th>Value</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${Object.entries(details.properties || {}).map(([key, value]) => `
                                                    <tr>
                                                        <td><code>${key}</code></td>
                                                        <td>${typeof value === 'object' ? JSON.stringify(value) : value}</td>
                                                    </tr>
                                                `).join('')}
                                            </tbody>
                                        </table>
                                    </div>

                                    <!-- Assets Tab -->
                                    <div class="tab-pane fade" id="assets" role="tabpanel">
                                        <table class="table table-sm table-striped">
                                            <thead>
                                                <tr>
                                                    <th>Asset</th>
                                                    <th>Type</th>
                                                    <th>Description</th>
                                                    <th>Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${Object.entries(details.assets || {}).map(([key, asset]) => `
                                                    <tr>
                                                        <td><code>${key}</code></td>
                                                        <td>${asset.type || 'N/A'}</td>
                                                        <td>${asset.description || 'N/A'}</td>
                                                        <td>
                                                            ${asset.href ?
                                                                `<a href="${asset.href}" target="_blank" class="btn btn-sm btn-outline-primary">
                                                                    <i class="bi bi-box-arrow-up-right"></i> Open
                                                                </a>` : 'N/A'
                                                            }
                                                        </td>
                                                    </tr>
                                                `).join('')}
                                            </tbody>
                                        </table>
                                    </div>

                                    <!-- Raw JSON Tab -->
                                    <div class="tab-pane fade" id="json" role="tabpanel">
                                        <pre class="bg-light p-3 rounded"><code>${JSON.stringify(details, null, 2)}</code></pre>
                                    </div>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Add modal to document
            const modalContainer = document.createElement('div');
            modalContainer.innerHTML = modalContent;
            document.body.appendChild(modalContainer);

            // Show the modal
            const modal = new bootstrap.Modal(document.getElementById('detailsModal'));
            modal.show();

            // Remove modal from DOM after it's hidden
            document.getElementById('detailsModal').addEventListener('hidden.bs.modal', function () {
                document.body.removeChild(modalContainer);
            });
        })
        .catch(error => {
            console.error('Error fetching image details:', error);
            alert(`Error fetching image details: ${error.message}`);
        });
}

// Function to visualize a geometry on the map
function visualizeGeometry(geometry) {
    if (!geometry) return;

    // Clear previous geometries
    drawnItems.clearLayers();

    // Create a GeoJSON layer and add it to the map
    const geoJsonLayer = L.geoJSON(geometry, {
        style: {
            color: '#3388ff',
            weight: 3,
            fillOpacity: 0.2
        }
    });

    // Add the layer to the feature group
    drawnItems.addLayer(geoJsonLayer);

    // Zoom to the geometry bounds
    map.fitBounds(geoJsonLayer.getBounds());
}