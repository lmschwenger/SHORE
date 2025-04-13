from flask import Flask


def create_app(config_name=None):
    """Application factory pattern for creating the Flask app"""
    app = Flask(__name__)

    # Load configuration
    from app.config import config_by_name
    app.config.from_object(config_by_name[config_name or 'development'])

    # Register blueprints
    from app.views.main import main_bp
    app.register_blueprint(main_bp)

    return app