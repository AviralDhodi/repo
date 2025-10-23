// Missing API endpoints from backup that need to be added
const express = require('express');
const router = express.Router();
const { logger } = require('../../../shared/utils/logger');
const { getInstance: getPathResolver } = require('../../../shared/utils/pathResolver');
const pathResolver = getPathResolver();
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');

// Import comparison states from main index (these should be passed in or shared via a state manager)
// For now, we'll create local instances but in production these should be shared
const activeComparisons = global.activeComparisons || new Map();
const comparisonResults = global.comparisonResults || new Map();

// Get comparison status
router.get('/comparison-status/:id', (req, res) => {
  const { id } = req.params;
  const comparison = activeComparisons.get(id);
  
  if (!comparison) {
    return res.status(404).json({ 
      success: false,
      error: 'Comparison not found' 
    });
  }
  
  res.json({
    success: true,
    status: {
      id: comparison.id,
      phase: comparison.status || 'initializing',
      progress: comparison.progress || 0,
      currentObject: comparison.currentObject,
      recordsProcessed: comparison.recordsProcessed || 0,
      message: comparison.message || 'Processing...',
      startTime: comparison.startTime,
      phases: comparison.phases,
      error: comparison.error,
      endTime: comparison.endTime,
      resultPath: comparison.resultPath,
      warnings: comparison.warnings || [],
      duplicatesDetected: comparison.duplicatesDetected,
      duplicateDetails: comparison.duplicateDetails
    }
  });
});

// Get comparison results for viewer
router.get('/comparison/:id/results', async (req, res) => {
  const { id } = req.params;
  const comparison = activeComparisons.get(id) || comparisonResults.get(id);
  
  if (!comparison || !comparison.resultPath) {
    return res.status(404).json({ 
      error: 'Results not found' 
    });
  }
  
  try {
    const content = await fs.readFile(comparison.resultPath, 'utf8');
    res.setHeader('Content-Type', 'text/csv');
    res.send(content);
  } catch (error) {
    logger.error(`Failed to read results file: ${error.message}`);
    res.status(500).json({ 
      error: 'Failed to read results file' 
    });
  }
});

// Get duplicate report for a comparison
router.get('/comparison/:id/duplicates', async (req, res) => {
  const { id } = req.params;
  const comparison = activeComparisons.get(id);
  
  if (!comparison) {
    return res.status(404).json({ 
      success: false, 
      error: 'Comparison not found' 
    });
  }
  
  if (!comparison.duplicatesDetected || !comparison.duplicateReportPath) {
    return res.json({ 
      success: true, 
      report: null 
    });
  }
  
  try {
    const report = JSON.parse(await fs.readFile(comparison.duplicateReportPath, 'utf8'));
    res.json({ 
      success: true, 
      report 
    });
  } catch (error) {
    logger.error(`Failed to read duplicate report: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to read duplicate report' 
    });
  }
});

// Resolve duplicates
router.post('/resolve-duplicates/:id', async (req, res) => {
  const { id } = req.params;
  const { resolutions } = req.body;
  
  if (!resolutions) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing resolutions' 
    });
  }
  
  const comparison = activeComparisons.get(id);
  if (!comparison) {
    return res.status(404).json({ 
      success: false, 
      error: 'Comparison not found' 
    });
  }
  
  try {
    // Apply duplicate resolutions
    comparison.duplicatesResolved = true;
    comparison.status = 'data_prepared';
    comparison.resolutions = resolutions;
    
    // Continue comparison process
    // This would trigger the continuation of the comparison
    
    res.json({ 
      success: true, 
      message: 'Duplicates resolved, continuing comparison' 
    });
  } catch (error) {
    logger.error(`Failed to resolve duplicates: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Download CSV results
router.get('/download-csv/:id', async (req, res) => {
  const { id } = req.params;
  const comparison = activeComparisons.get(id) || comparisonResults.get(id);
  
  if (!comparison || !comparison.resultPath) {
    return res.status(404).json({ 
      error: 'Results not found' 
    });
  }
  
  try {
    const fileName = `comparison_${id}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    
    const content = await fs.readFile(comparison.resultPath, 'utf8');
    res.send(content);
  } catch (error) {
    logger.error(`Failed to download CSV: ${error.message}`);
    res.status(500).json({ 
      error: 'Failed to download CSV' 
    });
  }
});

// Download report
router.get('/download-report/:id', async (req, res) => {
  const { id } = req.params;
  const comparison = activeComparisons.get(id) || comparisonResults.get(id);
  
  if (!comparison) {
    return res.status(404).json({ 
      error: 'Comparison not found' 
    });
  }
  
  try {
    // Generate detailed report
    const report = {
      comparisonId: id,
      startTime: comparison.startTime,
      endTime: comparison.endTime,
      status: comparison.status,
      configuration: comparison.config,
      summary: {
        totalRecordsProcessed: comparison.recordsProcessed || 0,
        duplicatesFound: comparison.duplicatesDetected || false,
        warnings: comparison.warnings || []
      },
      phases: comparison.phases
    };
    
    const fileName = `report_${id}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(JSON.stringify(report, null, 2));
  } catch (error) {
    logger.error(`Failed to generate report: ${error.message}`);
    res.status(500).json({ 
      error: 'Failed to generate report' 
    });
  }
});

// Get common objects across organizations (with caching)
router.post('/common-objects', async (req, res) => {
  try {
    const { organizations } = req.body;

    if (!organizations || organizations.length < 2) {
      return res.json({
        success: false,
        error: 'At least 2 organizations required'
      });
    }

    // Create cache key from sorted org IDs
    const cacheKey = organizations.map(org => org.id || org).sort().join(',');

    // Check cache (5 minutes TTL)
    const cached = global.objectCache.commonObjects.get(cacheKey);
    const cacheAge = cached?.lastFetched
      ? (new Date() - cached.lastFetched) / 1000
      : Infinity;

    if (cached && cacheAge < 300) {
      logger.info(`Using cached common objects (${Math.round(cacheAge)}s old)`);
      return res.json({
        success: true,
        objects: cached.data,
        cached: true
      });
    }

    // Mock common objects for now (will be replaced with real API calls)
    const commonObjects = [
      { name: 'Account', label: 'Account' },
      { name: 'Contact', label: 'Contact' },
      { name: 'Opportunity', label: 'Opportunity' },
      { name: 'Lead', label: 'Lead' },
      { name: 'Case', label: 'Case' },
      { name: 'SBQQ__Quote__c', label: 'Quote' },
      { name: 'SBQQ__QuoteLine__c', label: 'Quote Line' },
      { name: 'SBQQ__Product__c', label: 'Product' },
      { name: 'SBQQ__PriceRule__c', label: 'Price Rule' },
      { name: 'SBQQ__PriceAction__c', label: 'Price Action' }
    ];

    // Update cache
    global.objectCache.commonObjects.set(cacheKey, {
      data: commonObjects,
      lastFetched: new Date()
    });

    logger.info('Fetched and cached common objects');

    res.json({
      success: true,
      objects: commonObjects,
      cached: false
    });
  } catch (error) {
    logger.error('Failed to fetch common objects:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get object fields (with caching)
router.post('/object-fields', async (req, res) => {
  try {
    const { object, organizations } = req.body;

    if (!object || !organizations) {
      return res.json({
        success: false,
        error: 'Object and organizations required'
      });
    }

    // Create cache key
    const orgIds = organizations.map(org => org.id || org).sort().join(',');
    const cacheKey = `${orgIds}:${object}`;

    // Check cache (5 minutes TTL)
    const cached = global.objectCache.objectFields.get(cacheKey);
    const cacheAge = cached?.lastFetched
      ? (new Date() - cached.lastFetched) / 1000
      : Infinity;

    if (cached && cacheAge < 300) {
      logger.info(`Using cached object fields for ${object} (${Math.round(cacheAge)}s old)`);
      return res.json({
        success: true,
        fields: cached.data.fields,
        lookups: cached.data.lookups,
        cached: true
      });
    }

    // Mock fields for now (will be replaced with real API calls)
    const fields = [
      { name: 'Id', label: 'Record ID', type: 'id' },
      { name: 'Name', label: 'Name', type: 'string' },
      { name: 'CreatedDate', label: 'Created Date', type: 'datetime' },
      { name: 'LastModifiedDate', label: 'Last Modified Date', type: 'datetime' },
      { name: 'OwnerId', label: 'Owner ID', type: 'reference', referenceTo: 'User' }
    ];

    // Add object-specific fields
    if (object.includes('SBQQ')) {
      fields.push(
        { name: 'SBQQ__Active__c', label: 'Active', type: 'boolean' },
        { name: 'SBQQ__Description__c', label: 'Description', type: 'textarea' }
      );
    }

    const lookups = fields.filter(f => f.type === 'reference').map(f => ({
      name: f.name,
      label: f.label,
      relationshipName: f.name.replace('Id', ''),
      referenceTo: f.referenceTo,
      fields: [
        { name: 'Id', label: 'ID', type: 'id' },
        { name: 'Name', label: 'Name', type: 'string' }
      ]
    }));

    // Update cache
    global.objectCache.objectFields.set(cacheKey, {
      data: { fields, lookups },
      lastFetched: new Date()
    });

    logger.info(`Fetched and cached object fields for ${object}`);

    res.json({
      success: true,
      fields: fields,
      lookups: lookups,
      cached: false
    });
  } catch (error) {
    logger.error('Failed to fetch object fields:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// State management endpoints
const stateManager = require('../state');

router.get('/state', (req, res) => {
  res.json(stateManager.getState());
});

router.post('/state/set', (req, res) => {
  const { component, data } = req.body;
  stateManager.setState(component, data);
  res.json({ success: true });
});

// Export for use in main routes
module.exports = {
  router,
  activeComparisons,
  comparisonResults
};