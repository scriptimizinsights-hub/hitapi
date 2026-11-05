/**
 * ui/views/project-bar.js — choose a project, create one, open the spec import.
 */

import { h, spinner, withBusy } from '../core/dom.js';
import { OpenApiImportView } from './openapi-import.js';

function NewProjectForm(store, actions, { first }) {
  const { tabInfo } = store.state;
  const name = h('input', { id: 'np-name', type: 'text', placeholder: 'Project name, e.g. Local dev' });
  const url = h('input', {
    id: 'np-url', type: 'url', placeholder: 'Base URL, e.g. http://localhost:8080',
    value: tabInfo?.origin || '',
  });
  const ok = h('button', { id: 'np-ok', type: 'submit', class: 'btn-primary btn-sm grow2' }, 'Create');
  const submit = (e) => { e.preventDefault(); withBusy(ok, () => actions.createProject(name.value, url.value)); };
  setTimeout(() => name.focus(), 0);

  return h('form', { class: 'card card-accent', onsubmit: submit },
    h('div', { class: 'card-title' }, first ? '✨ Create your first project' : '✨ New project'),
    h('div', { class: 'stack' },
      name, url,
      h('div', { class: 'row' },
        first ? null : h('button', { id: 'np-cancel', type: 'button', class: 'btn-ghost btn-sm grow', onclick: () => actions.showNewProject(false) }, 'Cancel'),
        ok,
      ),
    ),
  );
}

export function ProjectBarView(store, actions) {
  const { projects, projectId, projectsLoading, projectsError, showNewProject, showImport } = store.state;

  if (projectsError) {
    return h('div', { class: 'error' }, `Couldn't load projects: ${projectsError} `,
      h('button', { class: 'btn-ghost btn-sm', onclick: () => actions.loadProjects() }, 'Retry'));
  }
  if (projectsLoading && !projects.length) {
    return h('div', { class: 'muted small pad' }, spinner(), ' Loading projects…');
  }
  if (!projects.length) return NewProjectForm(store, actions, { first: true });

  const select = h('select', {
    id: 'proj-sel', 'aria-label': 'Project',
    onchange: (e) => actions.selectProject(e.target.value),
  }, projects.map(p => h('option', { value: p.id, selected: p.id === projectId }, p.name)));

  return h('div', { class: 'project-bar' },
    h('div', { class: 'row' },
      select,
      h('button', { id: 'new-proj-btn', class: 'btn-ghost btn-sm', title: 'Create a project', onclick: () => actions.showNewProject(!showNewProject) }, '+ New'),
      h('button', { id: 'import-toggle', class: `btn-ghost btn-sm ${showImport ? 'pressed' : ''}`, title: 'Import an OpenAPI / Swagger spec', onclick: () => actions.showImport(!showImport) }, '📥'),
    ),
    showNewProject ? NewProjectForm(store, actions, { first: false }) : null,
    showImport ? OpenApiImportView(store, actions) : null,
  );
}
