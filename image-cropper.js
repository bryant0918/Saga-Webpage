/**
 * Image Cropper UI — shows a modal with Cropper.js locked to 6:7 aspect ratio.
 * After the user adjusts the crop, returns a Blob of the cropped image.
 *
 * Usage:
 *   showCropModal(file).then(function(croppedBlob) { ... });
 *
 * Requires: Cropper.js CSS + JS loaded (from CDN in the HTML page).
 */

var _cropResolve = null;
var _cropperInstance = null;

function _ensureCropModal() {
    if (document.getElementById("imageCropModal")) return;

    var modalHtml = ''
        + '<div class="modal fade" id="imageCropModal" tabindex="-1" data-bs-backdrop="static">'
        + '<div class="modal-dialog modal-lg">'
        + '<div class="modal-content" style="background-color: var(--primary-black, #1a1a1a); border: 1px solid var(--light-black, #333);">'
        + '<div class="modal-header" style="border-bottom: 1px solid var(--light-black, #333);">'
        + '<h5 class="modal-title" style="color: var(--gold-primary, #d4af37);"><i class="fas fa-crop-alt me-2"></i>Crop Image</h5>'
        + '<button type="button" class="btn-close btn-close-white" id="cropCancelBtn"></button>'
        + '</div>'
        + '<div class="modal-body p-0" style="background: #000; max-height: 70vh; overflow: hidden;">'
        + '<img id="cropperImage" style="display: block; max-width: 100%;">'
        + '</div>'
        + '<div class="modal-footer" style="border-top: 1px solid var(--light-black, #333);">'
        + '<div class="d-flex align-items-center gap-2 me-auto">'
        + '<button type="button" class="btn btn-sm btn-outline-secondary" id="cropZoomIn"><i class="fas fa-search-plus"></i></button>'
        + '<button type="button" class="btn btn-sm btn-outline-secondary" id="cropZoomOut"><i class="fas fa-search-minus"></i></button>'
        + '<button type="button" class="btn btn-sm btn-outline-secondary" id="cropReset"><i class="fas fa-undo"></i></button>'
        + '</div>'
        + '<button type="button" class="btn btn-outline-secondary" id="cropCancelBtn2">Cancel</button>'
        + '<button type="button" class="btn btn-nordic" id="cropConfirmBtn" style="background: linear-gradient(135deg, #d4af37 0%, #f4d03f 100%); color: #000; font-weight: 600; border: none;"><i class="fas fa-check me-1"></i>Crop & Upload</button>'
        + '</div></div></div></div>';

    var container = document.createElement("div");
    container.innerHTML = modalHtml;
    document.body.appendChild(container.firstChild);

    document.getElementById("cropConfirmBtn").addEventListener("click", _confirmCrop);
    document.getElementById("cropCancelBtn").addEventListener("click", _cancelCrop);
    document.getElementById("cropCancelBtn2").addEventListener("click", _cancelCrop);
    document.getElementById("cropZoomIn").addEventListener("click", function() { if (_cropperInstance) _cropperInstance.zoom(0.1); });
    document.getElementById("cropZoomOut").addEventListener("click", function() { if (_cropperInstance) _cropperInstance.zoom(-0.1); });
    document.getElementById("cropReset").addEventListener("click", function() { if (_cropperInstance) _cropperInstance.reset(); });
}

function showCropModal(file, options) {
    _ensureCropModal();
    var opts = options || {};
    var aspectRatio = opts.aspectRatio || (6 / 7);
    var outputWidth = opts.outputWidth || (aspectRatio >= 1 ? 800 : 600);
    var outputHeight = opts.outputHeight || Math.round(outputWidth / aspectRatio);

    return new Promise(function(resolve) {
        _cropResolve = resolve;
        window._cropOutputWidth = outputWidth;
        window._cropOutputHeight = outputHeight;

        var reader = new FileReader();
        reader.onload = function(e) {
            var imgEl = document.getElementById("cropperImage");
            imgEl.src = e.target.result;

            var modal = new bootstrap.Modal(document.getElementById("imageCropModal"));
            modal.show();

            document.getElementById("imageCropModal").addEventListener("shown.bs.modal", function handler() {
                this.removeEventListener("shown.bs.modal", handler);

                if (_cropperInstance) {
                    _cropperInstance.destroy();
                }

                _cropperInstance = new Cropper(imgEl, {
                    aspectRatio: aspectRatio,
                    viewMode: 1,
                    dragMode: "move",
                    autoCropArea: 1,
                    cropBoxResizable: true,
                    cropBoxMovable: true,
                    guides: true,
                    center: true,
                    highlight: true,
                    background: true,
                    responsive: true,
                });
            });
        };
        reader.readAsDataURL(file);
    });
}

function _confirmCrop() {
    if (!_cropperInstance || !_cropResolve) return;

    var canvas = _cropperInstance.getCroppedCanvas({
        width: window._cropOutputWidth || 600,
        height: window._cropOutputHeight || 700,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: "high",
    });

    canvas.toBlob(function(blob) {
        _closeCropModal();
        if (_cropResolve) {
            var resolve = _cropResolve;
            _cropResolve = null;
            resolve(blob);
        }
    }, "image/jpeg", 0.92);
}

function _cancelCrop() {
    _closeCropModal();
    if (_cropResolve) {
        var resolve = _cropResolve;
        _cropResolve = null;
        resolve(null);
    }
}

function _closeCropModal() {
    if (_cropperInstance) {
        _cropperInstance.destroy();
        _cropperInstance = null;
    }
    var modalEl = document.getElementById("imageCropModal");
    var modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
}
