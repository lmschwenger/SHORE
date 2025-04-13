from flask import Blueprint, render_template, current_app

main_bp = Blueprint('main', __name__)


@main_bp.route('/')
def index():
    """Render the main application page"""
    return render_template('index.html',
                           app_name=current_app.config['APP_NAME'],
                           app_description=current_app.config['APP_DESCRIPTION'])
