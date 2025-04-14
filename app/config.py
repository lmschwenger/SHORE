import os

from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class Config:
    """Base configuration"""
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-key-please-change')
    DEBUG = False
    TESTING = False
    APP_NAME = "SHORE"
    APP_DESCRIPTION = "Sentinel Hydrological Observation & Resource Explorer"
    OPENEO_PROVIDER_URL = 'https://openeo.dataspace.copernicus.eu/'

class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True


class TestingConfig(Config):
    """Testing configuration"""
    TESTING = True
    DEBUG = True


class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False


# Configuration dictionary
config_by_name = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig
}
