// script.js
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('treeForm');
    const fileInput = document.getElementById('gedcomFile');
    const fileDisplay = document.querySelector('.file-input-display');
    const fileText = document.querySelector('.file-text');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    const downloadBtn = document.getElementById('downloadBtn');

    // Handle file input display
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            fileText.textContent = file.name;
            fileDisplay.classList.add('has-file');
        } else {
            fileText.textContent = 'Choose GEDCOM file...';
            fileDisplay.classList.remove('has-file');
        }
    });

    // Handle form submission
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const contactName = document.getElementById('contactName').value.trim();
        const contactEmail = document.getElementById('contactEmail').value.trim();
        const contactPhone = document.getElementById('contactPhone').value.trim();
        const gedcomFile = fileInput.files[0];
        const familyName = document.getElementById('familyName').value.trim();
        const rootPointer = document.getElementById('rootPointer').value.trim();
        const generations = document.getElementById('generations').value;
        const treeType = document.getElementById('treeType').value;

        if (!contactName || !contactEmail) {
            showError('Please fill in your contact information.');
            return;
        }

        if (!gedcomFile) {
            showError('Please select a GEDCOM file.');
            return;
        }

        if (!familyName) {
            showError('Please enter a family name.');
            return;
        }

        // Show loading state
        showLoading();

        try {
            const fileSizeInMB = gedcomFile.size / (1024 * 1024);
            const isLargeFile = fileSizeInMB > 5;

            // Create form data for GetForm (without file)
            const getFormData = new FormData();
            getFormData.append('contact_name', contactName);
            getFormData.append('contact_email', contactEmail);
            getFormData.append('contact_phone', contactPhone || 'Not provided');
            getFormData.append('title', familyName);
            getFormData.append('generations', generations);
            getFormData.append('tree_type', treeType);
            getFormData.append('root_pointer', rootPointer || 'Auto-detect');
            getFormData.append('request_type', 'GEDCOM Family Tree Request');
            getFormData.append('file_size', `${(gedcomFile.size / 1024).toFixed(2)} KB`);
            getFormData.append('tree_type_display', treeType === 'ancestor' ? 'Ancestor Tree' : 'Descendant Tree');
            getFormData.append('submission_time', new Date().toLocaleString());

            // If file is large, send it separately to FormBackend
            if (isLargeFile) {
                getFormData.append('file_location', 'File sent separately to FormBackend due to size > 5MB');
                // Submit form data to GetForm
                const getFormResponse = await fetch('https://getform.io/f/bdrgewgb', {
                    method: 'POST',
                    body: getFormData
                });

                if (!getFormResponse.ok) {
                    throw new Error(`Failed to submit form data: ${getFormResponse.status}`);
                }

                // Now send the file to FormBackend
                const fileFormData = new FormData();
                fileFormData.append('gedcom_file', gedcomFile);
                fileFormData.append('contact_name', contactName);
                fileFormData.append('contact_email', contactEmail);
                fileFormData.append('title', familyName);
                fileFormData.append('file_reference', `GEDCOM file for ${familyName} family tree request`);
                fileFormData.append('submission_time', new Date().toLocaleString());

                const fileResponse = await fetch('https://www.formbackend.com/f/963a5f492158bd58', {
                    method: 'POST',
                    body: fileFormData
                });

                if (!fileResponse.ok) {
                    throw new Error(`Failed to submit file: ${fileResponse.status}`);
                }
            } else {
                getFormData.append('gedcom_file', gedcomFile);

                const smallFileResponse = await fetch('https://getform.io/f/bdrgewgb', {
                    method: 'POST',
                    body: getFormData
                });

                if (!smallFileResponse.ok) {
                    throw new Error(`Failed to submit complete form: ${smallFileResponse.status}`);
                }
            }

            showRequestSubmitted();

        } catch (error) {
            console.error('Error submitting family tree request:', error);
            showError(`Failed to submit request: ${error.message}`);
        } finally {
            hideLoading();
        }
    });

    // Handle download (not used anymore, but keeping for compatibility)
    downloadBtn.addEventListener('click', function() {
        // This function is no longer used since we're not generating PDFs directly
        console.log('Download functionality disabled - requests are processed manually');
    });

    function showLoading() {
        loadingIndicator.classList.remove('hidden');
        errorMessage.classList.add('hidden');
        successMessage.classList.add('hidden');
        form.querySelector('.submit-btn').disabled = true;
    }

    function hideLoading() {
        loadingIndicator.classList.add('hidden');
        form.querySelector('.submit-btn').disabled = false;
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.remove('hidden');
        successMessage.classList.add('hidden');
    }

    function showSuccess() {
        successMessage.classList.remove('hidden');
        errorMessage.classList.add('hidden');
    }

    function showRequestSubmitted() {
        // Update the success message content for request submission
        const successTitle = successMessage.querySelector('h3');
        const successText = successMessage.querySelector('p');
        const downloadBtn = successMessage.querySelector('#downloadBtn');
        
        if (successTitle) successTitle.textContent = '✅ Request Submitted Successfully!';
        if (successText) successText.textContent = 'Thanks for submitting a family tree request. We will contact you shortly with your completed family tree.';
        if (downloadBtn) downloadBtn.style.display = 'none'; // Hide download button
        
        successMessage.classList.remove('hidden');
        errorMessage.classList.add('hidden');
    }
});

// Static Forms API KEY: sf_edhj9dfcgnehjmccmdf809hl
