/** Place only our native postbox above the dashboard columns. WordPress still owns hide/collapse state. */
(function () {
  'use strict';
  function placeOverview() {
    var widget = document.getElementById('kartodesk_overview');
    var dashboard = document.getElementById('dashboard-widgets');
    var row = document.getElementById('kartodesk-dashboard-wide');
    var sortables = document.getElementById('kartodesk-sortables');
    if (!widget || !dashboard || !dashboard.parentNode || !row || !sortables) return;
    dashboard.parentNode.insertBefore(row, dashboard);
    // A saved layout from an older version may still put our widget in a narrow column.
    // Keep it inside a native sortable area so WordPress's other widgets retain correct move controls.
    if (widget.parentNode !== sortables) sortables.appendChild(widget);
    if (typeof window !== 'undefined' && window.postboxes && window.postboxes.page === 'dashboard') {
      window.postboxes.updateOrderButtonsProperties();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', placeOverview, { once: true });
  else placeOverview();
}());
