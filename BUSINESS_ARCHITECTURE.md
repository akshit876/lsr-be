# Business Logic Architecture & Component Integration

## High-Level System Architecture

```mermaid
C4Context
    title Scanner Controller System Context Diagram
    
    Person(operator, "Factory Operator", "Monitors manufacturing process via web interface")
    System(scannerController, "Scanner Controller System", "Orchestrates laser marking quality control workflow")
    
    System_Ext(plc, "PLC System", "Industrial controller managing manufacturing line")
    System_Ext(mainScanner, "Main TCP Scanner", "Barcode scanner at 192.168.3.147:502")
    System_Ext(middleScanner, "Middle TCP Scanner", "Marking data scanner at 192.168.3.148:502")
    System_Ext(mongodb, "MongoDB Database", "Stores manufacturing records and configuration")
    System_Ext(fileSystem, "File System", "Local file storage for scan data")
    
    Rel(operator, scannerController, "Uses", "Web UI")
    Rel(scannerController, plc, "Controls/Monitors", "Modbus TCP")
    Rel(scannerController, mainScanner, "Reads", "TCP Socket")
    Rel(scannerController, middleScanner, "Reads", "TCP Socket")
    Rel(scannerController, mongodb, "Stores/Retrieves", "MongoDB Driver")
    Rel(scannerController, fileSystem, "Writes", "Node.js fs")
```

## Component Architecture Deep Dive

```mermaid
C4Container
    title Scanner Controller Container Diagram
    
    Container(webUI, "Web UI", "React/Socket.IO", "Real-time monitoring dashboard")
    Container(scannerController, "ScannerController", "Node.js/Express", "Main orchestration logic")
    Container(resetMonitor, "Reset Monitor", "Worker Thread", "Monitors PLC reset signals")
    
    ContainerDb(mongodb, "MongoDB", "Document Database", "Manufacturing records storage")
    ContainerDb(fileCache, "File Cache", "Local Files", "Scanner data & comparison files")
    
    System_Ext(plc, "PLC System", "Modbus TCP interface")
    System_Ext(scanners, "TCP Scanners", "Network-connected barcode scanners")
    
    Rel(webUI, scannerController, "Socket.IO Events", "Real-time updates")
    Rel(scannerController, resetMonitor, "Worker Messages", "Reset coordination")
    Rel(scannerController, mongodb, "Database Operations", "CRUD operations")
    Rel(scannerController, fileCache, "File I/O", "Read/Write scan data")
    Rel(scannerController, plc, "Modbus Protocol", "Bit/Register operations")
    Rel(scannerController, scanners, "TCP Sockets", "Scanner data acquisition")
```

## Business Process Orchestration

```mermaid
graph TB
    subgraph "Manufacturing Line Integration"
        A1[Part Arrives at Station]
        A2[PLC Signals Start 1410.0]
        A3[Safety Systems Check]
        A4[Quality Control Process]
        A5[Part Released/Rejected]
    end
    
    subgraph "Scanner Controller Orchestration"
        B1[First Scanner Check<br/>Quality Pre-validation]
        B2[Middle Scanner Check<br/>Marking Data Acquisition]
        B3[Duplicate Detection<br/>Database Validation]
        B4[File Transfer Signal<br/>PLC Coordination]
        B5[Verification Scanner<br/>Final Quality Check]
        B6[Data Comparison<br/>Pass/Fail Decision]
        B7[Results Storage<br/>Database Update]
        B8[PLC Signal Update<br/>Manufacturing Decision]
    end
    
    subgraph "Data Management"
        C1[MongoDB Records<br/>Historical Data]
        C2[Performance Cache<br/>Duplicate Detection]
        C3[File System<br/>Scan Data Storage]
        C4[Real-time UI<br/>Operator Dashboard]
    end
    
    A1 --> A2
    A2 --> A3
    A3 --> B1
    
    B1 --> B2
    B2 --> B3
    B3 --> B4
    B4 --> B5
    B5 --> B6
    B6 --> B7
    B7 --> B8
    
    B3 -.-> C2
    B7 -.-> C1
    B5 -.-> C3
    B8 -.-> C4
    
    B8 --> A4
    A4 --> A5
    
    style A1 fill:#e3f2fd
    style A5 fill:#e8f5e8
    style B1 fill:#fff3e0
    style B8 fill:#fff3e0
    style C1 fill:#f3e5f5
    style C4 fill:#fce4ec
```

## Error Handling & Recovery Architecture

```mermaid
graph LR
    subgraph "Error Detection"
        E1[PLC Communication Errors]
        E2[Scanner Connection Failures]
        E3[Database Connection Issues]
        E4[File System Errors]
        E5[Safety Violations]
        E6[Reset Signals]
        E7[Timeout Conditions]
    end
    
    subgraph "Error Classification"
        F1[Critical Errors<br/>Stop Operation]
        F2[Recoverable Errors<br/>Retry with Backoff]
        F3[Warning Conditions<br/>Log and Continue]
    end
    
    subgraph "Recovery Actions"
        G1[Emergency Stop<br/>Safety First]
        G2[Connection Retry<br/>Exponential Backoff]
        G3[Alternative Paths<br/>Graceful Degradation]
        G4[Reset and Restart<br/>Clean State Recovery]
        G5[Operator Notification<br/>UI Alerts]
    end
    
    E5 --> F1
    E6 --> F1
    E1 --> F2
    E2 --> F2
    E3 --> F2
    E4 --> F3
    E7 --> F3
    
    F1 --> G1
    F1 --> G5
    F2 --> G2
    F2 --> G4
    F3 --> G3
    F3 --> G5
    
    style E5 fill:#ffcdd2
    style E6 fill:#ffcdd2
    style F1 fill:#ffcdd2
    style G1 fill:#ffcdd2
    style G5 fill:#fff3e0
```

## Performance Optimization Strategy

```mermaid
mindmap
  root((Performance<br/>Optimization))
    Database
      Indexed Queries
        MarkingData Index
        SerialNumber Index
        Compound Indexes
      Connection Pooling
        MongoDB Driver Pool
        Connection Reuse
      Query Optimization
        Projection Limiting
        Count vs Find
    Memory Management
      Cache Strategy
        5-minute TTL
        100-entry Limit
        LRU Eviction
      Event Listeners
        Clear After Use
        Prevent Memory Leaks
      Buffer Management
        Scanner Buffer Clear
        Data Queue Clear
    Network Optimization
      Connection Keepalive
        TCP Scanner Connections
        PLC Modbus Connection
      Timeout Management
        Scanner Response: 30s
        PLC Operations: 100s
        File Operations: 5s
      Retry Logic
        Exponential Backoff
        Circuit Breaker Pattern
    Concurrency
      Worker Threads
        Reset Monitor
        Background Processing
      Async Operations
        Promise.race for Timeouts
        Parallel Scanner Listening
      Resource Pooling
        Database Connections
        File Handles
```

## Data Flow & Business Rules Matrix

| Process Stage | Input Sources | Business Rules | Output Destinations | Error Handling |
|---------------|---------------|----------------|-------------------|----------------|
| **First Scanner** | Main/Middle TCP Scanners | Always continue workflow regardless of result | PLC bit 1414.7 (NG signal) | Timeout → NG, Continue |
| **Middle Scanner** | Middle TCP Scanner only | Remove @ prefix, Check duplicates | code.txt, text.txt, MongoDB insert | Duplicate → Stop, NG → Continue |
| **Duplicate Check** | MongoDB MarkingData field | 5-min cache, Performance tracking | PLC bit 1414.6, UI notification | DB error → Skip check |
| **File Transfer** | Processed marking data | Write verification files | Local file system | Write error → Try alternative path |
| **Verification** | Main/Middle TCP Scanners | Compare against code.txt | PLC bits 1414.3/4, Registers 3000+ | Timeout → Use NG |
| **PLC Register Write** | Scanner data string | Little-endian encoding, 2 chars per register | PLC registers 3000-N, Status 2999 | Write error → Log, continue |
| **File Persistence** | Scanner data | Multiple save locations with fallback | D:/scan_data.txt, ./scan_data.txt | Path error → Alternative |
| **Database Update** | Complete scan results | Update existing record by SerialNumber+Model | MongoDB records collection | Update fail → Insert new |
| **Final Checks** | PLC bit 1415.7 | 3-second delay, Safety monitoring | Cycle counter, UI broadcast | Safety violation → Stop |

## Integration Points & Dependencies

```mermaid
graph TD
    subgraph "External Dependencies"
        A1[PLC System<br/>Modbus TCP]
        A2[TCP Scanners<br/>Network Sockets]
        A3[MongoDB<br/>Database Server]
        A4[File System<br/>Local Storage]
        A5[Web UI<br/>Socket.IO Client]
    end
    
    subgraph "Internal Components"
        B1[ScannerController<br/>Main Orchestrator]
        B2[TcpScannerService<br/>Scanner Interface]
        B3[MongoDbService<br/>Database Interface]
        B4[BarcodeGenerator<br/>Serial Management]
        B5[ShiftUtility<br/>Shift Management]
        B6[Logger<br/>Logging Service]
    end
    
    subgraph "Worker Threads"
        C1[Reset Monitor<br/>Background Process]
    end
    
    A1 -.->|Modbus Protocol| B1
    A2 -.->|TCP Sockets| B2
    A3 -.->|MongoDB Driver| B3
    A4 -.->|Node.js fs| B1
    A5 -.->|Socket.IO Events| B1
    
    B1 --> B2
    B1 --> B3
    B1 --> B4
    B1 --> B5
    B1 --> B6
    B1 --> C1
    
    B2 --> A2
    B3 --> A3
    
    style A1 fill:#ffecb3
    style A2 fill:#ffecb3
    style A3 fill:#ffecb3
    style B1 fill:#e1f5fe
    style C1 fill:#f3e5f5
```

## Business Critical Success Factors

### 1. **Manufacturing Integration**
- **PLC Timing Synchronization**: Critical handshake protocols with manufacturing line
- **Safety System Integration**: Real-time monitoring of safety interlocks
- **Production Rate Matching**: 2-second cycle delays to match line speed

### 2. **Quality Assurance**
- **Duplicate Prevention**: Cached duplicate detection prevents rework
- **Data Verification**: Triple-check process (marking → verification → comparison)
- **Traceability**: Complete audit trail in MongoDB with timestamps

### 3. **System Reliability**
- **Graceful Degradation**: System continues operation despite component failures
- **Reset Recovery**: Automatic recovery from PLC reset signals
- **Connection Resilience**: Automatic reconnection for all network components

### 4. **Performance Requirements**
- **Real-time Response**: Sub-second response to PLC signals
- **Concurrent Operations**: Parallel scanner listening and safety monitoring
- **Memory Efficiency**: Bounded cache sizes and event listener cleanup

### 5. **Operational Visibility**
- **Real-time Dashboard**: Live cycle counter and status updates
- **Performance Metrics**: Scanner response times and error rates
- **Alert System**: Immediate notification of safety violations and duplicates

This architecture documentation demonstrates how the ScannerController serves as the central orchestrator for a complex manufacturing quality control system, integrating multiple hardware interfaces while maintaining safety, reliability, and performance requirements.