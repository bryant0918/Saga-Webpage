// script.js
document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("treeForm");
    const fileInput = document.getElementById("gedcomFile");
    const fileDisplay = document.querySelector(".file-input-display");
    const fileText = document.querySelector(".file-text");
    const loadingIndicator = document.getElementById("loadingIndicator");
    const errorMessage = document.getElementById("errorMessage");
    const successMessage = document.getElementById("successMessage");
    const downloadBtn = document.getElementById("downloadBtn");

    // Handle file input display
    fileInput.addEventListener("change", function (e) {
        const file = e.target.files[0];
        if (file) {
            fileText.textContent = file.name;
            fileDisplay.classList.add("has-file");
        } else {
            fileText.textContent = "Choose GEDCOM file...";
            fileDisplay.classList.remove("has-file");
        }
    });

    // Handle form submission
    form.addEventListener("submit", async function (e) {
        e.preventDefault();

        const contactName = document.getElementById("contactName").value.trim();
        const contactEmail = document
            .getElementById("contactEmail")
            .value.trim();
        const contactPhone = document
            .getElementById("contactPhone")
            .value.trim();
        const gedcomFile = fileInput.files[0];
        const familyName = document.getElementById("familyName").value.trim();
        const rootPointer = document.getElementById("rootPointer").value.trim();
        const generations = document.getElementById("generations").value;
        const treeType = document.getElementById("treeType").value;

        if (!contactName || !contactEmail) {
            showError("Please fill in your contact information.");
            return;
        }

        if (!gedcomFile) {
            showError("Please select a GEDCOM file.");
            return;
        }

        if (!familyName) {
            showError("Please enter a family name.");
            return;
        }

        // Show loading state
        showLoading();

        try {
            const fileSizeInMB = gedcomFile.size / (1024 * 1024);
            const isSmallFile = fileSizeInMB < 5;
            const isLargeFile = fileSizeInMB >= 5;

            // Create form data for GetForm (without file)
            const getFormData = new FormData();
            getFormData.append("contact_name", contactName);
            getFormData.append("contact_email", contactEmail);
            getFormData.append("contact_phone", contactPhone || "Not provided");
            getFormData.append("title", familyName);
            getFormData.append("generations", generations);
            getFormData.append("tree_type", treeType);
            getFormData.append("root_pointer", rootPointer || "Auto");
            getFormData.append("request_type", "GEDCOM Family Tree Request");
            getFormData.append(
                "file_size",
                `${(gedcomFile.size / 1024).toFixed(2)} KB`,
            );
            getFormData.append(
                "tree_type_display",
                treeType === "ancestor" ? "Ancestor Tree" : "Descendant Tree",
            );
            getFormData.append("submission_time", new Date().toLocaleString());

            // If gedcom file is small, send it with getio
            if (isSmallFile) {
                getFormData.append("gedcom_file", gedcomFile);
            }

            // Submit the small file data to GetForm
            const smallFileResponse = await fetch(
                "https://getform.io/f/bdrgewgb",
                {
                    method: "POST",
                    body: getFormData,
                },
            );

            if (!smallFileResponse.ok) {
                throw new Error(
                    `Failed to submit complete form: ${smallFileResponse.status}`,
                );
            }

            // If gedcom file is large, need to append still for backend
            if (!isSmallFile) {
                getFormData.append("gedcom_file", gedcomFile);
            }

            const endpoint =
                treeType === "ancestor"
                    ? "/build_tree"
                    : "/build_descendant_tree";
            console.log("Submitting to endpoint:", endpoint);
            const response = await fetch(
                `https://family-trees-backend.replit.app${endpoint}`,
                {
                    // const response = await fetch(`http://127.0.0.1:10000${endpoint}`, {
                    method: "POST",
                    body: getFormData,
                },
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(
                    errorData.error || `HTTP error! status: ${response.status}`,
                );
            }

            showRequestSubmitted();
        } catch (error) {
            console.error("Error submitting family tree request:", error);
            showError(`Failed to submit request: ${error.message}`);
        } finally {
            hideLoading();
        }
    });

    // Handle download (not used anymore, but keeping for compatibility)
    downloadBtn.addEventListener("click", function () {
        if (pdfBlob) {
            const treeType = document.getElementById("treeType").value;
            const url = window.URL.createObjectURL(pdfBlob);
            const a = document.createElement("a");
            a.style.display = "none";
            a.href = url;
            a.download = `${document.getElementById("familyName").value.trim()}_${treeType === "ancestor" ? "Family" : "Descendant"}_Tree.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }

        // This function is no longer used since we're not generating PDFs directly
        // console.log('Download functionality disabled - requests are processed manually');
    });

    function showLoading() {
        loadingIndicator.classList.remove("d-none");
        errorMessage.classList.add("d-none");
        successMessage.classList.add("d-none");
        form.querySelector('button[type="submit"]').disabled = true;
    }

    function hideLoading() {
        loadingIndicator.classList.add("d-none");
        form.querySelector('button[type="submit"]').disabled = false;
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.remove("d-none");
        successMessage.classList.add("d-none");
    }

    function showSuccess() {
        successMessage.classList.remove("d-none");
        errorMessage.classList.add("d-none");
    }

    function showRequestSubmitted() {
        // Show the success message (HTML already contains the correct content)
        successMessage.classList.remove("d-none");
        errorMessage.classList.add("d-none");
    }
});
