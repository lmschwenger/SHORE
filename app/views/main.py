# app/views/main.py
from flask import Blueprint, render_template, current_app, request, jsonify, url_for, redirect

# Import services
from app.services.stac_service import STACService
from app.services.water_level_service import WaterLevelService

main_bp = Blueprint('main', __name__)
stac_service = STACService()
water_level_service = WaterLevelService()


# Initialize services
@main_bp.before_app_request
def setup_services():
    """Initialize services with configuration"""
    # Set up water level service with API key
    api_key = current_app.config.get('DMI_API_KEY', '')
    if api_key:
        water_level_service.set_api_key(api_key)
    else:
        current_app.logger.warning("DMI API key not configured. Water level data will not be available.")

    # Connect water level service to STAC service
    stac_service.set_water_level_service(water_level_service)


@main_bp.route('/api/search_images', methods=['POST'])
def search_images():
    """API endpoint to search for images based on a geometry"""
    # Get request data
    data = request.json
    if not data or 'geometry' not in data:
        return jsonify({"error": "Missing geometry data"}), 400

    # Process search parameters
    geometry = data.get('geometry')
    start_date = data.get('start_date')
    end_date = data.get('end_date')
    max_cloud_coverage = int(data.get('max_cloud_coverage', 20))

    # Get pagination parameters
    page = int(data.get('page', 1))
    limit = int(data.get('limit', 20))
    sort_by = data.get('sort_by', 'datetime')
    sort_direction = data.get('sort_direction', 'desc')

    # Search for images using STAC API
    result = stac_service.search_images(
        geometry,
        start_date=start_date,
        end_date=end_date,
        max_cloud_coverage=max_cloud_coverage,
        page=page,
        limit=limit,
        sort_by=sort_by,
        sort_direction=sort_direction
    )

    return jsonify(result)


@main_bp.route('/api/image_details/<image_id>')
def image_details(image_id):
    """Get detailed information about a specific image"""
    details = stac_service.get_image_details(image_id)
    return jsonify(details)


@main_bp.route('/api/download_links/<image_id>')
def download_links(image_id):
    """Get download links for a specific image"""
    bands = request.args.get('bands', 'B04,B03,B02').split(',')
    links = stac_service.get_download_links(image_id, bands)
    return jsonify({"links": links})


@main_bp.route('/api/water_level_stations')
def water_level_stations():
    """Get all water level stations"""
    stations = water_level_service.get_all_stations()
    return jsonify({"stations": stations})


@main_bp.route('/api/water_level_at_time', methods=['GET'])
def water_levels_for_all_stations():
    """Get water levels for all stations at a specific time"""
    time_str = request.args.get('time')
    if not time_str:
        return jsonify({"error": "Missing time parameter"}), 400

    try:
        # Get all stations
        stations = water_level_service.get_all_stations()

        # Filter stations to only include those with valid coordinates
        valid_stations = [s for s in stations if 'latitude' in s and 'longitude' in s
                          and s['latitude'] is not None and s['longitude'] is not None]

        # Get water level for each station at the specified time
        station_levels = []
        for station in valid_stations:
            station_id = station.get('stationId') or station.get('id')

            if not station_id:
                continue  # Skip stations without an ID

            water_level = water_level_service.get_water_level_at_time(
                station_id=station_id,
                timestamp=time_str,
                parameter_id='sealev_dvr'
            )

            # Create station data entry even if water level is null
            station_data = {
                'stationId': station_id,
                'waterLevel': water_level.get('value') if water_level else None,
                'timestamp': water_level.get('observed') if water_level else time_str,
                'latitude': station.get('latitude'),
                'longitude': station.get('longitude'),
                'name': station.get('name', 'Unnamed Station')
            }
            station_levels.append(station_data)

        return jsonify({"stationLevels": station_levels})
    except Exception as e:
        current_app.logger.error(f"Error getting water levels: {str(e)}")
        return jsonify({"error": str(e)}), 500




@main_bp.route('/api/nearest_station', methods=['GET'])
def nearest_station():
    """Find the nearest water level station to a given coordinate"""
    try:
        lon = float(request.args.get('lon'))
        lat = float(request.args.get('lat'))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid coordinates"}), 400

    station = water_level_service.find_nearest_station(lon, lat)

    if station:
        return jsonify({"station": station})
    else:
        return jsonify({"error": "No station found"}), 404


@main_bp.route('/waterlevel')
def water_level():
    return render_template('waterlevel.html')


@main_bp.route('/')
def index():
    """Render the main application page"""
    return render_template('index.html',
                           app_name=current_app.config['APP_NAME'],
                           app_description=current_app.config['APP_DESCRIPTION'])