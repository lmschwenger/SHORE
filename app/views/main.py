# app/views/main.py
from flask import Blueprint, render_template, current_app, request, jsonify, url_for, redirect

# Import only the STAC service
from app.services.stac_service import STACService

main_bp = Blueprint('main', __name__)
stac_service = STACService()


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

    # Search for images using STAC API
    images = stac_service.search_images(
        geometry,
        start_date=start_date,
        end_date=end_date,
        max_cloud_coverage=max_cloud_coverage
    )

    return jsonify({"images": images})


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


@main_bp.route('/')
def index():
    """Render the main application page"""
    return render_template('index.html',
                           app_name=current_app.config['APP_NAME'],
                           app_description=current_app.config['APP_DESCRIPTION'])