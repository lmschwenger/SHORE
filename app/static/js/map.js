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
const loadingIndicator = document.querySelector('.loading');
const resultsContainer = document.getElementById('results');
const imagesList = document.getElementById('imagesList');
const dateFromInput = document.getElementById('dateFrom');
const dateToInput = document.getElementById('dateTo');
const cloudCoverageSlider = document.getElementById('cloudCoverage');
const cloudCoverageValue = document.getElementById('cloudCoverageValue');

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

        // Display results
        displayResults(data.images);
    })
    .catch(error => {
        console.error('Error:', error);

        // Reset button state
        searchButton.disabled = false;
        searchButton.textContent = 'Search for Images';

        alert(`An error occurred while searching for images: ${error.message}`);
    });
});

// Function to display results
function displayResults(images) {
    // Clear previous results
    imagesList.innerHTML = '';

    // Check if we have any images
    if (!images || images.length === 0) {
        imagesList.innerHTML = '<div class="alert alert-info">No images found for the selected area and time period.</div>';
        resultsContainer.style.display = 'block';
        return;
    }

    // Sort images by date (newest first)
    images.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Display result count
    imagesList.innerHTML = `<div class="alert alert-success mb-3">Found ${images.length} images</div>`;

    // Display each image
    images.forEach(image => {
        const imageItem = document.createElement('div');
        imageItem.className = 'card mb-3 image-item';

        // Format date
        let dateDisplay = 'Unknown date';
        try {
            const date = new Date(image.date);
            dateDisplay = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        } catch (e) {
            console.error('Error formatting date:', e);
        }

        // Create image info
        imageItem.innerHTML = `
            <div class="card-body">
                <h4 class="card-title">${image.id}</h4>
                <div class="image-preview mb-3">
                    ${image.preview_url
                        ? `<img src="${image.preview_url}" class="img-fluid rounded" alt="Preview" onclick="openFullSizeImage('${image.preview_url}')">`
                        : '<div class="alert alert-info">No preview available</div>'
                    }
                </div>
                <div class="image-metadata">
                    <table class="table table-sm">
                        <tbody>
                            <tr>
                                <th scope="row">Date</th>
                                <td>${dateDisplay}</td>
                            </tr>
                            <tr>
                                <th scope="row">Cloud Cover</th>
                                <td>${image.cloudCoverage}%</td>
                            </tr>
                            <tr>
                                <th scope="row">Available Bands</th>
                                <td>${image.bands.join(', ')}</td>
                            </tr>
                            ${image.sun_elevation ? `
                            <tr>
                                <th scope="row">Sun Elevation</th>
                                <td>${image.sun_elevation.toFixed(2)}°</td>
                            </tr>` : ''}
                            ${image.sun_azimuth ? `
                            <tr>
                                <th scope="row">Sun Azimuth</th>
                                <td>${image.sun_azimuth.toFixed(2)}°</td>
                            </tr>` : ''}
                        </tbody>
                    </table>
                </div>
                <div class="btn-group w-100 mt-2">
                    <button class="btn btn-sm btn-primary view-details-btn" data-image-id="${image.id}">
                        <i class="bi bi-info-circle"></i> View Details
                    </button>
                    <button class="btn btn-sm btn-success download-btn" data-image-id="${image.id}">
                        <i class="bi bi-download"></i> Download
                    </button>
                </div>
            </div>
        `;

        imagesList.appendChild(imageItem);
    });

    // Show the results container
    resultsContainer.style.display = 'block';

    // Add event listeners to buttons
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

// Function to open full-size image in a modal
function openFullSizeImage(url) {
    // Create modal
    const modalHtml = `
        <div class="modal fade" id="imageModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-xl">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Full Size Preview</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body text-center">
                        <img src="${url}" class="img-fluid" alt="Full size preview">
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Add modal to the DOM
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHtml;
    document.body.appendChild(modalContainer);

    // Show the modal
    const modal = new bootstrap.Modal(document.getElementById('imageModal'));
    modal.show();

    // Remove modal from DOM after it's hidden
    document.getElementById('imageModal').addEventListener('hidden.bs.modal', function () {
        document.body.removeChild(modalContainer);
    });
}

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
                                                    `<img src="${details.assets.preview.href}" class="img-fluid rounded" alt="Preview">` :
                                                    details.assets?.thumbnail?.href ?
                                                    `<img src="${details.assets.thumbnail.href}" class="img-fluid rounded" alt="Thumbnail">` :
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