# Scanner Controller Business Logic Documentation

## File Overview
- **Language**: JavaScript (ES6 modules)
- **Runtime**: Node.js
- **Framework**: Industrial automation system with PLC integration
- **Patterns**: Singleton, Event-driven architecture, State machine, Worker threads
- **High-level purpose**: Controls a laser marking system with multiple TCP scanners, PLC communication, and MongoDB data persistence for manufacturing quality control

## Business Logic Orchestrator Graph

```mermaid
graph TB
    A[System Startup] --> B[ScannerController Singleton]
    B --> C[Initialize Components]
    
    C --> D[MongoDB Connection]
    C --> E[TCP Scanner Services]
    C --> F[PLC Communication]
    C --> G[Barcode Generator]
    C --> H[Reset Monitor Worker]
    
    E --> E1[Main Scanner<br/>192.168.3.147:502]
    E --> E2[Middle Scanner<br/>192.168.3.148:502]
    
    I[Start Continuous Scan] --> J[Wait for Start Signal<br/>PLC Bit 1410.0]
    
    J --> K{Reset Signal<br/>1600.0?}
    K -->|Yes| L[Handle Reset]
    K -->|No| M[Execute Scan Cycle]
    
    M --> N[Step 1: First Scanner Check]
    N --> O[Step 2: Middle Scanner Check]
    O --> P[Step 3: Signal Transfer]
    P --> Q[Step 4: Verification Scanner]
    Q --> R[Step 5: Final Checks]
    
    R --> S{Cycle Success?}
    S -->|Yes| T[Increment Counter<br/>Save to DB<br/>Reset Bits]
    S -->|No| U[Log Failure<br/>Reset Bits]
    
    T --> V[2 Second Delay]
    U --> V
    V --> J
    
    L --> W[Reset PLC Bits<br/>Decrement Serial<br/>Restart Cycle]
    W --> J
    
    style A fill:#e1f5fe
    style B fill:#f3e5f5
    style M fill:#fff3e0
    style S fill:#e8f5e8
    style T fill:#c8e6c9
    style U fill:#ffcdd2
```

## Complete Business Flow Diagram

```mermaid
sequenceDiagram
    participant UI as Web UI
    participant SC as ScannerController
    participant PLC as PLC System
    participant MS as Main Scanner
    participant MidS as Middle Scanner
    participant DB as MongoDB
    participant RM as Reset Monitor
    
    Note over SC: System Initialization
    SC->>DB: Connect to MongoDB
    SC->>MS: Initialize TCP Connection (192.168.3.147:502)
    SC->>MidS: Initialize TCP Connection (192.168.3.148:502)
    SC->>RM: Start Reset Monitor Worker
    SC->>SC: Create Database Indexes
    
    Note over SC: Start Continuous Scanning
    UI->>SC: runContinuousScan()
    
    loop Continuous Scan Cycle
        SC->>PLC: Check Start Signal (1410.0)
        PLC-->>SC: Bit Status
        
        alt Reset Detected (1600.0)
            SC->>PLC: Reset Bits
            SC->>SC: Decrement Serial Number
            SC->>SC: Restart Cycle
        else Start Signal Active
            Note over SC: Step 1 - First Scanner Check
            SC->>PLC: Trigger First Scanner (1415.0)
            SC->>MS: Listen for Data
            SC->>MidS: Listen for Data
            MS-->>SC: Scanner Data (or timeout)
            SC->>PLC: Write NG Signal (1414.7)
            
            Note over SC: Step 2 - Middle Scanner Check
            SC->>PLC: Trigger Middle Scanner (1418.0)
            MidS-->>SC: Marking Data
            SC->>SC: Process Data (remove @ symbol)
            SC->>SC: Check for Duplicates (cached)
            
            alt Duplicate Found
                SC->>PLC: Signal Duplicate (1414.6)
                SC->>DB: Save Duplicate Record
                SC->>UI: Emit Duplicate Event
            else No Duplicate
                SC->>SC: Write to Files (code.txt, text.txt)
                SC->>DB: Insert New Record
                SC->>UI: Emit Marking Data
                
                Note over SC: Step 3 - Signal Transfer
                SC->>PLC: Signal File Transfer (1414.15)
                SC->>PLC: Wait for Response (1410.3)
                
                Note over SC: Step 4 - Verification Scanner
                SC->>PLC: Trigger Verification (1416.15)
                SC->>MS: Listen for Verification Data
                SC->>MidS: Listen for Verification Data
                MS-->>SC: Verification Data
                SC->>SC: Compare with Code File
                SC->>PLC: Signal Match Result (1414.3/1414.4)
                SC->>SC: Write to Multiple PLC Registers (3000+)
                SC->>SC: Save to D:/scan_data.txt
                SC->>DB: Update Record with Results
                
                Note over SC: Step 5 - Final Checks
                SC->>PLC: Wait for Final Signal (1415.7)
                SC->>SC: 3 Second Delay
                SC->>SC: Increment Cycle Counter
                SC->>DB: Broadcast to All Clients
                SC->>UI: Emit Cycle Completion
            end
        end
        
        SC->>PLC: Reset All Bits
        SC->>SC: 2 Second Delay Before Next Cycle
    end
```

## State Machine Diagram

```mermaid
stateDiagram-v2
    [*] --> Initializing
    Initializing --> WaitingForStart: Initialization Complete
    
    WaitingForStart --> FirstScan: Start Signal (1410.0)
    WaitingForStart --> Reset: Reset Signal (1600.0)
    
    FirstScan --> MiddleScan: Scanner Triggered
    FirstScan --> Reset: Reset Detected
    
    MiddleScan --> DuplicateCheck: Data Received
    MiddleScan --> Reset: Reset Detected
    
    DuplicateCheck --> SignalTransfer: No Duplicate
    DuplicateCheck --> WaitingForStart: Duplicate Found
    
    SignalTransfer --> VerificationScan: Transfer Complete (1410.3)
    SignalTransfer --> Reset: Reset Detected
    
    VerificationScan --> DataComparison: Scanner Data Received
    VerificationScan --> Reset: Reset Detected
    
    DataComparison --> FinalChecks: Comparison Complete
    
    FinalChecks --> CycleComplete: Final Signal (1415.7)
    FinalChecks --> Reset: Reset Detected
    FinalChecks --> SafetyViolation: Safety Error
    
    CycleComplete --> WaitingForStart: Cycle Counter Incremented
    
    Reset --> WaitingForStart: Reset Complete
    SafetyViolation --> WaitingForStart: Safety Cleared
    
    note right of Reset
        - Reset PLC bits
        - Decrement serial number
        - Clear scanner buffers
    end note
    
    note right of SafetyViolation
        Safety Checks:
        - Part Present (1490.0)
        - Emergency Stop (1490.1)
        - Safety Sensor (1490.2)
    end note
```

## Data Flow Architecture

```mermaid
graph LR
    subgraph "Input Sources"
        A1[Main TCP Scanner<br/>192.168.3.147:502]
        A2[Middle TCP Scanner<br/>192.168.3.148:502]
        A3[PLC System<br/>Modbus Registers]
    end
    
    subgraph "ScannerController Processing"
        B1[First Scan Handler]
        B2[Middle Scan Handler]
        B3[Verification Handler]
        B4[Data Comparison]
        B5[Duplicate Check Cache]
        B6[File Operations]
    end
    
    subgraph "Output Destinations"
        C1[MongoDB Records]
        C2[PLC Register Updates]
        C3[File System<br/>code.txt, text.txt<br/>D:/scan_data.txt]
        C4[Web UI Events]
        C5[Performance Metrics]
    end
    
    A1 --> B1
    A1 --> B3
    A2 --> B2
    A2 --> B3
    A3 --> B1
    A3 --> B2
    A3 --> B3
    
    B1 --> B4
    B2 --> B5
    B2 --> B6
    B3 --> B4
    B4 --> C2
    B4 --> C3
    
    B5 --> C1
    B6 --> C3
    
    B1 --> C4
    B2 --> C4
    B3 --> C4
    B4 --> C4
    B5 --> C5
    
    style A1 fill:#e3f2fd
    style A2 fill:#e3f2fd
    style A3 fill:#fff3e0
    style C1 fill:#e8f5e8
    style C2 fill:#fff3e0
    style C3 fill:#f3e5f5
    style C4 fill:#fce4ec
```

## PLC Register Map & Communication Flow

```mermaid
graph TD
    subgraph "PLC Input Registers (Read)"
        R1[1410.0 - Start Signal]
        R2[1410.3 - Transfer Complete]
        R3[1415.7 - Final Check]
        R4[1600.0 - Reset Signal]
        R5[1490.0 - Part Present Safety]
        R6[1490.1 - Emergency Stop]
        R7[1490.2 - Safety Sensor]
    end
    
    subgraph "PLC Output Registers (Write)"
        W1[1414.3 - Data Match OK]
        W2[1414.4 - Data Match NG]
        W3[1414.6 - Duplicate Detected]
        W4[1414.7 - Scanner NG]
        W5[1414.15 - File Transfer Signal]
        W6[1415.0 - First Scanner Trigger]
        W7[1416.15 - Verification Trigger]
        W8[1418.0 - Middle Scanner Trigger]
        W9[3000+ - Scanner Data Registers]
        W10[2999 - Data Length Register]
    end
    
    subgraph "Scanner Controller Logic"
        SC[ScannerController<br/>Business Logic]
    end
    
    R1 --> SC
    R2 --> SC
    R3 --> SC
    R4 --> SC
    R5 --> SC
    R6 --> SC
    R7 --> SC
    
    SC --> W1
    SC --> W2
    SC --> W3
    SC --> W4
    SC --> W5
    SC --> W6
    SC --> W7
    SC --> W8
    SC --> W9
    SC --> W10
    
    style R1 fill:#c8e6c9
    style R4 fill:#ffcdd2
    style R5 fill:#ffcdd2
    style R6 fill:#ffcdd2
    style R7 fill:#ffcdd2
    style SC fill:#e1f5fe
```

## Error Handling & Recovery Flow

```mermaid
graph TB
    A[Error Detected] --> B{Error Type?}
    
    B -->|Reset Signal| C[Reset Handler]
    B -->|Safety Violation| D[Safety Handler]
    B -->|Scanner Timeout| E[Scanner Recovery]
    B -->|MongoDB Error| F[Database Recovery]
    B -->|PLC Communication| G[PLC Recovery]
    B -->|File System| H[File Recovery]
    
    C --> C1[Reset PLC Bits]
    C1 --> C2[Decrement Serial Number]
    C2 --> C3[Clear Scanner Buffers]
    C3 --> I[Restart Cycle]
    
    D --> D1[Emit Safety Event to UI]
    D1 --> D2[Stop Current Cycle]
    D2 --> D3[Wait for Safety Clear]
    D3 --> I
    
    E --> E1[Clear Event Listeners]
    E1 --> E2[Reset Scanner Connections]
    E2 --> E3[Return NG Result]
    E3 --> I
    
    F --> F1[Retry Connection]
    F1 --> F2{Retry Success?}
    F2 -->|Yes| I
    F2 -->|No| F3[Log Error & Continue]
    F3 --> I
    
    G --> G1[Timeout Protection]
    G1 --> G2[Retry with Backoff]
    G2 --> I
    
    H --> H1[Try Alternative Path]
    H1 --> H2[Log File Error]
    H2 --> I
    
    I --> J[Continue Normal Operation]
    
    style A fill:#ffcdd2
    style C fill:#fff3e0
    style D fill:#ffcdd2
    style I fill:#c8e6c9
    style J fill:#e8f5e8
```

## Performance Optimization Architecture

```mermaid
graph LR
    subgraph "Performance Optimizations"
        A1[Duplicate Check Cache<br/>5-minute TTL<br/>100 entry limit]
        A2[Database Indexes<br/>MarkingData, SerialNumber<br/>Compound indexes]
        A3[Event Listener Management<br/>Clear/Reset between scans]
        A4[Scanner Buffer Management<br/>Clear before each scan]
        A5[Timeout Protection<br/>Prevent hanging operations]
        A6[Background Processing<br/>Worker threads for monitoring]
    end
    
    subgraph "Monitoring & Metrics"
        B1[Performance Metrics]
        B2[Cycle Counter Tracking]
        B3[Error Rate Monitoring]
        B4[Scanner Response Times]
        B5[Database Query Performance]
    end
    
    A1 --> B1
    A2 --> B5
    A3 --> B4
    A4 --> B4
    A5 --> B3
    A6 --> B2
    
    B1 --> C[UI Dashboard]
    B2 --> C
    B3 --> C
    B4 --> C
    B5 --> C
    
    style A1 fill:#e3f2fd
    style A2 fill:#e8f5e8
    style A6 fill:#f3e5f5
    style C fill:#fce4ec
```

## Key Business Rules & Logic

### 1. Scanner Priority & Fallback
- Both main and middle scanners listen simultaneously for data
- First scanner to respond wins
- Timeout handling returns "NG" to continue workflow

### 2. Duplicate Detection Logic
```javascript
// Cached duplicate checking with 5-minute TTL
// Performance optimization with MongoDB indexes
// Configurable to skip in debug mode
```

### 3. Data Processing Pipeline
```javascript
// Middle scan: Remove @ symbol prefix
// Verification: Compare against code.txt file
// PLC Writing: Split data into 16-bit registers (little-endian)
// File Writing: Multiple locations with fallback paths
```

### 4. Safety Interlocks
```javascript
// Continuous monitoring of safety bits:
// 1490.0 - Part not present
// 1490.1 - Emergency stop
// 1490.2 - Safety sensor not engaged
```

### 5. Reset Handling
```javascript
// Immediate cycle termination
// PLC bit cleanup
// Serial number decrement
// Scanner buffer clearing
// Automatic cycle restart
```

This documentation provides a comprehensive view of the scanner controller's business logic, showing how it orchestrates complex manufacturing workflows with multiple hardware components, safety systems, and data persistence requirements.