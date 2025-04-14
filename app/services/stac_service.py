# app/services/stac_service.py
import datetime
import logging

import requests
from shapely.geometry import shape


class STACService:
    """Service for interacting with Copernicus STAC API for satellite data access"""

    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.stac_base_url = "https://catalogue.dataspace.copernicus.eu/stac"
        self.water_level_service = None  # Will be set from the main view

    def set_water_level_service(self, water_level_service):
        """Set the water level service for fetching water level data"""
        self.water_level_service = water_level_service

    def search_images(self, geometry, start_date=None, end_date=None, max_cloud_coverage=20):
        """
        Search for Sentinel-2 images based on geographic area and time range

        Parameters:
        - geometry: GeoJSON geometry object defining the area of interest
        - start_date: Start date for the search (defaults to 15 days ago)
        - end_date: End date for the search (defaults to today)
        - max_cloud_coverage: Maximum cloud coverage percentage

        Returns:
        - List of image metadata objects
        """
        try:
            # Set default dates if not provided
            if not start_date:
                start_date = (datetime.datetime.now() - datetime.timedelta(days=15)).strftime("%Y-%m-%d")
            elif isinstance(start_date, datetime.datetime):
                start_date = start_date.strftime("%Y-%m-%d")

            if not end_date:
                end_date = datetime.datetime.now().strftime("%Y-%m-%d")
            elif isinstance(end_date, datetime.datetime):
                end_date = end_date.strftime("%Y-%m-%d")

            # Format the datetime for STAC API
            datetime_query = f"{start_date}T00:00:00Z/{end_date}T23:59:59Z"

            # Get the bounding box from the geometry for bbox query
            geom_shape = shape(geometry)
            bbox = geom_shape.bounds  # (minx, miny, maxx, maxy)

            # Try first with simple GET request (more reliable)
            try:
                return self.search_with_get(geometry, start_date, end_date, max_cloud_coverage)
            except Exception as e:
                self.logger.warning(f"GET request failed, trying POST: {str(e)}")

            # Build CQL2 filter for more precise filtering
            # Simplify the request to avoid potential issues with CQL2 syntax
            filter_obj = {
                "collections": ["SENTINEL-2"],
                "bbox": list(bbox),
                "datetime": datetime_query,
                "limit": 50
            }

            # Add cloud coverage filter if specified
            if max_cloud_coverage is not None and max_cloud_coverage < 100:
                filter_obj["query"] = {
                    "eo:cloud_cover": {
                        "lte": max_cloud_coverage
                    }
                }

            # Make the request using POST
            self.logger.info(f"Searching STAC API with filter: {filter_obj}")
            response = requests.post(f"{self.stac_base_url}/search", json=filter_obj)
            response.raise_for_status()

            # Parse the response
            stac_response = response.json()

            # Process and return the results
            return self._process_stac_response(stac_response)

        except Exception as e:
            self.logger.error(f"Error searching for images: {str(e)}")
            return []

    def get_image_details(self, image_id):
        """
        Get detailed information about a specific image

        Parameters:
        - image_id: ID of the image

        Returns:
        - Dictionary with image details
        """
        try:
            # STAC items are identified by their full name with .SAFE extension
            if not image_id.endswith(".SAFE"):
                full_id = f"{image_id}.SAFE"
            else:
                full_id = image_id

            # Search for the specific image by ID in the SENTINEL-2 collection
            url = f"{self.stac_base_url}/collections/SENTINEL-2/items/{full_id}"
            self.logger.info(f"Fetching image details from: {url}")

            response = requests.get(url)
            response.raise_for_status()

            image_details = response.json()

            # Add water level data if water level service is available
            if self.water_level_service:
                try:
                    self._add_water_level_data(image_details)
                except Exception as water_level_err:
                    self.logger.error(f"Error adding water level data: {str(water_level_err)}")

            return image_details

        except Exception as e:
            self.logger.error(f"Error getting image details: {str(e)}")
            return {}

    def get_download_links(self, image_id, bands=None):
        """
        Get download links for a specific Sentinel image

        Parameters:
        - image_id: ID of the image
        - bands: List of bands to download (defaults to RGB)

        Returns:
        - Dictionary with download links
        """
        if not bands:
            bands = ["B04", "B03", "B02"]  # Default to RGB

        try:
            # Get the full image details
            image_details = self.get_image_details(image_id)
            assets = image_details.get("assets", {})

            # Collect download links for each requested band
            download_links = {}
            for band in bands:
                if band in assets:
                    download_links[band] = assets[band].get("href")

            # If we couldn't find direct band links, look for a data link
            if not download_links and "data" in assets:
                download_links["data"] = assets["data"].get("href")

            return download_links

        except Exception as e:
            self.logger.error(f"Error getting download links: {str(e)}")
            return {}

    def search_with_get(self, geometry, start_date=None, end_date=None, max_cloud_coverage=20):
        """
        Alternative search method using GET request instead of POST
        This is often more reliable as the STAC API implementation may have issues with CQL2
        """
        try:
            # Set default dates if not provided
            if not start_date:
                start_date = (datetime.datetime.now() - datetime.timedelta(days=15)).strftime("%Y-%m-%d")
            elif isinstance(start_date, datetime.datetime):
                start_date = start_date.strftime("%Y-%m-%d")

            if not end_date:
                end_date = datetime.datetime.now().strftime("%Y-%m-%d")
            elif isinstance(end_date, datetime.datetime):
                end_date = end_date.strftime("%Y-%m-%d")

            # Format the datetime for STAC API
            datetime_query = f"{start_date}T00:00:00Z/{end_date}T23:59:59Z"

            # Get the bounding box from the geometry for bbox query
            geom_shape = shape(geometry)
            bbox = geom_shape.bounds  # (minx, miny, maxx, maxy)
            bbox_str = f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}"

            # Build URL for searching Sentinel-2 L2A images
            url = f"{self.stac_base_url}/collections/SENTINEL-2/items"
            params = {
                "datetime": datetime_query,
                "bbox": bbox_str,
                "limit": 50  # Get more results
            }

            # Make the request
            self.logger.info(f"Searching STAC API with params: {params}")
            response = requests.get(url, params=params)
            response.raise_for_status()

            # Parse the response
            stac_response = response.json()

            # Filter by cloud coverage after retrieving results
            # (since we can't do this in the GET request)
            result = self._process_stac_response(stac_response)
            if max_cloud_coverage < 100:
                result = [img for img in result if img.get('cloudCoverage', 100) <= max_cloud_coverage]

            return result

        except Exception as e:
            self.logger.error(f"Error searching for images with GET: {str(e)}")
            raise e  # Re-raise to try the POST method

    def _process_stac_response(self, stac_response):
        """Helper method to process STAC API response"""
        images = []

        # Process each feature (image) from the response
        for feature in stac_response.get("features", []):
            # Extract basic metadata
            properties = feature.get("properties", {})
            image_id = feature.get("id", "").replace(".SAFE", "")

            # Extract date
            datetime_str = properties.get("datetime")
            if datetime_str:
                try:
                    date_obj = datetime.datetime.fromisoformat(datetime_str.replace("Z", "+00:00"))
                except ValueError:
                    # Fallback if the date format is unexpected
                    date_obj = datetime.datetime.now()
            else:
                date_obj = datetime.datetime.now()

            # Get cloud coverage
            cloud_coverage = properties.get("eo:cloud_cover", 0)

            # Get the sun angle if available
            sun_azimuth = properties.get("view:sun_azimuth")
            sun_elevation = properties.get("view:sun_elevation")

            # Get preview URL
            assets = feature.get("assets", {})
            preview_url = None
            if "preview" in assets and "href" in assets["preview"]:
                preview_url = assets["preview"]["href"]
            elif "thumbnail" in assets and "href" in assets["thumbnail"]:
                preview_url = assets["thumbnail"]["href"]
            elif "overview" in assets and "href" in assets["overview"]:
                preview_url = assets["overview"]["href"]

            # List available bands
            bands = []
            for asset_name, asset_info in assets.items():
                if asset_name.startswith("B") and len(asset_name) <= 3:
                    bands.append(asset_name)

            # Get center coordinates for water level station lookup
            center_lon = None
            center_lat = None
            if feature.get("geometry"):
                bbox = shape(feature.get("geometry")).bounds
                center_lon = (bbox[0] + bbox[2]) / 2
                center_lat = (bbox[1] + bbox[3]) / 2

            # Add water level data if available
            water_level_data = None
            nearest_station = None

            if self.water_level_service and center_lon is not None and center_lat is not None:
                try:
                    # Find the nearest water level station
                    nearest_station = self.water_level_service.find_nearest_station(center_lon, center_lat)

                    if nearest_station and nearest_station.get("stationId"):
                        # Get water level at the image capture time
                        water_level_data = self.water_level_service.get_water_level_at_time(
                            nearest_station.get("stationId"),
                            date_obj
                        )
                except Exception as water_level_err:
                    self.logger.error(f"Error fetching water level data: {str(water_level_err)}")

            # Create image info object
            image_info = {
                "id": image_id,
                "date": date_obj.isoformat(),
                "cloudCoverage": cloud_coverage,
                "preview_url": preview_url,
                "sun_azimuth": sun_azimuth,
                "sun_elevation": sun_elevation,
                "bands": bands if bands else ["B02", "B03", "B04", "B08"],  # Default if not found
                "metadata": {
                    "platform": properties.get("platform", "Sentinel-2"),
                    "instrument": properties.get("instrument", "MSI"),
                    "productType": properties.get("s2:product_type", "L2A"),
                    "epsg": 4326,
                    "orbit": properties.get("sat:orbit_state"),
                    "tile_id": properties.get("s2:tile_id")
                }
            }

            # Add water level data if available
            if water_level_data:
                image_info["waterLevel"] = {
                    "value": water_level_data.get("value"),
                    "observed": water_level_data.get("observed"),
                    "stationId": water_level_data.get("stationId"),
                    "parameterId": water_level_data.get("parameterId"),
                    "stationName": nearest_station.get("name") if nearest_station else None,
                    "stationDistance": nearest_station.get("distance") if nearest_station else None
                }

            # Add closest station info even if water level data is not available
            elif nearest_station:
                image_info["waterLevel"] = {
                    "stationId": nearest_station.get("stationId"),
                    "stationName": nearest_station.get("name"),
                    "stationDistance": nearest_station.get("distance"),
                    "value": None,
                    "message": "Water level data not available for the image capture time"
                }

            images.append(image_info)

        return images

    def _add_water_level_data(self, image_details):
        """Add water level data to image details"""
        if not self.water_level_service:
            return

        # Extract the datetime from the image details
        datetime_str = image_details.get("properties", {}).get("datetime")
        if not datetime_str:
            return

        # Get the center of the image geometry
        if image_details.get("geometry"):
            bbox = shape(image_details.get("geometry")).bounds
            center_lon = (bbox[0] + bbox[2]) / 2
            center_lat = (bbox[1] + bbox[3]) / 2
        else:
            return

        try:
            # Find the nearest water level station
            nearest_station = self.water_level_service.find_nearest_station(center_lon, center_lat)

            if nearest_station and nearest_station.get("stationId"):
                # Get water level at the image capture time
                date_obj = datetime.datetime.fromisoformat(datetime_str.replace("Z", "+00:00"))
                water_level_data = self.water_level_service.get_water_level_at_time(
                    nearest_station.get("stationId"),
                    date_obj
                )

                if water_level_data:
                    # Add water level data to the image details
                    if "properties" not in image_details:
                        image_details["properties"] = {}

                    image_details["properties"]["waterLevel"] = {
                        "value": water_level_data.get("value"),
                        "observed": water_level_data.get("observed"),
                        "stationId": water_level_data.get("stationId"),
                        "parameterId": water_level_data.get("parameterId"),
                        "stationName": nearest_station.get("name"),
                        "stationDistance": nearest_station.get("distance")
                    }
                else:
                    # Add station info even if water level data is not available
                    image_details["properties"]["waterLevel"] = {
                        "stationId": nearest_station.get("stationId"),
                        "stationName": nearest_station.get("name"),
                        "stationDistance": nearest_station.get("distance"),
                        "value": None,
                        "message": "Water level data not available for the image capture time"
                    }
        except Exception as e:
            self.logger.error(f"Error adding water level data: {str(e)}")
