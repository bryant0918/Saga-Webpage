// Price calculation logic for Family Saga trees
function calculateTreePrice(treeType, generations) {
    let basePrice = 0;
    let additionalCost = 0;
    
    if (treeType === 'ancestor') {
        basePrice = 149; // Base price for 4 generations
        if (generations === 5) {
            additionalCost = 49; // +$49 for 5th generation
        }
        // 3 generations would be less than base, but we'll keep base price
    } else if (treeType === 'descendant') {
        basePrice = 169; // Base price for 3 generations
        if (generations === 4) {
            additionalCost = 49; // +$49 for 4th generation
        }
        // 3 generations is the base for descendant trees
    }
    
    return basePrice + additionalCost;
}

function updatePriceDisplay() {
    const treeTypeSelect = document.getElementById('treeType');
    const generationsSelect = document.getElementById('generations');
    const priceDisplay = document.getElementById('totalPrice');
    
    if (!treeTypeSelect || !generationsSelect || !priceDisplay) {
        return;
    }
    
    const treeType = treeTypeSelect.value;
    const generations = parseInt(generationsSelect.value);
    const totalPrice = calculateTreePrice(treeType, generations);
    
    // Update the price display
    priceDisplay.innerHTML = `
        <div class="text-center mb-4">
            <p class="mb-2" style="color: white; font-weight: bold; font-size: 1.1rem;">
                <i class="fas fa-dollar-sign me-2" style="color: var(--gold-primary);"></i>Total Price: <span style="color: var(--gold-primary);">$${totalPrice}</span>
            </p>
            <small style="color: var(--text-gray);">
                ${treeType === 'ancestor' ? 'Ancestry' : 'Descendancy'} Tree - ${generations} Generation${generations > 1 ? 's' : ''}
            </small>
        </div>
    `;
}

// Initialize price calculation when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Add event listeners for price updates
    const treeTypeSelect = document.getElementById('treeType');
    const generationsSelect = document.getElementById('generations');
    
    if (treeTypeSelect) {
        treeTypeSelect.addEventListener('change', function() {
            // Small delay to allow the generations dropdown to update first
            setTimeout(updatePriceDisplay, 50);
        });
    }
    
    if (generationsSelect) {
        generationsSelect.addEventListener('change', updatePriceDisplay);
    }
    
    // Initial price calculation
    setTimeout(updatePriceDisplay, 100); // Small delay to ensure all elements are loaded
});
