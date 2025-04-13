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

// Show/hide appropriate options based on selected geometry type
function toggleOptions() {
    const selectedType = document.querySelector('input[name="geometryType"]:checked').value;

    if (selectedType === 'draw') {
        drawInstructions.style.display = 'block';
        importOptions.style.display = 'none';

        // Make sure draw control is enabled
        if (!map.drawControl) {
            map.addControl(drawControl);
        }
    } else if (selectedType === 'import') {
        drawInstructions.style.display = 'none';
        importOptions.style.display = 'block';

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

// Function to handle the search button click
searchButton.addEventListener('click', function() {
    const selectedType = document.querySelector('input[name="geometryType"]:checked').value;
    let geometryData = {};

    if (selectedType === 'draw') {
        if (drawnItems.getLayers().length === 0) {
            alert('Please draw a polygon on the map first.');
            return;
        }

        const layer = drawnItems.getLayers()[0];
        geometryData = {
            type: 'draw',
            geojson: layer.toGeoJSON().geometry
        };
    } else if (selectedType === 'import') {
        const wktText = document.getElementById('wktInput').value.trim();

        if (wktText) {
            // Process WKT
            geometryData = {
                type: 'wkt',
                wkt: wktText
            };
        } else {
            // Process file
            const fileInput = document.getElementById('fileInput');
            const fileFormat = document.getElementById('fileFormat').value;

            if (!fileInput.files.length) {
                alert('Please select a file or paste WKT.');
                return;
            }

            const file = fileInput.files[0];
            const reader = new FileReader();

            loadingIndicator.style.display = 'block';

            reader.onload = function(e) {
                const fileContent = e.target.result;

                // Send the file content to the server
                fetch('/process_geometry', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        type: 'import',
                        format: fileFormat,
                        file: fileContent
                    })
                })
                .then(response => response.json())
                .then(data => {
                    loadingIndicator.style.display = 'none';
                    displayResults(data);
                    visualizeGeometry(data.geometry);
                })
                .catch(error => {
                    loadingIndicator.style.display = 'none';
                    console.error('Error:', error);
                    alert('An error occurred while processing the file.');
                });
            };

            reader.readAsText(file);
            return; // Exit early as we're handling async file reading
        }
    }

    // For direct WKT or drawn geometries
    loadingIndicator.style.display = 'block';

    fetch('/process_geometry', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(geometryData)
    })
    .then(response => response.json())
    .then(data => {
        loadingIndicator.style.display = 'none';
        displayResults(data);

        // If we're processing WKT, visualize the returned geometry
        if (selectedType === 'wkt') {
            visualizeGeometry(data.geometry);
        }
    })
    .catch(error => {
        loadingIndicator.style.display = 'none';
        console.error('Error:', error);
        alert('An error occurred while processing the request.');
    });
});

// Function to display the results in the sidebar
function displayResults(data) {
    // Clear previous results
    imagesList.innerHTML = '';

    // Check if we have any images
    if (!data.sentinel_images || data.sentinel_images.length === 0) {
        imagesList.innerHTML = '<p>No images found for the selected area.</p>';
        resultsContainer.style.display = 'block';
        return;
    }

    // Display each image
    data.sentinel_images.forEach(image => {
        const imageItem = document.createElement('div');
        imageItem.className = 'image-item';

        // Format date
        const date = new Date(image.date);
        const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();

        // Create image info
        imageItem.innerHTML = `
            <h4>${image.id}</h4>
            <div class="text-center">
                <img src="${image.thumbnail || '/static/img/sample_preview_1.jpg'}" alt="Image preview" class="img-thumbnail">
            </div>
            <p><strong>Date:</strong> ${formattedDate}</p>
            <p><strong>Cloud Coverage:</strong> ${image.cloudCoverage}%</p>
            <button class="btn btn-sm btn-outline-primary view-details-btn" data-image-id="${image.id}">View Details</button>
        `;

        imagesList.appendChild(imageItem);
    });

    // Show the results container
    resultsContainer.style.display = 'block';

    // Add event listeners to the view details buttons
    document.querySelectorAll('.view-details-btn').forEach(button => {
        button.addEventListener('click', function() {
            const imageId = this.getAttribute('data-image-id');
            alert(`Details for image ${imageId} would be shown here.`);
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