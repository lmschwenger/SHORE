# app/views/main.py - Final authentication routes
from flask import Blueprint, render_template, current_app, request, redirect, jsonify, url_for, session

from app.services.openeo_service import OpenEOService

main_bp = Blueprint('main', __name__)
openeo_service = OpenEOService()


@main_bp.route('/auth/openeo')
def auth_openeo():
    """Start OpenEO authentication process"""
    # Save the return URL in session
    return_to = request.args.get('return_to', url_for('main.index'))
    session['auth_return_to'] = return_to

    # Check if already authenticated
    if openeo_service.is_authenticated():
        # Already authenticated, redirect back
        return redirect(return_to)

    # Get authentication URL
    auth_url = openeo_service.get_auth_url()

    if not auth_url:
        # If no auth URL but we're authenticated, it means we authenticated with a refresh token
        if openeo_service.is_authenticated():
            return redirect(return_to)

        # If we get here, there was an error getting the auth URL
        return render_template('error.html',
                               message="Failed to initialize OpenEO authentication."), 500

    # Show the authentication page with instructions
    return render_template('authenticate.html',
                           auth_url=auth_url,
                           return_url=url_for('main.auth_check'),
                           app_name=current_app.config['APP_NAME'],
                           app_description=current_app.config['APP_DESCRIPTION'])


@main_bp.route('/auth/check')
def auth_check():
    """Check if authentication has completed"""
    # Try to handle authentication
    auth_complete = openeo_service.handle_auth_callback()

    if auth_complete:
        # Authentication successful, redirect to original page
        return_to = session.pop('auth_return_to', url_for('main.index'))
        return redirect(return_to)
    else:
        # Authentication not yet complete, redirect to auth page again
        return redirect(url_for('main.auth_openeo'))


@main_bp.route('/api/search_images', methods=['POST'])
def search_images():
    """API endpoint to search for images based on a geometry"""
    # Check if authenticated with OpenEO
    if not openeo_service.is_authenticated():
        # Return the authentication URL
        return jsonify({
            "error": "Not authenticated with OpenEO",
            "auth_url": url_for('main.auth_openeo', return_to=request.referrer or url_for('main.index'))
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