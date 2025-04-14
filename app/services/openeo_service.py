# app/services/openeo_service.py
import datetime
import logging
import random

import openeo
from flask import current_app, session
from shapely.geometry import shape


class OpenEOService:
    """Service for interacting with OpenEO API for Copernicus data access"""

    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self._connection = None

    @property
    def connection(self):
        """Get or create an OpenEO connection"""
        # Check if there's a valid connection in the session
        if self._connection is None:
            self._connection = self._create_connection()
        return self._connection

    def _create_connection(self):
        """Create and authenticate an OpenEO connection"""
        try:
            # Connect to Copernicus OpenEO backend
            provider_url = current_app.config.get('OPENEO_PROVIDER_URL', 'https://openeo.dataspace.copernicus.eu/')
            connection = openeo.connect(provider_url)

            # If we have authentication info, use it
            if session.get('openeo_auth_token'):
                connection.authenticate_oidc_refresh_token()
                self.logger.info("Using existing token from session")

            return connection
        except Exception as e:
            self.logger.error(f"Error connecting to OpenEO: {str(e)}")
            return None

    def get_auth_url(self, redirect_uri=None):
        """
        Get authentication URL for Copernicus CDSE

        Returns a URL for authentication or None if already authenticated
        """
        try:
            # Check if we're already authenticated with a valid token
            if self.is_authenticated():
                self.logger.info("Already authenticated with OpenEO")
                return None

            provider_url = current_app.config.get('OPENEO_PROVIDER_URL', 'https://openeo.dataspace.copernicus.eu/')
            connection = openeo.connect(provider_url)

            # Try to authenticate with refresh token first
            try:
                connection.authenticate_oidc_refresh_token()
                self.logger.info("Authenticated using refresh token")

                # Store token in session
                session['openeo_auth_token'] = connection.auth.bearer

                # Update instance connection
                self._connection = connection

                return None  # No URL needed, already authenticated
            except Exception as e:
                self.logger.info(f"No refresh token available: {str(e)}")
                # Fall back to device code flow
                pass

            # Use authenticate_oidc with device code flow
            self.logger.info("Starting device code authentication flow")

            # This will print instructions to the console
            # We'll capture the URL from the output
            import io
            import sys
            from contextlib import redirect_stdout

            # Capture stdout to get the authentication URL
            f = io.StringIO()
            with redirect_stdout(f):
                connection.authenticate_oidc(provider_id="CDSE", store_refresh_token=True)

            # Get the output that contains the auth URL
            output = f.getvalue()
            self.logger.info(f"Auth output: {output}")

            # Extract the URL from the output
            import re
            url_match = re.search(r'Visit (https://[^\s]+) to authenticate', output)
            if url_match:
                auth_url = url_match.group(1)
                self.logger.info(f"Extracted auth URL: {auth_url}")

                # Store token in session if authentication was successful
                if "Authorized successfully" in output or "Authenticated using refresh token" in output:
                    session['openeo_auth_token'] = connection.auth.bearer
                    self._connection = connection
                    return None  # No URL needed, already authenticated

                return auth_url
            else:
                self.logger.error("Could not extract authentication URL from output")
                return None

        except Exception as e:
            self.logger.error(f"Error getting auth URL: {str(e)}")
            return None

    def handle_auth_callback(self):
        """
        Handle authentication completion

        Returns True if authentication is complete (either newly completed or already authenticated)
        """
        try:
            # If already authenticated, just return success
            if self.is_authenticated():
                return True

            # Try to authenticate with OIDC refresh token
            provider_url = current_app.config.get('OPENEO_PROVIDER_URL', 'https://openeo.dataspace.copernicus.eu/')
            connection = openeo.connect(provider_url)

            try:
                # Try to use refresh token authentication
                connection.authenticate_oidc_refresh_token()

                # Store token in session
                session['openeo_auth_token'] = connection.auth.bearer

                # Update instance connection
                self._connection = connection

                self.logger.info("Authentication completed successfully with refresh token")
                return True
            except Exception as e:
                self.logger.warning(f"Refresh token authentication failed: {str(e)}")

                # Since we don't have the user's device code anymore (it's managed internally by openeo),
                # we need to start a new authentication flow
                return False

        except Exception as e:
            self.logger.error(f"Error handling auth completion: {str(e)}")
            return False

    def is_authenticated(self):
        """Check if we have a valid authentication"""
        try:
            if self.connection is None or not session.get('openeo_auth_token'):
                return False

            # Try to get collection info to verify token is valid
            try:
                self.connection.describe_collection("SENTINEL2_L2A")
                return True
            except Exception as e:
                if "unauthorized" in str(e).lower():
                    # Token is invalid, remove it
                    session.pop('openeo_auth_token', None)
                    self._connection = None
                    return False
                # For other errors, assume token is valid
                return True
        except Exception as e:
            self.logger.error(f"Error checking authentication: {str(e)}")
            return False

    def search_images(self, geometry, start_date=None, end_date=None, max_cloud_coverage=20):
        """
        Search for Sentinel-2 images based on geographic area and time range

        Parameters:
        - geometry: GeoJSON geometry object defining the area of interest
        - start_date: Start date for the search (defaults to 90 days ago)
        - end_date: End date for the search (defaults to today)
        - max_cloud_coverage: Maximum cloud coverage percentage

        Returns:
        - List of image metadata objects
        """
        if not self.connection:
            self.logger.warning("No OpenEO connection available")
            return []

        # Set default dates if not provided
        if not start_date:
            start_date = (datetime.datetime.now() - datetime.timedelta(days=15)).strftime("%Y-%m-%d")
        elif isinstance(start_date, datetime.datetime):
            start_date = start_date.strftime("%Y-%m-%d")

        if not end_date:
            end_date = datetime.datetime.now().strftime("%Y-%m-%d")
        elif isinstance(end_date, datetime.datetime):
            end_date = end_date.strftime("%Y-%m-%d")

        try:
            # Convert geometry to a bbox for simpler querying
            geom_shape = shape(geometry)
            bbox = geom_shape.bounds  # (minx, miny, maxx, maxy)

            # Get collection metadata
            try:
                collection_metadata = self.connection.describe_collection("SENTINEL2_L2A")
                self.logger.info(f"Successfully retrieved collection metadata")
            except Exception as e:
                self.logger.error(f"Error getting collection metadata: {str(e)}")
                return []

            # Build the spatial extent object for OpenEO
            spatial_extent = {
                "west": bbox[0],
                "south": bbox[1],
                "east": bbox[2],
                "north": bbox[3]
            }

            # Basic temporal extent
            temporal_extent = [start_date, end_date]

            # Create a datacube with the Sentinel-2 data
            datacube = self.connection.load_collection(
                "SENTINEL2_L2A",
                spatial_extent=spatial_extent,
                temporal_extent=temporal_extent,
                bands=["B02", "B03", "B04", "B08"]  # RGB + NIR
            )

            # Log the datacube to inspect available methods
            self.logger.info(f"Datacube created: {datacube}")

            # Try a simpler approach using direct job execution
            try:
                # Create a simple job to get metadata about the datacube
                # This will just return the datacube as-is
                job = datacube.create_job(title="Get dates in extent",
                                          description="Retrieve available dates in the spatial and temporal extent")
                job.start_and_wait()

                # Get the results
                results = job.get_results()

                # Try to extract dates from the results
                # The exact structure depends on the OpenEO backend
                result_data = results
                print(results)
                self.logger.info(f"Job results: {result_data}")

                # Extract dates based on the result structure
                # If the structure isn't what we expect, we'll fall back to a sample image
                dates = []

                # Try to extract dates from different potential locations in the result JSON
                if "dimensions" in result_data and "t" in result_data["dimensions"]:
                    # Format 1: dimensions.t.values or dimensions.t.coords
                    if "values" in result_data["dimensions"]["t"]:
                        dates = list(result_data["dimensions"]["t"]["values"].keys())
                    elif "coords" in result_data["dimensions"]["t"]:
                        dates = result_data["dimensions"]["t"]["coords"]
                elif "timestamps" in result_data:
                    # Format 2: direct timestamps array
                    dates = result_data["timestamps"]
                elif "properties" in result_data and "dates" in result_data["properties"]:
                    # Format 3: properties.dates
                    dates = result_data["properties"]["dates"]

                # If we extracted dates, create image objects for each date
                if dates:
                    images = []
                    for date_str in dates:
                        # Format date if needed
                        if isinstance(date_str, datetime.datetime):
                            date_str = date_str.strftime("%Y-%m-%d")

                        # Create a preview URL
                        preview_url = self._generate_preview_url(date_str, spatial_extent)

                        # Build image metadata object
                        image_info = {
                            "id": f"S2_{date_str.replace('-', '')}",
                            "date": date_str,
                            "cloudCoverage": 0,  # We don't have this info without SCL band
                            "preview_url": preview_url,
                            "bands": ["B02", "B03", "B04", "B08"],
                            "metadata": {
                                "platform": "Sentinel-2",
                                "instrument": "MSI",
                                "productType": "L2A",
                                "epsg": 4326
                            }
                        }

                        images.append(image_info)

                    return images
                else:
                    # No dates found, fall back to sample images
                    self.logger.warning("No dates found in results, using sample image")

            except Exception as e:
                self.logger.error(f"Error retrieving image dates: {str(e)}")

            # Fallback method: Generate sample images for the requested time period
            # Just to demonstrate the interface while you work on the proper implementation
            start_dt = datetime.datetime.strptime(start_date, "%Y-%m-%d")
            end_dt = datetime.datetime.strptime(end_date, "%Y-%m-%d")

            # Generate dates at 5-day intervals within the range
            sample_dates = []
            current_dt = start_dt
            while current_dt <= end_dt:
                sample_dates.append(current_dt.strftime("%Y-%m-%d"))
                current_dt += datetime.timedelta(days=5)

            # Create sample images with these dates
            sample_images = []
            for date_str in sample_dates:
                sample_image = {
                    "id": f"S2_{date_str.replace('-', '')}",
                    "date": date_str,
                    "cloudCoverage": random.randint(0, 30),  # Random cloud coverage
                    "preview_url": None,
                    "bands": ["B02", "B03", "B04", "B08"],
                    "metadata": {
                        "platform": "Sentinel-2",
                        "instrument": "MSI",
                        "productType": "L2A",
                        "epsg": 4326
                    }
                }
                sample_images.append(sample_image)

            # Log that we're using samples
            self.logger.info(f"Using {len(sample_images)} sample images due to API limitations")
            return sample_images

        except Exception as e:
            self.logger.error(f"Error searching for images: {str(e)}")
            return []

    def _generate_preview_url(self, date_str, bbox):
        """
        Generate a preview URL for a specific date and bounding box

        This function creates a processing graph for generating an RGB preview
        and returns a URL that can be used to view this preview.

        The actual implementation depends on the OpenEO backend.
        """
        try:
            # Create a datacube for the specified date and area
            datacube = self.connection.load_collection(
                "SENTINEL2_L2A",
                spatial_extent=bbox,
                temporal_extent=[date_str, date_str],
                bands=["B04", "B03", "B02"]  # RGB bands
            )

            # Rescale values for display
            datacube = datacube.linear_scale_range(0, 3000, 0, 255)

            # Create a processing graph
            graph = datacube.create_job(
                title=f"Preview for {date_str}",
                description="RGB preview",
                out_format="png"
            )

            # Return a URL that references this graph
            # The exact structure depends on the OpenEO backend
            return f"{current_app.config.get('OPENEO_PROVIDER_URL')}/preview?process_graph={graph.id}"

        except Exception as e:
            self.logger.error(f"Error generating preview URL: {str(e)}")
            return None

    def download_image(self, image_id, bbox, bands=None):
        """
        Download a specific Sentinel image for the given area

        Parameters:
        - image_id: ID of the image
        - bbox: Bounding box of the area
        - bands: List of bands to download (defaults to RGB)

        Returns:
        - Path to downloaded file
        """
        if not self.connection:
            self.logger.warning("No OpenEO connection available")
            return None

        if not bands:
            bands = ["B04", "B03", "B02"]  # Default to RGB

        try:
            # Extract date from image_id
            # Assuming format like S2_20230501
            date_str = image_id.split('_')[1]
            date_formatted = f"{date_str[0:4]}-{date_str[4:6]}-{date_str[6:8]}"

            # Create datacube for the specific image
            datacube = self.connection.load_collection(
                "SENTINEL2_L2A",
                spatial_extent=bbox,
                temporal_extent=[date_formatted, date_formatted],
                bands=bands
            )

            # Apply any required processing
            # For example, rescaling values for RGB visualization
            if set(bands) == set(["B04", "B03", "B02"]):
                datacube = datacube.linear_scale_range(0, 3000, 0, 255)

            # Create and start download job
            job = datacube.create_job(
                title=f"Download {image_id}",
                description=f"Download for bands {', '.join(bands)}",
                out_format="GTiff"  # GeoTIFF format
            )

            job.start_and_wait()

            # Get result as local file
            result = job.get_results()
            download_path = result.download_file()

            return download_path

        except Exception as e:
            self.logger.error(f"Error downloading image: {str(e)}")
            return None
