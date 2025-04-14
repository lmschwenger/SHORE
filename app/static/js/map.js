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

// Function to check if elements exist in the DOM
function elementExists(element) {
    return element !== null && element !== undefined;
}

// Show/hide appropriate options based on selected geometry type
function toggleOptions() {
    const selectedType = document.querySelector('input[name="geometryType"]:checked').value;
    const drawInstructions = document.getElementById('drawInstructions');
    const importOptions = document.getElementById('importOptions');

    if (selectedType === 'draw') {
        // Only modify style if element exists
        if (elementExists(drawInstructions)) {
            drawInstructions.style.display = 'block';
        }

        if (elementExists(importOptions)) {
            importOptions.style.display = 'none';
        }

        // Make sure draw control is enabled
        if (!map.drawControl) {
            map.addControl(drawControl);
        }
    } else if (selectedType === 'import') {
        // Only modify style if element exists
        if (elementExists(drawInstructions)) {
            drawInstructions.style.display = 'none';
        }

        if (elementExists(importOptions)) {
            importOptions.style.display = 'block';
        }

        // Optionally, remove draw control when import is selected
        if (map.drawControl) {
            map.removeControl(drawControl);
        }
    }
}

// Initialize the options display
toggleOptions();

// Add event listeners to the radio buttons
geometryTypeRadios.forEach(function(radio) {
    radio.addEventListener('change', toggleOptions);
});

// app/static/js/map.js - Update the search button handler

// Handle search button click
// Modify the search button event handler in app/static/js/map.js

// Handle search button click
searchButton.addEventListener('click', function() {
    const selectedType = document.querySelector('input[name="geometryType"]:checked').value;
    let geometry = null;

    if (selectedType === 'draw') {
        if (drawnItems.getLayers().length === 0) {
            alert('Please draw a polygon on the map first.');
            return;
        }

        const layer = drawnItems.getLayers()[0];
        geometry = layer.toGeoJSON().geometry;
    } else if (selectedType === 'import') {
        const wktText = document.getElementById('wktInput').value.trim();
        const fileInput = document.getElementById('fileInput');

        if (!wktText && !fileInput.files.length) {
            alert('Please select a file or paste WKT.');
            return;
        }

        // If using WKT, send it for processing
        if (wktText) {
            // We'll handle this in the backend
            // For now, just show loading state
        } else {
            // Handle file processing via FormData
            const fileFormat = document.getElementById('fileFormat').value;
            const file = fileInput.files[0];

            // We'll use FormData to handle this case
        }
    }

    // Show loading state
    searchButton.disabled = true;
    searchButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Searching...';

    // Prepare search parameters
    const searchParams = {
        geometry: geometry,
        max_cloud_coverage: 20  // Default cloud coverage threshold
    };

    // Call the API to search for images
    fetch('/api/search_images', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(searchParams)
    })
    .then(response => response.json())
    .then(data => {
        // Reset button state
        searchButton.disabled = false;
        searchButton.textContent = 'Search for Images';

        // Handle authentication required response
        if (data.error === "Not authenticated with OpenEO") {
            // Automatically redirect to authentication page
            window.location.href = data.auth_url;
            return;
        }

        // Display results
        displayResults(data.images);
    })
    .catch(error => {
        console.error('Error:', error);

        // Reset button state
        searchButton.disabled = false;
        searchButton.textContent = 'Search for Images';

        alert('An error occurred while searching for images.');
    });
});

// Rest of the file remains the same...

// Function to display results
function displayResults(images) {
    // Clear previous results
    imagesList.innerHTML = '';

    // Check if we have any images
    if (!images || images.length === 0) {
        imagesList.innerHTML = '<p>No images found for the selected area.</p>';
        resultsContainer.style.display = 'block';
        return;
    }

    // Display each image
    images.forEach(image => {
        const imageItem = document.createElement('div');
        imageItem.className = 'card mb-3';

        // Format date
        const date = new Date(image.date);
        const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();

        // Create image info
        imageItem.innerHTML = `
            <div class="card-body">
                <h5 class="card-title">${image.id}</h5>
                ${image.preview_url ? `<img src="${image.preview_url}" class="img-fluid mb-2" alt="Preview">` : ''}
                <p class="card-text"><strong>Date:</strong> ${formattedDate}</p>
                <p class="card-text"><strong>Cloud Coverage:</strong> ${image.cloudCoverage}%</p>
                <p class="card-text"><strong>Bands:</strong> ${image.bands.join(', ')}</p>
                <button class="btn btn-sm btn-outline-primary download-btn" data-image-id="${image.id}">Download</button>
            </div>
        `;

        imagesList.appendChild(imageItem);
    });

    // Show the results container
    resultsContainer.style.display = 'block';

    // Add event listeners to download buttons
    document.querySelectorAll('.download-btn').forEach(button => {
        button.addEventListener('click', function() {
            const imageId = this.getAttribute('data-image-id');
            alert(`Download functionality for image ${imageId} would be implemented here.`);
            // In a full implementation, you would call another API endpoint to download the image
        });
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