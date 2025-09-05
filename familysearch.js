// familysearch.js - Client-side FamilySearch authentication and tree generation

// FamilySearch configuration
const FS_CONFIG = {
    APP_KEY: "b00KBZ8PWGLG7SJ0A3U1",
    REDIRECT_URI: window.location.origin + "/",
    // ENVIRONMENT: "beta",
    ENVIRONMENT: "production",
    // BASE_URL: "https://identbeta.familysearch.org", // beta environment
    BASE_URL: "https://ident.familysearch.org", // production environment
    // TOKEN_URL: "https://identbeta.familysearch.org/cis-web/oauth2/v3/token",
    TOKEN_URL: "https://ident.familysearch.org/cis-web/oauth2/v3/token",
    // API_BASE_URL: "https://apibeta.familysearch.org",
    API_BASE_URL: "https://api.familysearch.org",
};

let pdfBlob = null;

// Cookie utility functions
function setCookie(name, value, hours) {
    const date = new Date();
    date.setTime(date.getTime() + hours * 60 * 60 * 1000);
    const expires = "expires=" + date.toUTCString();
    document.cookie = name + "=" + value + ";" + expires + ";path=/";
}

function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(";");
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === " ") c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0)
            return c.substring(nameEQ.length, c.length);
    }
    return null;
}

function deleteCookie(name) {
    document.cookie =
        name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
}

function generateRandomString(length) {
    const characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += characters.charAt(
            Math.floor(Math.random() * characters.length),
        );
    }
    return result;
}

document.addEventListener("DOMContentLoaded", function () {
    // Log redirect URI information when page loads
    console.log("=== FAMILYSEARCH PAGE LOADED ===");
    console.log("🔗 Redirect URI that will be used:", FS_CONFIG.REDIRECT_URI);
    console.log("🌐 Current domain origin:", window.location.origin);
    console.log("📍 Current full URL:", window.location.href);
    console.log("✅ Redirect URI matches current origin + '/':", FS_CONFIG.REDIRECT_URI === (window.location.origin + "/"));
    console.log("================================");

    const loginBtn = document.getElementById("loginBtn");
    const familySearchForm = document.getElementById("familySearchForm");
    const loadingIndicator = document.getElementById("loadingIndicator");
    const errorMessage = document.getElementById("errorMessage");
    const successMessage = document.getElementById("successMessage");
    const downloadBtn = document.getElementById("downloadBtn");

    // Check if this is a switch user request
    const urlParams = new URLSearchParams(window.location.search);
    const switchUser = urlParams.get("switch_user");
    
    if (switchUser === "true") {
        // Clear any remaining authentication data
        deleteCookie("fs_access_token");
        deleteCookie("fs_refresh_token");
        deleteCookie("oauth_state");
        localStorage.clear();
        sessionStorage.clear();
        
        // Remove the switch_user parameter from URL
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
    }

    // Login button click handler
    if (loginBtn) {
        loginBtn.addEventListener("click", function () {
            // Check if this is a switch user scenario
            const isSwitchUser = switchUser === "true";
            initiateOAuthFlow(isSwitchUser);
        });
    }

    // Form submission handler
    if (familySearchForm) {
        familySearchForm.addEventListener("submit", async function (e) {
            e.preventDefault();
            await generateFamilyTree();
        });
    }

    // Download button handler
    if (downloadBtn) {
        downloadBtn.addEventListener("click", function () {
            if (pdfBlob) {
                const familyName = document
                    .getElementById("familyName")
                    .value.trim();
                const treeType = document.getElementById("treeType").value;
                const url = window.URL.createObjectURL(pdfBlob);
                const a = document.createElement("a");
                a.style.display = "none";
                a.href = url;
                a.download = `${familyName}_${treeType === "ancestor" ? "Family" : "Descendant"}_Tree.pdf`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }
        });
    }

    function initiateOAuthFlow(forceLogin = false) {
        const state = generateRandomString(16);
        setCookie("oauth_state", state, 1); // 1 hour expiry

        // Log the redirect URI for debugging
        console.log("🔗 Redirect URI being used:", FS_CONFIG.REDIRECT_URI);
        console.log("🌐 Current domain origin:", window.location.origin);

        let authUrl =
            `${FS_CONFIG.BASE_URL}/cis-web/oauth2/v3/authorization?` +
            `response_type=code&` +
            `client_id=${FS_CONFIG.APP_KEY}&` +
            `redirect_uri=${encodeURIComponent(FS_CONFIG.REDIRECT_URI)}&` +
            `scope=profile email tree&` +
            `state=${state}`;

        // Add prompt=login to force re-authentication when switching users
        if (forceLogin) {
            authUrl += `&prompt=login`;
        }

        console.log("🚀 Full OAuth URL:", authUrl);
        console.log("📋 OAuth Parameters:", {
            redirect_uri: FS_CONFIG.REDIRECT_URI,
            client_id: FS_CONFIG.APP_KEY,
            state: state,
            forceLogin: forceLogin
        });

        window.location.href = authUrl;
    }

    const oauthCode = urlParams.get("code");
    const returnedState = urlParams.get("state");
    const storedState = getCookie("oauth_state");

    if (oauthCode && returnedState && storedState) {
        if (returnedState === storedState) {
            console.log("OAuth code:", oauthCode);
            // State is valid, proceed...
        } else {
            console.error("OAuth state mismatch! Possible CSRF attack.");
        }
        // Delete the cookie after checking
        deleteCookie("oauth_state");
    }

    async function generateFamilyTree() {
        const contactName = document.getElementById("contactName").value.trim();
        const contactEmail = document
            .getElementById("contactEmail")
            .value.trim();
        const contactPhone = document
            .getElementById("contactPhone")
            .value.trim();
        const startingPerson = document
            .getElementById("startingPerson")
            .value.trim();
        const familyName = document.getElementById("familyName").value.trim();
        const generations = document.getElementById("generations").value;
        const treeType = document.getElementById("treeType").value;
        const selectedTheme = document.getElementById("selectedTheme").value;

        // Map theme names to backend values
        const themeMapping = {
            "royal-heritage": "black",
            "rustic-roots": "rustic",
            "vintage-botanical": "green",
            "ancestral-stone": "stone",
        };
        const theme = themeMapping[selectedTheme] || "black";

        if (!contactName || !contactEmail || !startingPerson || !familyName) {
            showError("Please fill in all required fields.");
            return;
        }

        // Get access token from cookie or global variable
        const currentAccessToken = window.accessToken; //|| getCookie("fs_access_token");
        if (!currentAccessToken) {
            showError("Not authenticated. Please log in again.");
            return;
        }

        showLoading();

        try {
            // Get current person info for the form
            const currentPerson =
                await window.fetchCurrentPerson(currentAccessToken);
            const currentPersonName = currentPerson
                ? currentPerson.name
                : "Unknown";

            // Submit to GetForm
            const formData = new FormData();
            formData.append("contact_name", contactName);
            formData.append("contact_email", contactEmail);
            formData.append("contact_phone", contactPhone || "Not provided");
            formData.append("starting_person_id", startingPerson);
            formData.append("title", familyName);
            formData.append("generations", generations);
            formData.append("tree_type", treeType);
            formData.append("request_type", "FamilySearch Family Tree Request");
            formData.append(
                "tree_type_display",
                treeType === "ancestor" ? "Ancestor Tree" : "Descendant Tree",
            );
            formData.append("familysearch_user", currentPersonName);
            formData.append("submission_time", new Date().toLocaleString());
            formData.append("theme", theme);
            formData.append("access_token", currentAccessToken);

            const getform_response = await fetch(
                "https://getform.io/f/bdrgewgb",
                {
                    method: "POST",
                    body: formData,
                },
            );

            if (!getform_response.ok) {
                throw new Error(
                    `Failed to submit request: ${getform_response.status}`,
                );
            }

            // Only send access token to our backend
            // formData.append("access_token", currentAccessToken);
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
                    body: formData,
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
    }

    function showConfigSection() {
        if (loginSection) loginSection.classList.add("hidden");
        if (configSection) configSection.classList.remove("hidden");
    }

    function showLoading() {
        if (loadingIndicator) loadingIndicator.classList.remove("d-none");
        if (errorMessage) errorMessage.classList.add("d-none");
        if (successMessage) successMessage.classList.add("d-none");
        if (familySearchForm) {
            const submitBtn = familySearchForm.querySelector(
                'button[type="submit"]',
            );
            if (submitBtn) submitBtn.disabled = true;
        }
    }

    function hideLoading() {
        if (loadingIndicator) loadingIndicator.classList.add("d-none");
        if (familySearchForm) {
            const submitBtn = familySearchForm.querySelector(
                'button[type="submit"]',
            );
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    function showError(message) {
        if (errorMessage) {
            errorMessage.textContent = message;
            errorMessage.classList.remove("d-none");
        }
        if (successMessage) successMessage.classList.add("d-none");
    }

    function showSuccess() {
        if (successMessage) successMessage.classList.remove("d-none");
        if (errorMessage) errorMessage.classList.add("d-none");
    }

    function showRequestSubmitted() {
        if (successMessage) {
            // Show the success message (HTML already contains the correct content)
            successMessage.classList.remove("d-none");
        }
        if (errorMessage) errorMessage.classList.add("d-none");
    }

    // Function to fetch current person data
    async function fetchCurrentPerson(accessToken) {
        try {
            const response = await fetch(
                `${FS_CONFIG.API_BASE_URL}/platform/tree/current-person`,
                {
                    method: "GET",
                    headers: {
                        Accept: "application/x-gedcomx-v1+json",
                        Authorization: `Bearer ${accessToken}`,
                    },
                },
            );

            if (!response.ok) {
                throw new Error(
                    `Failed to fetch current person: ${response.status}`,
                );
            }

            const data = await response.json();
            const currentPerson = data.persons?.[0];

            if (currentPerson) {
                return {
                    name: currentPerson.display?.name || "Unknown",
                    id: currentPerson.id || "Unknown",
                };
            }

            return null;
        } catch (error) {
            console.error("Error fetching current person:", error);
            return null;
        }
    }

    // Make fetchCurrentPerson available globally
    window.fetchCurrentPerson = fetchCurrentPerson;
});
