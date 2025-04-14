// Water Level Display Logic
document.addEventListener('DOMContentLoaded', function() {
    // Only run this script on the water level page
    if (!document.body.classList.contains('water-level-page')) {
        return;
    }

    // DOM Elements
    const datetimePicker = document.getElementById('datetimePicker');
    const updateButton = document.getElementById('updateButton');
    const statusMessage = document.getElementById('statusMessage');
    const loadingIndicator = document.querySelector('.loading');

    // Access the map instance created in map.js
    const map = window.mapInstance;
    const stationsLayer = window.stationsLayer;

    if (!map || !stationsLayer) {
        console.error('Map or stations layer not initialized');
        // Wait a moment and try again (sometimes the map initializes after this script)
        setTimeout(() => {
            const retryMap = window.mapInstance;
            const retryStationsLayer = window.stationsLayer;
            if (retryMap && retryStationsLayer) {
                console.log('Map and stations layer found on retry');
                initializeWaterLevelMap(retryMap, retryStationsLayer);
            }
        }, 500);
        return;
    }

    // Initialize water level functionality
    initializeWaterLevelMap(map, stationsLayer);

    // Main initialization function
    function initializeWaterLevelMap(map, stationsLayer) {

    // Set default datetime to current time
    const now = new Date();
    // Format date for datetime-local input (YYYY-MM-DDThh:mm)
    const formattedDate = now.toISOString().substring(0, 16);
    if (datetimePicker) {
        datetimePicker.value = formattedDate;
    }

    // Store markers for stations
    const stationMarkers = {};
    const stationLabels = {};

    // Function to show loading indicator
    function showLoading() {
        if (loadingIndicator) {
            loadingIndicator.style.display = 'block';
        }
    }

    // Function to hide loading indicator
    function hideLoading() {
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
    }

    // Function to display status message
    function showStatus(message, isError = false) {
        if (!statusMessage) return;

        statusMessage.textContent = message;
        statusMessage.className = isError
            ? 'mt-2 text-center text-danger'
            : 'mt-2 text-center text-success';

        // Clear message after 5 seconds
        setTimeout(() => {
            statusMessage.textContent = '';
        }, 5000);
    }

    // Function to load and display stations
    function loadStations() {
        showLoading();
        fetch('/api/water_level_stations')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                hideLoading();
                if (data.stations && Array.isArray(data.stations)) {
                    displayStations(data.stations);
                    showStatus(`Loaded ${data.stations.length} stations`);
                    // Load water levels for the current time
                    updateWaterLevels();
                } else {
                    showStatus('No stations data received', true);
                }
            })
            .catch(error => {
                hideLoading();
                console.error('Error loading stations:', error);
                showStatus(`Failed to load water level stations: ${error.message}`, true);
            });
    }

    // Function to display stations on the map
    function displayStations(stations) {
        // Clear existing stations from the map
        stationsLayer.clearLayers();

        // Create markers for each station
        stations.forEach(station => {
            // Extract coordinates from the station data
            let lon, lat;

            if (station.coordinates && Array.isArray(station.coordinates) && station.coordinates.length === 2) {
                // If coordinates are in [lon, lat] format
                [lon, lat] = station.coordinates;
            } else if (station.longitude !== undefined && station.latitude !== undefined) {
                // If coordinates are in separate properties
                lon = station.longitude;
                lat = station.latitude;
            } else {
                console.warn(`Station ${station.name || station.stationId} has invalid coordinates`, station);
                return; // Skip this station
            }

            // Create marker
            const marker = L.circleMarker([lat, lon], {
                radius: 6,
                fillColor: '#3388ff',
                color: '#fff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            });

            // Add popup
            marker.bindPopup(`
                <div class="station-popup">
                    <h6>${station.name || 'Unnamed Station'}</h6>
                    <p><strong>Station ID:</strong> ${station.stationId}</p>
                    <p><strong>Parameters:</strong> ${Array.isArray(station.parameterId) ? station.parameterId.join(', ') : 'N/A'}</p>
                </div>
            `);

            stationMarkers[station.stationId] = marker;
            marker.addTo(stationsLayer);

            // Create label for water level
            const label = L.divIcon({
                className: 'water-level-label',
                html: 'Loading...',
                iconSize: [80, 20],
                iconAnchor: [40, -5]
            });

            const labelMarker = L.marker([lat, lon], {
                icon: label,
                interactive: false
            });

            stationLabels[station.stationId] = {
                marker: labelMarker,
                position: [lat, lon]
            };

            labelMarker.addTo(stationsLayer);
        });

        // Fit map to show all stations
        if (Object.keys(stationMarkers).length > 0) {
            map.fitBounds(stationsLayer.getBounds());
        }
    }

    // Function to update water levels for all stations
    function updateWaterLevels() {
        const selectedTime = datetimePicker ? datetimePicker.value : null;
        if (!selectedTime) {
            showStatus('Please select a date and time', true);
            return;
        }

        showLoading();

        // Convert to ISO format
        const isoTime = new Date(selectedTime).toISOString();

        fetch(`/api/water_level_at_time?time=${encodeURIComponent(isoTime)}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                hideLoading();
                if (data.stationLevels && Array.isArray(data.stationLevels)) {
                    displayWaterLevels(data.stationLevels);
                    showStatus(`Updated water levels for ${data.stationLevels.length} stations`);
                } else {
                    showStatus('No water level data available for the selected time', true);
                }
            })
            .catch(error => {
                hideLoading();
                console.error('Error loading water levels:', error);
                showStatus(`Failed to load water level data: ${error.message}`, true);
            });
    }

    // Function to display water levels on the map
    function displayWaterLevels(stationLevels) {
        // Update each station's water level label
        stationLevels.forEach(station => {
            // Skip if no station ID
            if (!station.stationId) return;

            // Get the label marker
            const labelInfo = stationLabels[station.stationId];
            if (!labelInfo) return;

            // Update the marker style based on water level
            const stationMarker = stationMarkers[station.stationId];
            if (stationMarker) {
                // Check if waterLevel exists
                if (station.waterLevel !== null && station.waterLevel !== undefined) {
                    // Update marker color based on water level
                    const level = parseFloat(station.waterLevel);
                    const color = getWaterLevelColor(level);

                    stationMarker.setStyle({
                        fillColor: color
                    });

                    // Create new label with the water level
                    const label = L.divIcon({
                        className: 'water-level-label',
                        html: `${level.toFixed(1)} cm`,
                        iconSize: [80, 20],
                        iconAnchor: [40, -5]
                    });

                    // Update the label
                    labelInfo.marker.setIcon(label);
                } else {
                    // No water level data available, display a different label
                    const label = L.divIcon({
                        className: 'water-level-label no-data',
                        html: 'No data',
                        iconSize: [80, 20],
                        iconAnchor: [40, -5]
                    });

                    // Set marker to gray
                    stationMarker.setStyle({
                        fillColor: '#999'
                    });

                    // Update the label
                    labelInfo.marker.setIcon(label);
                }
            }
        });
    }

    // Function to determine color based on water level
    function getWaterLevelColor(level) {
        // New thresholds as requested
        if (level > 30) return '#ff0000';     // Red: > 30 cm
        if (level > 15) return '#ffa500';     // Orange: 15-30 cm
        if (level > 0) return '#3388ff';      // Blue: 0-15 cm
        if (level > -15) return '#4CAF50';    // Green-ish: -15-0 cm
        return '#800080';                     // Purple: < -15 cm
    }

    // Event listeners
    if (updateButton) {
        updateButton.addEventListener('click', updateWaterLevels);
    }

    // Initial load
    loadStations();
    }
});