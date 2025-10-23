// Welcome Component Logic with Tabs - CPQ Toolset v3
(function() {
    'use strict';
    
    // Prevent multiple initializations
    if (window.welcomeComponentInitialized) {
        console.log('Welcome component already initialized, skipping...');
        return;
    }
    window.welcomeComponentInitialized = true;

    // Component state
    let isUploading = false;

    // DOM elements (will be initialized after DOM is ready)
    let configFileInput;
    let browseFilesBtn;
    let dropZone;
    let processFileBtn;
    let removeFileBtn;
    let fileSelectedDisplay;
    let selectedFileName;
    let loadingModal;
    let loadingBackdrop;

    // Initialize component
    function init() {
        console.log('Welcome component initializing...');

        // Initialize DOM elements for upload tab
        configFileInput = document.getElementById('config-file-input');
        browseFilesBtn = document.getElementById('browse-files-btn');
        dropZone = document.getElementById('file-drop-zone');
        processFileBtn = document.getElementById('process-file-btn');
        removeFileBtn = document.getElementById('remove-file-btn');
        fileSelectedDisplay = document.getElementById('file-selected-display');
        selectedFileName = document.getElementById('selected-file-name');
        loadingModal = document.getElementById('loading-modal');
        loadingBackdrop = document.getElementById('loading-backdrop');
        
        // Bind event listeners
        bindEvents();
        
        // Handle tab display based on component data
        if (window.componentData && window.componentData.activeTab === 'upload') {
            // Show upload tab
            const generateTab = document.getElementById('tab-generate');
            const uploadTab = document.getElementById('tab-upload');
            if (generateTab) generateTab.classList.add('slds-hide');
            if (uploadTab) uploadTab.classList.remove('slds-hide');
        }
        
        console.log('Welcome component initialized');
    }

    // Bind event listeners
    function bindEvents() {
        console.log('Binding events...');
        console.log('browseFilesBtn:', browseFilesBtn);
        console.log('configFileInput:', configFileInput);
        console.log('processFileBtn:', processFileBtn);
        console.log('dropZone:', dropZone);

        // Browse files button
        if (browseFilesBtn) {
            browseFilesBtn.addEventListener('click', handleBrowseClick);
            console.log('Browse button listener attached');
        } else {
            console.warn('Browse button not found!');
        }

        // Drop zone click
        if (dropZone) {
            dropZone.addEventListener('click', (e) => {
                if (e.target === dropZone || !e.target.closest('button')) {
                    handleBrowseClick();
                }
            });

            // Drag and drop events
            dropZone.addEventListener('dragover', handleDragOver);
            dropZone.addEventListener('dragleave', handleDragLeave);
            dropZone.addEventListener('drop', handleDrop);
            console.log('Drop zone listeners attached');
        }

        // File input change
        if (configFileInput) {
            configFileInput.addEventListener('change', handleFileSelection);
            console.log('File input listener attached');
        } else {
            console.warn('File input not found!');
        }

        // Process file button
        if (processFileBtn) {
            processFileBtn.addEventListener('click', handleProcessFileClick);
            console.log('Process file button listener attached');
        } else {
            console.warn('Process file button not found!');
        }

        // Remove file button
        if (removeFileBtn) {
            removeFileBtn.addEventListener('click', handleRemoveFileClick);
            console.log('Remove file button listener attached');
        } else {
            console.warn('Remove file button not found!');
        }

        // Prevent default form submission
        document.addEventListener('submit', (e) => e.preventDefault());
    }

    // Handle browse button click
    function handleBrowseClick(e) {
        if (e) e.stopPropagation();
        console.log('Browse button clicked!');
        if (isUploading) {
            console.log('Already uploading, returning...');
            return;
        }

        console.log('Triggering file input click...');
        configFileInput.click();
    }

    // Handle drag over
    function handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('slds-has-drag-over');
    }

    // Handle drag leave
    function handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('slds-has-drag-over');
    }

    // Handle drop
    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('slds-has-drag-over');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelection({ target: { files: [files[0]] } });
        }
    }

    // Handle file selection
    function handleFileSelection(event) {
        const file = event.target.files[0];

        if (!file) {
            return;
        }

        console.log('File selected:', file.name, file.type, file.size);

        // Validate file
        if (!validateFile(file)) {
            return;
        }

        // Show selected file
        if (selectedFileName) {
            selectedFileName.textContent = file.name;
        }
        if (fileSelectedDisplay) {
            fileSelectedDisplay.classList.remove('slds-hide');
        }

        // Store file for processing
        window.selectedConfigFile = file;
    }

    // Handle process file click
    function handleProcessFileClick() {
        if (!window.selectedConfigFile) {
            console.error('No file selected');
            return;
        }

        console.log('Processing file:', window.selectedConfigFile.name);
        uploadConfigFile(window.selectedConfigFile);
    }

    // Handle remove file click
    function handleRemoveFileClick() {
        console.log('Removing file');

        // Clear file input
        if (configFileInput) {
            configFileInput.value = '';
        }

        // Hide file selected display
        if (fileSelectedDisplay) {
            fileSelectedDisplay.classList.add('slds-hide');
        }

        // Clear stored file
        window.selectedConfigFile = null;

        console.log('File removed');
    }

    // Validate selected file
    function validateFile(file) {
        const allowedTypes = [
            'application/json',
            'text/csv',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel'
        ];
        
        const allowedExtensions = ['.json', '.csv', '.xlsx', '.xls'];
        const fileExtension = getFileExtension(file.name);
        
        // Check file size (10MB limit)
        if (file.size > 10 * 1024 * 1024) {
            showUploadStatus('File size must be less than 10MB', 'error');
            return false;
        }
        
        // Check file type
        if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
            showUploadStatus('Only JSON, CSV, and Excel files are allowed', 'error');
            return false;
        }
        
        return true;
    }

    // Get file extension
    function getFileExtension(filename) {
        return filename.toLowerCase().substring(filename.lastIndexOf('.'));
    }

    // Upload configuration file
    async function uploadConfigFile(file) {
        isUploading = true;
        showLoading('Uploading configuration file...');
        showUploadStatus('Processing file...', 'processing');
        
        try {
            const formData = new FormData();
            formData.append('configFile', file);
            
            const response = await fetch('/data-comparison/api/config/upload', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.success) {
                showUploadStatus('Configuration uploaded successfully!', 'success');

                // Start comparison with the uploaded config
                setTimeout(async () => {
                    try {
                        const startResponse = await fetch('/data-comparison/api/comparison/start', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ config: result.config })
                        });

                        const startResult = await startResponse.json();

                        if (startResult.success && startResult.comparisonId) {
                            window.location.href = `/data-comparison/comparison-status?comparisonId=${startResult.comparisonId}`;
                        } else {
                            throw new Error(startResult.error || 'Failed to start comparison');
                        }
                    } catch (error) {
                        console.error('Failed to start comparison:', error);
                        showUploadStatus(`Failed to start comparison: ${error.message}`, 'error');
                        hideLoading();
                    }
                }, 1500);
            } else {
                throw new Error(result.error || result.message || 'Upload failed');
            }
            
        } catch (error) {
            console.error('Upload failed:', error);
            showUploadStatus(`Upload failed: ${error.message}`, 'error');
        } finally {
            isUploading = false;
            hideLoading();
            
            // Reset file input
            configFileInput.value = '';
        }
    }

    // Handle create configuration button click
    function handleCreateConfigClick() {
        console.log('Create config button clicked!');
        console.log('Starting configuration creation...');
        showLoading('Loading configuration generator...');
        
        // Navigate to configuration generator
        setTimeout(() => {
            console.log('Navigating to config generator...');
            navigateToConfigGenerator();
        }, 500);
    }

    // Show upload status using SLDS toast
    function showUploadStatus(message, type) {
        // Toast elements not present in current HTML - using console logging instead
        console.log(`Upload Status [${type}]: ${message}`);
        
        // Alternative: Show status in loading modal for now
        if (type === 'error') {
            alert(`Error: ${message}`);
        } else if (type === 'success') {
            // Show success briefly in loading modal
            showLoading(message);
            setTimeout(() => {
                hideLoading();
            }, 2000);
        }
    }

    // Show loading overlay
    function showLoading(message = 'Loading...') {
        console.log(`[Loading] ${message}`);

        const loadingText = document.getElementById('loadingText');

        if (loadingText) {
            loadingText.textContent = message;
        }

        if (loadingModal && loadingBackdrop) {
            loadingModal.classList.add('slds-fade-in-open');
            loadingBackdrop.classList.add('slds-backdrop_open');
            loadingModal.setAttribute('aria-hidden', 'false');
        }
    }

    // Hide loading overlay
    function hideLoading() {
        console.log('[Loading] Hidden');

        if (loadingModal && loadingBackdrop) {
            loadingModal.classList.remove('slds-fade-in-open');
            loadingBackdrop.classList.remove('slds-backdrop_open');
            loadingModal.setAttribute('aria-hidden', 'true');
        }
    }


    // Navigate to configuration viewer
    function navigateToConfigViewer(configPath) {
        const params = new URLSearchParams({ configPath });
        window.location.href = `/data-comparison/comparison-viewer?${params}`;
    }

    // Navigate to configuration generator
    function navigateToConfigGenerator() {
        window.location.href = '/data-comparison/config-generator';
    }

    // Check system health
    async function checkSystemHealth() {
        try {
            const response = await fetch('/health');
            const health = await response.json();
            
            console.log('System health:', health);
            
            // Update status indicator badge
            const statusBadge = document.querySelector('.status-indicator');
            const statusText = document.querySelector('.status-text');
            const statusIcon = statusBadge?.querySelector('svg use');
            
            if (statusBadge && statusText && statusIcon) {
                // Remove all theme classes
                statusBadge.classList.remove('slds-badge_success', 'slds-badge_error', 'slds-badge_warning');
                
                if (health.status === 'healthy') {
                    statusBadge.classList.add('slds-badge_success');
                    statusText.textContent = 'System Ready';
                    statusIcon.setAttribute('xlink:href', '/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#check');
                } else {
                    statusBadge.classList.add('slds-badge_error');
                    statusText.textContent = 'System Issues';
                    statusIcon.setAttribute('xlink:href', '/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#error');
                }
            }
            
        } catch (error) {
            console.warn('Health check failed:', error);
            
            const statusBadge = document.querySelector('.status-indicator');
            const statusText = document.querySelector('.status-text');
            const statusIcon = statusBadge?.querySelector('svg use');
            
            if (statusBadge && statusText && statusIcon) {
                statusBadge.classList.remove('slds-badge_success', 'slds-badge_error');
                statusBadge.classList.add('slds-badge_warning');
                statusText.textContent = 'Connection Issues';
                statusIcon.setAttribute('xlink:href', '/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#warning');
            }
        }
    }

    // Keyboard shortcuts
    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            // Ctrl/Cmd + U for upload
            if ((event.ctrlKey || event.metaKey) && event.key === 'u') {
                event.preventDefault();
                handleUploadClick();
            }
            
            // Ctrl/Cmd + N for new configuration
            if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
                event.preventDefault();
                handleCreateConfigClick();
            }
        });
    }

    // Initialize component when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Setup additional features
    setupKeyboardShortcuts();
    
    // Periodic health check
    checkSystemHealth();
    setInterval(checkSystemHealth, 30000); // Check every 30 seconds
    
    // Expose global functions for debugging
    window.welcomeComponent = {
        checkSystemHealth,
        navigateToConfigGenerator,
        navigateToConfigViewer
    };

})();