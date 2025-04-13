# app/views/main.py - Add these routes
from flask import Blueprint, render_template, current_app, request, redirect, jsonify, url_for

from app.services.openeo_service import OpenEOService

main_bp = Blueprint('main', __name__)
openeo_service = OpenEOService()


# ... existing routes ...

@main_bp.route('/auth/openeo')
def auth_openeo():
    """Start OpenEO authentication process"""
    # Generate redirect URI
    redirect_uri = url_for('main.auth_callback', _external=True)

    # Get authentication URL
    auth_url = openeo_service.get_auth_url(redirect_uri)

    if not auth_url:
        return render_template('error.html',
                               message="Failed to initialize OpenEO authentication."), 500

    # Redirect to authentication provider
    return redirect(auth_url)


@main_bp.route('/auth/callback')
def auth_callback():
    """Handle OpenEO authentication callback"""
    auth_code = request.args.get('code')

    if not auth_code:
        return render_template('error.html',
                               message="Authentication failed: No authorization code received."), 400

    # Process the authentication code
    redirect_uri = url_for('main.auth_callback', _external=True)
    success = openeo_service.handle_auth_callback(auth_code, redirect_uri)

    if not success:
        return render_template('error.html',
                               message="Authentication failed: Unable to process authorization code."), 500

    # Redirect to index page
    return redirect(url_for('main.index'))


@main_bp.route('/api/search_images', methods=['POST'])
def search_images():
    """API endpoint to search for images based on a geometry"""
    # Check if authenticated with OpenEO
    if not openeo_service.is_authenticated():
        return jsonify({
            "error": "Not authenticated with OpenEO",
            "auth_url": url_for('main.auth_openeo')
        }), 401

    # Get request data
    data = request.json
    if not data or 'geometry' not in data:
        return jsonify({"error": "Missing geometry data"}), 400

    # Process search parameters
    geometry = data.get('geometry')
    start_date = data.get('start_date')
    end_date = data.get('end_date')
    max_cloud_coverage = int(data.get('max_cloud_coverage', 20))

    # Search for images
    images = openeo_service.search_images(
        geometry,
        start_date=start_date,
        end_date=end_date,
        max_cloud_coverage=max_cloud_coverage
    )

    return jsonify({"images": images})


@main_bp.route('/')
def index():
    """Render the main application page"""
    return render_template('index.html',
                           app_name=current_app.config['APP_NAME'],
                           app_description=current_app.config['APP_DESCRIPTION'])
