var STRIPE_PUBLISHABLE_KEY = "pk_live_51SZ0q2Gi0ETKj4aVlXXM8GJDyek0BAG5FZwqtv2O73EBbyYLgfEYz0mVU8tBAp3v0RodAwSNfPaZCqJ6CQtx8whJ00OHmi7dpk";

var STRIPE_BUY_BUTTONS = {
    "ancestor_5": "buy_btn_1T1WQIGi0ETKj4aVLr5VfuEj",
    "ancestor_4": "buy_btn_1T1WQIGi0ETKj4aVLr5VfuEj",
    "descendant_4": "buy_btn_1T1WQIGi0ETKj4aVLr5VfuEj",
    "descendant_3": "buy_btn_1T1WQIGi0ETKj4aVLr5VfuEj"
};

function calculateTreePrice(treeType, generations) {
    var basePrice = 0;
    var additionalCost = 0;
    
    if (treeType === 'ancestor') {
        basePrice = 149;
        if (generations === 5) {
            additionalCost = 49;
        }
    } else if (treeType === 'descendant') {
        basePrice = 169;
        if (generations === 4) {
            additionalCost = 49;
        }
    }
    
    return basePrice + additionalCost;
}

function getButtonKey(treeType, generations) {
    return treeType + "_" + generations;
}

function updatePriceDisplay() {
    var treeTypeSelect = document.getElementById('treeType');
    var generationsSelect = document.getElementById('generations');
    var priceDisplay = document.getElementById('totalPrice');
    var stripeContainer = document.getElementById('stripeBuyButton');
    
    if (!treeTypeSelect || !generationsSelect || !priceDisplay) {
        return;
    }
    
    var treeType = treeTypeSelect.value;
    var generations = parseInt(generationsSelect.value);
    var totalPrice = calculateTreePrice(treeType, generations);
    var treeLabel = treeType === 'ancestor' ? 'Ancestry' : 'Descendancy';
    
    priceDisplay.innerHTML =
        '<div class="text-center mb-4">' +
            '<p class="mb-2" style="color: white; font-weight: bold; font-size: 1.1rem;">' +
                '<i class="fas fa-dollar-sign me-2" style="color: var(--gold-primary);"></i>' +
                'Total Price: <span style="color: var(--gold-primary);">$' + totalPrice + '</span>' +
            '</p>' +
            '<small style="color: var(--text-gray);">' +
                treeLabel + ' Tree - ' + generations + ' Generation' + (generations > 1 ? 's' : '') +
            '</small>' +
        '</div>';
    
    if (stripeContainer) {
        var buttonKey = getButtonKey(treeType, generations);
        var buyButtonId = STRIPE_BUY_BUTTONS[buttonKey];
        
        if (buyButtonId) {
            stripeContainer.innerHTML =
                '<stripe-buy-button ' +
                    'buy-button-id="' + buyButtonId + '" ' +
                    'publishable-key="' + STRIPE_PUBLISHABLE_KEY + '"' +
                '></stripe-buy-button>';
        }
    }
}

document.addEventListener('DOMContentLoaded', function() {
    var treeTypeSelect = document.getElementById('treeType');
    var generationsSelect = document.getElementById('generations');
    
    if (treeTypeSelect) {
        treeTypeSelect.addEventListener('change', function() {
            setTimeout(updatePriceDisplay, 50);
        });
    }
    
    if (generationsSelect) {
        generationsSelect.addEventListener('change', updatePriceDisplay);
    }
    
    setTimeout(updatePriceDisplay, 100);
});
