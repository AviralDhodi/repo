# VS Code Extension Overview - Salesforce Data & Permissions Comparison Tool

## Project Status
**WARNING**: This extension is in a poor state with multiple architectural/infrastructure patches and code scattered throughout. Variable names, folder/file names, function names, and comments CANNOT be trusted. Logic must be verified by examining the actual code implementation.

## Extension Architecture

### Platform Support
The extension has two versions current version being Windows:
1. **Windows x64**
   - Bundled Python (embedded in `py/` directory)
   - Pre-compiled Node modules
   - NodeJS Windows runtime
   - PowerShell commands

2. **macOS Silicon (ARM64)**
   - Pre-compiled Node modules
   - NodeJS Mac runtime
   - Terminal zsh commands

### Design Goals
- Built to run on corporate machines without admin privileges
- Uses Express server with routes within VS Code's Electron process
- UI follows Salesforce Lightning Design System (SLDS)


## Applications

### App 1: Data Comparison (Current Focus)
Compares configuration data between Salesforce orgs (e.g., Price Rules, Revenue Recognition Rules, Billing Rules).

#### Technology Stack
- Heavy reliance on GraphQL via SF CLI
- Python for data processing (JSONL to Parquet conversion, comparisons)
- Multi-process architecture with child spawners for parallel data fetching
- Buffer appender process for continuous data aggregation

#### Key Documentation Links

**GraphqL**
C:\ExtensionBuilds\Direct\GraphqlMd.md

**SLDS**
C:\ExtensionBuilds\Direct\sldsDoc.md

## SLDS Compliance
Three npm modules ensure SLDS compliance:
- **Linter**: https://www.lightningdesignsystem.com/2e1ef8501/p/012d73-slds-linter
- **Validator**: https://www.lightningdesignsystem.com/2e1ef8501/p/952cae-slds-validator
- **Scope Customizer**: https://www.lightningdesignsystem.com/2e1ef8501/p/014cb2-slds-scope-customizer


#### User Flow - Data Comparison App
1. **App Selection**: User chooses Data Comparison App
2. **Configuration**: Create new or upload existing config
3. **Org Selection**: Choose from authenticated orgs (fetched via CLI)
4. **Mode Selection**: Manual or SOQL check
5. **Object/Field Selection**: 
   - Select common objects and fields
   - Choose foreign key field (identifier between orgs)
   - Configure lookups with modal for foreign key selection
6. **Validation**: Validate configuration (stored in filesystem)
7. **Filter Configuration**: Set WHERE clauses per object/org
8. **Finalization**: Download config or start comparison
9. **Comparison Execution**:
   - Multiple child processes spawn for parallel GraphQL queries
   - Data saved as `.buffers` files
   - Appender process aggregates to JSONL files
   - Python converts JSONL to Parquet
   - Python performs comparison
10. **Results**: View in Git-like diff viewer, download CSV, or generate PDF reports

### App 2: Permissions Analyzer
Analyzes and compares permissions between Salesforce orgs.

## Known Issues (Priority Order)

### Priority 1 (Highest) - Critical Failures
- **GraphQL data fetch failing** for testConfigs JSON files
- Windows command line compatibility issues (no support for \n or \r)

UPDATE : FIXED Priority 1, by change of GraphQL Logic using Upper Limits. 

### Priority 1.5 - Major Bugs
- **Org names showing as `[object Object]`** in filter configuration
- Property not properly accessed in JavaScript
- Issue propagates to generated config JSON
UPDATE : FIXED Priority 1.5.

### Priority 2 - Functional Issues
- **Duplicate objects** appearing in object selection
- Should only show common objects between orgs
- Common fields selection should follow on Object click and common lookups as well.

FIXED

### Priority 3 - Feature Enhancements
- **SOQL check functionality** needs fixing
- **UI structure issues** in manual config (missing proper divs/lists)
- Filter configuration needs renaming to generic "FILTERS"

### Priority 4 - Minor Issues
- **Report generation and PDF download** functionality needs fixes

## Directory Structure Notes
- `py/`: Embedded Python for Windows
- `node_modules/`: Node dependencies (DO NOT ANALYZE)
- `NodeJS/`: Runtime environments for different platforms
- `apps/`: Main application code
- `shared/`: Shared utilities and UI components
- `storage/`: Config files and comparison results
- `testConfigs/`: Sample configuration files for testing

## Development Notes
- Extension built and patched multiple times
- Bundling and publishing handled across multiple Claude sessions
- Code organization is inconsistent
- Trust nothing - verify everything through code inspection


