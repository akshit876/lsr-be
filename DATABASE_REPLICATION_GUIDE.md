# Database Replication Guide

## Overview

This guide helps you replicate your MongoDB database structure and sample data to a new machine for development or testing purposes.

## What You Get

### 🔍 Database Inspection

- View current database structure
- See sample documents from each collection
- Analyze database schemas
- Check indexes and statistics

### 📦 Database Export

- Complete database structure export
- First 10 records from each collection
- Index definitions
- Schema analysis
- Auto-generated replication scripts

### 🚀 Database Replication

- One-click setup on new machines
- Automatic database and collection creation
- Sample data insertion
- Index recreation

## Scripts Available

### 1. `inspect-database.js` - Quick Database Overview

```bash
node inspect-database.js
```

**Purpose**: Get a quick overview of your current database structure
**Output**: Console display of collections, sample documents, and schemas

**Example Output**:

```
📋 Found 3 collections in 'main-data' database
📄 Collection: records
📊 Stats: 45 documents, 12 KB
📝 Sample Documents (showing 3):
   1. Document ID: 65a1b2c3d4e5f6789
      Timestamp: 2024-01-15T10:30:00.000Z
      SerialNumber: 7386-123
      MarkingData: P5314775:57386:TTA:D25154:VR0003
      Result: OK
```

### 2. `export-db-structure.js` - Complete Export

```bash
node export-db-structure.js
```

**Purpose**: Create complete database export with replication scripts
**Output**:

- `database-exports/db-export-TIMESTAMP.json` - Complete export data
- `database-exports/replicate-db-TIMESTAMP.js` - Replication script
- `database-exports/README-TIMESTAMP.md` - Instructions

### 3. Auto-Generated Replication Script

```bash
node replicate-db-TIMESTAMP.js
```

**Purpose**: Set up database on new machine
**Requirements**: Node.js and MongoDB on target machine

## Step-by-Step Replication Process

### On Source Machine (Current Setup)

#### Step 1: Inspect Your Database

```bash
# Quick look at what you have
node inspect-database.js
```

#### Step 2: Export Database Structure

```bash
# Create replication package
node export-db-structure.js
```

This creates a `database-exports` folder with:

- Export data file
- Replication script
- README with instructions

#### Step 3: Package for Transfer

```bash
# Zip the export folder for easy transfer
tar -czf database-export-$(date +%Y%m%d).tar.gz database-exports/
```

### On Target Machine (New Setup)

#### Step 1: Prerequisites

```bash
# Install Node.js (if not already installed)
# Install MongoDB (if not already installed)

# Install MongoDB driver
npm install mongodb
```

#### Step 2: Transfer Files

Copy the exported files to your new machine:

- Via USB drive, network share, or cloud storage
- Extract the archive if zipped

#### Step 3: Run Replication

```bash
# Navigate to the export directory
cd database-exports

# Run the replication script
node replicate-db-TIMESTAMP.js
```

#### Step 4: Verify Setup

```bash
# Check if replication worked
# (copy inspect-database.js to new machine first)
node inspect-database.js
```

## Configuration Options

### MongoDB Connection

The replication script connects to `mongodb://localhost:27017` by default.

**For different MongoDB setups**:

```bash
# Different host/port
MONGODB_URI="mongodb://192.168.1.100:27017" node replicate-db-TIMESTAMP.js

# MongoDB with authentication
MONGODB_URI="mongodb://username:password@localhost:27017" node replicate-db-TIMESTAMP.js

# MongoDB Atlas
MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net" node replicate-db-TIMESTAMP.js
```

### Customizing Export

Edit `export-db-structure.js` to:

```javascript
// Export different databases
const databasesToExport = [
  "main-data",
  "config-data",
  "logs-data", // Add more databases
];

// Change sample size (default: 10 records)
const sampleDocs = await mongoDbService.collection
  .find({})
  .limit(20) // Change to 20 records
  .toArray();
```

## Database Structure Overview

### Expected Collections in `main-data`

1. **`records`** - Main production data

   - **Fields**: Timestamp, SerialNumber, MarkingData, ScannerData, Result, etc.
   - **Purpose**: Stores all production cycle records
   - **Sample Size**: First 10 records

2. **`config`** - Configuration settings

   - **Fields**: partNo, currentModelConfig, etc.
   - **Purpose**: System configuration and model settings
   - **Sample Size**: All records (usually 1-5)

3. **`serialconfig`** - Serial number configuration
   - **Fields**: modelNumber, currentSerial, resetTime, etc.
   - **Purpose**: Serial number management per model
   - **Sample Size**: All records

### Index Information

The export includes all custom indexes:

- Unique constraints
- Performance indexes
- Compound indexes

## Troubleshooting

### Common Issues

#### 1. "Connection Failed" Error

```bash
# Check MongoDB is running
mongosh --eval "db.adminCommand('ping')"

# Check connection string
echo $MONGODB_URI
```

#### 2. "Database Not Found" Error

```bash
# List available databases
mongosh --eval "show dbs"
```

#### 3. "Permission Denied" Error

```bash
# Check MongoDB permissions
mongosh --eval "db.runCommand({connectionStatus: 1})"
```

#### 4. "Module Not Found" Error

```bash
# Install dependencies
npm install mongodb
```

### Verification Commands

#### Check Database Contents

```javascript
// In mongosh
use main-data
show collections
db.records.count()
db.records.findOne()
```

#### Compare Record Counts

```bash
# On source machine
node -e "
import mongoDbService from './services/mongoDbService.js';
await mongoDbService.connect('main-data', 'records');
console.log('Records:', await mongoDbService.collection.countDocuments());
process.exit(0);
"

# On target machine (same command)
```

## Best Practices

### For Development Setup

- Use sample data export (10 records per collection)
- Focus on database structure over data volume
- Test with minimal data first

### For Production Migration

- Use proper MongoDB backup tools (mongodump/mongorestore)
- Include all data, not just samples
- Plan for downtime and data consistency

### Security Considerations

- Don't include sensitive production data in exports
- Use environment variables for connection strings
- Review exported data before transferring

## Advanced Usage

### Selective Collection Export

Modify the export script to only export specific collections:

```javascript
// In export-db-structure.js
const collectionsToExport = ["records", "config"]; // Only these collections

for (const collectionInfo of collections) {
  if (collectionsToExport.includes(collectionInfo.name)) {
    await this.exportCollection(dbName, collectionInfo.name);
  }
}
```

### Custom Sample Sizes

Different sample sizes per collection:

```javascript
// In exportCollection method
const sampleSize =
  collectionName === "records"
    ? 10
    : collectionName === "config"
      ? -1 // All records
      : 5; // Default

const sampleDocs =
  sampleSize === -1
    ? await mongoDbService.collection.find({}).toArray()
    : await mongoDbService.collection.find({}).limit(sampleSize).toArray();
```

### Automated Scheduling

Set up automated exports:

```bash
# Add to crontab for daily exports
0 2 * * * cd /path/to/project && node export-db-structure.js
```

## File Structure After Export

```
database-exports/
├── db-export-2024-01-15T10-30-00-000Z.json
├── replicate-db-2024-01-15T10-30-00-000Z.js
└── README-2024-01-15T10-30-00-000Z.md
```

## Integration with Manual Entry System

The exported database structure will include:

- All existing scanner workflow data
- Configuration for manual entry workflow
- Sample records showing both workflow types
- Proper indexes for UI performance

This ensures your new machine can run either workflow seamlessly.

## Next Steps

1. **Run inspection**: `node inspect-database.js`
2. **Create export**: `node export-db-structure.js`
3. **Transfer to new machine**
4. **Run replication script**
5. **Verify with inspection on new machine**
6. **Start your application**

The new machine will have the same database structure and sample data, ready for development or testing of both scanner and manual entry workflows.
