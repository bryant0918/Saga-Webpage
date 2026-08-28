// admin-orders.js - Order management for the admin page.
//
// Lets an admin see every chart anyone has generated, download either version,
// build a chart on a customer's behalf, and comp an order when we decide to
// give one away. Kept separate from admin.js, which owns tree browsing/editing.

(function (global) {
  'use strict';

  var ordersState = {
    orders: [],
    filter: 'all'
  };

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatDate(isoString) {
    if (!isoString) return '';
    var parsed = new Date(isoString);
    if (isNaN(parsed.getTime())) return isoString;
    return parsed.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  function setStatus(message, isError) {
    var el = document.getElementById('ordersStatus');
    if (!el) return;
    el.textContent = message || '';
    el.style.color = isError ? '#fca5a5' : 'var(--text-dark-gray)';
  }

  function matchesFilter(order) {
    if (ordersState.filter === 'all') return true;
    if (ordersState.filter === 'unpaid') {
      return order.status === 'ready' && !order.paid && !order.comped_by;
    }
    if (ordersState.filter === 'paid') return Boolean(order.paid || order.comped_by);
    if (ordersState.filter === 'failed') return order.status === 'failed';
    return true;
  }

  function render() {
    var container = document.getElementById('ordersList');
    if (!container) return;

    var visible = ordersState.orders.filter(matchesFilter);

    if (!visible.length) {
      container.innerHTML =
        '<div class="text-center py-4" style="color: var(--text-dark-gray);">No orders match this filter.</div>';
      return;
    }

    var html =
      '<div class="table-responsive"><table class="table table-sm align-middle" style="color: var(--text-gray);">' +
      '<thead><tr>' +
      '<th>Customer</th><th>Chart</th><th>Status</th><th>Created</th><th class="text-end">Actions</th>' +
      '</tr></thead><tbody>';

    visible.forEach(function (order) {
      var unlocked = Boolean(order.paid || order.comped_by);
      var statusHtml;
      if (order.status === 'failed') {
        statusHtml = '<span style="color: #fca5a5;">Failed</span>';
      } else if (order.status === 'building') {
        statusHtml = '<span style="color: var(--gold-primary);">Building</span>';
      } else if (order.comped_by) {
        statusHtml = '<span style="color: #6ee7b7;">Comped</span>';
      } else if (order.paid) {
        statusHtml = '<span style="color: #6ee7b7;">Paid</span>';
      } else {
        statusHtml = '<span style="color: #93c5fd;">Proof sent</span>';
      }

      html += '<tr>';
      html +=
        '<td><div>' + escapeHtml(order.contact_name || '-') + '</div>' +
        '<div class="small" style="color: var(--text-dark-gray);">' +
        escapeHtml(order.contact_email || 'no email') + '</div>' +
        '<div class="small" style="color: var(--text-dark-gray);">' +
        escapeHtml(order.user_scope_id) + '</div></td>';

      html +=
        '<td><div>' + escapeHtml(order.title) + '</div>' +
        '<div class="small" style="color: var(--text-dark-gray);">' +
        escapeHtml(order.tree_type) + ' &middot; ' + escapeHtml(order.max_generations) +
        ' gens &middot; ' + escapeHtml(order.theme) + '</div>' +
        (order.price_usd ? '<div class="small" style="color: var(--gold-primary);">$' + order.price_usd + '</div>' : '') +
        '</td>';

      html += '<td>' + statusHtml + '</td>';
      html += '<td class="small" style="color: var(--text-dark-gray);">' + escapeHtml(formatDate(order.created_at)) + '</td>';

      html += '<td class="text-end">';
      if (order.proof_storage_path) {
        html +=
          '<button class="btn btn-sm btn-outline-secondary me-1" onclick="AdminOrders.download(\'' +
          escapeHtml(order.order_id) + '\',\'proof\')" title="Download proof"><i class="fas fa-eye"></i></button>';
      }
      if (unlocked) {
        html +=
          '<button class="btn btn-sm btn-outline-warning me-1" onclick="AdminOrders.download(\'' +
          escapeHtml(order.order_id) + '\',\'final\')" title="Download print file"><i class="fas fa-download"></i></button>';
      } else if (order.status === 'ready') {
        html +=
          '<button class="btn btn-sm btn-outline-success" onclick="AdminOrders.comp(\'' +
          escapeHtml(order.order_id) + '\')" title="Unlock without payment"><i class="fas fa-gift"></i> Comp</button>';
      }
      html += '</td>';
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

  async function load() {
    setStatus('Loading orders...');
    try {
      var result = await global.FsAuth.postJson('/orders/admin/list', {});
      ordersState.orders = (result && result.orders) || [];
      setStatus(ordersState.orders.length + ' orders');
      render();
    } catch (error) {
      setStatus('Could not load orders: ' + error.message, true);
      var container = document.getElementById('ordersList');
      if (container) {
        container.innerHTML =
          '<div class="text-center py-4" style="color: #fca5a5;">' + escapeHtml(error.message) + '</div>';
      }
    }
  }

  function findOrder(orderId) {
    return ordersState.orders.filter(function (order) {
      return order.order_id === orderId;
    })[0];
  }

  async function download(orderId, variant) {
    var order = findOrder(orderId);
    if (!order) return;

    setStatus('Preparing download...');
    try {
      var blob = await global.FsAuth.postForBlob('/orders/download', {
        user_scope_id: order.user_scope_id,
        order_id: orderId,
        variant: variant
      });
      var suffix = variant === 'proof' ? '_PROOF' : '';
      var safeTitle = String(order.title || 'Family').replace(/[^A-Za-z0-9 _-]/g, '').replace(/\s+/g, '_');
      global.FsAuth.saveBlob(blob, safeTitle + '_Chart' + suffix + '.pdf');
      setStatus('');
    } catch (error) {
      setStatus('Download failed: ' + error.message, true);
    }
  }

  async function comp(orderId) {
    var order = findOrder(orderId);
    if (!order) return;

    var who = order.contact_email || order.user_scope_id;
    if (!confirm('Unlock "' + order.title + '" for ' + who + ' without payment?\n\nThey will be emailed the print-ready file.')) {
      return;
    }

    setStatus('Comping order...');
    try {
      await global.FsAuth.postJson('/orders/comp', { order_id: orderId });
      setStatus('Order comped and delivered.');
      await load();
    } catch (error) {
      setStatus('Could not comp: ' + error.message, true);
    }
  }

  function wire() {
    var refreshBtn = document.getElementById('ordersRefreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', load);

    document.querySelectorAll('[data-order-filter]').forEach(function (button) {
      button.addEventListener('click', function () {
        ordersState.filter = button.getAttribute('data-order-filter');
        document.querySelectorAll('[data-order-filter]').forEach(function (other) {
          other.classList.toggle('active', other === button);
        });
        render();
      });
    });
  }

  global.AdminOrders = {
    load: load,
    download: download,
    comp: comp,
    wire: wire
  };

  document.addEventListener('DOMContentLoaded', function () {
    wire();
    load();
  });
})(window);
