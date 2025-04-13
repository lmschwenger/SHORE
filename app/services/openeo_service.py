# app/services/openeo_service.py
import datetime
import logging

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
            provider_url = current_app.config.get('OPENEO_PROVIDER_URL', 'https://openeo.cloud')
            connection = openeo.connect(provider_url)

            # If we have authentication info, use it
            if session.get('openeo_auth_token'):
                connection.set_auth_bearer(session.get('openeo_auth_token'))

            return connection
        except Exception as e:
            self.logger.error(f"Error connecting to OpenEO: {str(e)}")
            return None

    def get_auth_url(self, redirect_uri):
        """Get OAuth authentication URL for Copernicus"""
        try:
            provider_url = current_app.config.get('OPENEO_PROVIDER_URL', 'https://openeo.dataspace.copernicus.eu/')
            connection = openeo.connect(provider_url)

            # Get authentication URL
            auth_url = connection.authenticate_oidc(
                provider_id="CDSE",
                client_id=current_app.config.get('OPENEO_CLIENT_ID'),
            )

            return auth_url
        except Exception as e:
            self.logger.error(f"Error getting auth URL: {str(e)}")
            return None

    def handle_auth_callback(self, auth_code, redirect_uri):
        """Handle authentication callback and store token"""
        try:
            provider_url = current_app.config.get('OPENEO_PROVIDER_URL', 'https://openeo.cloud')
            connection = openeo.connect(provider_url)

            # Exchange code for token
            connection.authenticate_oidc_authorization_code(
                provider_id="egi",
                client_id=current_app.config.get('OPENEO_CLIENT_ID'),
                client_secret=current_app.config.get('OPENEO_CLIENT_SECRET'),
                code=auth_code,
                redirect_uri=redirect_uri
            )

            # Store token in session
            session['openeo_auth_token'] = connection.auth.get_auth_token()

            # Update instance connection
            self._connection = connection

            return True
        except Exception as e:
            self.logger.error(f"Error handling auth callback: {str(e)}")
            return False

    def is_authenticated(self):
        """Check if we have a valid authentication"""
        return self.connection is not None and session.get('openeo_auth_token') is not None

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
            start_date = (datetime.datetime.now() - datetime.timedelta(days=90)).strftime("%Y-%m-%d")
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
                bands=["B02", "B03", "B04", "B08", "SCL"]  # RGB + NIR + Scene Classification
            )

            # Apply cloud filtering based on the Scene Classification Layer (SCL)
            # This approach may vary depending on the OpenEO backend implementation
            if max_cloud_coverage < 100:
                # Create a cloud mask using SCL band
                # (Values 1,2,3,8,9,10 are typically considered cloudy in SCL)
                cloud_mask = datacube.band("SCL").eq(1) \
                    .or_(datacube.band("SCL").eq(2)) \
                    .or_(datacube.band("SCL").eq(3)) \
                    .or_(datacube.band("SCL").eq(8)) \
                    .or_(datacube.band("SCL").eq(9)) \
                    .or_(datacube.band("SCL").eq(10))

                # Calculate average cloud percentage per observation
                # This step might need adjustment based on the backend implementation
                cloud_percentage = cloud_mask.mean()

                # Filter observations with cloud coverage less than threshold
                cloudless = cloud_percentage.lt(max_cloud_coverage / 100.0)
                datacube = datacube.filter_temporal(cloudless)

            # Get metadata about the filtered datacube
            # Different backends have different approaches for this
            # Some backends provide specific functions for this purpose
            metadata = datacube.metadata()
            job = metadata.send_job()
            job.start_and_wait()
            results = job.get_results()
            metadata_dict = results.json

            # Extract image information
            # The structure might vary depending on the OpenEO backend implementation
            images = []

            for date_str, date_data in metadata_dict.get("dimensions", {}).get("t", {}).get("values", {}).items():
                # Create a preview URL
                preview_url = self._generate_preview_url(date_str, spatial_extent)

                # Build image metadata object
                image_info = {
                    "id": f"S2_{date_str.replace('-', '')}",
                    "date": date_str,
                    "cloudCoverage": date_data.get("cloud_coverage", 0),
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
