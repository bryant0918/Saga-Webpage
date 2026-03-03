(function () {
    "use strict";

    var STYLE_ID = "person-id-hint-styles";
    var MODAL_ID = "personIdHintModal";

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        var style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            .person-id-hint-btn {
                width: 24px;
                height: 24px;
                border-radius: 50%;
                border: 1px solid var(--gold-primary);
                background-color: transparent;
                color: var(--gold-primary);
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 0.75rem;
                line-height: 1;
                padding: 0;
                transition: all 0.2s ease;
            }

            .person-id-hint-btn:hover,
            .person-id-hint-btn:focus {
                background-color: var(--gold-primary);
                color: var(--deep-black);
                box-shadow: 0 0 0 0.2rem rgba(255, 215, 0, 0.18);
            }

            .person-id-hint-image {
                width: 100%;
                height: auto;
                border-radius: 8px;
                border: 1px solid rgba(255, 215, 0, 0.35);
            }
        `;
        document.head.appendChild(style);
    }

    function ensureModal() {
        if (document.getElementById(MODAL_ID)) {
            return;
        }

        var modalWrapper = document.createElement("div");
        modalWrapper.innerHTML = `
            <div
                class="modal fade"
                id="${MODAL_ID}"
                tabindex="-1"
                aria-labelledby="${MODAL_ID}Label"
                aria-hidden="true"
            >
                <div class="modal-dialog modal-xl modal-dialog-scrollable">
                    <div class="modal-content" style="background-color: var(--primary-black); border-color: var(--gold-primary);">
                        <div class="modal-header" style="border-color: var(--light-black);">
                            <h5 class="modal-title" id="${MODAL_ID}Label" style="color: var(--gold-primary);">Person ID Help</h5>
                            <button
                                type="button"
                                class="btn-close btn-close-white"
                                data-bs-dismiss="modal"
                                aria-label="Close"
                            ></button>
                        </div>
                        <div class="modal-body">
                            <p id="${MODAL_ID}Intro" style="color: var(--text-gray);">
                                Your selected person appears in a different place based on tree type.
                            </p>
                            <div class="row g-3 mb-4">
                                <div class="col-md-6">
                                    <div class="p-2 rounded" style="background-color: rgba(255, 215, 0, 0.05);">
                                        <img
                                            src="assets/starting_person_hint_ancestor.png"
                                            alt="Ancestor chart example showing selected person location"
                                            class="person-id-hint-image mb-2"
                                        />
                                        <p class="mb-0" style="font-size: 0.9rem; color: var(--text-gray);">
                                            <strong style="color: var(--gold-primary);">Ancestor Tree:</strong>
                                            The selected person appears in this highlighted position.
                                        </p>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="p-2 rounded" style="background-color: rgba(255, 215, 0, 0.05);">
                                        <img
                                            src="assets/starting_person_hint_descendant.png"
                                            alt="Descendant chart example showing selected person location"
                                            class="person-id-hint-image mb-2"
                                        />
                                        <p class="mb-0" style="font-size: 0.9rem; color: var(--text-gray);">
                                            <strong style="color: var(--gold-primary);">Descendant Tree:</strong>
                                            The selected person appears in this highlighted position.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <h6 id="${MODAL_ID}Heading" style="color: var(--gold-primary);">How to choose the right person</h6>
                            <div id="${MODAL_ID}Instructions" style="color: var(--text-gray);"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modalWrapper.firstElementChild);
    }

    function setModalContent(options) {
        var titleEl = document.getElementById(MODAL_ID + "Label");
        var introEl = document.getElementById(MODAL_ID + "Intro");
        var headingEl = document.getElementById(MODAL_ID + "Heading");
        var instructionsEl = document.getElementById(MODAL_ID + "Instructions");

        if (titleEl && options.modalTitle) {
            titleEl.textContent = options.modalTitle;
        }
        if (introEl && options.introText) {
            introEl.textContent = options.introText;
        }
        if (headingEl && options.instructionsHeading) {
            headingEl.textContent = options.instructionsHeading;
        }
        if (instructionsEl) {
            instructionsEl.innerHTML = options.instructionsHtml || "";
        }
    }

    function attach(options) {
        var config = options || {};
        var fieldId = config.fieldId;
        if (!fieldId) {
            return false;
        }

        var label = document.querySelector('label[for="' + fieldId + '"]');
        if (!label || label.dataset.personHintAttached === "true") {
            return false;
        }

        ensureStyles();
        ensureModal();

        var wrapper = document.createElement("div");
        wrapper.className = "d-flex align-items-center gap-2 mb-1";
        label.parentNode.insertBefore(wrapper, label);
        wrapper.appendChild(label);
        label.classList.add("mb-0");

        var button = document.createElement("button");
        button.type = "button";
        button.className = "person-id-hint-btn";
        button.setAttribute("data-bs-toggle", "modal");
        button.setAttribute("data-bs-target", "#" + MODAL_ID);
        button.setAttribute(
            "aria-label",
            config.buttonAriaLabel || "Show person ID help",
        );
        button.title = config.buttonTitle || "Show person ID help";
        button.innerHTML = '<i class="fas fa-question"></i>';

        button.addEventListener("click", function () {
            setModalContent(config);
        });

        wrapper.appendChild(button);
        label.dataset.personHintAttached = "true";
        return true;
    }

    window.PersonIdHint = {
        attach: attach,
    };
})();
