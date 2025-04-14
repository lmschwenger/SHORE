# app/services/water_level_service.py
import datetime
import logging
import requests
from flask import current_app
from typing import Dict, List, Optional, Union, Any


class WaterLevelService:
    """Service for interacting with DMI Water Level API"""

    def __init__(self, api_key: Optional[str] = None):
        self.logger = logging.getLogger(__name__)
        self.base_url = "https://dmigw.govcloud.dk/v2/oceanObs"
        self.api_key = api_key

    def set_api_key(self, api_key: str):
        """Set the API key for the DMI API"""
        self.api_key = api_key

    def get_water_level_at_time(self, station_id: str, timestamp: Union[str, datetime.datetime],
                                parameter_id: str = "sealev_dvr") -> Optional[Dict[str, Any]]:
        """
        Get water level data from a specific station at a specific time

        Parameters:
        - station_id: The ID of the DMI water level station
        - timestamp: The timestamp to get water level for (ISO format or datetime object)
        - parameter_id: The parameter ID to fetch (default: sealev_dvr)

        Returns:
        - Dictionary with water level data or None if not found
        """
        try:
            # Format the timestamp if it's a datetime object
            if isinstance(timestamp, datetime.datetime):
                timestamp_str = timestamp.strftime("%Y-%m-%dT%H:%M:%SZ")
            else:
                # If it's already a string, ensure it's in the correct format
                # Convert to datetime and back to string to ensure format
                try:
                    dt = datetime.datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                    timestamp_str = dt.strftime("%Y-%m-%dT%H:%M:%SZ")
                except ValueError:
                    self.logger.error(f"Invalid timestamp format: {timestamp}")
                    return None

            # Calculate a 10-minute window around the timestamp (±5 minutes)
            dt = datetime.datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
            start_time = (dt - datetime.timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
            end_time = (dt + datetime.timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M:%SZ")

            # Build the URL with datetime range
            datetime_param = f"{start_time}/{end_time}"

            # Make the API request
            url = f"{self.base_url}/collections/observation/items"
            params = {
                "stationId": station_id,
                "parameterId": parameter_id,
                "datetime": datetime_param,
                "limit": 2,  # We only need a few closest readings
                "api-key": self.api_key
            }

            self.logger.info(f"Fetching water level data for station {station_id} at {timestamp_str}")
            response = requests.get(url, params=params)
            response.raise_for_status()

            # Parse the response
            data = response.json()
            features = data.get("features", [])

            if not features:
                self.logger.warning(f"No water level data found for station {station_id} at {timestamp_str}")
                return None

            # Find the closest reading to the requested timestamp
            closest_reading = min(features, key=lambda x: self._time_difference(
                x.get("properties", {}).get("observed", ""), timestamp_str))

            return {
                "value": closest_reading.get("properties", {}).get("value"),
                "observed": closest_reading.get("properties", {}).get("observed"),
                "stationId": closest_reading.get("properties", {}).get("stationId"),
                "parameterId": closest_reading.get("properties", {}).get("parameterId"),
                "qcStatus": closest_reading.get("properties", {}).get("qcStatus")
            }

        except Exception as e:
            self.logger.error(f"Error fetching water level data: {str(e)}")
            return None

    def find_nearest_station(self, lon: float, lat: float) -> Optional[Dict[str, Any]]:
        """
        Find the nearest water level station to a given coordinate

        Parameters:
        - lon: Longitude
        - lat: Latitude

        Returns:
        - Dictionary with station information or None if not found
        """
        try:
            # Make the API request to get all active stations
            url = f"{self.base_url}/collections/station/items"
            params = {
                "status": "Active",
                "limit": 100,  # Get more stations to ensure coverage
                "api-key": self.api_key
            }

            self.logger.info(f"Fetching water level stations near coordinates ({lon}, {lat})")
            response = requests.get(url, params=params)
            response.raise_for_status()

            # Parse the response
            data = response.json()
            features = data.get("features", [])

            if not features:
                self.logger.warning("No water level stations found")
                return None

            # Calculate distances and find the nearest station
            nearest_station = None
            min_distance = float('inf')

            for station in features:
                # Get station coordinates
                coordinates = station.get("geometry", {}).get("coordinates", [])
                if len(coordinates) < 2:
                    continue

                station_lon, station_lat = coordinates

                # Calculate distance (simple Euclidean distance is sufficient for small areas)
                distance = ((station_lon - lon) ** 2 + (station_lat - lat) ** 2) ** 0.5

                if distance < min_distance:
                    min_distance = distance
                    nearest_station = station

            if nearest_station:
                return {
                    "stationId": nearest_station.get("properties", {}).get("stationId"),
                    "name": nearest_station.get("properties", {}).get("name"),
                    "coordinates": nearest_station.get("geometry", {}).get("coordinates", []),
                    "distance": min_distance,
                    "parameterId": nearest_station.get("properties", {}).get("parameterId", [])
                }

            return None

        except Exception as e:
            self.logger.error(f"Error finding nearest station: {str(e)}")
            return None

    def get_all_stations(self) -> List[Dict[str, Any]]:
        """
        Get all active water level stations

        Returns:
        - List of dictionaries with station information
        """
        try:
            # Make the API request
            url = f"{self.base_url}/collections/station/items"
            params = {
                "status": "Active",
                "limit": 300,  # Get all stations
                "api-key": self.api_key
            }

            self.logger.info("Fetching all water level stations")
            response = requests.get(url, params=params)
            response.raise_for_status()

            # Parse the response
            data = response.json()
            features = data.get("features", [])

            # Extract relevant station information
            stations = []
            for station in features:
                properties = station.get("properties", {})
                if "sealev_dvr" in properties.get("parameterId", []):
                    stations.append({
                        "stationId": properties.get("stationId"),
                        "name": properties.get("name"),
                        "coordinates": station.get("geometry", {}).get("coordinates", []),
                        "parameterId": properties.get("parameterId", [])
                    })

            return stations

        except Exception as e:
            self.logger.error(f"Error fetching all stations: {str(e)}")
            return []

    def _time_difference(self, time1_str: str, time2_str: str) -> float:
        """
        Calculate the absolute time difference between two timestamp strings in seconds

        Parameters:
        - time1_str: First timestamp in ISO format
        - time2_str: Second timestamp in ISO format

        Returns:
        - Absolute time difference in seconds
        """
        try:
            time1 = datetime.datetime.fromisoformat(time1_str.replace('Z', '+00:00'))
            time2 = datetime.datetime.fromisoformat(time2_str.replace('Z', '+00:00'))
            return abs((time1 - time2).total_seconds())
        except Exception:
            # Return a large value if parsing fails
            return float('inf')