"""
Database Service for MongoDB Operations
Python implementation of the Node.js MongoDB functionality
"""

import time
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Union
from pymongo import MongoClient, DESCENDING, ASCENDING
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError, OperationFailure
from PyQt5.QtCore import QObject, pyqtSignal, QTimer
from utils.logger import get_logger


class DatabaseService(QObject):
    """MongoDB database service for data management"""
    
    # Qt signals
    connection_status_changed = pyqtSignal(bool, str)
    record_inserted = pyqtSignal(dict)
    record_updated = pyqtSignal(dict)
    data_retrieved = pyqtSignal(list)
    error_occurred = pyqtSignal(str)
    
    def __init__(self, config):
        super().__init__()
        self.config = config
        self.logger = get_logger(__name__)
        
        # Database configuration
        db_config = config.get_database_config()
        self.connection_string = db_config['connection_string']
        self.database_name = db_config['database_name']
        self.collection_name = db_config['collection_name']
        
        # MongoDB client and database objects
        self.client = None
        self.database = None
        self.collection = None
        self.is_connected = False
        self.is_initialized = False
        
        # Connection monitoring
        self.connection_timer = QTimer()
        self.connection_timer.timeout.connect(self.check_connection)
        self.connection_timer.setInterval(10000)  # Check every 10 seconds
        
    def initialize(self) -> bool:
        """Initialize the database service"""
        try:
            self.logger.section("Database Service Initialization")
            self.logger.info(f"Connection String: {self.connection_string}")
            self.logger.info(f"Database: {self.database_name}")
            self.logger.info(f"Collection: {self.collection_name}")
            
            # Connect to MongoDB
            if self.connect():
                self.is_initialized = True
                self.connection_timer.start()
                self.logger.success("Database service initialized successfully")
                return True
            else:
                self.logger.error("Failed to connect to database during initialization")
                return False
                
        except Exception as e:
            self.logger.error(f"Failed to initialize database service: {e}")
            return False
    
    def connect(self) -> bool:
        """Connect to MongoDB"""
        try:
            self.logger.info("Connecting to MongoDB...")
            
            # Create MongoDB client
            self.client = MongoClient(
                self.connection_string,
                serverSelectionTimeoutMS=5000,  # 5 second timeout
                connectTimeoutMS=5000,
                socketTimeoutMS=5000
            )
            
            # Test connection
            self.client.admin.command('ping')
            
            # Get database and collection
            self.database = self.client[self.database_name]
            self.collection = self.database[self.collection_name]
            
            self.is_connected = True
            self.connection_status_changed.emit(True, "Connected")
            self.logger.success(f"Connected to MongoDB: {self.database_name}.{self.collection_name}")
            
            # Create indexes for better performance
            self.create_indexes()
            
            return True
            
        except ConnectionFailure as e:
            self.is_connected = False
            error_msg = f"MongoDB connection failed: {e}"
            self.logger.error(error_msg)
            self.connection_status_changed.emit(False, "Connection failed")
            self.error_occurred.emit(error_msg)
            return False
            
        except ServerSelectionTimeoutError as e:
            self.is_connected = False
            error_msg = f"MongoDB server selection timeout: {e}"
            self.logger.error(error_msg)
            self.connection_status_changed.emit(False, "Timeout")
            self.error_occurred.emit(error_msg)
            return False
            
        except Exception as e:
            self.is_connected = False
            error_msg = f"Error connecting to MongoDB: {e}"
            self.logger.error(error_msg)
            self.connection_status_changed.emit(False, f"Error: {e}")
            self.error_occurred.emit(error_msg)
            return False
    
    def disconnect(self):
        """Disconnect from MongoDB"""
        try:
            if self.client:
                self.client.close()
                self.client = None
                self.database = None
                self.collection = None
                
            self.is_connected = False
            self.connection_status_changed.emit(False, "Disconnected")
            self.logger.info("Disconnected from MongoDB")
            
            if self.connection_timer.isActive():
                self.connection_timer.stop()
                
        except Exception as e:
            self.logger.error(f"Error disconnecting from MongoDB: {e}")
    
    def check_connection(self):
        """Check and maintain database connection"""
        try:
            if self.client:
                # Ping the database to check connection
                self.client.admin.command('ping')
                if not self.is_connected:
                    self.is_connected = True
                    self.connection_status_changed.emit(True, "Reconnected")
                    self.logger.success("Database connection restored")
            else:
                if self.is_connected:
                    self.is_connected = False
                    self.connection_status_changed.emit(False, "Lost connection")
                self.connect()
                
        except Exception as e:
            if self.is_connected:
                self.is_connected = False
                self.connection_status_changed.emit(False, "Connection lost")
                self.logger.warning(f"Database connection lost: {e}")
    
    def create_indexes(self):
        """Create database indexes for better performance"""
        try:
            # Create indexes on commonly queried fields
            indexes = [
                ("Timestamp", DESCENDING),
                ("SerialNumber", ASCENDING),
                ("Date", DESCENDING),
                ("ModelNumber", ASCENDING),
                ("Grade", ASCENDING),
                ("Result", ASCENDING)
            ]
            
            for field, direction in indexes:
                try:
                    self.collection.create_index([(field, direction)])
                    self.logger.debug(f"Created index on {field}")
                except Exception as e:
                    self.logger.warning(f"Failed to create index on {field}: {e}")
                    
        except Exception as e:
            self.logger.warning(f"Error creating indexes: {e}")
    
    def insert_record(self, record: Dict[str, Any]) -> Optional[str]:
        """
        Insert a new record into the database
        
        Args:
            record: Record data to insert
            
        Returns:
            Record ID if successful, None otherwise
        """
        try:
            if not self.ensure_connection():
                return None
            
            # Add timestamp if not present
            if 'Timestamp' not in record:
                record['Timestamp'] = datetime.now()
            
            # Add date if not present
            if 'Date' not in record:
                record['Date'] = datetime.now().strftime('%Y-%m-%d')
            
            self.logger.database_operation("Insert", f"Record: {record.get('SerialNumber', 'N/A')}")
            
            result = self.collection.insert_one(record)
            
            if result.inserted_id:
                record['_id'] = str(result.inserted_id)
                self.logger.success(f"Record inserted with ID: {result.inserted_id}")
                self.record_inserted.emit(record)
                return str(result.inserted_id)
            else:
                self.logger.error("Failed to insert record")
                return None
                
        except Exception as e:
            error_msg = f"Exception inserting record: {e}"
            self.logger.error(error_msg)
            self.error_occurred.emit(error_msg)
            return None
    
    def update_record(self, record_id: str, update_data: Dict[str, Any]) -> bool:
        """
        Update an existing record
        
        Args:
            record_id: Record ID to update
            update_data: Data to update
            
        Returns:
            True if successful, False otherwise
        """
        try:
            if not self.ensure_connection():
                return False
            
            from bson import ObjectId
            
            # Add update timestamp
            update_data['UpdatedAt'] = datetime.now()
            
            self.logger.database_operation("Update", f"Record ID: {record_id}")
            
            result = self.collection.update_one(
                {'_id': ObjectId(record_id)},
                {'$set': update_data}
            )
            
            if result.modified_count > 0:
                self.logger.success(f"Record updated: {record_id}")
                update_data['_id'] = record_id
                self.record_updated.emit(update_data)
                return True
            else:
                self.logger.warning(f"No record updated for ID: {record_id}")
                return False
                
        except Exception as e:
            error_msg = f"Exception updating record {record_id}: {e}"
            self.logger.error(error_msg)
            self.error_occurred.emit(error_msg)
            return False
    
    def get_records(self, limit: int = 100, skip: int = 0, 
                   filters: Dict[str, Any] = None, 
                   sort_field: str = 'Timestamp', 
                   sort_direction: int = DESCENDING) -> List[Dict[str, Any]]:
        """
        Retrieve records from the database
        
        Args:
            limit: Maximum number of records to return
            skip: Number of records to skip
            filters: Query filters
            sort_field: Field to sort by
            sort_direction: Sort direction (ASCENDING or DESCENDING)
            
        Returns:
            List of records
        """
        try:
            if not self.ensure_connection():
                return []
            
            query = filters or {}
            
            self.logger.database_operation("Query", f"Limit: {limit}, Skip: {skip}")
            
            cursor = self.collection.find(query).sort(sort_field, sort_direction).skip(skip).limit(limit)
            records = list(cursor)
            
            # Convert ObjectId to string for JSON serialization
            for record in records:
                if '_id' in record:
                    record['_id'] = str(record['_id'])
            
            self.logger.success(f"Retrieved {len(records)} records")
            self.data_retrieved.emit(records)
            return records
            
        except Exception as e:
            error_msg = f"Exception retrieving records: {e}"
            self.logger.error(error_msg)
            self.error_occurred.emit(error_msg)
            return []
    
    def get_records_by_date_range(self, start_date: datetime, end_date: datetime, 
                                 limit: int = 1000) -> List[Dict[str, Any]]:
        """
        Get records within a date range
        
        Args:
            start_date: Start date
            end_date: End date
            limit: Maximum number of records
            
        Returns:
            List of records
        """
        filters = {
            'Timestamp': {
                '$gte': start_date,
                '$lte': end_date
            }
        }
        return self.get_records(limit=limit, filters=filters)
    
    def get_records_by_model(self, model_number: str, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Get records for a specific model number
        
        Args:
            model_number: Model number to filter by
            limit: Maximum number of records
            
        Returns:
            List of records
        """
        filters = {'ModelNumber': model_number}
        return self.get_records(limit=limit, filters=filters)
    
    def get_recent_records(self, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Get the most recent records
        
        Args:
            limit: Maximum number of records
            
        Returns:
            List of recent records
        """
        return self.get_records(limit=limit, sort_field='Timestamp', sort_direction=DESCENDING)
    
    def get_statistics(self) -> Dict[str, Any]:
        """
        Get database statistics
        
        Returns:
            Dictionary containing statistics
        """
        try:
            if not self.ensure_connection():
                return {}
            
            # Total records
            total_records = self.collection.count_documents({})
            
            # Records today
            today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            today_records = self.collection.count_documents({
                'Timestamp': {'$gte': today_start}
            })
            
            # Records this week
            week_start = today_start - timedelta(days=7)
            week_records = self.collection.count_documents({
                'Timestamp': {'$gte': week_start}
            })
            
            # Grade distribution
            grade_pipeline = [
                {'$group': {'_id': '$Grade', 'count': {'$sum': 1}}},
                {'$sort': {'count': -1}}
            ]
            grade_distribution = list(self.collection.aggregate(grade_pipeline))
            
            # Model distribution
            model_pipeline = [
                {'$group': {'_id': '$ModelNumber', 'count': {'$sum': 1}}},
                {'$sort': {'count': -1}},
                {'$limit': 10}
            ]
            model_distribution = list(self.collection.aggregate(model_pipeline))
            
            stats = {
                'total_records': total_records,
                'today_records': today_records,
                'week_records': week_records,
                'grade_distribution': grade_distribution,
                'model_distribution': model_distribution,
                'collection_name': self.collection_name,
                'database_name': self.database_name
            }
            
            self.logger.info(f"Database statistics: {total_records} total records")
            return stats
            
        except Exception as e:
            error_msg = f"Exception getting statistics: {e}"
            self.logger.error(error_msg)
            self.error_occurred.emit(error_msg)
            return {}
    
    def search_records(self, search_term: str, fields: List[str] = None, 
                      limit: int = 100) -> List[Dict[str, Any]]:
        """
        Search records by text
        
        Args:
            search_term: Text to search for
            fields: List of fields to search in
            limit: Maximum number of records
            
        Returns:
            List of matching records
        """
        try:
            if not self.ensure_connection():
                return []
            
            if not fields:
                fields = ['SerialNumber', 'MarkingData', 'ScannerData', 'ModelNumber']
            
            # Create regex search query
            search_query = {
                '$or': [
                    {field: {'$regex': search_term, '$options': 'i'}} 
                    for field in fields
                ]
            }
            
            return self.get_records(limit=limit, filters=search_query)
            
        except Exception as e:
            error_msg = f"Exception searching records: {e}"
            self.logger.error(error_msg)
            self.error_occurred.emit(error_msg)
            return []
    
    def delete_record(self, record_id: str) -> bool:
        """
        Delete a record
        
        Args:
            record_id: Record ID to delete
            
        Returns:
            True if successful, False otherwise
        """
        try:
            if not self.ensure_connection():
                return False
            
            from bson import ObjectId
            
            result = self.collection.delete_one({'_id': ObjectId(record_id)})
            
            if result.deleted_count > 0:
                self.logger.success(f"Record deleted: {record_id}")
                return True
            else:
                self.logger.warning(f"No record deleted for ID: {record_id}")
                return False
                
        except Exception as e:
            error_msg = f"Exception deleting record {record_id}: {e}"
            self.logger.error(error_msg)
            self.error_occurred.emit(error_msg)
            return False
    
    def ensure_connection(self) -> bool:
        """Ensure connection to database is active"""
        if not self.is_connected:
            return self.connect()
        return True
    
    def test_connection(self) -> bool:
        """Test the database connection"""
        try:
            if self.client:
                self.client.admin.command('ping')
                self.logger.success("Database connection test passed")
                return True
            else:
                self.logger.error("Database connection test failed - no client")
                return False
                
        except Exception as e:
            self.logger.error(f"Database connection test error: {e}")
            return False
    
    def get_connection_info(self) -> Dict[str, Any]:
        """Get connection information"""
        return {
            'connection_string': self.connection_string,
            'database_name': self.database_name,
            'collection_name': self.collection_name,
            'connected': self.is_connected,
            'initialized': self.is_initialized
        }
    
    def backup_collection(self, backup_path: str) -> bool:
        """
        Create a backup of the collection
        
        Args:
            backup_path: Path to save backup file
            
        Returns:
            True if successful, False otherwise
        """
        try:
            if not self.ensure_connection():
                return False
            
            import json
            
            records = self.get_records(limit=0)  # Get all records
            
            with open(backup_path, 'w') as f:
                json.dump(records, f, default=str, indent=2)
            
            self.logger.success(f"Backup created: {backup_path}")
            return True
            
        except Exception as e:
            error_msg = f"Exception creating backup: {e}"
            self.logger.error(error_msg)
            self.error_occurred.emit(error_msg)
            return False
    
    def close(self):
        """Close the database service"""
        try:
            self.logger.info("Closing database service...")
            
            if self.connection_timer.isActive():
                self.connection_timer.stop()
            
            self.disconnect()
            
            self.is_initialized = False
            self.logger.success("Database service closed")
            
        except Exception as e:
            self.logger.error(f"Error closing database service: {e}")
    
    def get_status(self) -> Dict[str, Any]:
        """Get current database status"""
        return {
            'initialized': self.is_initialized,
            'connected': self.is_connected,
            'database_name': self.database_name,
            'collection_name': self.collection_name,
            'connection_string': self.connection_string,
            'monitoring_active': self.connection_timer.isActive()
        } 