// Initialize the map centered on Denmark
const map = L.map('map').setView([56.0, 10.0], 6);

// Add OpenStreetMap tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Initialize feature group to store drawn items
const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

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

// Store search results globally
let searchResults = [];

// Function to check if elements exist in the DOM
function elementExists(element) {
    return element !== null && element !== undefined;
}

// Show/hide appropriate options based on selected geometry type
function toggleOptions() {
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

    // Show loading state
    searchButton.disabled = true;
    searchButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Searching...';

    // Hide results button (will show again when results are ready)
    resultsButton.style.display = 'none';

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

    // Prepare search parameters
    const searchParams = {
        geometry: geometry,
        start_date: startDate,
        end_date: endDate,
        max_cloud_coverage: maxCloudCoverage
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

        // Store the results globally
        searchResults = data.images || [];

        // Display results count and show results button
        updateResultsButton(searchResults.length);

        // Clear and populate results table
        populateResultsTable(searchResults);
    })
    .catch(error => {
        console.error('Error:', error);

        // Reset button state
        searchButton.disabled = false;
        searchButton.textContent = 'Search for Images';

        alert(`An error occurred while searching for images: ${error.message}`);
    });
});

// Function to update the results button
function updateResultsButton(count) {
    if (count > 0) {
        resultsCount.textContent = count;
        resultsButton.style.display = 'block';

        // Also update the count in the modal header
        const modalCount = document.getElementById('resultsModalCount');
        if (modalCount) {
            modalCount.textContent = count + ' images';
        }

        // Add export functionality
        const exportBtn = document.getElementById('exportResultsBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportResults);
        }
    } else {
        resultsButton.style.display = 'none';
        // Show a message for no results
        alert('No images found for the selected area and time period.');
    }
}

// Function to export results as CSV
function exportResults() {
    if (!searchResults || searchResults.length === 0) {
        alert('No results to export');
        return;
    }

    // Create CSV content
    let csvContent = 'data:text/csv;charset=utf-8,';

    // Add header row
    csvContent += 'ID,Date,Cloud Coverage,Sun Elevation,Sun Azimuth,Preview URL\n';

    // Add data rows
    searchResults.forEach(image => {
        const row = [
            image.id,
            image.date,
            image.cloudCoverage,
            image.sun_elevation || '',
            image.sun_azimuth || '',
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

    // Sort images by date (newest first)
    images.sort((a, b) => new Date(b.date) - new Date(a.date));

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