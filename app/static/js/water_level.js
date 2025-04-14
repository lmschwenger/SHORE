// Water Level Display Logic
document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const datetimePicker = document.getElementById('datetimePicker');
    const updateButton = document.getElementById('updateButton');
    const statusMessage = document.getElementById('statusMessage');
    const loadingIndicator = document.querySelector('.loading');

    // Set default datetime to current time
    const now = new Date();
    // Format date for datetime-local input (YYYY-MM-DDThh:mm)
    const formattedDate = now.toISOString().substring(0, 16);
    datetimePicker.value = formattedDate;

    // Initialize markers layer for stations
    const stationMarkers = {};
    const stationLabels = {};

    // Function to show loading indicator
    function showLoading() {
        loadingIndicator.style.display = 'block';
    }

    // Function to hide loading indicator
    function hideLoading() {
        loadingIndicator.style.display = 'none';
    }

    // Function to display status message
    function showStatus(message, isError = false) {
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
            .then(response => response.json())
            .then(data => {
                hideLoading();
                if (data.stations) {
                    displayStations(data.stations);
                    showStatus(`Loaded ${data.stations.length} stations`);
                    // Load water levels for the current time
                    updateWaterLevels();
                }
            })
            .catch(error => {
                hideLoading();
                console.error('Error loading stations:', error);
                showStatus('Failed to load water level stations', true);
            });
    }

    // Function to display stations on the map
    function displayStations(stations) {
        // Clear existing stations from the map
        stationsLayer.clearLayers();

        // Create markers for each station
        stations.forEach(station => {
            // Check for valid lat/lng values
            if (!station.latitude || !station.longitude) {
                console.warn(`Station ${station.name || station.stationId} has invalid coordinates`);
                return; // Skip this station
            }

            const marker = L.circleMarker([station.latitude, station.longitude], {
                radius: 6,
                fillColor: '#3388ff',
                color: '#fff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            });

            marker.bindPopup(`
                <div class="station-marker">
                    <h6>${station.name || 'Unnamed Station'}</h6>
                    <p>Station ID: ${station.stationId}</p>
                </div>
            `);

            stationMarkers[station.stationId] = marker;
            marker.addTo(stationsLayer);

            // Create label for water level
            const label = L.divIcon({
                className: 'water-level-label',
                html: '',
                iconSize: [60, 20],
                iconAnchor: [30, -5]
            });

            const labelMarker = L.marker([station.latitude, station.longitude], {
                icon: label,
                interactive: false
            });

            stationLabels[station.stationId] = labelMarker;
        });
    }

    // Function to update water levels for all stations
    function updateWaterLevels() {
        const selectedTime = datetimePicker.value;
        if (!selectedTime) {
            showStatus('Please select a date and time', true);
            return;
        }

        showLoading();

        // Convert to ISO format
        const isoTime = new Date(selectedTime).toISOString();

        fetch(`/api/water_level_at_time?time=${encodeURIComponent(isoTime)}`)
            .then(response => response.json())
            .then(data => {
                hideLoading();
                if (data.stationLevels) {
                    displayWaterLevels(data.stationLevels);
                    showStatus(`Updated water levels for ${data.stationLevels.length} stations`);
                } else {
                    showStatus('No water level data available for the selected time', true);
                }
            })
            .catch(error => {
                hideLoading();
                console.error('Error loading water levels:', error);
                showStatus('Failed to load water level data', true);
            });
    }

    // Function to display water levels on the map
function displayWaterLevels(stationLevels) {
    // Clear existing labels
    stationsLayer.clearLayers();

    // Add markers back to the map
    Object.values(stationMarkers).forEach(marker => {
        marker.addTo(stationsLayer);
    });

    // Update each station's water level label
    stationLevels.forEach(station => {
        if (stationMarkers[station.stationId]) {
            // Check if waterLevel exists and is not null
            if (station.waterLevel !== undefined && station.waterLevel !== null) {
                // Update marker color based on water level
                const level = station.waterLevel;
                const color = getWaterLevelColor(level);

                stationMarkers[station.stationId].setStyle({
                    fillColor: color
                });

                // Create new label with the water level
                const label = L.divIcon({
                    className: 'water-level-label',
                    html: `${level.toFixed(2)} cm`,
                    iconSize: [60, 20],
                    iconAnchor: [30, -5]
                });

                // Update or create the label marker
                if (stationLabels[station.stationId]) {
                    stationLabels[station.stationId].setIcon(label);
                    stationLabels[station.stationId].addTo(stationsLayer);
                }
            } else {
                // No water level data available, display a different label
                const label = L.divIcon({
                    className: 'water-level-label no-data',
                    html: 'No data',
                    iconSize: [60, 20],
                    iconAnchor: [30, -5]
                });

                if (stationLabels[station.stationId]) {
                    stationLabels[station.stationId].setIcon(label);
                    stationLabels[station.stationId].addTo(stationsLayer);
                }
            }
        }
    });
}

    // Function to determine color based on water level
    function getWaterLevelColor(level) {
        // Adjust these thresholds based on your requirements
        if (level > 100) return '#ff0000'; // High water - red
        if (level > 50) return '#ffa500';  // Medium high - orange
        if (level < -50) return '#800080'; // Low water - purple
        return '#3388ff';                  // Normal - blue
    }

    // Event listeners
    updateButton.addEventListener('click', updateWaterLevels);

    // Initial load
    loadStations();
});