// SOQL Configuration API with Validation and Cleaning
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { getInstance: getPathResolver } = require('../../../shared/utils/pathResolver');
const { logger } = require('../../../shared/utils/logger');

const router = express.Router();
const pathResolver = getPathResolver();

// SOQL Parser and Cleaner based on soqlToConfig.js patterns
class SOQLParser {
    constructor() {
        this.foreignKeyPatterns = [
            'Id',
            '__c',
            'Name',
            'External_ID__c',
            'ExternalId__c',
            'External_Id__c'
        ];
    }

    // Clean and parse SOQL query
    parseSOQL(soql) {
        // Remove extra whitespace, newlines, carriage returns
        const cleanedSOQL = soql.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
        
        // Enhanced regex patterns for parsing
        const selectMatch = cleanedSOQL.match(/SELECT\s+([\s\S]+?)\s+FROM/i);
        const fromMatch = cleanedSOQL.match(/FROM\s+(\w+)(?:\s+WHERE|\s*$)/i);
        const whereMatch = cleanedSOQL.match(/WHERE\s+([\s\S]+?)(?:\s+ORDER\s+BY|\s+LIMIT|\s*$)/i);
        
        if (!selectMatch || !fromMatch) {
            throw new Error('Invalid SOQL query format. Must contain SELECT and FROM clauses.');
        }
        
        const fields = this.parseFields(selectMatch[1]);
        const objectName = fromMatch[1].trim();
        const whereClause = whereMatch ? whereMatch[1].trim() : null;
        
        return {
            fields,
            objectName,
            whereClause,
            cleanedQuery: this.reconstructQuery(fields, objectName, whereClause)
        };
    }
    
    // Parse and clean field list
    parseFields(fieldsStr) {
        const fields = [];
        const fieldParts = fieldsStr.split(',');
        
        fieldParts.forEach(field => {
            let cleaned = field.trim();
            
            // Remove aliases (field AS alias or field alias)
            const aliasMatch = cleaned.match(/^(\S+)\s+(?:AS\s+)?(\w+)$/i);
            if (aliasMatch) {
                cleaned = aliasMatch[1];
                // Mark if it was aliased as 'Ext' (foreign key indicator)
                if (aliasMatch[2].toLowerCase() === 'ext') {
                    cleaned = cleaned + '__FK_MARKER__';
                }
            }
            
            // Convert relationship fields
            if (cleaned.includes('__r.')) {
                // Custom relationship: Account__r.Name -> Account__c
                cleaned = cleaned.replace(/__r\./g, '__c.');
            }
            
            // Handle standard relationships
            if (cleaned.includes('.') && !cleaned.includes('__')) {
                const [relationship, fieldName] = cleaned.split('.');
                // Standard relationships need Id suffix
                const standardRelationships = {
                    'Owner': 'OwnerId',
                    'CreatedBy': 'CreatedById',
                    'LastModifiedBy': 'LastModifiedById',
                    'Parent': 'ParentId',
                    'Account': 'AccountId',
                    'Contact': 'ContactId'
                };
                
                const relationshipField = standardRelationships[relationship] || `${relationship}Id`;
                cleaned = fieldName ? `${relationshipField}.${fieldName}` : relationshipField;
            }
            
            if (cleaned && cleaned !== '') {
                fields.push(cleaned);
            }
        });
        
        return fields;
    }
    
    // Identify the most likely foreign key field
    identifyForeignKey(fields) {
        // Priority 1: Field marked with __FK_MARKER__
        const markedField = fields.find(f => f.includes('__FK_MARKER__'));
        if (markedField) {
            return markedField.replace('__FK_MARKER__', '');
        }
        
        // Priority 2: Id field
        if (fields.includes('Id')) {
            return 'Id';
        }
        
        // Priority 3: External ID fields
        const externalIdField = fields.find(f => 
            f.toLowerCase().includes('external') && 
            (f.toLowerCase().includes('id') || f.endsWith('__c'))
        );
        if (externalIdField) {
            return externalIdField;
        }
        
        // Priority 4: Name field
        if (fields.includes('Name')) {
            return 'Name';
        }
        
        // Priority 5: First custom field
        const customField = fields.find(f => f.endsWith('__c'));
        if (customField) {
            return customField;
        }
        
        // Default: first field
        return fields[0] || 'Id';
    }
    
    // Reconstruct clean SOQL query
    reconstructQuery(fields, objectName, whereClause) {
        // Remove FK markers from fields for final query
        const cleanFields = fields.map(f => f.replace('__FK_MARKER__', ''));
        
        let query = `SELECT ${cleanFields.join(', ')}\nFROM ${objectName}`;
        if (whereClause) {
            query += `\nWHERE ${whereClause}`;
        }
        return query;
    }
    
    // Validate that selected object matches SOQL object
    validateObjectMatch(selectedObject, soqlObject) {
        if (!selectedObject || !soqlObject) {
            return { valid: false, message: 'Object names are required' };
        }
        
        if (selectedObject.toLowerCase() !== soqlObject.toLowerCase()) {
            return { 
                valid: false, 
                message: `Selected object (${selectedObject}) does not match SOQL object (${soqlObject})` 
            };
        }
        
        return { valid: true };
    }
}

// Instantiate parser
const soqlParser = new SOQLParser();

// Validate SOQL query
router.post('/validate-soql', async (req, res) => {
    try {
        const { query, selectedObject, mode } = req.body;
        
        if (!query) {
            return res.json({
                success: false,
                error: 'SOQL query is required'
            });
        }
        
        // Parse SOQL
        const parsed = soqlParser.parseSOQL(query);
        
        // Validate object match if object was selected
        if (selectedObject) {
            const objectValidation = soqlParser.validateObjectMatch(selectedObject, parsed.objectName);
            if (!objectValidation.valid) {
                return res.json({
                    success: false,
                    error: objectValidation.message
                });
            }
        }
        
        // Identify foreign key
        const foreignKey = soqlParser.identifyForeignKey(parsed.fields);
        
        // Return validation result
        res.json({
            success: true,
            data: {
                object: parsed.objectName,
                fields: parsed.fields.map(f => f.replace('__FK_MARKER__', '')),
                foreignKey: foreignKey,
                whereClause: parsed.whereClause,
                cleanedQuery: parsed.cleanedQuery,
                fieldCount: parsed.fields.length
            }
        });
        
    } catch (error) {
        logger.error('SOQL validation error:', error);
        res.json({
            success: false,
            error: error.message || 'Failed to validate SOQL query'
        });
    }
});

// Generate configuration from SOQL
router.post('/generate-soql-config', async (req, res) => {
    try {
        const { 
            queries, // Array of queries for separate mode or single query for shared
            mode, // 'shared' or 'separate'
            organizations,
            foreignKey: userForeignKey // User can override auto-detected FK
        } = req.body;
        
        if (!organizations || organizations.length < 2) {
            return res.json({
                success: false,
                error: 'At least 2 organizations are required'
            });
        }
        
        const objects = {};
        let totalFields = 0;
        
        if (mode === 'shared') {
            // Single query for all orgs
            const parsed = soqlParser.parseSOQL(queries);
            const fk = userForeignKey || soqlParser.identifyForeignKey(parsed.fields);
            const cleanFields = parsed.fields.map(f => f.replace('__FK_MARKER__', ''));
            
            // Create org filters if WHERE clause exists
            const orgFilters = {};
            if (parsed.whereClause) {
                organizations.forEach(org => {
                    orgFilters[org.username] = { 
                        customFilter: parsed.whereClause 
                    };
                });
            }
            
            objects[parsed.objectName] = {
                fields: cleanFields,
                foreignKey: fk,
                orgFilters: orgFilters
            };
            
            totalFields = cleanFields.length;
            
        } else {
            // Separate queries per org
            queries.forEach((queryData, index) => {
                const org = organizations[index];
                const parsed = soqlParser.parseSOQL(queryData.query);
                
                if (!objects[parsed.objectName]) {
                    const fk = userForeignKey || soqlParser.identifyForeignKey(parsed.fields);
                    const cleanFields = parsed.fields.map(f => f.replace('__FK_MARKER__', ''));
                    
                    objects[parsed.objectName] = {
                        fields: cleanFields,
                        foreignKey: fk,
                        orgFilters: {}
                    };
                    totalFields = cleanFields.length;
                }
                
                // Add org-specific filter
                if (parsed.whereClause) {
                    objects[parsed.objectName].orgFilters[org.username] = {
                        customFilter: parsed.whereClause
                    };
                }
            });
        }
        
        // Generate configuration
        const config = {
            version: '2.0.0',
            createdAt: new Date().toISOString(),
            orgs: organizations.map(org => org.username),
            objects: objects,
            fetchMethod: 'graphql',
            metadata: {
                totalOrgs: organizations.length,
                totalObjects: Object.keys(objects).length,
                totalFields: totalFields,
                configGenerator: 'soql-mode',
                uiVersion: 'v3-slds2',
                fetchMethod: 'graphql'
            }
        };
        
        // Save configuration
        const configId = `config_soql_${Date.now()}`;
        const configPath = pathResolver.getStoragePath('data-comparison', 'config', `${configId}.json`);
        
        // Ensure directory exists
        const configDir = path.dirname(configPath);
        await fs.mkdir(configDir, { recursive: true });
        
        // Write config file
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));
        
        logger.info(`SOQL config saved: ${configId}`);
        
        res.json({
            success: true,
            configId: configId,
            config: config
        });
        
    } catch (error) {
        logger.error('Config generation error:', error);
        res.json({
            success: false,
            error: error.message || 'Failed to generate configuration'
        });
    }
});

// Download configuration
router.get('/download-config/:configId', async (req, res) => {
    try {
        const { configId } = req.params;
        const configPath = pathResolver.getStoragePath('data-comparison', 'config', `${configId}.json`);
        
        const configData = await fs.readFile(configPath, 'utf8');
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${configId}.json"`);
        res.send(configData);
        
    } catch (error) {
        logger.error('Config download error:', error);
        res.status(404).json({
            error: 'Configuration not found'
        });
    }
});

module.exports = router;