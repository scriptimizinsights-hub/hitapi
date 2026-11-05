/**
 * ui/views/openapi-import.js — import an OpenAPI / Swagger spec by URL.
 */

import { h, withBusy } from '../core/dom.js';

const SPEC_HINT = /(openapi|swagger|api-docs)[^/]*$|\.(json|ya?ml)$/i;

export function OpenApiImportView(store, actions) {
  const { tabInfo } = store.state;
  // If the current tab is showing a spec file, offer its URL.
  const suggested = tabInfo?.url && SPEC_HINT.test(tabInfo.url.split('?')[0]) ? tabInfo.url : '';
  const input = h('input', {
    id: 'swagger-url', type: 'url', value: suggested,
    placeholder: 'http://localhost:3000/openapi.json',
  });
  const button = h('button', { id: 'import-swagger-btn', type: 'submit', class: 'btn-primary btn-sm' }, 'Import');
  const submit = async (e) => {
    e.preventDefault();
    if (await withBusy(button, () => actions.importOpenApi(input.value))) actions.showImport(false);
  };

  return h('form', { class: 'card', onsubmit: submit },
    h('div', { class: 'card-title' }, '📥 Import OpenAPI / Swagger'),
    h('div', { class: 'small muted mb' },
      'Paste the spec URL (JSON or YAML). Localhost and logged-in pages work too. ',
      'Endpoints the project already has are updated, not duplicated.'),
    h('div', { class: 'row' },
      input,
      button,
    ),
  );
}
